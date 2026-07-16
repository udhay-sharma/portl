import { z } from 'zod';

// ---------------------------------------------------------------------------
// LoginSchema
// "credential" accepts either an email address or a phone number.
// Keeping it as a single field makes the mobile form simpler (one input,
// one zodResolver rule). The API service layer determines which it is.
// ---------------------------------------------------------------------------
export const LoginSchema = z.object({
  credential: z
    .string({ required_error: 'Email or phone number is required' })
    .min(1, { message: 'Email or phone number is required' }),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, { message: 'Password must be at least 8 characters' }),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// ---------------------------------------------------------------------------
// RegisterSchema
// flatId / gateId are optional at the schema layer.
// The rule "Resident must have flatId, Guard must have gateId" is enforced
// at the application layer in Step 1.4 (auth routes + service logic) using
// .refine(), so the base schema stays composable and reusable as-is.
// ---------------------------------------------------------------------------
export const RegisterSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .min(1, { message: 'Name is required' }),
  email: z
    .string({ required_error: 'Email is required' })
    .email({ message: 'Must be a valid email address' }),
  phone: z.string().optional(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, { message: 'Password must be at least 8 characters' }),
  role: z.enum(['RESIDENT', 'GUARD', 'ADMIN'], {
    required_error: 'Role is required',
    message: 'Role must be RESIDENT, GUARD, or ADMIN',
  }),
  societyId: z
    .string({ required_error: 'Society ID is required' })
    .min(1, { message: 'Society ID is required' }),
  flatId: z.string().optional(),   // Required for RESIDENT — enforced in Step 1.4
  gateId: z.string().optional(),   // Required for GUARD   — enforced in Step 1.4
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
