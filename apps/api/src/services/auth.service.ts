import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { RegisterInput, LoginInput } from '@portl/shared';
import prisma from '../lib/prisma.js';

const BCRYPT_SALT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

function buildToken(user: {
  id: string;
  role: string;
  societyId: string;
  flatId: string | null;
}): string {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      societyId: user.societyId,
      flatId: user.flatId,
    },
    getJwtSecret(),
    { expiresIn: '7d', algorithm: 'HS256' },
  );
}

// ---------------------------------------------------------------------------
// Register
// Step 1.4: Resident role only. Guard/Admin accounts are seeded in Step 1.6.
// ---------------------------------------------------------------------------

export type RegisterResult =
  | { ok: true; user: SafeUser }
  | { ok: false; code: 'ROLE_NOT_ALLOWED' | 'FLAT_REQUIRED' | 'EMAIL_TAKEN' };

export type SafeUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  societyId: string;
  flatId: string | null;
  createdAt: Date;
};

export async function register(input: RegisterInput): Promise<RegisterResult> {
  // Only RESIDENT registration is supported in Step 1.4.
  if (input.role !== 'RESIDENT') {
    return { ok: false, code: 'ROLE_NOT_ALLOWED' };
  }

  // flatId is required for RESIDENT (per architecture doc design decision).
  if (!input.flatId) {
    return { ok: false, code: 'FLAT_REQUIRED' };
  }

  // Check for duplicate email.
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    return { ok: false, code: 'EMAIL_TAKEN' };
  }

  // Hash password — plaintext never stored or logged.
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,          // bcrypt hash, NOT plaintext
      role: input.role,
      societyId: input.societyId,
      flatId: input.flatId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      societyId: true,
      flatId: true,
      createdAt: true,
      // passwordHash intentionally excluded from the result
    },
  });

  return { ok: true, user };
}

// ---------------------------------------------------------------------------
// Login
// Accepts credential as email or phone. Returns a signed JWT on success.
// ---------------------------------------------------------------------------

export type LoginResult =
  | { ok: true; accessToken: string }
  | { ok: false; code: 'INVALID_CREDENTIALS' };

export async function login(input: LoginInput): Promise<LoginResult> {
  // Try email first, then phone — credential field accepts both.
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.credential }, { phone: input.credential }],
    },
  });

  // User not found — same response as wrong password (prevents user enumeration).
  if (!user) {
    return { ok: false, code: 'INVALID_CREDENTIALS' };
  }

  // Compare plaintext password against stored bcrypt hash.
  const passwordMatch = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatch) {
    return { ok: false, code: 'INVALID_CREDENTIALS' };
  }

  const accessToken = buildToken(user);
  return { ok: true, accessToken };
}
