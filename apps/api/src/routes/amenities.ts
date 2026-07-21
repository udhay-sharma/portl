import type { FastifyPluginAsync } from 'fastify';
import { AmenityBookingSchema } from '@portl/shared';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import * as amenityService from '../services/amenity.service.js';

const amenityRoutes: FastifyPluginAsync = async (fastify) => {
  // -------------------------------------------------------------------------
  // POST /amenities/:id/book
  // Resident only. Books a time slot for an amenity.
  // -------------------------------------------------------------------------
  fastify.post(
    '/amenities/:id/book',
    { preHandler: [requireAuth, requireRole('RESIDENT')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = AmenityBookingSchema.safeParse(request.body);
      
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { userId, societyId } = request.user;

      try {
        const booking = await amenityService.bookAmenity(id, societyId, userId, parsed.data);
        if (!booking) {
          return reply.status(404).send({ error: 'Amenity not found' });
        }
        return reply.status(201).send({ booking });
      } catch (err: any) {
        // Prisma might throw DriverAdapterError or PrismaClientKnownRequestError for EXCLUDE constraints
        if (err.message && err.message.includes('no_overlapping_bookings')) {
          throw fastify.httpErrors.conflict('This time slot overlaps with an existing booking.');
        }
        throw err;
      }
    }
  );
};

export default amenityRoutes;
