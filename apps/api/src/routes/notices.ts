import type { FastifyPluginAsync } from 'fastify';
import { CreateNoticeSchema } from '@portl/shared';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import * as noticeService from '../services/notice.service.js';

const noticeRoutes: FastifyPluginAsync = async (fastify) => {
  // -------------------------------------------------------------------------
  // GET /notices
  // Fetches notices scoped to the caller's societyId.
  // Cached in Redis for ~60s.
  // -------------------------------------------------------------------------
  fastify.get(
    '/notices',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      // Step 4.1: Deriving societyId directly from the validated JWT payload.
      // Verified that societyId is present for all roles (RESIDENT, GUARD, ADMIN).
      const societyId = request.user.societyId;
      const notices = await noticeService.getNotices(societyId);
      return reply.status(200).send({ notices });
    }
  );

  // -------------------------------------------------------------------------
  // POST /notices
  // Admin only. Creates a new notice for their society.
  // -------------------------------------------------------------------------
  fastify.post(
    '/notices',
    { preHandler: [requireAuth, requireRole('ADMIN')] },
    async (request, reply) => {
      const parsed = CreateNoticeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      // Step 4.1: Ensure societyId comes from the JWT, not the request body
      const societyId = request.user.societyId;
      const userId = request.user.userId;

      const notice = await noticeService.createNotice(parsed.data, societyId, userId);
      return reply.status(201).send({ notice });
    }
  );
};

export default noticeRoutes;
