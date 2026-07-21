import { z } from 'zod';

export const CreatePollSchema = z.object({
  question: z.string().min(1, 'Question is required').max(500, 'Question cannot exceed 500 characters'),
  options: z.array(z.string().min(1, 'Option cannot be empty')).min(2, 'At least 2 options are required').max(10, 'Maximum 10 options allowed'),
  endsAt: z.string().datetime().optional(),
});

export type CreatePollInput = z.infer<typeof CreatePollSchema>;

export const PollVoteSchema = z.object({
  selectedOption: z.string().min(1, 'Selected option is required'),
});

export type PollVoteInput = z.infer<typeof PollVoteSchema>;
