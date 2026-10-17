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
  action: z.enum(['sit', 'sit_floor', 'sit_chair', 'stand', 'fall', 'offer_hand', 'accept_interaction', 'decline_interaction', 'release_hand',
    'share_popcorn', 'kiss', 'peck', 'slap', 'throw_popcorn', 'throw_tomato', 'steal_popcorn', 'handsy', 'rate_film', 'jump', 'crouch', 'lie_back']),
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
      if (action === 'jump') { notifyAction(undefined, action); return; }
      if (action === 'crouch') { actor.pose = actor.pose === 'crouching' ? 'standing' : 'crouching'; notifyAction(undefined, action); return; }
      if (action === 'lie_back') { actor.pose = 'lying_back'; notifyAction(undefined, action); return; }
      if (action === 'sit' || action === 'sit_floor' || action === 'sit_chair' || action === 'stand' || action === 'fall') {
        if (action === 'sit_chair') {
          const seats = Array.from({ length: 5 }, (_, row) =>
            Array.from({ length: 8 }, (_, col) => ({ x: (col - 3.5) * 1.25, z: 1 + row * 1.65 }))).flat();
          const availableSeats = seats.filter((seat) => ![...found.room.participants.values()].some((person) =>
            person.id !== actor.id && person.pose === 'sitting_chair' && Math.hypot(person.x - seat.x, person.z - seat.z) < 0.7));
          const seat = availableSeats.sort((a, b) => Math.hypot(a.x - actor.x, a.z - actor.z) - Math.hypot(b.x - actor.x, b.z - actor.z))[0];
          if (!seat || !closeEnough(actor, seat, 1.3)) {
            if (actor.socketId) io.to(actor.socketId).emit('social:response', { accepted: false, message: 'Aproxime-se de uma cadeira para sentar.' });
            return;
          }
          updateParticipantPosition(roomId, actor.id, { x: seat.x, z: seat.z - 0.1, rotation: Math.PI });
        }
        actor.pose = action === 'sit_chair' ? 'sitting_chair' : (action === 'sit' || action === 'sit_floor') ? 'sitting' : action === 'fall' ? 'fallen' : 'standing';
        notifyAction(undefined, action === 'sit_floor' ? 'sit' : action);
        return;
      }
      if (action === 'rate_film') {
        if (!rating) return;
        const ratings = filmRatings.get(roomId) ?? new Map<string, number>();
        ratings.set(actor.id, rating); filmRatings.set(roomId, ratings);
        const values = [...ratings.values()];
        io.to(roomId).emit('film:ratings', { count: values.length, average: values.reduce((sum, value) => sum + value, 0) / values.length, actorId: actor.id, rating });
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
        if (target.displayName === 'Bot de Teste') { if (action === 'offer_hand') { actor.holdingHandsWith = target.id; target.holdingHandsWith = actor.id; } notifyAction(target, action === 'offer_hand' ? 'hold_hands' : action); return; }
        const seatedTogether = actor.pose === 'sitting_chair' && target.pose === 'sitting_chair' && Math.hypot(actor.x - target.x, actor.z - target.z) <= 1.85;
        if ((target.displayName === 'Bot de Teste' || seatedTogether) && (action === 'handsy' || action === 'kiss' || action === 'peck')) { notifyAction(target, action); return; }
        const requestedAction = action === 'offer_hand' ? 'hold_hands' : action;
        const id = randomUUID();
        const request: PendingSocialRequest = { id, roomId, fromId: actor.id, toId: target.id, action: requestedAction, createdAt: Date.now() };
        pendingSocialRequests.set(id, request);
        if (target.socketId) io.to(target.socketId).emit('social:request', { requestId: id, fromId: actor.id, fromName: actor.displayName, action: requestedAction });
        return;
      }
      if (action === 'share_popcorn' || action === 'slap' || action === 'throw_popcorn' || action === 'throw_tomato' || action === 'steal_popcorn') {
        if (action !== 'throw_popcorn' && action !== 'throw_tomato' && (!target || !target.connected || target.id === actor.id || !closeEnough(actor, target))) return;
        if (target?.displayName === 'Bot de Teste') { notifyAction(target, action); return; }
        const seatedTogether = Boolean(target && actor.pose === 'sitting_chair' && target.pose === 'sitting_chair' && Math.hypot(actor.x - target.x, actor.z - target.z) <= 1.85);
        if (target && !seatedTogether && (action === 'slap' || action === 'steal_popcorn')) {
          if (actor.socketId) io.to(actor.socketId).emit('social:response', { accepted: false, message: 'Essa interação está disponível quando vocês estão sentados lado a lado.' });
          return;
        }
        notifyAction(target, action);
      }
    });
    socket.on('bot:control', (payload: unknown) => {
      const commandSchema = z.object({ command: z.enum(['spawn', 'remove', 'stand', 'sit_chair', 'sit_floor', 'walk']), x: z.number().finite().min(-8).max(8).optional(), z: z.number().finite().min(-1).max(9).optional() });
      const parsedCommand = commandSchema.safeParse(payload);
      const owner = findParticipantByToken(roomId, token)?.participant;
      if (!parsedCommand.success || owner?.role !== 'owner') return;
      const command = parsedCommand.data;
      const room = findParticipantByToken(roomId, token)?.room;
      if (!room) return;
      let bot = [...room.participants.values()].find((person) => person.displayName === 'Bot de Teste' && person.color === '#60a5fa');
      if (command.command === 'spawn') {
        if (bot) return;
        bot = { id: randomUUID(), token: randomUUID(), displayName: 'Bot de Teste', role: 'member', color: '#60a5fa', accessory: 'none', expression: 'happy', x: 0, z: 3.5, rotation: Math.PI, connected: true, joinedAt: Date.now(), pose: 'standing' };
        room.participants.set(bot.id, bot); io.to(roomId).emit('participant:joined', safeParticipant(bot)); return;
      }
      if (!bot) return;
      if (command.command === 'remove') { room.participants.delete(bot.id); io.to(roomId).emit('participant:left', { participantId: bot.id }); return; }
      if (command.command === 'walk') { const x = command.x ?? bot.x, z = command.z ?? bot.z; bot.rotation = Math.atan2(x - bot.x, z - bot.z); bot.x = x; bot.z = z; bot.pose = 'standing'; }
      else if (command.command === 'sit_chair') {
        const seats = Array.from({ length: 5 }, (_, row) => Array.from({ length: 8 }, (_, col) => ({ x: (col - 3.5) * 1.25, z: 1 + row * 1.65 }))).flat();
        const seat = seats.sort((a, b) => Math.hypot(a.x - bot!.x, a.z - bot!.z) - Math.hypot(b.x - bot!.x, b.z - bot!.z))[0]!;
        bot.x = seat.x; bot.z = seat.z - 0.1; bot.rotation = Math.PI; bot.pose = 'sitting_chair';
      } else if (command.command === 'sit_floor') bot.pose = 'sitting';
      else bot.pose = 'standing';
      io.to(roomId).emit('avatar:moved', safeParticipant(bot));
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
      const heldPartnerId = current.participant.holdingHandsWith;
      if (heldPartnerId) {
        delete current.participant.holdingHandsWith;
        const heldPartner = current.room.participants.get(heldPartnerId);
        if (heldPartner) {
          delete heldPartner.holdingHandsWith;
          io.to(roomId).emit('avatar:moved', safeParticipant(heldPartner));
        }
      }
      io.to(roomId).emit('participant:left', { participantId });
      setTimeout(() => removeDisconnectedParticipant(roomId, participantId, token), 120_000).unref();
    });
  });
  return io;
}
