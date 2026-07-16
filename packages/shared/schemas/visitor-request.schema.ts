import { z } from 'zod';

// ---------------------------------------------------------------------------
// VisitorRequestSchema
// Step 2.1: Zod validation schema for creating visitor requests.
// Fields: name, purpose, visitorType, flatId, photoUrl (optional)
// ---------------------------------------------------------------------------
export const VisitorRequestSchema = z.object({
  name: z
    .string({ required_error: 'Visitor name is required' })
    .min(1, { message: 'Visitor name is required' }),
  purpose: z
    .string({ required_error: 'Purpose is required' })
    .min(1, { message: 'Purpose is required' }),
  visitorType: z
    .string({ required_error: 'Visitor type is required' })
    .min(1, { message: 'Visitor type is required' }),
  flatId: z
    .string({ required_error: 'Flat ID is required' })
    .min(1, { message: 'Flat ID is required' }),
  photoUrl: z.string().optional(),
});

export type VisitorRequestInput = z.infer<typeof VisitorRequestSchema>;

// ---------------------------------------------------------------------------
// UpdateVisitorStatusSchema
// Step 2.2: Zod validation schema for PATCH status update.
// ---------------------------------------------------------------------------
export const UpdateVisitorStatusSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CHECKED_IN', 'CHECKED_OUT', 'EXPIRED'], {
    required_error: 'Status is required',
    message: 'Status must be PENDING, APPROVED, REJECTED, CHECKED_IN, CHECKED_OUT, or EXPIRED',
  }),
});

export type UpdateVisitorStatusInput = z.infer<typeof UpdateVisitorStatusSchema>;
