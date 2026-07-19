import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import visitorRequestRoutes from './routes/visitor-requests.js';
import socketPlugin from './plugins/socket.js';
import redis from './lib/redis.js';
import { closeWorker } from './workers/visitor-notification.worker.js';
import { startExpireWorker, closeExpireWorker } from './workers/visitor-expire.worker.js';

// ---------------------------------------------------------------------------
// createApp — builds and configures the Fastify instance without starting it.
// Exported for testability: tests import this and use fastify.inject() without
// binding to a real port.
// ---------------------------------------------------------------------------
export async function createApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: true });

  // Enable CORS for Expo Web / mobile LAN clients
  fastify.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (request.method === 'OPTIONS') {
      reply.status(200).send();
    }
  });

  // Plugins
  await fastify.register(sensible);
  await fastify.register(socketPlugin);

  // Routes
  await fastify.register(authRoutes);
  await fastify.register(meRoutes);
  await fastify.register(visitorRequestRoutes);

  // Health check — same contract as Step 1.1: GET /health → { status: "ok" }
  fastify.get('/health', async (_request, _reply) => {
    return { status: 'ok' };
  });

  // Ensure Redis singleton and BullMQ worker close cleanly on app shutdown
  fastify.addHook('onClose', async () => {
    // Step 3.1 & 3.2: Close BullMQ workers and queues before Redis
    await closeExpireWorker();
    await closeWorker();

    if (redis.status !== 'end' && redis.status !== 'close') {
      await redis.quit().catch(() => {
        redis.disconnect();
      });
    }
  });

  // Step 3.2: Initialize the expire worker which needs the fastify instance
  // to emit socket.io events
  startExpireWorker(fastify);

  return fastify;
}
