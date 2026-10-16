import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createRoom, findRoom, joinRoom, listPublicRooms, toPublicRoom } from './store.js';

const CreateRoomSchema = z.object({ name: z.string().trim().min(2).max(80),
  visibility: z.enum(['public', 'private']).default('public'), maxParticipants: z.number().int().min(2).max(100).default(24) });
const JoinRoomSchema = z.object({ displayName: z.string().trim().min(1).max(32),
  accessCode: z.string().trim().max(20).optional(), ownerToken: z.string().uuid().optional(), participantToken: z.string().uuid().optional() });

export async function registerRoomRoutes(app: FastifyInstance) {
  app.get('/api/rooms', async () => ({ rooms: listPublicRooms() }));
  app.post('/api/rooms', async (request, reply) => {
    const parsed = CreateRoomSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_INPUT', message: 'Confira o nome, a privacidade e o limite de participantes.' });
    const created = createRoom(parsed.data);
    return reply.status(201).send({ room: toPublicRoom(created.room), ownerToken: created.ownerToken,
      ...(created.room.visibility === 'private' ? { inviteCode: created.inviteCode } : {}) });
  });
  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId', async (request, reply) => {
    const room = findRoom(request.params.roomId);
    if (!room) return reply.status(404).send({ error: 'ROOM_NOT_FOUND', message: 'Essa sala não existe ou o servidor foi reiniciado.' });
    return { room: toPublicRoom(room) };
  });
  app.post<{ Params: { roomId: string } }>('/api/rooms/:roomId/join', async (request, reply) => {
    const parsed = JoinRoomSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_INPUT', message: 'Informe um nome com até 32 caracteres.' });
    const result = joinRoom({ roomId: request.params.roomId, ...parsed.data });
    if ('error' in result) {
      const errors = {
        ROOM_NOT_FOUND: [404, 'Essa sala não existe ou o servidor foi reiniciado.'],
        ROOM_FORBIDDEN: [403, 'Código de convite inválido para esta sala privada.'],
        ROOM_FULL: [409, 'A sala atingiu seu limite de participantes.'],
      } as const;
      const [status, message] = errors[result.error];
      return reply.status(status).send({ error: result.error, message });
    }
    return { room: toPublicRoom(result.room), participant: { id: result.participant.id,
      displayName: result.participant.displayName, role: result.participant.role },
      participantToken: result.participantToken, reconnected: result.reconnected };
  });
}
