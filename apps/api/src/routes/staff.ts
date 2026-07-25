import type { FastifyPluginAsync } from 'fastify';
import z from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const CreateProviderSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  phone: z.string().min(1),
  notes: z.string().optional().nullable(),
});

const UpdateProviderSchema = CreateProviderSchema.partial();

const staffRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /staff (Resident and Admin)
  fastify.get(
    '/staff',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const societyId = request.user.societyId;
      const providers = await prisma.serviceProvider.findMany({
        where: { societyId },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      });
      return reply.status(200).send({ providers });
    }
  );

  // POST /staff (Admin only)
  fastify.post(
    '/staff',
    { preHandler: [requireAuth, requireRole('ADMIN')] },
    async (request, reply) => {
      const parsed = CreateProviderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const societyId = request.user.societyId;

      const provider = await prisma.serviceProvider.create({
        data: {
          name: parsed.data.name,
          category: parsed.data.category,
          phone: parsed.data.phone,
          notes: parsed.data.notes,
          societyId,
        },
      });

      return reply.status(201).send(provider);
    }
  );

  // PATCH /staff/:id (Admin only)
  fastify.patch(
    '/staff/:id',
    { preHandler: [requireAuth, requireRole('ADMIN')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateProviderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const societyId = request.user.societyId;

      // Verify ownership
      const existing = await prisma.serviceProvider.findFirst({
        where: { id, societyId },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Service provider not found in your society' });
      }

      const updated = await prisma.serviceProvider.update({
        where: { id },
        data: parsed.data,
      });

      return reply.status(200).send(updated);
    }
  );

  // DELETE /staff/:id (Admin only)
  fastify.delete(
    '/staff/:id',
    { preHandler: [requireAuth, requireRole('ADMIN')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const societyId = request.user.societyId;

      // Verify ownership
      const existing = await prisma.serviceProvider.findFirst({
        where: { id, societyId },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Service provider not found in your society' });
      }

      await prisma.serviceProvider.delete({
        where: { id },
      });

      return reply.status(204).send();
    }
  );
};

export default staffRoutes;
