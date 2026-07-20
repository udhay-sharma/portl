/**
 * Step 2.5 — Socket.IO Real-Time Updates Integration Test
 *
 * Verifies:
 * 1. Socket connects and joins flat:{flatId} room via 'join' event.
 * 2. Successful POST /visitor-requests emits 'visitor:new' event to the flat's room containing the created row.
 * 3. Successful PATCH /visitor-requests/:id emits 'visitor:decided' event containing the updated status.
 */

import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../app.js';
import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';

let app: FastifyInstance;
let serverUrl: string;
let guardToken: string;
let clientSocket: ClientSocket;
const FLAT_ID = 'c0000000-0000-0000-0000-000000000001'; // Seed Flat 101

before(async () => {
  execSync('npx prisma db seed', { stdio: 'pipe' });

  app = await createApp();
  // Listen on ephemeral port 0 so real Socket.IO server accepts connections
  serverUrl = await app.listen({ port: 0, host: '127.0.0.1' });

  await redis.connect().catch(() => {
    // ignore if already connected
  });

  const loginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { credential: 'guard@portl.dev', password: 'password123' },
  });
  assert.equal(loginRes.statusCode, 200);
  guardToken = (JSON.parse(loginRes.body) as { accessToken: string }).accessToken;

  // Connect socket client
  clientSocket = Client(serverUrl, {
    transports: ['websocket'],
    forceNew: true,
  });

  await new Promise<void>((resolve, reject) => {
    clientSocket.on('connect', resolve);
    clientSocket.on('connect_error', reject);
  });

  // Join the room for Flat 101
  clientSocket.emit('join', FLAT_ID);
  // Give the server 50ms to process the join room event
  await new Promise((resolve) => setTimeout(resolve, 50));
});

after(async () => {
  if (clientSocket) {
    clientSocket.disconnect();
  }

  // ApprovalDecision must be deleted before VisitorRequest (FK constraint, no cascade)
  const requests = await prisma.visitorRequest.findMany({ where: { flatId: FLAT_ID }, select: { id: true } });
  const ids = requests.map((r) => r.id);
  if (ids.length > 0) {
    await prisma.approvalDecision.deleteMany({ where: { visitorRequestId: { in: ids } } });
  }
  await prisma.visitorRequest.deleteMany({
    where: { flatId: FLAT_ID },
  });

  await app.close();
  await prisma.$disconnect();
});

test('Step 2.5 — POST /visitor-requests emits visitor:new event to flat:{flatId} room', async () => {
  let createdId = '';

  const eventPromise = new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for visitor:new event')), 3000);
    clientSocket.once('visitor:new', (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

  const res = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${guardToken}` },
    payload: {
      name: 'Real-Time Socket Visitor',
      purpose: 'Testing Socket Emissions',
      visitorType: 'Delivery',
      flatId: FLAT_ID,
    },
  });

  assert.equal(res.statusCode, 201, `Expected 201 Created, got ${res.statusCode}: ${res.body}`);
  const body = JSON.parse(res.body) as { visitorRequest: { id: string } };
  createdId = body.visitorRequest.id;

  const eventData = await eventPromise;
  assert.equal(eventData.id, createdId, 'Event payload id must match created visitorRequest id');
  assert.equal(eventData.visitorName, 'Real-Time Socket Visitor');
  assert.equal(eventData.status, 'PENDING');
});

test('Step 2.5 — PATCH /visitor-requests/:id emits visitor:decided event to flat:{flatId} room', async () => {
  // First create a pending visitor request to modify
  const createRes = await app.inject({
    method: 'POST',
    url: '/visitor-requests',
    headers: { authorization: `Bearer ${guardToken}` },
    payload: {
      name: 'Status Change Visitor',
      purpose: 'Testing decided event',
      visitorType: 'Guest',
      flatId: FLAT_ID,
    },
  });
  const { visitorRequest } = JSON.parse(createRes.body) as { visitorRequest: { id: string } };

  const eventPromise = new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for visitor:decided event')), 3000);
    clientSocket.once('visitor:decided', (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

  const patchRes = await app.inject({
    method: 'PATCH',
    url: `/visitor-requests/${visitorRequest.id}`,
    headers: { authorization: `Bearer ${guardToken}` },
    payload: { status: 'APPROVED' },
  });

  assert.equal(patchRes.statusCode, 200, `Expected 200 OK, got ${patchRes.statusCode}: ${patchRes.body}`);

  const eventData = await eventPromise;
  assert.equal(eventData.id, visitorRequest.id, 'Event payload id must match updated request id');
  assert.equal(eventData.status, 'APPROVED', 'Status in event payload must be APPROVED');
});
