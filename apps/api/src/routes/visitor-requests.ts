import type { FastifyPluginAsync } from 'fastify';
import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';
import { VisitorRequestSchema, UpdateVisitorStatusSchema, assertValidTransition } from '@portl/shared';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { visitorNotificationQueue, PUSH_NOTIFICATION_DELAY_MS } from '../workers/visitor-notification.worker.js';

const visitorRequestRoutes: FastifyPluginAsync = async (fastify) => {
  // -------------------------------------------------------------------------
  // GET /visitor-requests
  //
  // Lock 2: requireAuth (JWT) + requireRole('RESIDENT') — Guards/Admins get 403
  // Lock 3: row-level scoping — flatId comes ONLY from request.user (verified JWT)
  //
  // The Prisma where clause is a constant: { flatId: request.user.flatId }
  // request.query, request.body, and request.params are NOT consulted for scoping.
  // A client passing ?flatId=<someone-else's-id> has zero effect on the DB query.
  //
  // Returns an empty array until Step 2.1 adds visitor request creation.
  // -------------------------------------------------------------------------
  fastify.get(
    '/visitor-requests',
    { preHandler: [requireAuth, requireRole('RESIDENT')] },
    async (request, reply) => {
      // SECURITY: flatId is read from the verified JWT payload set by requireAuth.
      // It is structurally impossible for the query string to influence this value.
      const scopedFlatId = request.user.flatId;

      if (!scopedFlatId) {
        // RESIDENT must always have a flatId — this means the token was issued
        // without one, which shouldn't happen but is a defence-in-depth check.
        return reply.status(400).send({
          error: 'User account has no flatId — cannot scope visitor requests',
        });
      }

      const visitorRequests = await prisma.visitorRequest.findMany({
        where: {
          flatId: scopedFlatId, // ← verified JWT, never client-supplied
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.status(200).send({ visitorRequests });
    },
  );

  // -------------------------------------------------------------------------
  // POST /visitor-requests
  // Step 2.1: Guard-only endpoint to create a visitor request.
  // Validates input with VisitorRequestSchema from @portl/shared.
  // Status defaults to PENDING at the database/Prisma schema level.
  // Step 2.4: Wraps creation in a Redis distributed lock (SET NX PX 5000)
  // keyed on lock:flat:{flatId} with try/finally release guarantee.
  // -------------------------------------------------------------------------
  fastify.post(
    '/visitor-requests',
    { preHandler: [requireAuth, requireRole('GUARD')] },
    async (request, reply) => {
      const parsed = VisitorRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const lockKey = `lock:flat:${parsed.data.flatId}`;
      let lockAcquired = false;

      try {
        const result = await redis.set(lockKey, '1', 'PX', 5000, 'NX');
        if (result === 'OK') {
          lockAcquired = true;
        }
      } catch (err) {
        // Rule 4: If Redis is unreachable, return a clean 503 Service Unavailable
        return reply.status(503).send({
          error: 'Service temporarily unavailable: unable to acquire distributed lock (Redis unreachable)',
        });
      }

      if (!lockAcquired) {
        return reply.status(409).send({
          error: 'Conflict: another visitor request for this flat is currently being processed',
        });
      }

      let visitorRequest = null;
      try {
        // Check if flat exists to return clean 400 rather than 500 foreign key crash
        const flat = await prisma.flat.findUnique({
          where: { id: parsed.data.flatId },
        });
        if (!flat) {
          return reply.status(400).send({ error: 'Flat not found' });
        }

        visitorRequest = await prisma.visitorRequest.create({
          data: {
            visitorName: parsed.data.name,
            purpose: parsed.data.purpose,
            visitorType: parsed.data.visitorType,
            photoUrl: parsed.data.photoUrl ?? null,
            flatId: parsed.data.flatId,
            createdByGuardId: request.user.userId,
            // status is intentionally omitted so Prisma/Postgres apply @default(PENDING)
          },
        });
      } finally {
        if (lockAcquired) {
          try {
            await redis.del(lockKey);
          } catch (delErr) {
            console.error('[Redis Cleanup Error] Failed to release lock:', delErr);
          }
        }
      }

      if (visitorRequest) {
        // Step 2.5: On successful POST /visitor-requests (after the lock is released and the row is created),
        // emit 'visitor:new' event containing the created visitor request to flat:{flatId} room.
        fastify.io?.to(`flat:${visitorRequest.flatId}`).emit('visitor:new', visitorRequest);

        // Step 3.1: Enqueue a delayed push notification job.
        // The worker re-checks status at fire time — if the resident already
        // responded via socket, the job exits cleanly without sending anything.
        await visitorNotificationQueue.add(
          'notify-resident',
          { visitorRequestId: visitorRequest.id, flatId: visitorRequest.flatId },
          { delay: PUSH_NOTIFICATION_DELAY_MS },
        );

        return reply.status(201).send({ visitorRequest });
      }
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /visitor-requests/:id
  // Step 2.2: Updates visitor request status using the state machine.
  // Calls assertValidTransition() BEFORE any database write happens.
  // Protected by requireAuth for now (role logic added in Step 2.3).
  // Step 2.5: Emits 'visitor:decided' event to flat:{flatId} room on success.
  // -------------------------------------------------------------------------
  fastify.patch<{ Params: { id: string } }>(
    '/visitor-requests/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = UpdateVisitorStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { id } = request.params;

      // Step 2.6: Check idempotencyKey in Redis BEFORE processing transition
      const idempotencyKey = parsed.data.idempotencyKey;
      if (idempotencyKey) {
        const cacheKey = `idempotency:patch-visitor:${idempotencyKey}`;
        try {
          const cachedRaw = await redis.get(cacheKey);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw) as {
              request: { id: string; status: string; userId: string };
              response: { statusCode: number; body: unknown };
            };

            // Rule 4a: Check if same idempotencyKey is reused for a different request body/target
            if (
              cached.request.id !== id ||
              cached.request.status !== parsed.data.status ||
              cached.request.userId !== request.user.userId
            ) {
              return reply.status(409).send({
                error: 'Idempotency conflict',
                message:
                  'This idempotency key has already been used for a different request',
              });
            }

            // Exactly matching replay: return cached response without touching DB or assertValidTransition
            return reply.status(cached.response.statusCode).send(cached.response.body);
          }
        } catch (redisErr) {
          fastify.log.error({ err: redisErr }, 'Redis idempotency get failed');
          return reply.status(503).send({
            error: 'Service Unavailable: Redis connection failed',
          });
        }
      }

      const visitorRequest = await prisma.visitorRequest.findUnique({
        where: { id },
      });

      if (!visitorRequest) {
        return reply.status(404).send({ error: 'Visitor request not found' });
      }

      // Step 2.3: Resident row-level scoping check
      // Residents can only modify visitor requests linked to their own flatId from their verified JWT.
      if (
        request.user.role === 'RESIDENT' &&
        visitorRequest.flatId !== request.user.flatId
      ) {
        return reply.status(403).send({
          error:
            'Forbidden: you do not have permission to modify visitor requests for this flat',
        });
      }

      // State machine validation strictly BEFORE any database update
      try {
        assertValidTransition(visitorRequest.status, parsed.data.status);
      } catch (err) {
        return reply.status(400).send({
          error: 'Invalid transition',
          message:
            err instanceof Error ? err.message : 'Invalid status transition',
          currentStatus: visitorRequest.status,
          requestedStatus: parsed.data.status,
        });
      }

      const updated = await prisma.visitorRequest.update({
        where: { id },
        data: { status: parsed.data.status },
      });

      // Step 2.5: On successful status change, emit 'visitor:decided' to flat:{flatId} room.
      fastify.io?.to(`flat:${updated.flatId}`).emit('visitor:decided', updated);

      const responseBody = { visitorRequest: updated };

      // Step 2.6: Store successful response in Redis with 300s TTL (Rule 4b)
      if (idempotencyKey) {
        const cacheKey = `idempotency:patch-visitor:${idempotencyKey}`;
        try {
          await redis.set(
            cacheKey,
            JSON.stringify({
              request: {
                id,
                status: parsed.data.status,
                userId: request.user.userId,
              },
              response: {
                statusCode: 200,
                body: responseBody,
              },
            }),
            'EX',
            300, // 5 minutes TTL
          );
        } catch (redisErr) {
          fastify.log.error({ err: redisErr }, 'Redis idempotency set failed');
        }
      }

      return reply.status(200).send(responseBody);
    },
  );
};

export default visitorRequestRoutes;
