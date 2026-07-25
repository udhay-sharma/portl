import type { FastifyPluginAsync } from 'fastify';
import { AmenityBookingSchema, CreateAmenitySchema, UpdateAmenitySchema } from '@portl/shared';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import * as amenityService from '../services/amenity.service.js';
import prisma from '../lib/prisma.js';

const amenityRoutes: FastifyPluginAsync = async (fastify) => {
  // -------------------------------------------------------------------------
  // GET /amenities
  // Returns amenities scoped to the caller's societyId.
  // -------------------------------------------------------------------------
  fastify.get(
    '/amenities',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { societyId } = request.user;
      const startOfTodayUTC = new Date();
      startOfTodayUTC.setUTCHours(0, 0, 0, 0);

      const amenities = await prisma.amenity.findMany({
        where: { societyId },
        orderBy: { createdAt: 'desc' },
        include: {
          bookings: {
            where: { date: { gte: startOfTodayUTC } },
            select: {
              id: true,
              bookedByUserId: true,
              startTime: true,
              endTime: true,
            },
          },
        },
      });
      return reply.status(200).send({ amenities });
    }
  );

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

  // -------------------------------------------------------------------------
  // POST /amenities
  // Admin only. Create a new amenity for their society.
  // -------------------------------------------------------------------------
  fastify.post(
    '/amenities',
    { preHandler: [requireAuth, requireRole('ADMIN')] },
    async (request, reply) => {
      const parsed = CreateAmenitySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { societyId } = request.user;
      const amenity = await amenityService.createAmenity(societyId, parsed.data);
      return reply.status(201).send({ amenity });
    }
  );

  // -------------------------------------------------------------------------
  // PATCH /amenities/:id
  // Admin only. Update an existing amenity in their society.
  // -------------------------------------------------------------------------
  fastify.patch(
    '/amenities/:id',
    { preHandler: [requireAuth, requireRole('ADMIN')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateAmenitySchema.safeParse(request.body);
      
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { societyId } = request.user;
      const amenity = await amenityService.updateAmenity(id, societyId, parsed.data);
      if (!amenity) {
        return reply.status(404).send({ error: 'Amenity not found' });
      }
      return reply.status(200).send({ amenity });
    }
  );

  // -------------------------------------------------------------------------
  // DELETE /amenities/:id
  // Admin only. Delete an amenity in their society.
  // -------------------------------------------------------------------------
  fastify.delete(
    '/amenities/:id',
    { preHandler: [requireAuth, requireRole('ADMIN')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { societyId } = request.user;
      
      const success = await amenityService.deleteAmenity(id, societyId);
      if (!success) {
        return reply.status(404).send({ error: 'Amenity not found' });
      }
      return reply.status(200).send({ success: true });
    }
  );
};

export default amenityRoutes;
