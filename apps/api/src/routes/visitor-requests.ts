import type { FastifyPluginAsync } from 'fastify';
import prisma from '../lib/prisma.js';
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
};

export default visitorRequestRoutes;
