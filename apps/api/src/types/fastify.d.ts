import 'fastify';

// ---------------------------------------------------------------------------
// Adds `user` to FastifyRequest globally.
// Set by `requireAuth` after JWT verification — never trust anything the
// client sends about who they are. This payload is read from the verified
// JWT signature.
// ---------------------------------------------------------------------------

export type JwtPayload = {
  userId: string;
  role: string;
  societyId: string;
  flatId: string | null;
};

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload;
  }
}
