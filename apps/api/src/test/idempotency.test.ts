process.env.NODE_ENV = 'test';
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

  // Flush any stale cached idempotency keys from previous runs or a live dev server.
  // These are the exact keys used in this test file — they must be clean before each run.
  const staleKeys = [
    'idempotency:patch-visitor:11111111-1111-1111-1111-111111111111',
    'idempotency:patch-visitor:22222222-2222-2222-2222-222222222222',
    'idempotency:patch-visitor:33333333-3333-3333-3333-333333333333',
    'idempotency:patch-visitor:44444444-4444-4444-4444-444444444444',
    'idempotency:patch-visitor:55555555-5555-5555-5555-555555555555',
  ];
  if (redis.status === 'ready') {
    await redis.del(...staleKeys).catch(() => {});
  }

  const loginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'guard@portl.dev', password: 'password123' },
  });
  assert.equal(loginRes.statusCode, 200);
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

test('Step 3.4 Audit trail — Same PATCH sent twice with same idempotencyKey creates exactly 1 ApprovalDecision row (not 2)', async () => {
  // Step 3.3 fixed the audit trail to write ApprovalDecision on every status change.
  // This test confirms the cached-response path (same idempotencyKey) does NOT write
  // a second audit row — only the first real execution does.
  const createRes = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${guardToken}` },
    payload: {
      name: 'Audit Trail Visitor',
      purpose: 'Testing audit row count',
      visitorType: 'Guest',
      flatId: FLAT_ID,
    },
  });
  assert.equal(createRes.statusCode, 201, `Create failed: ${createRes.body}`);
  const { visitorRequest } = JSON.parse(createRes.body) as { visitorRequest: { id: string } };
  const key = '55555555-5555-5555-5555-555555555555';

  // First PATCH — real execution, must write 1 ApprovalDecision row
  const res1 = await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${visitorRequest.id}`,
    headers: { authorization: `Bearer ${guardToken}` },
    payload: { status: 'APPROVED', idempotencyKey: key },
  });
  assert.equal(res1.statusCode, 200, `First PATCH failed: ${res1.body}`);

  // Second PATCH — cached response path, must NOT write another ApprovalDecision row
  const res2 = await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${visitorRequest.id}`,
    headers: { authorization: `Bearer ${guardToken}` },
    payload: { status: 'APPROVED', idempotencyKey: key },
  });
  assert.equal(res2.statusCode, 200, `Second PATCH (cached) failed: ${res2.body}`);

  // Verify exactly 1 ApprovalDecision row exists for this request
  const decisions = await prisma.approvalDecision.findMany({
    where: { visitorRequestId: visitorRequest.id },
  });
  assert.equal(
    decisions.length,
    1,
    `Expected exactly 1 ApprovalDecision row, found ${decisions.length} — duplicate audit row was created`,
  );
  assert.equal(decisions[0]!.fromStatus, 'PENDING');
  assert.equal(decisions[0]!.toStatus, 'APPROVED');
});
