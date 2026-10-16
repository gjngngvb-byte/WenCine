import { z } from 'zod';

export const RoomIdSchema = z.string().min(1).max(80);
export const DisplayNameSchema = z.string().trim().min(1).max(32);
export const RoomVisibilitySchema = z.enum(['public', 'private', 'unlisted']);

export type RoomId = z.infer<typeof RoomIdSchema>;
export type DisplayName = z.infer<typeof DisplayNameSchema>;
export type RoomVisibility = z.infer<typeof RoomVisibilitySchema>;
