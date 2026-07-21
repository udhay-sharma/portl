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
let residentAToken: string;
let residentBToken: string;
let amenityId: string;
let societyId: string;

before(async () => {
  execSync('npx prisma db seed', { stdio: 'pipe' });
  app = await createApp();
  await app.ready();

  // Login Resident A
  const residentARes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'resident@portl.dev', password: 'password123' },
  });
  residentAToken = JSON.parse(residentARes.body).accessToken;
  
  // Decode JWT to get societyId (base64 string)
  const payloadBase64 = residentAToken.split('.')[1];
  const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
  societyId = payload.societyId;

  // We need an amenity
  const amenity = await prisma.amenity.create({
    data: {
      name: 'Clubhouse',
      societyId,
    },
  });
  amenityId = amenity.id;

  // Login a second resident just for fun, or we can use Resident A to double book
});

after(async () => {
  await prisma.amenityBooking.deleteMany({});
  await prisma.amenity.deleteMany({});
  
  if (redis.status !== 'end' && redis.status !== 'close') {
    await redis.quit().catch(() => redis.disconnect());
  }
  await app.close();
  await prisma.$disconnect();
});

test('Step 4.4 Amenities — Resident can book an amenity slot', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/amenities/${amenityId}/book`,
    headers: { authorization: `Bearer ${residentAToken}` },
    payload: {
      date: new Date('2026-10-01T00:00:00Z').toISOString(),
      startTime: new Date('2026-10-01T09:00:00Z').toISOString(),
      endTime: new Date('2026-10-01T10:00:00Z').toISOString(),
    },
  });

  assert.equal(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${res.body}`);
});

test('Step 4.4 Amenities — DB constraint strictly blocks overlapping slot (concurrent race test)', async () => {
  // Fire two simultaneous requests for the SAME slot (11:00 AM to 12:00 PM)
  const [res1, res2] = await Promise.all([
    app.inject({
      method: 'POST',
      url: `/amenities/${amenityId}/book`,
      headers: { authorization: `Bearer ${residentAToken}` },
      payload: {
        date: new Date('2026-10-01T00:00:00Z').toISOString(),
        startTime: new Date('2026-10-01T11:00:00Z').toISOString(),
        endTime: new Date('2026-10-01T12:00:00Z').toISOString(),
      },
    }),
    app.inject({
      method: 'POST',
      url: `/amenities/${amenityId}/book`,
      headers: { authorization: `Bearer ${residentAToken}` },
      payload: {
        date: new Date('2026-10-01T00:00:00Z').toISOString(),
        startTime: new Date('2026-10-01T11:30:00Z').toISOString(), // overlaps with 11:00-12:00
        endTime: new Date('2026-10-01T12:30:00Z').toISOString(),
      },
    }),
  ]);

  // One MUST succeed (201) and one MUST fail (409)
  const statuses = [res1.statusCode, res2.statusCode].sort((a, b) => a - b);
  assert.deepEqual(statuses, [201, 409], 'Exactly one request should succeed (201) and one fail (409)');

  // Verify the error message on the 409
  const failedRes = res1.statusCode === 409 ? res1 : res2;
  const errorBody = JSON.parse(failedRes.body);
  assert.equal(errorBody.message, 'This time slot overlaps with an existing booking.');
});

test('Step 4.4 Amenities — Allows concurrent bookings for DIFFERENT slots on same amenity', async () => {
  // Fire two simultaneous requests for DIFFERENT slots
  const [res1, res2] = await Promise.all([
    app.inject({
      method: 'POST',
      url: `/amenities/${amenityId}/book`,
      headers: { authorization: `Bearer ${residentAToken}` },
      payload: {
        date: new Date('2026-10-01T00:00:00Z').toISOString(),
        startTime: new Date('2026-10-01T14:00:00Z').toISOString(),
        endTime: new Date('2026-10-01T15:00:00Z').toISOString(),
      },
    }),
    app.inject({
      method: 'POST',
      url: `/amenities/${amenityId}/book`,
      headers: { authorization: `Bearer ${residentAToken}` },
      payload: {
        date: new Date('2026-10-01T00:00:00Z').toISOString(),
        startTime: new Date('2026-10-01T15:00:00Z').toISOString(),
        endTime: new Date('2026-10-01T16:00:00Z').toISOString(),
      },
    }),
  ]);

  // BOTH MUST succeed (201) because they don't overlap
  assert.equal(res1.statusCode, 201);
  assert.equal(res2.statusCode, 201);
});
