import 'dotenv/config';
import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import authRoutes from './routes/auth.js';

const PORT = 3000;

const fastify = Fastify({ logger: true });

// Plugins
await fastify.register(sensible);

// Routes
await fastify.register(authRoutes);

// Health check — kept from Step 1.1, same contract: GET /health → { status: "ok" }
fastify.get('/health', async (_request, _reply) => {
  return { status: 'ok' };
});

// Start
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`API listening on http://localhost:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
