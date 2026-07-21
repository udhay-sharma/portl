process.env.NODE_ENV = 'test';
/**
 * Step 2.4 — Redis distributed lock integration test
 *
 * Verifies:
 * 1. Single normal POST /visitor-requests succeeds (201) and lock is cleaned up immediately via try/finally.
 * 2. Race condition: Two concurrent POST /visitor-requests for the same flat -> exactly one 201 Created, one 409 Conflict.
 * 3. Lock held explicitly -> returns 409 Conflict without creating duplicate DB rows.
 * 4. Redis unreachable -> returns clean 503 Service Unavailable (not 500 Internal Server Error or hanging).
 */

import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../app.js';
import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';

let app: FastifyInstance;
let guardToken: string;
const FLAT_ID = 'c0000000-0000-0000-0000-000000000001'; // Seed Flat 101

before(async () => {
  execSync('npx prisma db seed', { stdio: 'pipe' });

  app = await createApp();
  await app.ready();

  // Ensure Redis connection is up before tests begin
  await redis.connect().catch(() => {
    // If lazyConnect already connected or connecting, ignore error
  });

  // Login as Guard
  const loginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'guard@portl.dev', password: 'password123' },
  });
  assert.equal(loginRes.statusCode, 200, `Failed to login as guard: ${loginRes.body}`);
  guardToken = (JSON.parse(loginRes.body) as { accessToken: string }).accessToken;
});

after(async () => {
  // ApprovalDecision must be deleted before VisitorRequest (FK constraint, no cascade)
  const requests = await prisma.visitorRequest.findMany({ where: { flatId: FLAT_ID }, select: { id: true } });
  const ids = requests.map((r) => r.id);
  if (ids.length > 0) {
    await prisma.approvalDecision.deleteMany({ where: { visitorRequestId: { in: ids } } });
  }
  await prisma.visitorRequest.deleteMany({ where: { flatId: FLAT_ID } });

  if (redis.status !== 'end' && redis.status !== 'close') {
    await redis.quit().catch(() => {
      redis.disconnect();
    });
  }
  await app.close();
  await prisma.$disconnect();
});

test('Step 2.4 — Single normal POST /visitor-requests succeeds (201) and lock is released via try/finally', async () => {
  const lockKey = `lock:flat:${FLAT_ID}`;

  // Verify lock key is initially absent
  const initialLock = await redis.get(lockKey);
  assert.equal(initialLock, null, 'Lock key should be empty before request');

  const res = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${guardToken}` },
    payload: {
      name: 'Single Lock Test Visitor',
      purpose: 'Testing Single Request',
      visitorType: 'Guest',
      flatId: FLAT_ID,
    },
  });

  assert.equal(res.statusCode, 201, `Expected 201 Created, got ${res.statusCode}: ${res.body}`);

  // Verify lock key is immediately released after completion
  const afterLock = await redis.get(lockKey);
  assert.equal(afterLock, null, 'Lock key MUST be deleted in finally block right after request ends');
});

test('Step 2.4 — Race condition: Two concurrent POST /visitor-requests -> one 201 Created, one 409 Conflict', async () => {
  // Fire both requests simultaneously using Promise.all
  const [res1, res2] = await Promise.all([
    app.inject({
      method: 'POST',
      url: '/visitor-requests',
      headers: { authorization: `Bearer ${guardToken}` },
      payload: {
        name: 'Concurrent Visitor 1',
        purpose: 'Race Test 1',
        visitorType: 'Delivery',
        flatId: FLAT_ID,
      },
    }),
    app.inject({
      method: 'POST',
      url: '/visitor-requests',
      headers: { authorization: `Bearer ${guardToken}` },
      payload: {
        name: 'Concurrent Visitor 2',
        purpose: 'Race Test 2',
        visitorType: 'Delivery',
        flatId: FLAT_ID,
      },
    }),
  ]);

  const statuses = [res1.statusCode, res2.statusCode].sort();
  assert.deepEqual(
    statuses,
    [201, 409],
    `Exactly one request should succeed (201) and one should conflict (409). Got: ${res1.statusCode} and ${res2.statusCode}`,
  );

  const conflictRes = res1.statusCode === 409 ? res1 : res2;
  const conflictBody = JSON.parse(conflictRes.body) as { error: string };
  assert.match(conflictBody.error, /Conflict/);
});

test('Step 2.4 — Explicitly held lock rejects POST /visitor-requests with clean 409 Conflict', async () => {
  const lockKey = `lock:flat:${FLAT_ID}`;

  // Manually acquire lock for 5 seconds
  const setRes = await redis.set(lockKey, '1', 'PX', 5000, 'NX');
  assert.equal(setRes, 'OK', 'Must be able to set manual lock');

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/visitor-requests',
      headers: { authorization: `Bearer ${guardToken}` },
      payload: {
        name: 'Blocked Visitor',
        purpose: 'Should be rejected',
        visitorType: 'Guest',
        flatId: FLAT_ID,
      },
    });

    assert.equal(res.statusCode, 409, `Expected 409 Conflict when lock held, got ${res.statusCode}: ${res.body}`);
    const body = JSON.parse(res.body) as { error: string };
    assert.match(body.error, /Conflict: another visitor request/);
  } finally {
    await redis.del(lockKey);
  }
});

test('Step 2.4 — Redis unreachable behavior returns clean 503 Service Unavailable (not 500)', async () => {
  // Disconnect Redis to simulate network failure or Redis outage
  redis.disconnect();

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/visitor-requests',
      headers: { authorization: `Bearer ${guardToken}` },
      payload: {
        name: 'No Redis Visitor',
        purpose: 'Testing 503 Failure Mode',
        visitorType: 'Service',
        flatId: FLAT_ID,
      },
    });

    assert.equal(res.statusCode, 503, `Expected 503 Service Unavailable when Redis down, got ${res.statusCode}: ${res.body}`);
    const body = JSON.parse(res.body) as { error: string };
    assert.match(body.error, /Service temporarily unavailable.*Redis unreachable/);
  } finally {
    // Reconnect so after() cleanup can run cleanly
    await redis.connect().catch(() => {
      // ignore
    });
  }
});
