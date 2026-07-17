import { Redis } from 'ioredis';

// Step 2.4 — Redis client for distributed locks
// Connects to localhost:6379 by default (running via Docker).
const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';

// Singleton Redis client configured for fail-fast behavior:
// - maxRetriesPerRequest: 1 ensurescommands throw/reject immediately if Redis is down rather than hanging indefinitely.
// - lazyConnect: true ensures the API server boots even if Redis is not started yet.
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  retryStrategy(times: number) {
    // Retry connection up to 2 seconds interval when disconnected
    return Math.min(times * 50, 2000);
  },
});

redis.on('error', (err: Error) => {
  // Prevent unhandled error events from crashing the Node.js process when Redis is unreachable
  console.error('[Redis Client Error]', err.message);
});

export default redis;
