import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { z } from 'zod';
import { findParticipantByToken, removeDisconnectedParticipant, safeParticipant,
  setParticipantSocket, toPublicRoom, updateParticipantPosition } from '../rooms/store.js';

const PositionSchema = z.object({ x: z.number().finite(), z: z.number().finite(), rotation: z.number().finite(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accessory: z.enum(['none', 'cap', 'crown', 'horns', 'halo', 'ears']).optional(),
  expression: z.enum(['neutral', 'happy', 'sad', 'angry', 'love', 'surprised', 'shy', 'sleepy']).optional() });
const ChatSchema = z.object({ message: z.string().trim().min(1).max(500) });

export function attachRealtime(server: HttpServer, allowedOrigins: string[]) {
  const io = new Server(server, { cors: { origin: allowedOrigins, credentials: true },
    maxHttpBufferSize: 64 * 1024, pingInterval: 25_000, pingTimeout: 20_000 });
  io.use((socket, next) => {
    const roomId = socket.handshake.auth.roomId;
    const token = socket.handshake.auth.participantToken;
    if (typeof roomId !== 'string' || typeof token !== 'string') return next(new Error('Sessão da sala inválida.'));
    if (!findParticipantByToken(roomId, token)) return next(new Error('Entre na sala novamente para atualizar sua sessão.'));
    socket.data.roomId = roomId.toUpperCase(); socket.data.participantToken = token;
    next();
  });
  io.on('connection', (socket) => {
    const roomId = socket.data.roomId as string;
    const token = socket.data.participantToken as string;
    const found = findParticipantByToken(roomId, token);
    if (!found) { socket.disconnect(true); return; }
    const participantId = found.participant.id;
    const previousSocket = found.participant.socketId;
    if (previousSocket && previousSocket !== socket.id) io.sockets.sockets.get(previousSocket)?.disconnect(true);
    setParticipantSocket(roomId, participantId, socket.id);
    socket.join(roomId);
    socket.emit('room:snapshot', { room: toPublicRoom(found.room, true), selfId: participantId });
    socket.to(roomId).emit('participant:joined', safeParticipant(found.participant));
    const recentMessages: number[] = [];
    let lastPositionAt = 0;
    socket.on('avatar:move', (payload: unknown) => {
      const now = Date.now();
      if (now - lastPositionAt < 40) return;
      lastPositionAt = now;
      const parsed = PositionSchema.safeParse(payload);
      if (!parsed.success) return;
      const { x, z, rotation, color, accessory, expression } = parsed.data;
      const updated = updateParticipantPosition(roomId, participantId, { x, z, rotation });
      if (!updated) return;
      if (color) updated.participant.color = color;
      if (accessory) updated.participant.accessory = accessory;
      if (expression) updated.participant.expression = expression;
      socket.to(roomId).volatile.emit('avatar:moved', safeParticipant(updated.participant));
    });
    socket.on('chat:send', (payload: unknown) => {
      const now = Date.now();
      while (recentMessages.length && now - recentMessages[0]! > 10_000) recentMessages.shift();
      if (recentMessages.length >= 8) { socket.emit('chat:error', { message: 'Você está enviando mensagens muito rápido.' }); return; }
      const parsed = ChatSchema.safeParse(payload);
      if (!parsed.success) return;
      recentMessages.push(now);
      io.to(roomId).emit('chat:message', { id: randomUUID(), participantId,
        displayName: found.participant.displayName, role: found.participant.role, message: parsed.data.message, sentAt: now });
    });
    socket.on('disconnect', () => {
      const currentParticipant = findParticipantByToken(roomId, token)?.participant;
      if (!currentParticipant || currentParticipant.socketId !== socket.id) return;
      const current = setParticipantSocket(roomId, participantId, undefined);
      if (!current) return;
      io.to(roomId).emit('participant:left', { participantId });
      setTimeout(() => removeDisconnectedParticipant(roomId, participantId, token), 120_000).unref();
    });
  });
  return io;
}
