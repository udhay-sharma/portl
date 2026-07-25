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
let adminToken: string;
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

  // Login Admin
  const adminRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'admin@portl.dev', password: 'password123' },
  });
  adminToken = JSON.parse(adminRes.body).accessToken;
  
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

test('Step 4.5 Amenities — Admin can create an amenity', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/amenities`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      name: 'Swimming Pool',
      slotDurationMinutes: 120,
    },
  });
  assert.equal(res.statusCode, 201);
  const body = JSON.parse(res.body);
  assert.equal(body.amenity.name, 'Swimming Pool');
  assert.equal(body.amenity.slotDurationMinutes, 120);
});

test('Step 4.5 Amenities — Resident gets 403 trying to create amenity', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/amenities`,
    headers: { authorization: `Bearer ${residentAToken}` },
    payload: {
      name: 'Gym',
    },
  });
  assert.equal(res.statusCode, 403);
});

test('Step 4.5 Amenities — Admin can update an amenity', async () => {
  const res = await app.inject({
    method: 'PATCH',
    url: `/amenities/${amenityId}`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      name: 'Super Clubhouse',
    },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.amenity.name, 'Super Clubhouse');
});

test('Step 4.5 Amenities — Admin can delete an amenity', async () => {
  // First create a temporary amenity
  const tempAmenityRes = await app.inject({
    method: 'POST',
    url: `/amenities`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: 'Temp Amenity' },
  });
  const tempAmenityId = JSON.parse(tempAmenityRes.body).amenity.id;

  const res = await app.inject({
    method: 'DELETE',
    url: `/amenities/${tempAmenityId}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.statusCode, 200);

  // Verify deletion
  const getRes = await app.inject({
    method: 'GET',
    url: `/amenities`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const body = JSON.parse(getRes.body);
  assert.equal(body.amenities.some((a: any) => a.id === tempAmenityId), false);
});
