process.env.NODE_ENV = 'test';
import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../app.js';
import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';

let app: FastifyInstance;
let residentToken: string;
let residentId: string;

before(async () => {
  execSync('npx prisma db seed', { stdio: 'pipe' });
  app = await createApp();
  await app.ready();

  // Login Resident
  const residentRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'resident@portl.dev', password: 'password123' },
  });
  residentToken = JSON.parse(residentRes.body).accessToken;

  // Get userId
  const payloadBase64 = residentToken.split('.')[1];
  const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
  residentId = payload.userId;
});

after(async () => {
  if (redis.status !== 'end' && redis.status !== 'close') {
    await redis.quit().catch(() => redis.disconnect());
  }
  await app.close();
  await prisma.$disconnect();
});

test('PUT /me/push-token — fails if not authenticated', async () => {
  const res = await app.inject({
    method: 'PUT',
    url: '/me/push-token',
    payload: { expoPushToken: 'ExponentPushToken[123]' },
  });
  assert.equal(res.statusCode, 401, 'Should require authentication');
});

test('PUT /me/push-token — fails if token missing', async () => {
  const res = await app.inject({
    method: 'PUT',
    url: '/me/push-token',
    headers: { authorization: `Bearer ${residentToken}` },
    payload: {},
  });
  assert.equal(res.statusCode, 400, 'Should return 400 for missing token');
});

test('PUT /me/push-token — successfully saves token', async () => {
  const testToken = 'ExponentPushToken[RealDeviceToken123]';
  const res = await app.inject({
    method: 'PUT',
    url: '/me/push-token',
    headers: { authorization: `Bearer ${residentToken}` },
    payload: { expoPushToken: testToken },
  });
  
  assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.body}`);
  const body = JSON.parse(res.body);
  assert.equal(body.success, true);
  assert.equal(body.user.expoPushToken, testToken);

  // Verify in database
  const dbUser = await prisma.user.findUnique({ where: { id: residentId } });
  assert.equal(dbUser?.expoPushToken, testToken, 'Database should contain updated token');
});
