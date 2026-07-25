process.env.NODE_ENV = 'test';
/**
 * Step 2.2 — State machine (status transitions) verification test
 *
 * Verifies that:
 * 1. PATCHing a PENDING request to APPROVED succeeds (200 OK) and updates the database row.
 * 2. PATCHing that same now-APPROVED request back to PENDING returns a clean rejection (400 Bad Request, invalid transition).
 * 3. PATCHing a PENDING request directly to CHECKED_IN (skipping APPROVED) returns a clean rejection (400 Bad Request).
 *
 * Run with:
 *   cd apps/api
 *   npm run test:state-machine
 */

import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import prisma from '../lib/prisma.js';

let app: FastifyInstance;
let guardToken: string;
let residentToken: string;
const KNOWN_PASSWORD = 'password123';
const FLAT_ID = 'c0000000-0000-0000-0000-000000000001';

before(async () => {
  execSync('npx prisma db seed', { stdio: 'pipe' });

  app = await createApp();
  await app.ready();

  const guardLogin = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'guard@portl.dev', password: KNOWN_PASSWORD },
  });
  guardToken = (JSON.parse(guardLogin.body) as { accessToken: string }).accessToken;

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

test('Step 2.2 — PATCH PENDING request to APPROVED succeeds (200 OK)', async () => {
  // 1. Create a PENDING request as Guard
  const createRes = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${guardToken}` },
    payload: {
      name: 'Guest Alice',
      purpose: 'Dinner',
      visitorType: 'Guest',
      flatId: FLAT_ID,
    },
  });
  assert.equal(createRes.statusCode, 201);
  const created = (JSON.parse(createRes.body) as { visitorRequest: { id: string; status: string } }).visitorRequest;
  assert.equal(created.status, 'PENDING');

  // 2. PATCH status to APPROVED
  const patchRes = await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${created.id}`,
    headers: { authorization: `Bearer ${residentToken}` },
    payload: { status: 'APPROVED' },
  });
  assert.equal(patchRes.statusCode, 200, `Expected 200 OK, got ${patchRes.statusCode}: ${patchRes.body}`);
  const patched = (JSON.parse(patchRes.body) as { visitorRequest: { id: string; status: string } }).visitorRequest;
  assert.equal(patched.status, 'APPROVED');

  // 3. Verify in database
  const dbRow = await prisma.visitorRequest.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(dbRow.status, 'APPROVED');
});

