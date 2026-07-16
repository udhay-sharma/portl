/**
 * Step 1.6 — Seed script and Guard/Admin auth verification test
 *
 * Verifies that:
 * 1. The database seed script (`npx prisma db seed`) runs cleanly and creates all 3 users.
 * 2. Each seeded user (`resident@portl.dev`, `guard@portl.dev`, `admin@portl.dev`) can log in via `POST /auth/login` with `password123`.
 * 3. Each token has the correct `role` and scope (`flatId` present for Resident, null for Guard and Admin).
 * 4. Hitting `GET /visitor-requests` (`requireRole('RESIDENT')`) with `ADMIN` and `GUARD` tokens returns 403 Forbidden.
 *
 * Run with:
 *   cd apps/api
 *   npm run test:seed
 */

import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import jwt from 'jsonwebtoken';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../app.js';
import prisma from '../lib/prisma.js';
import type { JwtPayload } from '../types/fastify.js';

let app: FastifyInstance;
const KNOWN_PASSWORD = 'password123';

before(async () => {
  // 1. Run seed script programmatically
  execSync('npx prisma db seed', { stdio: 'pipe' });

  app = await createApp();
  await app.ready();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test('Step 1.6 — All 3 seeded users exist in database with correct roles and scope', async () => {
  const resident = await prisma.user.findUniqueOrThrow({ where: { email: 'resident@portl.dev' } });
  assert.equal(resident.role, 'RESIDENT', 'resident@portl.dev must have RESIDENT role');
  assert.equal(resident.flatId, 'c0000000-0000-0000-0000-000000000001', 'Resident must be linked to flat 101');

  const guard = await prisma.user.findUniqueOrThrow({ where: { email: 'guard@portl.dev' } });
  assert.equal(guard.role, 'GUARD', 'guard@portl.dev must have GUARD role');
  assert.equal(guard.flatId, null, 'Guard must NOT have a flatId');
  assert.equal(guard.gateId, 'd0000000-0000-0000-0000-000000000001', 'Guard must be linked to Main Gate');

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@portl.dev' } });
  assert.equal(admin.role, 'ADMIN', 'admin@portl.dev must have ADMIN role');
  assert.equal(admin.flatId, null, 'Admin must NOT have a flatId');
  assert.equal(admin.gateId, null, 'Admin must NOT have a gateId');
});

test('Step 1.6 — RESIDENT login returns valid JWT with flatId set', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'resident@portl.dev', password: KNOWN_PASSWORD },
  });
  assert.equal(res.statusCode, 200, `Resident login failed: ${res.body}`);

  const { accessToken } = JSON.parse(res.body) as { accessToken: string };
  const decoded = jwt.verify(accessToken, process.env['JWT_SECRET'] ?? '') as JwtPayload;

  assert.equal(decoded.role, 'RESIDENT');
  assert.equal(decoded.flatId, 'c0000000-0000-0000-0000-000000000001');
});

test('Step 1.6 — GUARD login returns valid JWT with flatId = null', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'guard@portl.dev', password: KNOWN_PASSWORD },
  });
  assert.equal(res.statusCode, 200, `Guard login failed: ${res.body}`);

  const { accessToken } = JSON.parse(res.body) as { accessToken: string };
  const decoded = jwt.verify(accessToken, process.env['JWT_SECRET'] ?? '') as JwtPayload;

  assert.equal(decoded.role, 'GUARD');
  assert.equal(decoded.flatId, null, 'GUARD JWT payload must NOT have flatId set');
});

test('Step 1.6 — ADMIN login returns valid JWT with flatId = null', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'admin@portl.dev', password: KNOWN_PASSWORD },
  });
  assert.equal(res.statusCode, 200, `Admin login failed: ${res.body}`);

  const { accessToken } = JSON.parse(res.body) as { accessToken: string };
  const decoded = jwt.verify(accessToken, process.env['JWT_SECRET'] ?? '') as JwtPayload;

  assert.equal(decoded.role, 'ADMIN');
  assert.equal(decoded.flatId, null, 'ADMIN JWT payload must NOT have flatId set');
});

test('Step 1.6 — ADMIN token calling GET /visitor-requests (requireRole RESIDENT) returns 403 Forbidden', async () => {
  // Login as Admin
  const loginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'admin@portl.dev', password: KNOWN_PASSWORD },
  });
  const { accessToken } = JSON.parse(loginRes.body) as { accessToken: string };

  // Hit RESIDENT-only endpoint
  const res = await app.inject({
    method: 'GET',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  assert.equal(res.statusCode, 403, `Expected 403 for ADMIN hitting RESIDENT route, got ${res.statusCode}: ${res.body}`);
  assert.match(res.body, /Forbidden/i, 'Response body should indicate Forbidden error');
});

test('Step 1.6 — GUARD token calling GET /visitor-requests returns 403 Forbidden', async () => {
  // Login as Guard
  const loginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'guard@portl.dev', password: KNOWN_PASSWORD },
  });
  const { accessToken } = JSON.parse(loginRes.body) as { accessToken: string };

  // Hit RESIDENT-only endpoint
  const res = await app.inject({
    method: 'GET',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  assert.equal(res.statusCode, 403, `Expected 403 for GUARD hitting RESIDENT route, got ${res.statusCode}: ${res.body}`);
});
