import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';
import type { CreateNoticeInput } from '@portl/shared';
import type { Notice } from '../generated/prisma/client.js';

const CACHE_TTL_SECONDS = 60;

function getCacheKey(societyId: string): string {
  return `notices:${societyId}`;
}

export async function getNotices(societyId: string): Promise<Notice[]> {
  const cacheKey = getCacheKey(societyId);

  // 1. Try Cache
  if (redis.status === 'ready') {
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        const notices = JSON.parse(cached) as Notice[];
        // JSON.parse converts dates to strings, so we map them back if needed,
        // but for returning to Fastify, keeping them as strings is usually fine.
        // Fastify/Prisma handles Date serialization natively, but since we cache
        // the JSON representation, returning it parsed is sufficient for Fastify's send.
        return notices;
      } catch (e) {
        // Fallback to DB on parse error
      }
    }
  }

  // 2. Fetch from DB
  const notices = await prisma.notice.findMany({
    where: { societyId },
    orderBy: { createdAt: 'desc' },
  });

  // 3. Set Cache
  if (redis.status === 'ready') {
    await redis.set(cacheKey, JSON.stringify(notices), 'EX', CACHE_TTL_SECONDS);
  }

  return notices;
}

export async function createNotice(
  data: CreateNoticeInput,
  societyId: string,
  userId: string
): Promise<Notice> {
  const notice = await prisma.notice.create({
    data: {
      title: data.title,
      content: data.content,
      societyId,
      createdByUserId: userId,
    },
  });

  // 4. Cache Invalidation
  // As per Step 4.1 rules: The cache MUST correctly bust/invalidate when a new notice is created.
  if (redis.status === 'ready') {
    await redis.del(getCacheKey(societyId));
  }

  return notice;
}
