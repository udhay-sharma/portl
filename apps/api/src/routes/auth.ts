import type { FastifyPluginAsync } from 'fastify';
import { LoginSchema, RegisterSchema } from '@portl/shared';
import * as authService from '../services/auth.service.js';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // -------------------------------------------------------------------------
  // POST /auth/register
  // Resident-only self-registration. Guards and Admins are seeded in Step 1.6.
  // -------------------------------------------------------------------------
  fastify.post('/auth/register', async (request, reply) => {
    // Parse + validate body with RegisterSchema (use #2 of the "3 places" habit).
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await authService.register(parsed.data);

    if (!result.ok) {
      switch (result.code) {
        case 'ROLE_NOT_ALLOWED':
          return reply.status(400).send({
            error: 'Only RESIDENT registration is supported at this step',
          });
        case 'FLAT_REQUIRED':
          return reply.status(400).send({
            error: 'flatId is required for RESIDENT role',
          });
        case 'EMAIL_TAKEN':
          return reply.status(409).send({
            error: 'A user with this email already exists',
          });
      }
    }

    return reply.status(201).send({ user: result.user });
  });

  // -------------------------------------------------------------------------
  // POST /auth/login
  // Accepts email or phone as credential. Returns a signed JWT on success.
  // -------------------------------------------------------------------------
  fastify.post('/auth/login', async (request, reply) => {
    // Parse + validate body with LoginSchema (use #2 of the "3 places" habit).
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await authService.login(parsed.data);

    if (!result.ok) {
      // Same message for "user not found" and "wrong password" — prevents user enumeration.
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    return reply.status(200).send({ accessToken: result.accessToken });
  });
};

export default authRoutes;
