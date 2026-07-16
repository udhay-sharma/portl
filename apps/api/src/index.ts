import 'dotenv/config';
import { createApp } from './app.js';

const PORT = 3000;

const fastify = await createApp();

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`API listening on http://localhost:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
