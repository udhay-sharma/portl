import type { FastifyPluginAsync } from 'fastify';
import { CreateComplaintSchema, UpdateComplaintStatusSchema } from '@portl/shared';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import * as complaintService from '../services/complaint.service.js';

const complaintRoutes: FastifyPluginAsync = async (fastify) => {
  // -------------------------------------------------------------------------
  // GET /complaints
  // Residents see their flat's complaints. Admins see all in their society.
  // -------------------------------------------------------------------------
  fastify.get(
    '/complaints',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { role, flatId, societyId } = request.user;
      
      let complaints;
      if (role === 'RESIDENT' && flatId) {
        complaints = await complaintService.getComplaintsByFlat(flatId);
      } else if (role === 'ADMIN') {
        complaints = await complaintService.getComplaintsBySociety(societyId);
      } else {
        // Guards or incomplete users don't have access
        return reply.status(403).send({ error: 'Access denied' });
      }

      return reply.status(200).send({ complaints });
    }
  );

  // -------------------------------------------------------------------------
  // POST /complaints
  // Resident only. Creates a new complaint for their flat.
  // -------------------------------------------------------------------------
  fastify.post(
    '/complaints',
    { preHandler: [requireAuth, requireRole('RESIDENT')] },
    async (request, reply) => {
      const parsed = CreateComplaintSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      // Ensure flatId and userId come from the JWT, not the request body
      const flatId = request.user.flatId;
      const userId = request.user.userId;

      if (!flatId) {
        return reply.status(403).send({ error: 'User does not belong to a flat' });
      }

      const complaint = await complaintService.createComplaint(parsed.data, flatId, userId);
      return reply.status(201).send({ complaint });
    }
  );

  // -------------------------------------------------------------------------
  // PATCH /complaints/:id
  // Admin only. Updates the status through the state machine.
  // -------------------------------------------------------------------------
  fastify.patch(
    '/complaints/:id',
    { preHandler: [requireAuth, requireRole('ADMIN')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateComplaintStatusSchema.safeParse(request.body);
      
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      try {
        const updated = await complaintService.updateComplaintStatus(id, parsed.data.status);
        if (!updated) {
          return reply.status(404).send({ error: 'Complaint not found' });
        }
        return reply.status(200).send({ complaint: updated });
      } catch (err: any) {
        // Catch state machine transition errors and return clean 400
        if (err.name === 'InvalidComplaintTransitionError') {
          return reply.status(400).send({ error: err.message });
        }
        throw err;
      }
    }
  );
};

export default complaintRoutes;
