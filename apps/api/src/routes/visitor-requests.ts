import type { FastifyPluginAsync } from 'fastify';
import prisma from '../lib/prisma.js';
import { VisitorRequestSchema, UpdateVisitorStatusSchema, assertValidTransition } from '@portl/shared';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

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

      // Check if flat exists to return clean 400 rather than 500 foreign key crash
      const flat = await prisma.flat.findUnique({
        where: { id: parsed.data.flatId },
      });
      if (!flat) {
        return reply.status(400).send({ error: 'Flat not found' });
      }

      const visitorRequest = await prisma.visitorRequest.create({
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

      return reply.status(201).send({ visitorRequest });
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /visitor-requests/:id
  // Step 2.2: Updates visitor request status using the state machine.
  // Calls assertValidTransition() BEFORE any database write happens.
  // Protected by requireAuth for now (role logic added in Step 2.3).
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

      return reply.status(200).send({ visitorRequest: updated });
    },
  );
};

export default visitorRequestRoutes;
