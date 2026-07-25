import type { FastifyPluginAsync } from 'fastify';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const flatRoutes: FastifyPluginAsync = async (fastify) => {
  // -------------------------------------------------------------------------
  // GET /flats/search
  // Guard-only endpoint to search for flats by number or resident name.
  // -------------------------------------------------------------------------
  fastify.get(
    '/flats/search',
    { preHandler: [requireAuth, requireRole('GUARD')] },
    async (request, reply) => {
      const q = (request.query as { q?: string }).q || '';
      
      const flats = await prisma.flat.findMany({
        where: {
          tower: { societyId: request.user.societyId },
          OR: q ? [
            { number: { contains: q, mode: 'insensitive' } },
            { residents: { some: { name: { contains: q, mode: 'insensitive' } } } },
          ] : undefined,
        },
        include: {
          residents: {
            select: { name: true, phone: true },
          },
          tower: {
            select: { name: true },
          },
        },
        take: 20,
      });

      return reply.status(200).send({ flats });
    }
  );
};

export default flatRoutes;
