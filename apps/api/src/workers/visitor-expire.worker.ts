import { Queue, Worker, type Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { assertValidTransition } from '@portl/shared';

// ---------------------------------------------------------------------------
// Step 3.2 — BullMQ auto-expire fallback worker
//
// When a visitor request is created (POST /visitor-requests), a delayed job is
// enqueued here. When the job fires:
//   - If the request is still PENDING  → expire it and emit socket event
//   - If the request is no longer PENDING → skip silently (resident already acted)
// ---------------------------------------------------------------------------

const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';

// Parse Redis URL into ioredis connection options required by BullMQ
function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  const parsed = new URL(url);
  const conn: { host: string; port: number; password?: string } = {
    host: parsed.hostname || 'localhost',
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
  };
  if (parsed.password) {
    conn.password = decodeURIComponent(parsed.password);
  }
  return conn;
}

const redisConnection = parseRedisUrl(REDIS_URL);

// ---------------------------------------------------------------------------
// Named constant — easy to change for testing vs. production.
// Step 3.2 plan: "short delay (e.g. 15-20 seconds for now, easy to tune later)"
// Must be reverted to a production value (e.g. 5 minutes) before Step 3.3.
// ---------------------------------------------------------------------------
export const EXPIRE_REQUEST_DELAY_MS = 300_000; // 5 minutes

// ---------------------------------------------------------------------------
// Queue — exported so POST /visitor-requests can enqueue jobs.
// Uses the standard parsed connection (fast non-blocking commands only).
// ---------------------------------------------------------------------------
export const visitorExpireQueue = new Queue('visitor-expiration', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 86400 },
  },
});

export interface ExpireRequestJobData {
  visitorRequestId: string;
}

// ---------------------------------------------------------------------------
// Worker — processes 'expire-request' jobs.
//
// IMPORTANT: the Worker connection MUST have maxRetriesPerRequest: null.
// ---------------------------------------------------------------------------
const workerConnection = {
  ...parseRedisUrl(REDIS_URL),
  maxRetriesPerRequest: null as unknown as number, // required by BullMQ spec
};

let worker: Worker<ExpireRequestJobData> | null = null;

// Initialization function so the worker can access fastify.io for socket emits
export function startExpireWorker(fastify: FastifyInstance): void {
  if (worker) return; // already started

  worker = new Worker<ExpireRequestJobData>(
    'visitor-expiration',
    async (job: Job<ExpireRequestJobData>) => {
      const { visitorRequestId } = job.data;

      // 1. Re-fetch the visitor request
      const visitorRequest = await prisma.visitorRequest.findUnique({
        where: { id: visitorRequestId },
      });

      if (!visitorRequest) {
        console.log(
          `[Expire Worker] visitorRequestId=${visitorRequestId} not found — skipping expiration`,
        );
        return;
      }

      // 2. Status check — only expire if the resident hasn't already acted
      if (visitorRequest.status !== 'PENDING') {
        console.log(
          `[Expire Worker][SKIP] visitorRequestId=${visitorRequestId} is no longer PENDING ` +
            `(status=${visitorRequest.status}) — skipping expiration`,
        );
        return;
      }

      // 3. State machine validation strictly BEFORE any database update
      try {
        assertValidTransition(visitorRequest.status, 'EXPIRED');
      } catch (err) {
        console.error(`[Expire Worker] Invalid transition to EXPIRED:`, err);
        return; // Should not happen given ALLOWED_TRANSITIONS, but defence-in-depth
      }

      // 4. Update the VisitorRequest status to EXPIRED
      const updated = await prisma.visitorRequest.update({
        where: { id: visitorRequestId },
        data: { status: 'EXPIRED' },
      });

      // 5. Emit 'visitor:decided' event to flat:{flatId} room so screens update live
      fastify.io?.to(`flat:${updated.flatId}`).emit('visitor:decided', updated);

      console.log(
        `[Expire Worker][EXPIRED] visitorRequestId=${visitorRequestId} auto-expired successfully`,
      );
    },
    {
      connection: workerConnection, // maxRetriesPerRequest: null
      concurrency: 1,
    },
  );

  console.log(
    `[Expire Worker] initialized and listening on queue "visitor-expiration" ` +
      `(Redis: ${workerConnection.host}:${workerConnection.port}, delay: ${EXPIRE_REQUEST_DELAY_MS}ms)`,
  );

  worker.on('failed', (job, err) => {
    console.error(`[Expire Worker] Job ${job?.id} failed:`, err.message);
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown — called from app.ts onClose hook
// ---------------------------------------------------------------------------
export async function closeExpireWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  await visitorExpireQueue.close();
}
