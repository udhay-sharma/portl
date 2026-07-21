import { Queue, Worker, type Job } from 'bullmq';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import prisma from '../lib/prisma.js';

// ---------------------------------------------------------------------------
// Step 3.1 — BullMQ push notification fallback worker
//
// When a visitor request is created (POST /visitor-requests), a delayed job is
// enqueued here. When the job fires:
//   - If the request is still PENDING  → send Expo push to flat's residents
//   - If the request is no longer PENDING → skip silently (resident already acted)
//
// Uses the same REDIS_URL as the existing redis.ts client but opens its own
// ioredis connections internally — this is required by BullMQ's design and is
// intentional, not a bug.
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
// Step 3.1 plan: "short delay (e.g. 10–15 seconds for now, easy to tune later)"
// ---------------------------------------------------------------------------
export const PUSH_NOTIFICATION_DELAY_MS = 120_000; // 15 seconds

// ---------------------------------------------------------------------------
// Queue — exported so POST /visitor-requests can enqueue jobs.
// Uses the standard parsed connection (fast non-blocking commands only).
// ---------------------------------------------------------------------------
export const visitorNotificationQueue = new Queue('visitor-notifications', {
  connection: redisConnection,
  defaultJobOptions: {
    // Remove completed/failed jobs after 24h so Redis doesn't fill up
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 86400 },
  },
});

// ---------------------------------------------------------------------------
// Job payload type
// ---------------------------------------------------------------------------
export interface NotifyResidentJobData {
  visitorRequestId: string;
  flatId: string;
}

// ---------------------------------------------------------------------------
// Expo SDK client — stateless, safe to create once
// ---------------------------------------------------------------------------
const expo = new Expo();

// ---------------------------------------------------------------------------
// Worker — processes 'notify-resident' jobs.
//
// IMPORTANT: the Worker connection MUST have maxRetriesPerRequest: null.
// BullMQ Workers use blocking Redis commands (BLMOVE/BRPOP) internally.
// Without maxRetriesPerRequest: null, ioredis gives up after a finite number
// of retries and the Worker silently stops polling — jobs pile up unprocessed,
// no error is thrown anywhere. This is the #1 silent-failure trap with BullMQ.
// ---------------------------------------------------------------------------
const workerConnection = {
  ...parseRedisUrl(REDIS_URL),
  maxRetriesPerRequest: null as unknown as number, // required by BullMQ spec
};

export let worker: Worker<NotifyResidentJobData> | null = null;

export function initPushWorker(): void {
  const isTest = process.env.NODE_ENV === 'test' || process.argv.includes('--test');
  if (worker || isTest) return; // already initialized or in test mode

  worker = new Worker<NotifyResidentJobData>(
    'visitor-notifications',
    async (job: Job<NotifyResidentJobData>) => {
      const { visitorRequestId, flatId } = job.data;

      // 1. Re-fetch the visitor request — it may have been decided or deleted since enqueue
      const visitorRequest = await prisma.visitorRequest.findUnique({
        where: { id: visitorRequestId },
      });

      if (!visitorRequest) {
        console.log(
          `[Push Worker] visitorRequestId=${visitorRequestId} not found — skipping push notification`,
        );
        return;
      }

      // 2. Status check — this is the core of Step 3.1.
      //    Only send a push if the resident hasn't already acted via the socket.
      if (visitorRequest.status !== 'PENDING') {
        console.log(
          `[Push Worker][SKIP] visitorRequestId=${visitorRequestId} is no longer PENDING ` +
            `(status=${visitorRequest.status}) — skipping push notification`,
        );
        return;
      }

      // 3. Fetch all residents on this flat who have a stored push token
      const residents = await prisma.user.findMany({
        where: {
          flatId,
          role: 'RESIDENT',
          expoPushToken: { not: null },
        },
        select: { id: true, name: true, expoPushToken: true },
      });

      if (residents.length === 0) {
        console.log(
          `[Push Worker] No residents with push tokens found for flatId=${flatId} — skipping`,
        );
        return;
      }

      // 4. Build push messages (filter invalid tokens defensively)
      const messages: ExpoPushMessage[] = [];
      for (const resident of residents) {
        const token = resident.expoPushToken!;
        if (!Expo.isExpoPushToken(token)) {
          console.log(`[Push Worker] Invalid Expo push token for user ${resident.id}: ${token}`);
          continue;
        }
        messages.push({
          to: token,
          sound: 'default',
          title: '🔔 Visitor at the gate',
          body: `${visitorRequest.visitorName} is waiting — Purpose: ${visitorRequest.purpose}`,
          data: { visitorRequestId },
        });
      }

      if (messages.length === 0) {
        console.log(`[Push Worker] No valid push tokens — skipping send`);
        return;
      }

      // 5. Send in chunks (Expo's recommended approach for batching)
      const chunks = expo.chunkPushNotifications(messages);
      let sentCount = 0;
      for (const chunk of chunks) {
        try {
          const tickets = await expo.sendPushNotificationsAsync(chunk);
          sentCount += tickets.length;
          for (const ticket of tickets) {
            if (ticket.status === 'error') {
              console.log(`[Push Worker][PUSH ERROR] ${ticket.message} (${ticket.details?.error})`);
            }
          }
        } catch (err) {
          console.error('[Push Worker][PUSH ERROR] Failed to send chunk:', err);
        }
      }

      console.log(
        `[Push Worker][PUSH SENT] ${sentCount} token(s) notified for visitorRequestId=${visitorRequestId}`,
      );
    },
    {
      connection: workerConnection, // maxRetriesPerRequest: null — required for blocking commands
      concurrency: 1,
    },
  );

  // Startup confirmation — proves the Worker actually registered and is polling Redis
  console.log(
    `[Push Worker] initialized and listening on queue "visitor-notifications" ` +
      `(Redis: ${workerConnection.host}:${workerConnection.port}, delay: ${PUSH_NOTIFICATION_DELAY_MS}ms)`,
  );

  worker.on('failed', (job, err) => {
    console.error(`[Push Worker] Job ${job?.id} failed:`, err.message);
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown — called from app.ts onClose hook
// ---------------------------------------------------------------------------
export async function closeWorker(): Promise<void> {
  if (worker) {
    await worker.close();
  }
  await visitorNotificationQueue.close();
}
