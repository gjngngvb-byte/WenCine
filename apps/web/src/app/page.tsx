'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
type PublicRoom = { id: string; name: string; visibility: 'public' | 'private'; participantCount: number; maxParticipants: number };

export default function HomePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [roomName, setRoomName] = useState('Sessão da noite');
  const [roomCode, setRoomCode] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refreshRooms() {
    try { const response = await fetch(API + '/api/rooms', { cache: 'no-store' }); if (response.ok) setRooms((await response.json() as { rooms: PublicRoom[] }).rooms); }
    catch { setError('Não foi possível conectar à API. Confirme se o servidor está iniciado.'); }
  }
  useEffect(() => { void refreshRooms(); }, []);
  function rememberSession(roomId: string, token: string, name: string) {
    sessionStorage.setItem('wencine:session:' + roomId, JSON.stringify({ participantToken: token, displayName: name }));
    router.push('/rooms/' + roomId);
  }
  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(API + '/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: roomName, visibility, maxParticipants: 24 }) });
      const created = await response.json() as { room?: PublicRoom; ownerToken?: string; inviteCode?: string; message?: string };
      if (!response.ok || !created.room || !created.ownerToken) throw new Error(created.message ?? 'Não foi possível criar a sala.');
      if (created.inviteCode) window.alert('Código de convite da sala privada: ' + created.inviteCode);
      const joinedResponse = await fetch(API + '/api/rooms/' + created.room.id + '/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: displayName.trim(), ownerToken: created.ownerToken }) });
      const joined = await joinedResponse.json() as { participantToken?: string; message?: string };
      if (!joinedResponse.ok || !joined.participantToken) throw new Error(joined.message ?? 'Sala criada, mas não foi possível entrar.');
      rememberSession(created.room.id, joined.participantToken, displayName.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro inesperado ao criar sala.'); }
    finally { setBusy(false); }
  }
  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const id = roomCode.trim().toUpperCase();
    try {
      const response = await fetch(API + '/api/rooms/' + encodeURIComponent(id) + '/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: displayName.trim() }) });
      const data = await response.json() as { room?: PublicRoom; participantToken?: string; message?: string };
      if (!response.ok || !data.participantToken || !data.room) throw new Error(data.message ?? 'Não foi possível entrar na sala.');
      rememberSession(data.room.id, data.participantToken, displayName.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro inesperado ao entrar.'); }
    finally { setBusy(false); }
  }
  async function joinPublicRoom(room: PublicRoom) {
    setBusy(true); setError('');
    try {
      const name = displayName.trim() || 'Visitante';
      const response = await fetch(API + '/api/rooms/' + room.id + '/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: name }) });
      const data = await response.json() as { participantToken?: string; message?: string };
      if (!response.ok || !data.participantToken) throw new Error(data.message ?? 'Não foi possível entrar na sala.');
      rememberSession(room.id, data.participantToken, name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro inesperado ao entrar.'); }
    finally { setBusy(false); }
  }
  return <main className="lobby-shell">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">W</span> WenCine</a><span className="live-pill"><span /> Cinema virtual multijogador</span></header>
    <section className="hero"><div className="hero-copy"><p className="eyebrow">SEU LUGAR, SUA SESSÃO</p><h1>O cinema fica melhor <span>junto.</span></h1>
      <p className="hero-description">Crie uma sala, encontre seus amigos e entre em um cinema 3D compartilhado. A criação de salas, o chat e a presença já se conectam ao servidor.</p>
      <div className="hero-stats"><span><b>3D</b> ambiente interativo</span><span><b>AO VIVO</b> salas compartilhadas</span></div></div>
      <div className="hero-art" aria-hidden="true"><div className="art-glow" /><div className="screen-frame"><div className="screen-scene"><span className="moon" /><span className="mountain mountain-one" /><span className="mountain mountain-two" /><span className="screen-beam" /></div></div><div className="seat seat-one" /><div className="seat seat-two" /><div className="seat seat-three" /><span className="art-caption">A PRÓXIMA SESSÃO COMEÇA AQUI</span></div></section>
    <section className="lobby-grid" aria-label="Entrar ou criar uma sala">
      <article className="lobby-card"><div className="card-icon">✦</div><h2>Criar uma sala</h2><p>Escolha o nome e decida se a sessão será pública ou privada.</p>
        <form onSubmit={createRoom} className="form-stack"><label>Seu nome<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} minLength={1} maxLength={32} required placeholder="Como quer aparecer?" /></label>
          <label>Nome da sala<input value={roomName} onChange={(e) => setRoomName(e.target.value)} minLength={2} maxLength={80} required /></label>
          <label>Privacidade<select value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}><option value="public">Pública, qualquer pessoa pode entrar</option><option value="private">Privada, somente com convite</option></select></label>
          <button className="primary-button" disabled={busy} type="submit">{busy ? 'Preparando sala…' : 'Criar e entrar'} <span>↗</span></button></form></article>
      <article className="lobby-card"><div className="card-icon card-icon-blue">⌁</div><h2>Entrar em uma sala</h2><p>Use o código de uma sala pública ou o convite de uma sala privada.</p>
        <form onSubmit={joinRoom} className="form-stack"><label>Seu nome<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} required placeholder="Como quer aparecer?" /></label>
          <label>Código da sala ou convite<input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} required maxLength={8} placeholder="Ex.: A1B2C3D4" /></label>
          <button className="secondary-button" disabled={busy} type="submit">{busy ? 'Entrando…' : 'Entrar com código'} <span>→</span></button></form>
        <p className="small-note">Salas privadas exigem o código de convite. Compartilhe-o somente com quem deseja convidar.</p></article>
    </section>
    {error && <p className="feedback error-feedback" role="alert">{error}</p>}
    <section className="rooms-section"><div className="section-heading"><div><p className="eyebrow">ENCONTRE SUA SESSÃO</p><h2>Salas públicas</h2></div><button className="refresh-button" onClick={() => void refreshRooms()} type="button">↻ Atualizar</button></div>
      {rooms.length ? <div className="rooms-list">{rooms.map((room) => <article className="room-row" key={room.id}><div className="room-symbol">▶</div><div className="room-info"><strong>{room.name}</strong><span>Código {room.id} · {room.participantCount}/{room.maxParticipants} participantes</span></div><button className="join-button" disabled={busy || room.participantCount >= room.maxParticipants} onClick={() => void joinPublicRoom(room)} type="button">Entrar</button></article>)}</div>
        : <div className="empty-rooms"><span>◌</span><div><strong>Nenhuma sala pública por enquanto</strong><p>Crie uma sessão e ela aparecerá aqui enquanto este servidor estiver ativo.</p></div></div>}</section>
    <footer className="site-footer"><span>WenCine © 2026</span><span>Próxima sessão: o começo de um mundo compartilhado.</span></footer>
  </main>;
}
