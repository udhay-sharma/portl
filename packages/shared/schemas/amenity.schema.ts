import { z } from 'zod';

export const AmenityBookingSchema = z.object({
  date: z.string().datetime(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
}).superRefine((data, ctx) => {
  if (new Date(data.endTime) <= new Date(data.startTime)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End time must be after start time',
      path: ['endTime'],
    });
  }
});

export type AmenityBookingInput = z.infer<typeof AmenityBookingSchema>;

export const CreateAmenitySchema = z.object({
  name: z.string().min(2, 'Name is too short').max(100, 'Name is too long'),
  description: z.string().optional(),
  slotDurationMinutes: z.number().int().positive().default(60),
});
export type CreateAmenityInput = z.infer<typeof CreateAmenitySchema>;

export const UpdateAmenitySchema = CreateAmenitySchema.partial();
export type UpdateAmenityInput = z.infer<typeof UpdateAmenitySchema>;
