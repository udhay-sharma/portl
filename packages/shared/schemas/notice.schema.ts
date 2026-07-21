import { z } from 'zod';

export const CreateNoticeSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title cannot exceed 100 characters'),
  content: z.string().min(1, 'Content is required').max(2000, 'Content cannot exceed 2000 characters'),
});

export type CreateNoticeInput = z.infer<typeof CreateNoticeSchema>;
