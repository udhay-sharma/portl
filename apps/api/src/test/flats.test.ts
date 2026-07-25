process.env.NODE_ENV = 'test';

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

before(async () => {
  execSync('npx prisma db seed', { stdio: 'pipe' });
  app = await createApp();
  await app.ready();

  const loginGuard = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'guard@portl.dev', password: 'password123' },
  });
  guardToken = (JSON.parse(loginGuard.body) as { accessToken: string }).accessToken;

  const loginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'resident@portl.dev', password: 'password123' },
  });
  residentToken = (JSON.parse(loginRes.body) as { accessToken: string }).accessToken;
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test('Guard can search flats by number', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/flats/search?q=101',
    headers: { authorization: `Bearer ${guardToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.flats.length > 0);
  assert.equal(body.flats[0].number, '101');
});

test('Guard can search flats by resident name', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/flats/search?q=resident',
    headers: { authorization: `Bearer ${guardToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.flats.length > 0);
  assert.ok(body.flats[0].residents.some((r: any) => r.name.toLowerCase().includes('resident')));
});

test('Resident cannot search flats (403)', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/flats/search?q=101',
    headers: { authorization: `Bearer ${residentToken}` },
  });
  assert.equal(res.statusCode, 403);
});
