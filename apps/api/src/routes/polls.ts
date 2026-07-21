import type { FastifyPluginAsync } from 'fastify';
import { CreatePollSchema, PollVoteSchema } from '@portl/shared';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import * as pollService from '../services/poll.service.js';

const pollRoutes: FastifyPluginAsync = async (fastify) => {
  // -------------------------------------------------------------------------
  // GET /polls
  // Fetches polls scoped to the caller's societyId, including vote tallies.
  // -------------------------------------------------------------------------
  fastify.get(
    '/polls',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const societyId = request.user.societyId;
      const polls = await pollService.getPolls(societyId);
      return reply.status(200).send({ polls });
    }
  );

  // -------------------------------------------------------------------------
  // POST /polls
  // Admin only. Creates a new poll for their society.
  // -------------------------------------------------------------------------
  fastify.post(
    '/polls',
    { preHandler: [requireAuth, requireRole('ADMIN')] },
    async (request, reply) => {
      const parsed = CreatePollSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      // Ensure societyId comes from the JWT, not the request body
      const societyId = request.user.societyId;
      const userId = request.user.userId;

      const poll = await pollService.createPoll(parsed.data, societyId, userId);
      return reply.status(201).send({ poll });
    }
  );

  // -------------------------------------------------------------------------
  // POST /polls/:id/vote
  // Resident only. Casts a vote on a poll.
  // -------------------------------------------------------------------------
  fastify.post(
    '/polls/:id/vote',
    { preHandler: [requireAuth, requireRole('RESIDENT')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = PollVoteSchema.safeParse(request.body);
      
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const userId = request.user.userId;

      try {
        const vote = await pollService.castVote(id, userId, parsed.data);
        if (!vote) {
          return reply.status(404).send({ error: 'Poll not found' });
        }
        return reply.status(201).send({ vote });
      } catch (err: any) {
        if (err.message === 'INVALID_OPTION') {
          return reply.status(400).send({ error: 'Invalid option selected' });
        }
        if (err.message === 'POLL_ENDED') {
          return reply.status(400).send({ error: 'Poll has ended' });
        }
        
        // Catch Prisma unique constraint violation (P2002)
        if (err.code === 'P2002') {
          throw fastify.httpErrors.conflict('You have already voted in this poll');
        }

        throw err;
      }
    }
  );
};

export default pollRoutes;
