process.env.NODE_ENV = 'test';
/**
 * Step 3.4 — Auth register/login success and failure cases
 *
 * Verifies that:
 * 1. POST /auth/register with valid data returns 201 + user object.
 * 2. POST /auth/register with missing required field returns 400.
 * 3. POST /auth/register with invalid email format returns 400.
 * 4. POST /auth/register with no body at all returns 400.
 * 5. POST /auth/register with a duplicate email returns 409 Conflict.
 * 6. POST /auth/register with a non-RESIDENT role returns 400 (ROLE_NOT_ALLOWED).
 * 7. POST /auth/login with valid credentials returns 200 + accessToken.
 * 8. POST /auth/login with wrong password returns 401.
 * 9. POST /auth/login with unknown email returns 401.
 * 10. POST /auth/login with missing credential field returns 400.
 *
 * Run with:
 *   cd apps/api
 *   npm run test:auth
 */

import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../app.js';
import prisma from '../lib/prisma.js';

let app: FastifyInstance;

// Stable seed society/flat IDs (created by npx prisma db seed)
const SEED_SOCIETY_ID = 'a0000000-0000-0000-0000-000000000001';
const SEED_FLAT_ID = 'c0000000-0000-0000-0000-000000000001';

// Unique email prefix for all auth test users — avoids collisions with seed users
const TEST_EMAIL_DOMAIN = '@auth.test.portl';
const emailOf = (label: string) => `auth.test.${label}${TEST_EMAIL_DOMAIN}`;

// Track emails created so we can clean up in after()
const createdEmails: string[] = [];

before(async () => {
  execSync('npx prisma db seed', { stdio: 'pipe' });
  app = await createApp();
  await app.ready();
});

