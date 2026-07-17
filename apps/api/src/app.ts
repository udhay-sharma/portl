import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import visitorRequestRoutes from './routes/visitor-requests.js';
import socketPlugin from './plugins/socket.js';
import redis from './lib/redis.js';

// ---------------------------------------------------------------------------
// createApp — builds and configures the Fastify instance without starting it.
// Exported for testability: tests import this and use fastify.inject() without
// binding to a real port.
// ---------------------------------------------------------------------------
export async function createApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: true });

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

  // Ensure Redis singleton closes when app closes (prevents open handles in tests/shutdown)
  fastify.addHook('onClose', async () => {
    if (redis.status !== 'end' && redis.status !== 'close') {
      await redis.quit().catch(() => {
        redis.disconnect();
      });
    }
  });

  return fastify;
}
