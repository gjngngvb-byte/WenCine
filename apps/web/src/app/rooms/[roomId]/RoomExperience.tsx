'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import { CinemaCanvas } from '../../../three/CinemaCanvas';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? API;
type Participant = { id: string; displayName: string; role: 'owner' | 'member'; color: string; accessory: string; expression: string; x: number; z: number; rotation: number; connected: boolean; pose?: 'standing' | 'sitting' | 'sitting_chair' | 'fallen' | 'crouching' | 'lying_back'; holdingHandsWith?: string };
type Room = { id: string; name: string; visibility: 'public' | 'private'; maxParticipants: number; participantCount: number; participants?: Participant[] };
type ChatMessage = { id: string; participantId: string; displayName: string; role: string; message: string; sentAt: number };

export function RoomExperience({ roomId }: { roomId: string }) {
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const [session, setSession] = useState<{ participantToken: string; displayName: string } | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [selfId, setSelfId] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [connection, setConnection] = useState('Conectando');
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ x: 0, z: 4, rotation: 0 });
  const positionRef = useRef(position);
  positionRef.current = position;
  const [color, setColor] = useState('#a78bfa');
  const [accessory, setAccessory] = useState('none');
  const [expression, setExpression] = useState('neutral');
  const [showCustomize, setShowCustomize] = useState(false);
  const [mobileVector, setMobileVector] = useState({ x: 0, z: 0 });
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const [pose, setPose] = useState<'standing' | 'sitting' | 'sitting_chair' | 'fallen' | 'crouching' | 'lying_back'>('standing');
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<{ requestId: string; fromId: string; fromName: string; action: string } | null>(null);
  const [socialStatus, setSocialStatus] = useState('');
  const [socialEffects, setSocialEffects] = useState<Array<{ id: string; action: string; actorId: string; targetId?: string; sentAt: number }>>([]);
  const [filmRating, setFilmRating] = useState(0);
  const [filmSummary, setFilmSummary] = useState<{ count: number; average: number } | null>(null);
  const lastMoveRef = useRef(0);
  const lastBumpRef = useRef(0);
  const heldKeys = useRef(new Set<string>());
  const participantsRef = useRef<Participant[]>([]);
  participantsRef.current = participants;
  const selfIdRef = useRef('');
  selfIdRef.current = selfId;
  const gameplayRef = useRef({ pose, nearestSeatDistance: Infinity, seatedNeighbor: undefined as Participant | undefined, nearbyParticipant: undefined as Participant | undefined, isHoldingHands: false });

  useEffect(() => {
    const raw = sessionStorage.getItem('wencine:session:' + roomId);
    if (!raw) { setError('Entre pela página inicial para obter uma sessão válida.'); return; }
    try { setSession(JSON.parse(raw) as { participantToken: string; displayName: string }); }
    catch { setError('A sessão local está inválida. Volte ao início e entre novamente.'); }
  }, [roomId]);
  useEffect(() => {
    if (!session) return;
    let active = true;
    void fetch(API + '/api/rooms/' + roomId, { cache: 'no-store' }).then(async (response) => {
      const data = await response.json() as { room?: Room; message?: string };
      if (!response.ok || !data.room) throw new Error(data.message ?? 'Sala indisponível.');
      if (active) setRoom(data.room);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Sala indisponível.'); });
    const socket = io(SOCKET_URL, { auth: { roomId, participantToken: session.participantToken }, reconnection: true, reconnectionAttempts: 8 });
    socketRef.current = socket;
    socket.on('connect', () => setConnection('Conectado'));
    socket.on('disconnect', () => setConnection('Reconectando'));
    socket.on('connect_error', (cause) => { setConnection('Sem conexão'); setError(cause.message); });
    socket.on('room:snapshot', (data: { room: Room; selfId: string }) => { setRoom(data.room); setSelfId(data.selfId); setParticipants(data.room.participants ?? []); setPose(data.room.participants?.find((person) => person.id === data.selfId)?.pose ?? 'standing'); });
    socket.on('participant:joined', (person: Participant) => setParticipants((current) => current.some((p) => p.id === person.id) ? current : [...current, person]));
    socket.on('participant:left', ({ participantId }: { participantId: string }) => setParticipants((current) => current.filter((p) => p.id !== participantId)));
    socket.on('avatar:moved', (person: Participant) => {
      setParticipants((current) => current.map((p) => p.id === person.id ? person : p));
      if (person.id === selfId) {
        setPose(person.pose ?? 'standing');
        const nextPosition = { x: person.x, z: person.z, rotation: person.rotation }; positionRef.current = nextPosition; setPosition(nextPosition);
      }
    });
    socket.on('avatar:dragged', (next: { x: number; z: number; rotation: number }) => { positionRef.current = next; setPosition(next); });
    socket.on('social:request', (request: { requestId: string; fromId: string; fromName: string; action: string }) => setPendingRequest(request));
    socket.on('social:response', (response: { accepted: boolean; action?: string; message?: string }) => setSocialStatus(response.message ?? (response.accepted ? 'Interação aceita!' : 'A pessoa recusou a interação.')));
    socket.on('social:effect', (effect: { id: string; action: string; actorId: string; targetId?: string; sentAt: number }) => {
      setSocialEffects((current) => [...current.slice(-24), effect]);
      const labels: Record<string, string> = {
        sit: 'sentou no chão', sit_chair: 'sentou na cadeira', stand: 'levantou', fall: 'caiu', hold_hands: 'está de mãos dadas',
        release_hand: 'soltou as mãos', share_popcorn: 'dividiu a pipoca', kiss: 'deu um beijo',
        peck: 'deu um selinho', slap: 'deu um tapinha', throw_popcorn: 'jogou pipoca na tela',
        throw_tomato: 'jogou um tomate na tela', steal_popcorn: 'roubou pipoca', handsy: 'fez carinho',
      };
      const actor = participants.find((person) => person.id === effect.actorId);
      setSocialStatus((actor?.displayName ?? (effect.actorId === selfId ? 'Você' : 'Alguém')) + ' ' + (labels[effect.action] ?? effect.action) + '.');
    });
    socket.on('film:ratings', (data: { count: number; average: number; actorId?: string; rating?: number }) => {
      setFilmSummary({ count: data.count, average: data.average });
      if (data.actorId === selfId && data.rating) setFilmRating(data.rating);
    });
    socket.on('chat:message', (chat: ChatMessage) => setMessages((current) => [...current.slice(-99), chat]));
    socket.on('chat:error', (data: { message: string }) => setError(data.message));
    return () => { active = false; socket.disconnect(); socketRef.current = null; };
  }, [roomId, session]);
  const move = useCallback((dx: number, dz: number) => {
    const current = positionRef.current;
    let x = Math.max(-9.05, Math.min(9.05, current.x + dx));
    let z = Math.max(-9.35, Math.min(9.2, current.z + dz));
    const seats = Array.from({ length: 5 }, (_, row) =>
      Array.from({ length: 8 }, (_, col) => ({ x: (col - 3.5) * 1.25, z: 1 + row * 1.65 }))).flat();
    const blocked = seats.some((seat) => Math.abs(x - seat.x) < 0.48 && Math.abs(z - seat.z) < 0.48);
    const now = Date.now();
    const colliding = participantsRef.current.some((person) => person.id !== selfIdRef.current && person.connected && Math.hypot(x - person.x, z - person.z) < 0.58);
    if (blocked || colliding) { x = current.x; z = current.z; }
    if ((colliding || blocked) && heldKeys.current.has('shift') && now - lastBumpRef.current > 1500) {
      lastBumpRef.current = now;
      setPose('fallen');
      socketRef.current?.emit('social:action', { action: 'fall' });
    }
    const next = { x, z, rotation: dx === 0 && dz === 0 ? current.rotation : Math.atan2(dx, dz) };
    positionRef.current = next;
    setPosition(next);
    if (now - lastMoveRef.current > 45) {
      lastMoveRef.current = now;
      socketRef.current?.emit('avatar:move', { ...next, color, accessory, expression });
    }
  }, [color, accessory, expression]);
  useEffect(() => {
    let lastCtrlTap = 0;
    let seatedActionIndex = 0;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select')) return;
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'shift'].includes(key)) {
        event.preventDefault(); heldKeys.current.add(key); return;
      }
      if (event.repeat) return;
      const context = gameplayRef.current;
      if (key === ' ') { event.preventDefault(); if (context.pose === 'fallen' || context.pose === 'lying_back' || context.pose === 'sitting' || context.pose === 'sitting_chair') { setPose('standing'); socialAction('stand'); } else if (context.pose === 'standing' || context.pose === 'crouching') socialAction('jump'); }
      if (key === 'control') { const now = Date.now(); socialAction(now - lastCtrlTap < 350 ? 'lie_back' : 'crouch'); lastCtrlTap = now; }
      if (key === 'e') {
        event.preventDefault();
        if (context.isHoldingHands) { socialAction('release_hand'); return; }
        if (context.pose === 'sitting_chair' && context.seatedNeighbor) { const actions = ['share_popcorn', 'handsy', 'kiss', 'peck', 'steal_popcorn', 'slap']; const action = actions[seatedActionIndex % actions.length]!; seatedActionIndex += 1; socialAction(action, { targetId: context.seatedNeighbor.id }); return; }
        if (context.pose === 'sitting' || context.pose === 'sitting_chair' || context.pose === 'fallen' || context.pose === 'lying_back' || context.pose === 'crouching') { setPose('standing'); socialAction('stand'); return; }
        if (context.nearestSeatDistance <= 1.3) { setPose('sitting_chair'); socialAction('sit_chair'); return; }
        if (context.nearbyParticipant) { socialAction('offer_hand', { targetId: context.nearbyParticipant.id }); return; }
        socialAction('throw_popcorn');
      }
    }
    function onKeyUp(event: KeyboardEvent) { heldKeys.current.delete(event.key.toLowerCase()); }
    function clearKeys() { heldKeys.current.clear(); }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    let previous = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(0.04, (now - previous) / 1000); previous = now;
      const keys = heldKeys.current;
      const dx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      const dz = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
      const currentPose = gameplayRef.current.pose;
      if ((currentPose === 'standing' || currentPose === 'crouching') && (dx || dz)) { const length = Math.hypot(dx, dz) || 1; const speed = keys.has('shift') ? 4.2 : currentPose === 'crouching' ? 1.5 : 2.8; move(dx / length * speed * elapsed, dz / length * speed * elapsed); }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', clearKeys); };
  }, [move]);
  const updateJoystick = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const element = joystickRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) * 0.34;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, radius / length);
    setMobileVector({ x: (dx * scale) / radius, z: (dy * scale) / radius });
  }, []);
  useEffect(() => {
    if (!mobileVector.x && !mobileVector.z) return;
    const timer = window.setInterval(() => {
      const length = Math.hypot(mobileVector.x, mobileVector.z) || 1;
      const speed = 0.19 * Math.min(1, length);
      move((mobileVector.x / length) * speed, (mobileVector.z / length) * speed);
    }, 45);
    return () => window.clearInterval(timer);
  }, [mobileVector, move]);
  useEffect(() => { socketRef.current?.emit('avatar:move', { ...position, color, accessory, expression }); }, [color, accessory, expression]);
  const nearbyParticipant = participants
    .filter((person) => person.id !== selfId && person.connected)
    .map((person) => ({ person, distance: Math.hypot(person.x - position.x, person.z - position.z) }))
    .filter((item) => item.distance <= 2.6)
    .sort((a, b) => a.distance - b.distance)[0]?.person;
  const isHoldingHands = participants.some((person) => person.id === selfId && person.holdingHandsWith);
  const seats = Array.from({ length: 5 }, (_, row) => Array.from({ length: 8 }, (_, col) => ({ x: (col - 3.5) * 1.25, z: 1 + row * 1.65 }))).flat();
  const nearestSeat = seats.map((seat) => ({ ...seat, distance: Math.hypot(position.x - seat.x, position.z - seat.z) })).sort((a, b) => a.distance - b.distance)[0]!;
  const nearestSeatDistance = nearestSeat.distance;
  const seatedNeighbor = pose === 'sitting_chair' && nearbyParticipant?.pose === 'sitting_chair' &&
    Math.hypot(nearbyParticipant.x - position.x, nearbyParticipant.z - position.z) <= 1.85 ? nearbyParticipant : undefined;
  const selectedSelf = selectedParticipantId === selfId;
  const isOwner = participants.some((person) => person.id === selfId && person.role === 'owner');
  const selectedParticipant = participants.find((person) => person.id === selectedParticipantId && person.id !== selfId && person.connected);
  const selectedSeatedNeighbor = pose === 'sitting_chair' && selectedParticipant?.pose === 'sitting_chair' &&
    Math.hypot(selectedParticipant.x - position.x, selectedParticipant.z - position.z) <= 1.85 ? selectedParticipant : undefined;
  gameplayRef.current = { pose, nearestSeatDistance, seatedNeighbor, nearbyParticipant, isHoldingHands };

  function socialAction(action: string, extra: { targetId?: string | undefined; requestId?: string | undefined; rating?: number | undefined } = {}) {
    socketRef.current?.emit('social:action', { action, ...extra });
    setSocialStatus(action === 'offer_hand' ? 'Pedido de mão enviado.' : '');
  }
  function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const clean = message.trim(); if (!clean) return;
    socketRef.current?.emit('chat:send', { message: clean }); setMessage('');
  }
  if (error && !session) return <main className="room-error"><h1>Não foi possível entrar</h1><p>{error}</p><button className="primary-button" onClick={() => router.push('/')}>Voltar ao início</button></main>;
  if (!session || !room) return <main className="room-loading"><div className="loading-orb" /><p>{error || 'Preparando seu cinema…'}</p><button className="text-button" onClick={() => router.push('/')}>Voltar ao início</button></main>;
  return <main className="experience-shell">
    <header className="experience-topbar"><button className="back-button" onClick={() => router.push('/')} aria-label="Voltar ao início">←</button>
      <div className="experience-title"><strong>{room.name}</strong><span>Sala {room.id} · {room.visibility === 'private' ? 'Privada' : 'Pública'}</span></div>
      <div className={'connection-state ' + (connection === 'Conectado' ? 'is-connected' : '')}><span />{connection}</div></header>
    {error && <p className="inline-error" role="status">{error}</p>}
    <div className="experience-layout"><section className="cinema-stage"><div className="stage-label"><span>WENCINE / SALA 3D</span><span>{participants.filter((p) => p.connected).length} participante(s)</span></div>
      <div className="canvas-wrap"><CinemaCanvas participants={participants} selfId={selfId} position={position} color={color} accessory={accessory} expression={expression} pose={pose} socialEffects={socialEffects} nearbySeat={nearestSeatDistance <= 1.3 && pose === 'standing' ? nearestSeat : null} onSitChair={() => { heldKeys.current.clear(); setPose('sitting_chair'); socialAction('sit_chair'); }} onSelectParticipant={(id) => setSelectedParticipantId(id)} /></div>
      <div className="movement-help">WASD / setas: andar · Espaço: pular · E: interagir · Shift: correr · Ctrl: agachar · Ctrl duas vezes: deitar</div>
      <div className="mobile-controls" aria-label="Controles de movimentação">
        <div className="mobile-joystick-zone"><div className="mobile-joystick" ref={joystickRef} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updateJoystick(event); }} onPointerMove={(event) => { if (event.buttons) updateJoystick(event); }} onPointerUp={() => setMobileVector({ x: 0, z: 0 })} onPointerCancel={() => setMobileVector({ x: 0, z: 0 })} onLostPointerCapture={() => setMobileVector({ x: 0, z: 0 })} role="application" aria-label="Joystick virtual: arraste para andar"><span className="mobile-joystick-knob" style={{ transform: `translate(${mobileVector.x * 35}px, ${mobileVector.z * 35}px)` }} /></div><span className="joystick-caption">MOVER</span></div>
        <div className="mobile-action-buttons"><button onClick={() => { if (pose === 'sitting_chair' || pose === 'sitting' || pose === 'fallen' || pose === 'lying_back') { setPose('standing'); socialAction('stand'); } else socialAction('jump'); }}>{pose === 'sitting_chair' ? '↑ Levantar' : '↑ Pular'}</button><button onClick={() => { if (nearestSeatDistance <= 1.3 && pose === 'standing') { setPose('sitting_chair'); socialAction('sit_chair'); } else if (nearbyParticipant) socialAction('offer_hand', { targetId: nearbyParticipant.id }); else socialAction('throw_popcorn'); }}>{pose === 'standing' ? 'Interagir' : 'Ação'}</button></div></div></section>
    <aside className="room-sidebar"><section className="side-panel"><div className="panel-heading"><h2>Seu avatar</h2><button className="text-button" onClick={() => setShowCustomize((value) => !value)}>{showCustomize ? 'Fechar' : 'Personalizar'}</button></div>
      <p className="muted-copy">A aparência é aplicada ao modelo 3D e compartilhada com a sala.</p>
      {showCustomize && <div className="customize-controls"><label>Cor <div className="color-options">{['#a78bfa','#f472b6','#60a5fa','#34d399','#fbbf24','#f8fafc','#f87171'].map((value) =>
        <button key={value} className={'color-swatch ' + (color === value ? 'selected' : '')} style={{ background: value }} onClick={() => setColor(value)} aria-label={'Selecionar cor ' + value} />)}</div></label>
        <label>Acessório <select value={accessory} onChange={(event) => setAccessory(event.target.value)}><option value="none">Nenhum</option><option value="cap">Boné 3D</option><option value="crown">Coroa 3D</option><option value="horns">Chifres 3D</option><option value="halo">Auréola 3D</option><option value="ears">Orelhas 3D</option></select></label>
        <label>Emoção <select value={expression} onChange={(event) => setExpression(event.target.value)}><option value="neutral">Neutro</option><option value="happy">Feliz</option><option value="sad">Triste</option><option value="angry">Bravo</option><option value="love">Apaixonado</option><option value="surprised">Surpreso</option><option value="shy">Tímido</option><option value="sleepy">Sonolento</option></select></label></div>}</section>
      <section className="side-panel social-panel"><div className="panel-heading"><h2>Controles</h2><span className="chat-live">JOGO</span></div>
        <div className="game-controls-help"><p><kbd>W A S D</kbd> / setas <span>Andar</span></p><p><kbd>Espaço</kbd><span>Pular</span></p><p><kbd>E</kbd><span>Interagir</span></p><p><kbd>Shift</kbd><span>Correr</span></p><p><kbd>Ctrl</kbd><span>Agachar</span></p><p><kbd>Ctrl × 2</kbd><span>Deitar de costas</span></p></div>
        {selectedSelf && pose === 'sitting_chair' && <div className="friend-interactions" role="group" aria-label="Ações do seu personagem"><div className="panel-heading"><h3>Você está sentado</h3><button className="text-button" onClick={() => setSelectedParticipantId(null)}>Fechar</button></div><button onClick={() => { setPose('standing'); socialAction('stand'); setSelectedParticipantId(null); }}>Levantar da cadeira</button></div>}
        {isOwner && <div className="test-bot-panel"><div className="panel-heading"><h3>🤖 Bot de teste</h3><span className="chat-live">DONO</span></div><p className="muted-copy">Adicione um personagem de teste sem abrir outra conta.</p><div className="bot-control-grid"><button onClick={() => socketRef.current?.emit('bot:control', { command: 'spawn' })}>Adicionar bot</button><button onClick={() => socketRef.current?.emit('bot:control', { command: 'remove' })}>Remover bot</button><button onClick={() => socketRef.current?.emit('bot:control', { command: 'stand' })}>Em pé</button><button onClick={() => socketRef.current?.emit('bot:control', { command: 'sit_chair' })}>Sentar</button><button onClick={() => socketRef.current?.emit('bot:control', { command: 'sit_floor' })}>No chão</button><button onClick={() => socketRef.current?.emit('bot:control', { command: 'walk', x: position.x + 1.5, z: position.z + 1 })}>Andar até perto</button></div></div>}
        {selectedSeatedNeighbor && <div className="friend-interactions" role="group" aria-label={'Interações com ' + selectedSeatedNeighbor.displayName}><div className="panel-heading"><h3>Com {selectedSeatedNeighbor.displayName}</h3><button className="text-button" onClick={() => setSelectedParticipantId(null)}>Fechar</button></div><p className="muted-copy">Vocês estão sentados lado a lado. Escolha uma interação:</p><div className="friend-interaction-actions">{([['kiss','Roubar beijo'],['peck','Roubar selinho'],['steal_popcorn','Roubar pipoca'],['slap','Dar tapa'],['handsy','Fazer carinho'],['share_popcorn','Dividir pipoca']] as const).map(([action,label]) => <button key={action} onClick={() => socialAction(action, { targetId: selectedSeatedNeighbor.id })}>{label}</button>)}</div></div>}
        <p className="context-prompt" aria-live="polite">{isHoldingHands ? '🤝 Mãos dadas: pressione E para soltar' : nearestSeatDistance <= 1.3 && pose === 'standing' ? '🪑 Cadeira próxima: pressione E para sentar' : seatedNeighbor ? '🍿 Ao lado de ' + seatedNeighbor.displayName + ': E alterna dividir pipoca, carinho, beijo, selinho, roubo e tapa. Espaço levanta' : pose === 'sitting_chair' ? 'Pressione E para levantar' : pose === 'crouching' ? 'Agachado · Ctrl para levantar' : pose === 'lying_back' ? 'Deitado · E para levantar'  : nearbyParticipant ? 'Perto de ' + nearbyParticipant.displayName + ': E para oferecer a mão' : 'Aproxime-se de uma cadeira ou jogador. Pressione E para interagir.'}</p>
        
        {isHoldingHands && <p className="social-status">🤝 Mãos dadas · pressione E para levantar ou encerrar a interação.</p>}
        {pendingRequest && <div className="social-request" role="status"><strong>{pendingRequest.fromName}</strong> quer {pendingRequest.action === 'hold_hands' ? 'segurar sua mão' : pendingRequest.action === 'kiss' ? 'te beijar' : pendingRequest.action === 'peck' ? 'te dar um selinho' : 'fazer carinho'}.
          <div><button onClick={() => { socialAction('accept_interaction', { requestId: pendingRequest.requestId }); setPendingRequest(null); }}>Aceitar</button><button onClick={() => { socialAction('decline_interaction', { requestId: pendingRequest.requestId }); setPendingRequest(null); }}>Recusar</button></div></div>}
        {socialStatus && <p className="social-status" aria-live="polite">{socialStatus}</p>}
        <div className="film-rating"><strong>Avaliar o filme</strong><div>{[1,2,3,4,5].map((value) => <button key={value} aria-label={value + ' estrelas'} className={filmRating >= value ? 'rated' : ''} onClick={() => { setFilmRating(value); socialAction('rate_film', { rating: value }); }}>★</button>)}</div>
          {filmSummary && <span>{filmSummary.average.toFixed(1)} / 5 · {filmSummary.count} avaliação(ões)</span>}</div>
      </section>
      <section className="side-panel participants-panel"><div className="panel-heading"><h2>Na sala</h2><span className="count-badge">{participants.filter((p) => p.connected).length}</span></div>
        <div className="participant-list">{participants.filter((p) => p.connected).map((person) => <div className="participant-row" key={person.id}><span className="avatar-dot" style={{ background: person.color }} />
          <div><strong>{person.displayName}{person.id === selfId ? ' (você)' : ''}</strong><span>{person.role === 'owner' ? 'Dono da sala' : 'Participante'}</span></div>{person.role === 'owner' && <span className="owner-crown">♛</span>}</div>)}</div></section>
      <section className="side-panel chat-panel"><div className="panel-heading"><h2>Conversa</h2><span className="chat-live">AO VIVO</span></div>
        <div className="chat-messages" aria-live="polite">{messages.length ? messages.map((chat) => <article className="chat-message" key={chat.id}><div><strong>{chat.displayName}</strong>{chat.role === 'owner' && <span className="mini-owner">DONO</span>}
          <time>{new Date(chat.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time></div><p>{chat.message}</p></article>) : <p className="chat-empty">As mensagens da sessão aparecem aqui.</p>}</div>
        <form className="chat-form" onSubmit={sendChat}><input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} placeholder="Diga algo…" aria-label="Mensagem do chat" />
          <button type="submit" aria-label="Enviar mensagem" disabled={!message.trim()}>↑</button></form></section></aside></div>
    <footer className="experience-footer"><span>WenCine · sessão compartilhada</span><span>Etapa inicial: salas, avatar 3D e chat · vídeo e voz ainda pendentes</span></footer>
  </main>;
}
