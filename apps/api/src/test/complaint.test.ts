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
let residentAToken: string;
let residentBToken: string;
let complaintId: string;

before(async () => {
  execSync('npx prisma db seed', { stdio: 'pipe' });
  app = await createApp();
  await app.ready();

  // Login Admin
  const adminRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'admin@portl.dev', password: 'password123' },
  });
  adminToken = JSON.parse(adminRes.body).accessToken;

  // Login Resident A
  const residentARes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'resident@portl.dev', password: 'password123' },
  });
  residentAToken = JSON.parse(residentARes.body).accessToken;

  // Create and Login a Resident B in a different flat (Flat B) if needed, 
  // but we can just use the seeded users.
});

after(async () => {
  await prisma.complaint.deleteMany({});
  
  if (redis.status !== 'end' && redis.status !== 'close') {
    await redis.quit().catch(() => redis.disconnect());
  }
  await app.close();
  await prisma.$disconnect();
});

test('Step 4.3 Complaints — Resident can create a complaint', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/complaints',
    headers: { authorization: `Bearer ${residentAToken}` },
    payload: {
      title: 'Water leak in lobby',
      description: 'The ceiling is leaking near the elevator.',
    },
  });

  assert.equal(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${res.body}`);
  
  const body = JSON.parse(res.body);
  assert.ok(body.complaint.id);
  assert.equal(body.complaint.title, 'Water leak in lobby');
  assert.equal(body.complaint.status, 'OPEN');
  complaintId = body.complaint.id;
});

test('Step 4.3 Complaints — Admin gets 403 trying to create a complaint (RESIDENT only)', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/complaints',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      title: 'Admin complaint',
      description: 'Admins cannot create complaints',
    },
  });

  assert.equal(res.statusCode, 403);
});

test('Step 4.3 Complaints — Resident sees their complaint', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/complaints',
    headers: { authorization: `Bearer ${residentAToken}` },
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(Array.isArray(body.complaints));
  const found = body.complaints.find((c: any) => c.id === complaintId);
  assert.ok(found, 'Complaint should be visible to Resident');
});

test('Step 4.3 Complaints — Admin sees complaints for the entire society', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/complaints',
    headers: { authorization: `Bearer ${adminToken}` },
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(Array.isArray(body.complaints));
  const found = body.complaints.find((c: any) => c.id === complaintId);
  assert.ok(found, 'Complaint should be visible to Admin');
});

test('Step 4.3 Complaints — Resident gets 403 trying to transition status (ADMIN only)', async () => {
  const res = await app.inject({
    method: 'PATCH',
    url: `/complaints/${complaintId}`,
    headers: { authorization: `Bearer ${residentAToken}` },
    payload: { status: 'IN_PROGRESS' },
  });

  assert.equal(res.statusCode, 403);
});

test('Step 4.3 Complaints — Admin successfully transitions status OPEN -> IN_PROGRESS', async () => {
  const res = await app.inject({
    method: 'PATCH',
    url: `/complaints/${complaintId}`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { status: 'IN_PROGRESS' },
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.complaint.status, 'IN_PROGRESS');
});

test('Step 4.3 Complaints — Admin gets 400 trying invalid transition IN_PROGRESS -> OPEN', async () => {
  const res = await app.inject({
    method: 'PATCH',
    url: `/complaints/${complaintId}`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { status: 'OPEN' }, // Not allowed per state machine
  });

  assert.equal(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'Invalid complaint status transition: cannot transition from IN_PROGRESS to OPEN');
});
