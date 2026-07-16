/**
 * Step 2.1 — Visitor request creation endpoint verification test
 *
 * Verifies that:
 * 1. A Guard calling POST /visitor-requests with valid data gets 201 Created and the row defaults to status PENDING in the DB.
 * 2. Calling POST /visitor-requests with missing required fields (e.g. name) returns 400 Bad Request (not 500).
 * 3. A Resident calling POST /visitor-requests gets 403 Forbidden (RBAC write protection).
 *
 * Run with:
 *   cd apps/api
 *   npm run test:visitor-create
 */

import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../app.js';
import prisma from '../lib/prisma.js';

let app: FastifyInstance;
let guardToken: string;
let residentToken: string;
const KNOWN_PASSWORD = 'password123';
const FLAT_ID = 'c0000000-0000-0000-0000-000000000001';

before(async () => {
  // Run seed script to ensure seeded users/flats exist cleanly
  execSync('npx prisma db seed', { stdio: 'pipe' });

  app = await createApp();
  await app.ready();

  // Login as Guard
  const guardLogin = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'guard@portl.dev', password: KNOWN_PASSWORD },
  });
  guardToken = (JSON.parse(guardLogin.body) as { accessToken: string }).accessToken;

  // Login as Resident
  const residentLogin = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'resident@portl.dev', password: KNOWN_PASSWORD },
  });
  residentToken = (JSON.parse(residentLogin.body) as { accessToken: string }).accessToken;
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test('Step 2.1 — Guard POST /visitor-requests creates row with status PENDING (201 Created)', async () => {
  const payload = {
    name: 'Amazon Delivery Driver',
    purpose: 'Package Delivery',
    visitorType: 'Courier',
    flatId: FLAT_ID,
    photoUrl: 'https://example.com/driver.jpg',
  };

  const res = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${guardToken}` },
    payload,
  });

  assert.equal(res.statusCode, 201, `Expected 201 Created, got ${res.statusCode}: ${res.body}`);
  const body = JSON.parse(res.body) as { visitorRequest: { id: string; visitorName: string; status: string } };

  assert.equal(body.visitorRequest.visitorName, 'Amazon Delivery Driver');
  assert.equal(body.visitorRequest.status, 'PENDING', 'Created row status must be PENDING in HTTP response');

  // Verify directly against Postgres database via Prisma
  const dbRecord = await prisma.visitorRequest.findUniqueOrThrow({
    where: { id: body.visitorRequest.id },
  });
  assert.equal(dbRecord.status, 'PENDING', 'Database row status must default to PENDING');
  assert.equal(dbRecord.visitorName, 'Amazon Delivery Driver');
});

test('Step 2.1 — Guard POST /visitor-requests with missing required field returns 400 Bad Request (not 500)', async () => {
  // Omit `name` entirely
  const payload = {
    purpose: 'Plumbing Repair',
    visitorType: 'Service',
    flatId: FLAT_ID,
  };

  const res = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${guardToken}` },
    payload,
  });

  assert.equal(res.statusCode, 400, `Expected 400 Bad Request, got ${res.statusCode}: ${res.body}`);
  const body = JSON.parse(res.body) as { error: string; details: { name: string[] } };

  assert.equal(body.error, 'Validation failed');
  assert.ok(body.details.name, 'Expected validation error details for missing "name" field');
});

test('Step 2.1 — Resident POST /visitor-requests returns 403 Forbidden (RBAC write enforcement)', async () => {
  const payload = {
    name: 'Friend visiting',
    purpose: 'Dinner',
    visitorType: 'Guest',
    flatId: FLAT_ID,
  };

  const res = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${residentToken}` },
    payload,
  });

  assert.equal(res.statusCode, 403, `Expected 403 Forbidden for Resident creating visitor request, got ${res.statusCode}: ${res.body}`);
  assert.match(res.body, /Forbidden/i, 'Response body should indicate Forbidden error');
});
