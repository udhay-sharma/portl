import jwt from 'jsonwebtoken';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload } from '../types/fastify.js';

// ---------------------------------------------------------------------------
// Lock 2a — requireAuth
//
// Reads: Authorization: Bearer <token>
// Verifies with HS256 against JWT_SECRET (algorithm hardcoded to prevent
// algorithm-confusion attacks — e.g. alg:none or RS256 downgrade).
// On success: sets request.user = decoded JWT payload.
// On failure: 401 — "who are you?"
// ---------------------------------------------------------------------------
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Authorization header missing or malformed' });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    // Server misconfiguration — return 500 rather than leaking the detail
    request.log.error('JWT_SECRET is not configured');
    return reply.status(500).send({ error: 'Server misconfiguration' });
  }

  try {
    // verify() throws on: expired token, bad signature, wrong algorithm, malformed token.
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtPayload;
    request.user = decoded;
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
}

// ---------------------------------------------------------------------------
// Lock 2b — requireRole
//
// Factory: returns a preHandler that checks request.user.role.
// MUST be used after requireAuth in the preHandler array.
//
// 401 = "who are you?" (no valid identity)
// 403 = "I know who you are — you're not allowed" (identity confirmed, wrong role)
// ---------------------------------------------------------------------------
export function requireRole(...roles: string[]) {
  return async function checkRole(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      // requireRole used without requireAuth — safety fallback
      return reply.status(401).send({ error: 'Not authenticated' });
    }
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({
        error: `Forbidden: requires one of [${roles.join(', ')}]`,
      });
    }
  };
}
