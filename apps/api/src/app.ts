import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import visitorRequestRoutes from './routes/visitor-requests.js';

// ---------------------------------------------------------------------------
// createApp — builds and configures the Fastify instance without starting it.
// Exported for testability: tests import this and use fastify.inject() without
// binding to a real port.
// ---------------------------------------------------------------------------
export async function createApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: true });

  // Plugins
  await fastify.register(sensible);

  // Routes
  await fastify.register(authRoutes);
  await fastify.register(meRoutes);
  await fastify.register(visitorRequestRoutes);

  // Health check — same contract as Step 1.1: GET /health → { status: "ok" }
  fastify.get('/health', async (_request, _reply) => {
    return { status: 'ok' };
  });

  return fastify;
}
