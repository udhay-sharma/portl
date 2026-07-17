/**
 * Step 2.6 — Idempotency Key (Replay Protection) Integration Test
 *
 * Verifies:
 * 1. Sending exact same PATCH twice with SAME idempotencyKey returns cached response without reprocessing (no duplicate transition error or extra DB writes).
 * 2. Sending PATCH twice with TWO DIFFERENT idempotencyKeys correctly re-evaluates the state machine and rejects the second as an invalid transition.
 * 3. Reusing the SAME idempotencyKey for a DIFFERENT request (different ID or status target) correctly returns 409 Conflict mismatch instead of returning the cached response blindly (Rule 4a).
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
  await redis.connect().catch(() => {});

  const loginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'guard@portl.dev', password: 'password123' },
  });
  assert.equal(loginRes.statusCode, 200);
  guardToken = (JSON.parse(loginRes.body) as { accessToken: string }).accessToken;
});

after(async () => {
  await prisma.visitorRequest.deleteMany({
    where: { flatId: FLAT_ID },
  });

  if (redis.status !== 'end' && redis.status !== 'close') {
    await redis.quit().catch(() => {
      redis.disconnect();
    });
  }
  await app.close();
  await prisma.$disconnect();
});

test('Step 2.6 — Same PATCH request twice with SAME idempotencyKey returns identical response without re-executing transition', async () => {
  const createRes = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${guardToken}` },
    payload: {
      name: 'Idempotent Visitor 1',
      purpose: 'Testing same key twice',
      visitorType: 'Guest',
      flatId: FLAT_ID,
    },
  });
  const { visitorRequest } = JSON.parse(createRes.body) as { visitorRequest: { id: string } };
  const key = '11111111-1111-1111-1111-111111111111';

  // First PATCH request
  const res1 = await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${visitorRequest.id}`,
    headers: { authorization: `Bearer ${guardToken}` },
    payload: { status: 'APPROVED', idempotencyKey: key },
  });
  assert.equal(res1.statusCode, 200, `First request failed: ${res1.body}`);
  const body1 = JSON.parse(res1.body);
  assert.equal(body1.visitorRequest.status, 'APPROVED');

  // Second PATCH request with exact SAME idempotencyKey
  const res2 = await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${visitorRequest.id}`,
    headers: { authorization: `Bearer ${guardToken}` },
    payload: { status: 'APPROVED', idempotencyKey: key },
  });
  assert.equal(res2.statusCode, 200, `Second request with same key must return cached 200 OK, got ${res2.statusCode}`);
  const body2 = JSON.parse(res2.body);
  assert.deepEqual(body2, body1, 'Cached response body must exactly match original response body');

  // Verify in DB that status is still APPROVED
  const dbRow = await prisma.visitorRequest.findUnique({ where: { id: visitorRequest.id } });
  assert.equal(dbRow?.status, 'APPROVED');
});

test('Step 2.6 — Same PATCH request twice with TWO DIFFERENT idempotencyKeys correctly rejects second as invalid transition', async () => {
  const createRes = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${guardToken}` },
    payload: {
      name: 'Idempotent Visitor 2',
      purpose: 'Testing different keys',
      visitorType: 'Delivery',
      flatId: FLAT_ID,
    },
  });
  const { visitorRequest } = JSON.parse(createRes.body) as { visitorRequest: { id: string } };

  const keyA = '22222222-2222-2222-2222-222222222222';
  const keyB = '33333333-3333-3333-3333-333333333333';

  // First PATCH request with Key A
  const res1 = await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${visitorRequest.id}`,
    headers: { authorization: `Bearer ${guardToken}` },
    payload: { status: 'APPROVED', idempotencyKey: keyA },
  });
  assert.equal(res1.statusCode, 200);

  // Second PATCH request with Key B (different key -> not in cache -> fresh state check)
  const res2 = await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${visitorRequest.id}`,
    headers: { authorization: `Bearer ${guardToken}` },
    payload: { status: 'APPROVED', idempotencyKey: keyB },
  });
  assert.equal(res2.statusCode, 400, `Second request with different key must fail state check (400), got ${res2.statusCode}`);
  const body2 = JSON.parse(res2.body) as { error: string };
  assert.equal(body2.error, 'Invalid transition');
});

test('Step 2.6 (Rule 4a) — Reusing SAME idempotencyKey for a DIFFERENT request detects mismatch and returns 409 Conflict', async () => {
  const createRes = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${guardToken}` },
    payload: {
      name: 'Idempotent Visitor 3',
      purpose: 'Testing mismatch detection',
      visitorType: 'Staff',
      flatId: FLAT_ID,
    },
  });
  const { visitorRequest } = JSON.parse(createRes.body) as { visitorRequest: { id: string } };
  const reusedKey = '44444444-4444-4444-4444-444444444444';

  // First PATCH request
  const res1 = await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${visitorRequest.id}`,
    headers: { authorization: `Bearer ${guardToken}` },
    payload: { status: 'APPROVED', idempotencyKey: reusedKey },
  });
  assert.equal(res1.statusCode, 200);

  // Reusing same key but targeting a different status (REJECTED instead of APPROVED)
  const res2 = await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${visitorRequest.id}`,
    headers: { authorization: `Bearer ${guardToken}` },
    payload: { status: 'REJECTED', idempotencyKey: reusedKey },
  });
  assert.equal(res2.statusCode, 409, `Expected 409 Conflict for key reuse on different parameters, got ${res2.statusCode}`);
  const body2 = JSON.parse(res2.body) as { error: string; message: string };
  assert.equal(body2.error, 'Idempotency conflict');
});