after(async () => {
  // Remove any users created during these tests
  if (createdEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  }
  await app.close();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Register — success
// ---------------------------------------------------------------------------

test('Step 3.4 Auth — POST /auth/register with valid data returns 201 and user object', async () => {
  const email = emailOf('valid.register');
  createdEmails.push(email);

  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      name: 'Auth Test Resident',
      email,
      password: 'password123',
      role: 'RESIDENT',
      societyId: SEED_SOCIETY_ID,
      flatId: SEED_FLAT_ID,
    },
  });

  assert.equal(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${res.body}`);
  const body = JSON.parse(res.body) as { user: { email: string; role: string } };
  assert.ok(body.user, 'Response must include a user object');
  assert.equal(body.user.email, email);
  assert.equal(body.user.role, 'RESIDENT');
});

// ---------------------------------------------------------------------------
// Register — validation failures (400)
// ---------------------------------------------------------------------------

test('Step 3.4 Auth — POST /auth/register missing required name field returns 400', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      // name intentionally omitted
      email: emailOf('missing.name'),
      password: 'password123',
      role: 'RESIDENT',
      societyId: SEED_SOCIETY_ID,
      flatId: SEED_FLAT_ID,
    },
  });

  assert.equal(res.statusCode, 400, `Expected 400, got ${res.statusCode}: ${res.body}`);
  const body = JSON.parse(res.body) as { error: string };
  assert.equal(body.error, 'Validation failed');
});

test('Step 3.4 Auth — POST /auth/register with invalid email format returns 400', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      name: 'Bad Email User',
      email: 'not-an-email',
      password: 'password123',
      role: 'RESIDENT',
      societyId: SEED_SOCIETY_ID,
      flatId: SEED_FLAT_ID,
    },
  });

  assert.equal(res.statusCode, 400, `Expected 400, got ${res.statusCode}: ${res.body}`);
  const body = JSON.parse(res.body) as { error: string };
  assert.equal(body.error, 'Validation failed');
});

test('Step 3.4 Auth — POST /auth/register with empty body returns 400', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {},
  });

  assert.equal(res.statusCode, 400, `Expected 400, got ${res.statusCode}: ${res.body}`);
});

test('Step 3.4 Auth — POST /auth/register with GUARD role returns 400 (ROLE_NOT_ALLOWED)', async () => {
  // Only RESIDENT self-registration is supported. Guards are seeded by admin.
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      name: 'Attempted Guard',
      email: emailOf('guard.attempt'),
      password: 'password123',
      role: 'GUARD',
      societyId: SEED_SOCIETY_ID,
    },
  });

  assert.equal(res.statusCode, 400, `Expected 400, got ${res.statusCode}: ${res.body}`);
  const body = JSON.parse(res.body) as { error: string };
  assert.match(body.error, /RESIDENT/i, 'Error must mention RESIDENT restriction');
});

// ---------------------------------------------------------------------------
// Register — conflict (409)
// ---------------------------------------------------------------------------

test('Step 3.4 Auth — POST /auth/register with duplicate email returns 409 Conflict', async () => {
  const email = emailOf('duplicate');
  createdEmails.push(email);

  const payload = {
    name: 'Dup User',
    email,
    password: 'password123',
    role: 'RESIDENT',
    societyId: SEED_SOCIETY_ID,
    flatId: SEED_FLAT_ID,
  };

  // First registration succeeds
  const first = await app.inject({ method: 'POST', url: '/auth/register', payload });
  assert.equal(first.statusCode, 201, `First registration should succeed: ${first.body}`);

  // Second registration with same email must fail
  const second = await app.inject({ method: 'POST', url: '/auth/register', payload });
  assert.equal(second.statusCode, 409, `Expected 409 for duplicate email, got ${second.statusCode}: ${second.body}`);
  const body = JSON.parse(second.body) as { error: string };
  assert.match(body.error, /already exists/i);
});

// ---------------------------------------------------------------------------
// Login — success
// ---------------------------------------------------------------------------

test('Step 3.4 Auth — POST /auth/login with valid credentials returns 200 and accessToken', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'resident@portl.dev', password: 'password123' },
  });

  assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.body}`);
  const body = JSON.parse(res.body) as { accessToken: string };
  assert.ok(body.accessToken, 'Response must include accessToken');
  assert.equal(typeof body.accessToken, 'string');
  assert.ok(body.accessToken.length > 0, 'accessToken must not be empty');
});

// ---------------------------------------------------------------------------
// Login — failures (401 / 400)
// ---------------------------------------------------------------------------

test('Step 3.4 Auth — POST /auth/login with wrong password returns 401', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'resident@portl.dev', password: 'wrongpassword' },
  });

  assert.equal(res.statusCode, 401, `Expected 401, got ${res.statusCode}: ${res.body}`);
  const body = JSON.parse(res.body) as { error: string };
  assert.equal(body.error, 'Invalid credentials');
});

test('Step 3.4 Auth — POST /auth/login with unknown email returns 401 (no user enumeration)', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'nobody@nowhere.dev', password: 'password123' },
  });

  assert.equal(res.statusCode, 401, `Expected 401, got ${res.statusCode}: ${res.body}`);
  const body = JSON.parse(res.body) as { error: string };
  // Must return the same error message as wrong password — prevents email enumeration
  assert.equal(body.error, 'Invalid credentials');
});

test('Step 3.4 Auth — POST /auth/login with missing credential field returns 400', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { password: 'password123' }, // credential field absent
  });

  assert.equal(res.statusCode, 400, `Expected 400, got ${res.statusCode}: ${res.body}`);
  const body = JSON.parse(res.body) as { error: string };
  assert.equal(body.error, 'Validation failed');
});

test('Step 3.4 Auth — POST /auth/login with missing password field returns 400', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'resident@portl.dev' }, // password field absent
  });

  assert.equal(res.statusCode, 400, `Expected 400, got ${res.statusCode}: ${res.body}`);
  const body = JSON.parse(res.body) as { error: string };
  assert.equal(body.error, 'Validation failed');
});
