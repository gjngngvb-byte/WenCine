import { describe, expect, it } from 'vitest';
import { createRoom, findParticipantByToken, joinRoom, toPublicRoom, updateParticipantPosition } from './store.js';

describe('room store', () => {
  it('creates a room without exposing owner credentials in public data', () => {
    const created = createRoom({ name: 'Sessão de teste', visibility: 'public', maxParticipants: 8 });
    expect(created.room.id).toHaveLength(8);
    expect(toPublicRoom(created.room)).not.toHaveProperty('ownerToken');
    expect(toPublicRoom(created.room)).not.toHaveProperty('inviteCode');
  });

  it('requires the private invite code and resolves it to the real room', () => {
    const created = createRoom({ name: 'Privada', visibility: 'private', maxParticipants: 8 });
    const denied = joinRoom({ roomId: created.room.id, displayName: 'Visitante' });
    expect(denied).toHaveProperty('error', 'ROOM_FORBIDDEN');
    const allowed = joinRoom({ roomId: created.inviteCode, displayName: 'Convidado' });
    expect(allowed).not.toHaveProperty('error');
    if (!('error' in allowed)) expect(allowed.room.id).toBe(created.room.id);
  });

  it('issues a participant token and clamps position updates to room bounds', () => {
    const created = createRoom({ name: 'Movimento', visibility: 'public', maxParticipants: 8 });
    const joined = joinRoom({ roomId: created.room.id, displayName: 'Wen' });
    expect(joined).not.toHaveProperty('error');
    if ('error' in joined) return;
    expect(findParticipantByToken(created.room.id, joined.participantToken)?.participant.id).toBe(joined.participant.id);
    const moved = updateParticipantPosition(created.room.id, joined.participant.id, { x: 99, z: -99, rotation: 1 });
    expect(moved?.participant.x).toBe(8);
    expect(moved?.participant.z).toBe(-1);
  });
});
