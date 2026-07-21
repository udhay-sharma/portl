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
let adminToken: string;
let residentToken: string;

const SOCIETY_A_ID = 'a0000000-0000-0000-0000-000000000001'; // Seed society
const SOCIETY_B_ID = 'a0000000-0000-0000-0000-000000000002'; // New society for testing isolation

before(async () => {
  // 1. Seed database
  execSync('npx prisma db seed', { stdio: 'pipe' });

  // 2. Setup Redis and App
  app = await createApp();
  await app.ready();
  await redis.connect().catch(() => {});

  if (redis.status === 'ready') {
    await redis.del(`notices:${SOCIETY_A_ID}`, `notices:${SOCIETY_B_ID}`);
  }

  // 3. Seed Society B and a resident for it
  await prisma.society.upsert({
    where: { id: SOCIETY_B_ID },
    update: { name: 'Society B', address: 'B street' },
    create: { id: SOCIETY_B_ID, name: 'Society B', address: 'B street' },
  });

  const residentBRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      name: 'Resident B',
      email: 'residentB@portl.dev',
      phone: '5551112222',
      password: 'password123',
      role: 'RESIDENT',
      societyId: SOCIETY_B_ID,
      flatId: 'c0000000-0000-0000-0000-000000000001', // Reusing flat from society A is fine for test purposes, flat is just a string here
    },
  });
  assert.equal(residentBRes.statusCode, 201);

  // 4. Login to get tokens
  const adminRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'admin@portl.dev', password: 'password123' },
  });
  adminToken = (JSON.parse(adminRes.body) as { accessToken: string }).accessToken;

  const residentRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'resident@portl.dev', password: 'password123' },
  });
  residentToken = (JSON.parse(residentRes.body) as { accessToken: string }).accessToken;
});

after(async () => {
  // Clean up notices
  await prisma.notice.deleteMany({
    where: { societyId: { in: [SOCIETY_A_ID, SOCIETY_B_ID] } },
  });

  // Clean up Society B user and society
  await prisma.user.deleteMany({
    where: { email: 'residentB@portl.dev' },
  });
  await prisma.society.deleteMany({
    where: { id: SOCIETY_B_ID },
  });

  if (redis.status !== 'end' && redis.status !== 'close') {
    await redis.quit().catch(() => {
      redis.disconnect();
    });
  }
  await app.close();
  await prisma.$disconnect();
});

test('Step 4.1 — Admin can POST /notices, Resident gets 403', async () => {
  // Resident tries to create
  const residentRes = await app.inject({
    method: 'POST',
    url: '/notices',
    headers: { authorization: `Bearer ${residentToken}` },
    payload: {
      title: 'Pool Party',
      content: 'Resident throwing a party',
    },
  });
  assert.equal(residentRes.statusCode, 403, 'Resident should not be able to create notice');

  // Admin creates
  const adminRes = await app.inject({
    method: 'POST',
    url: '/notices',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      title: 'Water Maintenance',
      content: 'Water will be shut off tomorrow.',
    },
  });
  assert.equal(adminRes.statusCode, 201, `Admin creation failed: ${adminRes.body}`);
});

test('Step 4.1 — GET /notices shows created notice (Cache Busting Test)', async () => {
  // Fetch notices for Society A
  const getRes1 = await app.inject({
    method: 'GET',
    url: '/notices',
    headers: { authorization: `Bearer ${residentToken}` },
  });
  assert.equal(getRes1.statusCode, 200);
  let body = JSON.parse(getRes1.body) as { notices: any[] };
  assert.ok(body.notices.some(n => n.title === 'Water Maintenance'), 'Notice 1 should be present');

  // Admin creates a SECOND notice
  const adminRes2 = await app.inject({
    method: 'POST',
    url: '/notices',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      title: 'Fire Drill',
      content: 'Evacuate at 10 AM.',
    },
  });
  assert.equal(adminRes2.statusCode, 201);

  // Fetch notices again immediately. If cache was not busted, this would miss the new notice.
  const getRes2 = await app.inject({
    method: 'GET',
    url: '/notices',
    headers: { authorization: `Bearer ${residentToken}` },
  });
  assert.equal(getRes2.statusCode, 200);
  body = JSON.parse(getRes2.body) as { notices: any[] };
  assert.ok(body.notices.some(n => n.title === 'Fire Drill'), 'Notice 2 should be immediately present, proving cache bust');
});

test('Step 4.1 — Cross-society isolation: Resident B only sees Society B notices', async () => {
  // Resident B login
  const residentBRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'residentB@portl.dev', password: 'password123' },
  });
  const residentBToken = (JSON.parse(residentBRes.body) as { accessToken: string }).accessToken;

  // Fetch notices for Resident B
  const getRes = await app.inject({
    method: 'GET',
    url: '/notices',
    headers: { authorization: `Bearer ${residentBToken}` },
  });
  
  assert.equal(getRes.statusCode, 200);
  const body = JSON.parse(getRes.body) as { notices: any[] };
  
  // Society B currently has 0 notices because Admin (who is in Society A) hasn't made any for B.
  assert.equal(body.notices.length, 0, 'Resident B should not see Society A notices');
});
