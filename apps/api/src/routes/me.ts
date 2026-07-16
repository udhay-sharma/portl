import type { FastifyPluginAsync } from 'fastify';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const meRoutes: FastifyPluginAsync = async (fastify) => {
  // -------------------------------------------------------------------------
  // GET /me
  // Lock 2 in action: requireAuth verifies the JWT and sets request.user.
  // The userId in the token is used to fetch the user's own row — the client
  // cannot supply a different userId and get someone else's data.
  // -------------------------------------------------------------------------
  fastify.get('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        societyId: true,
        flatId: true,
        createdAt: true,
        // passwordHash intentionally excluded
      },
    });

    if (!user) {
      // Token is valid but user was deleted since it was issued
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.status(200).send({ user });
  });
};

export default meRoutes;
