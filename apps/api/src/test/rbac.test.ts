/**
 * Step 1.5 — RBAC scoping integration test
 *
 * Verifies that GET /visitor-requests is scoped strictly to the authenticated
 * user's own flatId (from the verified JWT), ignoring any flatId passed in the
 * query string.
 *
 * Uses real Postgres DB + Fastify inject() (no HTTP port bound).
 *
 * Run with:
 *   cd apps/api
 *   npm run test:rbac
 */

import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../app.js';
import prisma from '../lib/prisma.js';

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let tokenA: string;
let flatIdA: string;
let flatIdB: string;
let societyId: string;
let towerId: string;

// ---------------------------------------------------------------------------
// Setup — create isolated test data
// ---------------------------------------------------------------------------

before(async () => {
  app = await createApp();
  await app.ready();

  // 1. Society
  const society = await prisma.society.create({
    data: { name: 'RBAC Test Society', address: '1 Test Lane' },
  });
  societyId = society.id;

  // 2. Tower
  const tower = await prisma.tower.create({
    data: { name: 'RBAC Tower', societyId },
  });
  towerId = tower.id;

  // 3. Two flats in the same tower
  const flatA = await prisma.flat.create({ data: { number: 'RBAC-101', towerId } });
  const flatB = await prisma.flat.create({ data: { number: 'RBAC-102', towerId } });
  flatIdA = flatA.id;
  flatIdB = flatB.id;

  // 4. Register Resident A (in Flat A)
  const regA = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      name: 'RBAC Resident A',
      email: 'rbac.resident.a@test.portl',
      password: 'password123',
      role: 'RESIDENT',
      societyId,
      flatId: flatIdA,
    },
  });
  assert.equal(regA.statusCode, 201, `Register A failed: ${regA.body}`);

  // 5. Register Resident B (in Flat B)
  const regB = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      name: 'RBAC Resident B',
      email: 'rbac.resident.b@test.portl',
      password: 'password123',
      role: 'RESIDENT',
      societyId,
      flatId: flatIdB,
    },
  });
  assert.equal(regB.statusCode, 201, `Register B failed: ${regB.body}`);

  // 6. Login as Resident A → get token
  const loginA = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'rbac.resident.a@test.portl', password: 'password123' },
  });
  assert.equal(loginA.statusCode, 200, `Login A failed: ${loginA.body}`);
  tokenA = (JSON.parse(loginA.body) as { accessToken: string }).accessToken;
});

// ---------------------------------------------------------------------------
// Cleanup — delete in FK-safe order
// ---------------------------------------------------------------------------

after(async () => {
  // Users first (FK to Society; Society → restrict by default)
  await prisma.user.deleteMany({
    where: { email: { in: ['rbac.resident.a@test.portl', 'rbac.resident.b@test.portl'] } },
  });
  // Flats → Tower → Society (cascade, but delete society which cascades tower → flat)
  await prisma.flat.deleteMany({ where: { id: { in: [flatIdA, flatIdB] } } });
  await prisma.tower.deleteMany({ where: { id: towerId } });
  await prisma.society.deleteMany({ where: { id: societyId } });

  await app.close();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('Lock 2 — GET /me with no Authorization header returns 401', async () => {
  const res = await app.inject({ method: 'GET', url: '/me' });
  assert.equal(res.statusCode, 401, `Expected 401, got ${res.statusCode}: ${res.body}`);
});

test('Lock 2 — GET /me with valid token returns 200 and correct user', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/me',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.body}`);

  const body = JSON.parse(res.body) as { user: { flatId: string; email: string } };
  assert.ok(body.user, 'Response must have a user object');
  assert.equal(body.user.email, 'rbac.resident.a@test.portl');
  assert.equal(body.user.flatId, flatIdA, 'user.flatId must match Resident A\'s flat');
});

test('Lock 2 — GET /visitor-requests with no token returns 401', async () => {
  const res = await app.inject({ method: 'GET', url: '/visitor-requests' });
  assert.equal(res.statusCode, 401, `Expected 401, got ${res.statusCode}: ${res.body}`);
});

test('Lock 3 — GET /visitor-requests ignores ?flatId=<B flatId>, scopes to A\'s flat only', async () => {
  // Attacker scenario: Resident A passes Resident B's flatId as a query param,
  // hoping to see B's visitor requests.
  const res = await app.inject({
    method: 'GET',
    url: `/visitor-requests?flatId=${flatIdB}`, // ← B's flatId — should be ignored
    headers: { authorization: `Bearer ${tokenA}` },
  });

  assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.body}`);

  const body = JSON.parse(res.body) as { visitorRequests: Array<{ flatId: string }> };
  assert.ok(Array.isArray(body.visitorRequests), 'Response must have visitorRequests array');

  // Every returned record must belong to A's flat — B's flatId must never appear.
  for (const vr of body.visitorRequests) {
    assert.equal(
      vr.flatId,
      flatIdA,
      `Visitor request flatId must be A's (${flatIdA}), got ${vr.flatId}`,
    );
    assert.notEqual(
      vr.flatId,
      flatIdB,
      `Visitor request MUST NOT belong to B's flat (${flatIdB})`,
    );
  }

  // No visitor requests exist yet (Step 2.1 adds creation) — array must be empty.
  assert.equal(
    body.visitorRequests.length,
    0,
    'Expected empty array — no visitor requests created until Step 2.1',
  );
});

test('Lock 2 — GET /me with a tampered/invalid token returns 401', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/me',
    headers: { authorization: 'Bearer this.is.not.a.valid.token' },
  });
  assert.equal(res.statusCode, 401, `Expected 401 for tampered token, got ${res.statusCode}`);
});
