import type { FastifyPluginAsync } from 'fastify';
import prisma from '../lib/prisma.js';
import { VisitorRequestSchema } from '@portl/shared';
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
};

export default visitorRequestRoutes;
