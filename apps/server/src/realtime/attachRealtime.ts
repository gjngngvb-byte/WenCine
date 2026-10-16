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
const SocialSchema = z.object({
  action: z.enum(['sit', 'stand', 'fall', 'offer_hand', 'accept_interaction', 'decline_interaction', 'release_hand',
    'share_popcorn', 'kiss', 'peck', 'slap', 'throw_popcorn', 'throw_tomato', 'steal_popcorn', 'handsy', 'rate_film']),
  targetId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
  rating: z.number().int().min(1).max(5).optional(),
});
type PendingSocialRequest = { id: string; roomId: string; fromId: string; toId: string; action: 'hold_hands' | 'kiss' | 'peck' | 'handsy'; createdAt: number };
const pendingSocialRequests = new Map<string, PendingSocialRequest>();
const filmRatings = new Map<string, Map<string, number>>();
function closeEnough(a: { x: number; z: number }, b: { x: number; z: number }, max = 2.4) {
  return Math.hypot(a.x - b.x, a.z - b.z) <= max;
}

export function attachRealtime(server: HttpServer, allowedOrigins: string[]) {
  const isAllowedOrigin = (origin: string | undefined) =>
    !origin || allowedOrigins.includes(origin) ||
    origin === 'https://wen-cine.vercel.app' ||
    /^https:\/\/wen-cine-[a-z0-9-]+-ciels-projects-9299fbb3\.vercel\.app$/.test(origin);
  const io = new Server(server, { cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
  },
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
      const heldId = updated.participant.holdingHandsWith;
      if (heldId) {
        const partner = updated.room.participants.get(heldId);
        if (partner?.connected && partner.id !== participantId) {
          const side = participantId.localeCompare(partner.id) < 0 ? 1 : -1;
          const dragged = updateParticipantPosition(roomId, partner.id, {
            x: updated.participant.x + side * 0.62,
            z: updated.participant.z + 0.08,
            rotation: updated.participant.rotation,
          });
          if (dragged) {
            io.to(roomId).emit('avatar:moved', safeParticipant(dragged.participant));
            if (dragged.participant.socketId) io.to(dragged.participant.socketId).emit('avatar:dragged', {
              x: dragged.participant.x, z: dragged.participant.z, rotation: dragged.participant.rotation,
            });
          }
        }
      }
    });
    socket.on('social:action', (payload: unknown) => {
      const parsed = SocialSchema.safeParse(payload);
      if (!parsed.success) return;
      const { action, targetId, requestId, rating } = parsed.data;
      const actor = findParticipantByToken(roomId, token)?.participant;
      if (!actor) return;
      const target = targetId ? found.room.participants.get(targetId) : undefined;
      const notifyAction = (targetPerson?: typeof actor, actualAction: string = action) => {
        const now = Date.now();
        actor.action = actualAction; actor.actionAt = now;
        if (targetPerson) { targetPerson.action = actualAction; targetPerson.actionAt = now; }
        io.to(roomId).emit('social:effect', {
          id: randomUUID(), action: actualAction, actorId: actor.id, targetId: targetPerson?.id, sentAt: now,
        });
        io.to(roomId).emit('avatar:moved', safeParticipant(actor));
        if (targetPerson) io.to(roomId).emit('avatar:moved', safeParticipant(targetPerson));
      };
      if (action === 'sit' || action === 'stand' || action === 'fall') {
        actor.pose = action === 'sit' ? 'sitting' : action === 'fall' ? 'fallen' : 'standing';
        notifyAction(undefined, action);
        return;
      }
      if (action === 'rate_film') {
        if (!rating) return;
        const ratings = filmRatings.get(roomId) ?? new Map<string, number>();
        ratings.set(actor.id, rating); filmRatings.set(roomId, ratings);
        const values = [...ratings.values()];
        io.to(roomId).emit('film:ratings', { count: values.length, average: values.reduce((sum, value) => sum + value, 0) / values.length, ownRating: rating });
        return;
      }
      if (action === 'accept_interaction' || action === 'decline_interaction') {
        if (!requestId) return;
        const request = pendingSocialRequests.get(requestId);
        if (!request || request.roomId !== roomId || request.toId !== actor.id || Date.now() - request.createdAt > 30_000) {
          pendingSocialRequests.delete(requestId); return;
        }
        pendingSocialRequests.delete(requestId);
        const initiator = found.room.participants.get(request.fromId);
        if (!initiator) return;
        if (action === 'decline_interaction') {
          if (initiator.socketId) io.to(initiator.socketId).emit('social:response', { requestId, accepted: false });
          return;
        }
        if (request.action === 'hold_hands') {
          actor.holdingHandsWith = initiator.id; initiator.holdingHandsWith = actor.id;
        }
        notifyAction(initiator, request.action);
        if (initiator.socketId) io.to(initiator.socketId).emit('social:response', { requestId, accepted: true, action: request.action });
        return;
      }
      if (action === 'release_hand') {
        const partner = actor.holdingHandsWith ? found.room.participants.get(actor.holdingHandsWith) : undefined;
        delete actor.holdingHandsWith;
        if (partner) delete partner.holdingHandsWith;
        io.to(roomId).emit('social:effect', { id: randomUUID(), action: 'release_hand', actorId: actor.id, targetId: partner?.id, sentAt: Date.now() });
        io.to(roomId).emit('avatar:moved', safeParticipant(actor));
        if (partner) io.to(roomId).emit('avatar:moved', safeParticipant(partner));
        return;
      }
      if (action === 'offer_hand' || action === 'kiss' || action === 'peck' || action === 'handsy') {
        if (!target || !target.connected || target.id === actor.id || !closeEnough(actor, target)) return;
        const requestedAction = action === 'offer_hand' ? 'hold_hands' : action;
        const id = randomUUID();
        const request: PendingSocialRequest = { id, roomId, fromId: actor.id, toId: target.id, action: requestedAction, createdAt: Date.now() };
        pendingSocialRequests.set(id, request);
        if (target.socketId) io.to(target.socketId).emit('social:request', {
          requestId: id, fromId: actor.id, fromName: actor.displayName, action: requestedAction,
        });
        return;
      }
      if (action === 'share_popcorn' || action === 'slap' || action === 'throw_popcorn' || action === 'throw_tomato' || action === 'steal_popcorn') {
        if (action !== 'throw_popcorn' && action !== 'throw_tomato' && (!target || !target.connected || target.id === actor.id || !closeEnough(actor, target))) return;
        notifyAction(target, action);
      }
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
