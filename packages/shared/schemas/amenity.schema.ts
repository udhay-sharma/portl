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