test('Step 2.2 — PATCH now-APPROVED request straight back to PENDING returns clean 400 rejection', async () => {
  // 1. Create request & move to APPROVED
  const createRes = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${guardToken}` },
    payload: {
      name: 'Plumber Bob',
      purpose: 'Repair',
      visitorType: 'Service',
      flatId: FLAT_ID,
    },
  });
  const created = (JSON.parse(createRes.body) as { visitorRequest: { id: string } }).visitorRequest;

  await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${created.id}`,
    headers: { authorization: `Bearer ${residentToken}` },
    payload: { status: 'APPROVED' },
  });

  // 2. Try to reverse back from APPROVED to PENDING
  const patchRes = await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${created.id}`,
    headers: { authorization: `Bearer ${residentToken}` },
    payload: { status: 'PENDING' },
  });

  assert.equal(patchRes.statusCode, 400, `Expected 400 clean rejection, got ${patchRes.statusCode}: ${patchRes.body}`);
  const body = JSON.parse(patchRes.body) as { error: string; currentStatus: string; requestedStatus: string };
  assert.equal(body.error, 'Invalid transition');
  assert.equal(body.currentStatus, 'APPROVED');
  assert.equal(body.requestedStatus, 'PENDING');

  // 3. Verify database status remains APPROVED (no write occurred)
  const dbRow = await prisma.visitorRequest.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(dbRow.status, 'APPROVED');
});

test('Step 2.2 — PATCH PENDING request directly to CHECKED_IN (skipping APPROVED) returns clean 400 rejection', async () => {
  // 1. Create a PENDING request
  const createRes = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${guardToken}` },
    payload: {
      name: 'Courier Charlie',
      purpose: 'Delivery',
      visitorType: 'Courier',
      flatId: FLAT_ID,
    },
  });
  const created = (JSON.parse(createRes.body) as { visitorRequest: { id: string } }).visitorRequest;

  // 2. Try to skip directly to CHECKED_IN
  const patchRes = await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${created.id}`,
    headers: { authorization: `Bearer ${guardToken}` },
    payload: { status: 'CHECKED_IN' },
  });

  assert.equal(patchRes.statusCode, 400, `Expected 400 clean rejection, got ${patchRes.statusCode}: ${patchRes.body}`);
  const body = JSON.parse(patchRes.body) as { error: string; currentStatus: string; requestedStatus: string };
  assert.equal(body.error, 'Invalid transition');
  assert.equal(body.currentStatus, 'PENDING');
  assert.equal(body.requestedStatus, 'CHECKED_IN');

  // 3. Verify database status remains PENDING
  const dbRow = await prisma.visitorRequest.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(dbRow.status, 'PENDING');
});

test('Step 2.2 — GUARD can PATCH CHECKED_IN request to CHECKED_OUT', async () => {
  // 1. Create a request and move it to CHECKED_IN
  const createRes = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${guardToken}` },
    payload: {
      name: 'Exiting Visitor',
      purpose: 'Visit',
      visitorType: 'Guest',
      flatId: FLAT_ID,
    },
  });
  const created = (JSON.parse(createRes.body) as { visitorRequest: { id: string } }).visitorRequest;

  await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${created.id}`,
    headers: { authorization: `Bearer ${residentToken}` },
    payload: { status: 'APPROVED' },
  });

  await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${created.id}`,
    headers: { authorization: `Bearer ${guardToken}` },
    payload: { status: 'CHECKED_IN' },
  });

  // 2. Guard PATCH to CHECKED_OUT
  const patchRes = await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${created.id}`,
    headers: { authorization: `Bearer ${guardToken}` },
    payload: { status: 'CHECKED_OUT' },
  });

  assert.equal(patchRes.statusCode, 200, `Expected 200 OK, got ${patchRes.statusCode}`);
  const body = JSON.parse(patchRes.body) as { visitorRequest: { status: string } };
  assert.equal(body.visitorRequest.status, 'CHECKED_OUT');
});

test('Step 2.2 — GUARD from a different society gets 403 when trying to PATCH', async () => {
  // We'll just create a new society, flat, and guard user manually in the DB for this test
  const otherSociety = await prisma.society.create({ data: { name: 'Other Soc', address: 'Other' } });
  const otherGuard = await prisma.user.create({
    data: {
      name: 'Other Guard',
      email: `other.guard.${Date.now()}@portl.dev`,
      passwordHash: 'hash', // fake
      role: 'GUARD',
      societyId: otherSociety.id,
    }
  });

  // Generate a valid JWT for this other guard
  const secret = process.env['JWT_SECRET']!;
  const otherGuardToken = jwt.sign(
    { userId: otherGuard.id, role: 'GUARD', societyId: otherSociety.id },
    secret,
    { expiresIn: '1h' }
  );

  // Use the PENDING request from previous test setup
  const createRes = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${guardToken}` },
    payload: {
      name: 'Target Visitor',
      purpose: 'Target',
      visitorType: 'Guest',
      flatId: FLAT_ID, // from the original society
    },
  });
  const created = (JSON.parse(createRes.body) as { visitorRequest: { id: string } }).visitorRequest;

  // Try to patch it with the OTHER guard's token
  const patchRes = await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${created.id}`,
    headers: { authorization: `Bearer ${otherGuardToken}` },
    payload: { status: 'REJECTED' }, // trying to reject it
  });

  assert.equal(patchRes.statusCode, 403, `Expected 403 Forbidden, got ${patchRes.statusCode}`);
  const body = JSON.parse(patchRes.body) as { error: string };
  assert.ok(body.error.includes('Forbidden: you do not have permission'), 'Must be a scoping error');
});
