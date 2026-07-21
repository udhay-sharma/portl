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
let residentBToken: string; // from Flat B to ensure different users
let pollId: string;

before(async () => {
  execSync('npx prisma db seed', { stdio: 'pipe' });
  app = await createApp();
  await app.ready();

  // Login as Admin
  const adminRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'admin@portl.dev', password: 'password123' },
  });
  adminToken = JSON.parse(adminRes.body).accessToken;

  // Login as Resident A
  const residentARes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'resident@portl.dev', password: 'password123' },
  });
  residentAToken = JSON.parse(residentARes.body).accessToken;

  // Login as Resident B (from Flat B, created in seed script but let's assume one is available or we use guard)
  // Actually, we don't strictly need a second resident for the double vote test, just one resident voting twice.
});

after(async () => {
  await prisma.pollVote.deleteMany({});
  await prisma.poll.deleteMany({});
  
  if (redis.status !== 'end' && redis.status !== 'close') {
    await redis.quit().catch(() => redis.disconnect());
  }
  await app.close();
  await prisma.$disconnect();
});

test('Step 4.2 Polls — Admin can create a poll', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/polls',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      question: 'What color should we paint the lobby?',
      options: ['Red', 'Blue', 'Green'],
    },
  });

  assert.equal(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${res.body}`);
  
  const body = JSON.parse(res.body);
  assert.ok(body.poll.id);
  assert.equal(body.poll.question, 'What color should we paint the lobby?');
  pollId = body.poll.id;
});

test('Step 4.2 Polls — Resident can vote on a poll successfully', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/polls/${pollId}/vote`,
    headers: { authorization: `Bearer ${residentAToken}` },
    payload: {
      selectedOption: 'Blue',
    },
  });

  assert.equal(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${res.body}`);
});

test('Step 4.2 Polls — DB constraint catches double voting (concurrent race test)', async () => {
  // First, create a fresh poll to ensure clean slate for this user
  const pollRes = await app.inject({
    method: 'POST',
    url: '/polls',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      question: 'Concurrent test poll',
      options: ['Yes', 'No'],
    },
  });
  const newPollId = JSON.parse(pollRes.body).poll.id;

  // Fire two simultaneous requests from the SAME resident to vote on this new poll
  const [res1, res2] = await Promise.all([
    app.inject({
      method: 'POST',
      url: `/polls/${newPollId}/vote`,
      headers: { authorization: `Bearer ${residentAToken}` },
      payload: { selectedOption: 'Yes' },
    }),
    app.inject({
      method: 'POST',
      url: `/polls/${newPollId}/vote`,
      headers: { authorization: `Bearer ${residentAToken}` },
      payload: { selectedOption: 'Yes' },
    }),
  ]);

  // One MUST succeed (201) and one MUST fail (409)
  const statuses = [res1.statusCode, res2.statusCode].sort((a, b) => a - b);
  assert.deepEqual(statuses, [201, 409], 'Exactly one request should succeed (201) and one fail (409)');

  // Verify the error message on the 409
  const failedRes = res1.statusCode === 409 ? res1 : res2;
  const errorBody = JSON.parse(failedRes.body);
  assert.equal(errorBody.message, 'You have already voted in this poll');
});

test('Step 4.2 Polls — GET /polls includes correctly tallied votes', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/polls',
    headers: { authorization: `Bearer ${residentAToken}` },
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(Array.isArray(body.polls));
  
  // Find the first poll we voted 'Blue' on
  const firstPoll = body.polls.find((p: any) => p.id === pollId);
  assert.ok(firstPoll, 'Poll not found in results');
  
  // Results tally check
  const blueResult = firstPoll.results.find((r: any) => r.option === 'Blue');
  assert.ok(blueResult);
  assert.equal(blueResult.count, 1);

  const redResult = firstPoll.results.find((r: any) => r.option === 'Red');
  assert.equal(redResult.count, 0);
});
