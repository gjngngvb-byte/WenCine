import { randomBytes, randomUUID } from 'node:crypto';

export type RoomVisibility = 'public' | 'private';
export type ParticipantRole = 'owner' | 'member';
export interface Participant {
  id: string; token: string; displayName: string; role: ParticipantRole; color: string;
  accessory: string; expression: string; x: number; z: number; rotation: number;
  connected: boolean; socketId?: string; joinedAt: number;
  pose: 'standing' | 'sitting' | 'fallen'; holdingHandsWith?: string; action?: string; actionAt?: number;
}
export interface Room {
  id: string; name: string; visibility: RoomVisibility; inviteCode: string; ownerToken: string;
  maxParticipants: number; createdAt: number; participants: Map<string, Participant>;
}
export type PublicParticipant = Omit<Participant, 'token' | 'socketId'>;
export type PublicRoom = Omit<Room, 'ownerToken' | 'inviteCode' | 'participants'> & {
  participantCount: number; participants?: PublicParticipant[];
};
const rooms = new Map<string, Room>();
function publicParticipant(person: Participant): PublicParticipant {
  const { token, socketId, ...safe } = person;
  void token; void socketId;
  return safe;
}
export function safeParticipant(person: Participant) { return publicParticipant(person); }
export function toPublicRoom(room: Room, includeParticipants = false): PublicRoom {
  const { ownerToken, inviteCode, participants, ...safe } = room;
  void ownerToken; void inviteCode;
  return { ...safe, participantCount: [...participants.values()].filter((p) => p.connected).length,
    ...(includeParticipants ? { participants: [...participants.values()].map(publicParticipant) } : {}) };
}
export function createRoom(input: { name: string; visibility: RoomVisibility; maxParticipants: number }) {
  const id = randomBytes(4).toString('hex').toUpperCase();
  const room: Room = { id, name: input.name.trim(), visibility: input.visibility,
    inviteCode: randomBytes(3).toString('hex').toUpperCase(), ownerToken: randomUUID(),
    maxParticipants: input.maxParticipants, createdAt: Date.now(), participants: new Map() };
  rooms.set(id, room);
  return { room, ownerToken: room.ownerToken, inviteCode: room.inviteCode };
}
export function findRoom(roomId: string) { return rooms.get(roomId.toUpperCase()); }
export function listPublicRooms() {
  return [...rooms.values()].filter((room) => room.visibility === 'public').map((room) => toPublicRoom(room));
}
export function joinRoom(input: { roomId: string; displayName: string; accessCode?: string | undefined; ownerToken?: string | undefined; participantToken?: string | undefined }) {
  const normalized = input.roomId.trim().toUpperCase();
  const room = findRoom(normalized) ?? [...rooms.values()].find((candidate) =>
    candidate.visibility === 'private' && candidate.inviteCode === normalized);
  if (!room) return { error: 'ROOM_NOT_FOUND' as const };
  const isOwner = Boolean(input.ownerToken && input.ownerToken === room.ownerToken);
  const hasInvite = input.accessCode?.trim().toUpperCase() === room.inviteCode || normalized === room.inviteCode;
  if (room.visibility === 'private' && !isOwner && !hasInvite) return { error: 'ROOM_FORBIDDEN' as const };
  if (input.participantToken) {
    const existing = [...room.participants.values()].find((person) => person.token === input.participantToken);
    if (existing) {
      existing.displayName = input.displayName.trim().slice(0, 32);
      existing.connected = true;
      if (isOwner) existing.role = 'owner';
      return { room, participant: existing, participantToken: existing.token, reconnected: true };
    }
  }
  const count = [...room.participants.values()].filter((person) => person.connected).length;
  if (count >= room.maxParticipants) return { error: 'ROOM_FULL' as const };
  const participant: Participant = { id: randomUUID(), token: randomUUID(), displayName: input.displayName.trim().slice(0, 32),
    role: isOwner ? 'owner' : 'member', color: '#a78bfa', accessory: 'none', expression: 'neutral',
    x: (Math.random() - 0.5) * 3, z: 2 + Math.random() * 2, rotation: 0, connected: true, joinedAt: Date.now(), pose: 'standing' };
  room.participants.set(participant.id, participant);
  return { room, participant, participantToken: participant.token, reconnected: false };
}
export function findParticipantByToken(roomId: string, token: string) {
  const room = findRoom(roomId);
  if (!room) return undefined;
  const participant = [...room.participants.values()].find((person) => person.token === token);
  return participant ? { room, participant } : undefined;
}
export function updateParticipantPosition(roomId: string, participantId: string, position: { x: number; z: number; rotation: number }) {
  const room = findRoom(roomId);
  const participant = room?.participants.get(participantId);
  if (!room || !participant) return undefined;
  participant.x = Math.max(-8, Math.min(8, position.x));
  participant.z = Math.max(-1, Math.min(9, position.z));
  participant.rotation = position.rotation;
  return { room, participant };
}
export function setParticipantSocket(roomId: string, participantId: string, socketId: string | undefined) {
  const room = findRoom(roomId);
  const participant = room?.participants.get(participantId);
  if (!room || !participant) return undefined;
  if (socketId) { participant.socketId = socketId; participant.connected = true; }
  else { delete participant.socketId; participant.connected = false; }
  return { room, participant };
}
export function removeDisconnectedParticipant(roomId: string, participantId: string, expectedToken: string) {
  const room = findRoom(roomId);
  const person = room?.participants.get(participantId);
  if (person && person.token === expectedToken && !person.connected) room?.participants.delete(participantId);
}
