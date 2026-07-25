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
const RESIDENT_B_FLAT_ID = 'c0000000-0000-0000-0000-000000000001';

before(async () => {
  // 1. Seed database
  execSync('npx prisma db seed', { stdio: 'pipe' });

  // 2. Setup Redis and App
  app = await createApp();
  await app.ready();
  await redis.connect().catch(() => {});

  // 3. Seed Society B and a resident/admin for it
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
      email: 'residentBstaff@portl.dev',
      phone: '5551112222',
      password: 'password123',
      role: 'RESIDENT',
      societyId: SOCIETY_B_ID,
      flatId: RESIDENT_B_FLAT_ID,
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
  // Clean up staff created in test
  await prisma.serviceProvider.deleteMany({
    where: { societyId: { in: [SOCIETY_A_ID, SOCIETY_B_ID] } },
  });

  await prisma.user.deleteMany({
    where: { email: 'residentBstaff@portl.dev' },
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

let createdProviderId: string;

test('Task 10 — Admin can POST /staff, Resident gets 403', async () => {
  // Resident tries to create
  const residentRes = await app.inject({
    method: 'POST',
    url: '/staff',
    headers: { authorization: `Bearer ${residentToken}` },
    payload: {
      name: 'Sneaky Plumber',
      category: 'Plumber',
      phone: '9998887777',
    },
  });
  assert.equal(residentRes.statusCode, 403);

  // Admin creates
  const adminRes = await app.inject({
    method: 'POST',
    url: '/staff',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      name: 'Luigi',
      category: 'Plumber',
      phone: '1234567890',
      notes: 'Available on weekends',
    },
  });
  assert.equal(adminRes.statusCode, 201);
  const body = JSON.parse(adminRes.body) as any;
  assert.equal(body.name, 'Luigi');
  assert.equal(body.societyId, SOCIETY_A_ID);
  
  createdProviderId = body.id;
});

test('Task 10 — Resident and Admin can GET /staff and see their scoped data', async () => {
  const residentRes = await app.inject({
    method: 'GET',
    url: '/staff',
    headers: { authorization: `Bearer ${residentToken}` },
  });
  assert.equal(residentRes.statusCode, 200);
  const body = JSON.parse(residentRes.body) as any;
  assert.ok(Array.isArray(body.providers));
  assert.ok(body.providers.some((p: any) => p.name === 'Luigi'));
});

test('Task 10 — Admin can PATCH /staff/:id, Resident gets 403', async () => {
  // Resident tries to patch
  const residentRes = await app.inject({
    method: 'PATCH',
    url: `/staff/${createdProviderId}`,
    headers: { authorization: `Bearer ${residentToken}` },
    payload: {
      name: 'Hacked Luigi',
    },
  });
  assert.equal(residentRes.statusCode, 403);

  // Admin patches
  const adminRes = await app.inject({
    method: 'PATCH',
    url: `/staff/${createdProviderId}`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      phone: '0987654321',
    },
  });
  assert.equal(adminRes.statusCode, 200);
  const body = JSON.parse(adminRes.body) as any;
  assert.equal(body.phone, '0987654321');
  assert.equal(body.name, 'Luigi'); // unchanged
});

test('Task 10 — Admin gets 404 patching a staff member in a different society', async () => {
  // Admin is in SOCIETY_A. Let's create a staff member in SOCIETY_B directly in DB.
  const otherProvider = await prisma.serviceProvider.create({
    data: {
      name: 'Mario',
      category: 'Plumber',
      phone: '1112223333',
      societyId: SOCIETY_B_ID,
    },
  });

  const adminRes = await app.inject({
    method: 'PATCH',
    url: `/staff/${otherProvider.id}`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      name: 'Captured Mario',
    },
  });
  // The route says: "not found in your society" -> 404
  assert.equal(adminRes.statusCode, 404);
});

test('Task 10 — Cross-society isolation on GET', async () => {
  // Resident B login
  const residentBRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'residentBstaff@portl.dev', password: 'password123' },
  });
  const residentBToken = (JSON.parse(residentBRes.body) as { accessToken: string }).accessToken;

  // Resident B fetches staff
  const getRes = await app.inject({
    method: 'GET',
    url: '/staff',
    headers: { authorization: `Bearer ${residentBToken}` },
  });
  
  assert.equal(getRes.statusCode, 200);
  const body = JSON.parse(getRes.body) as any;
  
  // They should only see 'Mario', not 'Luigi'
  assert.ok(body.providers.some((p: any) => p.name === 'Mario'));
  assert.ok(!body.providers.some((p: any) => p.name === 'Luigi'));
});

test('Task 10 — Admin can DELETE /staff/:id, Resident gets 403', async () => {
  // Resident tries to delete
  const residentRes = await app.inject({
    method: 'DELETE',
    url: `/staff/${createdProviderId}`,
    headers: { authorization: `Bearer ${residentToken}` },
  });
  assert.equal(residentRes.statusCode, 403);

  // Admin deletes
  const adminRes = await app.inject({
    method: 'DELETE',
    url: `/staff/${createdProviderId}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(adminRes.statusCode, 204);

  // Verify deletion
  const check = await prisma.serviceProvider.findUnique({
    where: { id: createdProviderId },
  });
  assert.equal(check, null);
});
