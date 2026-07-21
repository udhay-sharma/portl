import { z } from 'zod';
import { COMPLAINT_ALLOWED_TRANSITIONS, type ComplaintStatus } from '../permissions/complaint.js';

export const CreateComplaintSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title cannot exceed 100 characters'),
  description: z.string().min(1, 'Description is required').max(1000, 'Description cannot exceed 1000 characters'),
});

export type CreateComplaintInput = z.infer<typeof CreateComplaintSchema>;

export const UpdateComplaintStatusSchema = z.object({
  status: z.enum(Object.keys(COMPLAINT_ALLOWED_TRANSITIONS) as [ComplaintStatus, ...ComplaintStatus[]], {
    errorMap: () => ({ message: 'Invalid complaint status' }),
  }),
});

export type UpdateComplaintStatusInput = z.infer<typeof UpdateComplaintStatusSchema>;
