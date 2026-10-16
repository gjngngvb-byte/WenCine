import { z } from 'zod';

export const ClientEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room:join'), roomId: z.string().min(1).max(80) }),
  z.object({ type: z.literal('room:leave'), roomId: z.string().min(1).max(80) }),
  z.object({ type: z.literal('chat:send'), roomId: z.string().min(1).max(80), message: z.string().trim().min(1).max(1000) }),
]);
export type ClientEvent = z.infer<typeof ClientEventSchema>;
