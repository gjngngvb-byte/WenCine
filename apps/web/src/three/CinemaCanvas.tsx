'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

type Participant = {
  id: string; displayName: string; color: string; accessory: string; expression: string;
  x: number; z: number; rotation: number; connected: boolean; pose?: 'standing' | 'sitting' | 'sitting_chair' | 'fallen'; holdingHandsWith?: string;
};
type SocialEffect = { id: string; action: string; actorId: string; targetId?: string; sentAt: number };
function Seat({ position }: { position: [number, number, number] }) {
  return <group position={position}>
    <mesh position={[0, 0.38, 0]} castShadow><boxGeometry args={[0.72, 0.18, 0.72]} /><meshStandardMaterial color="#553f70" roughness={0.72} /></mesh>
    <mesh position={[0, 0.78, -0.25]} castShadow><boxGeometry args={[0.72, 0.68, 0.16]} /><meshStandardMaterial color="#684b88" roughness={0.7} /></mesh>
    <mesh position={[-0.36, 0.5, 0]}><boxGeometry args={[0.1, 0.3, 0.72]} /><meshStandardMaterial color="#8b5cf6" /></mesh>
    <mesh position={[0.36, 0.5, 0]}><boxGeometry args={[0.1, 0.3, 0.72]} /><meshStandardMaterial color="#8b5cf6" /></mesh>
    <mesh position={[0, 0.18, 0]}><boxGeometry args={[0.58, 0.3, 0.58]} /><meshStandardMaterial color="#29213d" /></mesh>
  </group>;
}
function Avatar({ person, local = false, socialEffects, allPeople }: { person: Participant; local?: boolean; socialEffects: SocialEffect[]; allPeople: Participant[] }) {
  const group = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const bodyColor = useMemo(() => new THREE.Color(person.color || '#a78bfa'), [person.color]);
  const lastPosition = useRef({ x: person.x, z: person.z });
  const gait = useRef(0);
  useFrame((_, delta) => {
    if (!group.current) return;
    const now = Date.now();
    const activeEffect = [...socialEffects].reverse().find((effect) => {
      if (effect.actorId !== person.id && effect.targetId !== person.id) return false;
      const partnerId = effect.actorId === person.id ? effect.targetId : effect.actorId;
      const partner = allPeople.find((candidate) => candidate.id === partnerId);
      const heldKiss = effect.action === 'kiss' && person.pose === 'sitting_chair' && partner?.pose === 'sitting_chair' && partner && Math.hypot(partner.x - person.x, partner.z - person.z) <= 1.35;
      return now - effect.sentAt < (effect.action === 'kiss' ? 2600 : effect.action === 'peck' ? 650 : 1150) || Boolean(heldKiss);
    });
    const age = activeEffect ? Math.max(0, (now - activeEffect.sentAt) / (activeEffect.action === 'kiss' ? 2600 : activeEffect.action === 'peck' ? 650 : 1150)) : 1;
    const isContactAnimation = Boolean(activeEffect && ['kiss', 'peck'].includes(activeEffect.action));
    const partnerId = activeEffect?.actorId === person.id ? activeEffect.targetId : activeEffect?.targetId === person.id ? activeEffect.actorId : undefined;
    const partner = isContactAnimation ? allPeople.find((candidate) => candidate.id === partnerId) : undefined;
    const contactDx = partner ? partner.x - person.x : 0;
    const contactDz = partner ? partner.z - person.z : 0;
    const contactLength = Math.hypot(contactDx, contactDz) || 1;
    const targetX = person.x + (partner ? contactDx / contactLength * 0.34 : 0);
    const targetZ = person.z + (partner ? contactDz / contactLength * 0.34 : 0);
    const sitting = person.pose === 'sitting' || person.pose === 'sitting_chair';
    const fallen = person.pose === 'fallen';
    const targetY = person.pose === 'sitting_chair' ? 0.18 : person.pose === 'sitting' ? -0.22 : fallen ? -0.08 : 0;
    const jumpLift = activeEffect?.action === 'jump' && age < 1 ? Math.sin(age * Math.PI) * 0.68 : 0;
    group.current.position.lerp(new THREE.Vector3(targetX, targetY + jumpLift, targetZ), Math.min(1, delta * (isContactAnimation ? 7 : 9)));
    const targetRotation = partner ? Math.atan2(contactDx, contactDz) : person.rotation;
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, targetRotation, delta, isContactAnimation ? 7 : 10);
    group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, fallen ? -1.12 : 0, delta, 7);
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, partner ? (activeEffect?.action === 'kiss' ? -0.08 + Math.sin(performance.now() * 0.004) * 0.02 : -0.035 * Math.sin(age * Math.PI)) : 0, delta, 8);
    group.current.scale.y = THREE.MathUtils.damp(group.current.scale.y, activeEffect?.action === 'crouch' && age < 1 ? 0.72 : 1, delta, 12);
    const moving = !sitting && !fallen && Math.hypot(person.x - lastPosition.current.x, person.z - lastPosition.current.z) > 0.002;
    lastPosition.current = { x: person.x, z: person.z };
    gait.current = THREE.MathUtils.damp(gait.current, moving ? 1 : 0, delta, 9);
    const swing = Math.sin(performance.now() * 0.012) * gait.current * 0.62;
    const waving = activeEffect && ['slap', 'share_popcorn', 'steal_popcorn', 'hold_hands', 'kiss', 'peck', 'handsy', 'throw_popcorn', 'throw_tomato'].includes(activeEffect.action);
    if (leftArm.current) {
      leftArm.current.rotation.x = sitting ? -0.5 : waving && activeEffect?.action === 'hold_hands' ? -0.7 : swing;
      leftArm.current.rotation.z = waving && activeEffect?.action === 'share_popcorn' ? -0.45 : 0;
    }
    if (rightArm.current) {
      rightArm.current.rotation.x = sitting ? -0.5 : waving ? -Math.sin(age * Math.PI) * 1.45 : -swing;
      rightArm.current.rotation.z = waving && activeEffect && ['slap', 'throw_popcorn', 'throw_tomato'].includes(activeEffect.action) ? -Math.sin(age * Math.PI) * 0.9 : 0;
    }
    if (leftLeg.current) leftLeg.current.rotation.x = sitting ? -1.15 : fallen ? 0.8 : -swing * 0.8;
    if (rightLeg.current) rightLeg.current.rotation.x = sitting ? -1.15 : fallen ? -0.35 : swing * 0.8;
  });
  return <group ref={group} position={[person.x, 0, person.z]}>
    <mesh position={[0, 0.57, 0]} castShadow><capsuleGeometry args={[0.23, 0.34, 5, 10]} /><meshStandardMaterial color={bodyColor} roughness={0.58} /></mesh>
    <mesh position={[0, 0.33, 0]} castShadow><sphereGeometry args={[0.2, 16, 12]} /><meshStandardMaterial color={bodyColor} roughness={0.7} /></mesh>
    <group ref={leftArm} position={[-0.25, 0.67, 0]}><mesh position={[0, -0.18, 0]} rotation={[0, 0, -0.12]} castShadow><capsuleGeometry args={[0.075, 0.28, 4, 8]} /><meshStandardMaterial color={bodyColor} /></mesh><mesh position={[0, -0.34, 0.015]}><sphereGeometry args={[0.075, 10, 8]} /><meshStandardMaterial color="#f1d3c3" /></mesh></group>
    <group ref={rightArm} position={[0.25, 0.67, 0]}><mesh position={[0, -0.18, 0]} rotation={[0, 0, 0.12]} castShadow><capsuleGeometry args={[0.075, 0.28, 4, 8]} /><meshStandardMaterial color={bodyColor} /></mesh><mesh position={[0, -0.34, 0.015]}><sphereGeometry args={[0.075, 10, 8]} /><meshStandardMaterial color="#f1d3c3" /></mesh></group>
    <group ref={leftLeg} position={[-0.12, 0.27, 0]}><mesh position={[0, -0.15, 0]} castShadow><capsuleGeometry args={[0.09, 0.23, 4, 8]} /><meshStandardMaterial color={bodyColor} /></mesh><mesh position={[0, -0.29, 0.06]}><boxGeometry args={[0.16, 0.09, 0.24]} /><meshStandardMaterial color="#211c30" /></mesh></group>
    <group ref={rightLeg} position={[0.12, 0.27, 0]}><mesh position={[0, -0.15, 0]} castShadow><capsuleGeometry args={[0.09, 0.23, 4, 8]} /><meshStandardMaterial color={bodyColor} /></mesh><mesh position={[0, -0.29, 0.06]}><boxGeometry args={[0.16, 0.09, 0.24]} /><meshStandardMaterial color="#211c30" /></mesh></group>
    <mesh position={[0, 0.99, 0]} castShadow><sphereGeometry args={[0.25, 24, 20]} /><meshStandardMaterial color="#f1d3c3" roughness={0.82} /></mesh>
    {(person.pose === 'sitting' || person.pose === 'sitting_chair') && <group position={[0, 0.54, 0.22]}>
      <mesh castShadow><cylinderGeometry args={[0.14, 0.1, 0.2, 12]} /><meshStandardMaterial color="#f472b6" roughness={0.65} /></mesh>
      <mesh position={[0, 0.105, 0]}><sphereGeometry args={[0.115, 12, 8]} /><meshStandardMaterial color="#fbbf24" roughness={0.9} /></mesh>
      <mesh position={[-0.055, 0.15, 0.02]}><sphereGeometry args={[0.045, 8, 8]} /><meshStandardMaterial color="#fff0b3" /></mesh>
      <mesh position={[0.045, 0.155, -0.025]}><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial color="#fff0b3" /></mesh>
    </group>}
    {person.expression === 'sleepy' ? <><mesh position={[-0.085, 0.99, 0.218]} rotation={[0,0,-0.12]}><boxGeometry args={[0.07,0.012,0.012]} /><meshStandardMaterial color="#1b1728" /></mesh><mesh position={[0.085, 0.99, 0.218]} rotation={[0,0,0.12]}><boxGeometry args={[0.07,0.012,0.012]} /><meshStandardMaterial color="#1b1728" /></mesh></> : <><mesh position={[-0.085, 0.99, 0.218]}><sphereGeometry args={[0.028, 10, 10]} /><meshStandardMaterial color={person.expression === 'love' ? '#e11d48' : '#1b1728'} /></mesh><mesh position={[0.085, 0.99, 0.218]}><sphereGeometry args={[0.028, 10, 10]} /><meshStandardMaterial color={person.expression === 'love' ? '#e11d48' : '#1b1728'} /></mesh></>}
    {person.expression === 'happy' && <mesh position={[0, 0.88, 0.235]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.052, 0.016, 8, 16, Math.PI]} /><meshStandardMaterial color="#8f3e52" /></mesh>}
    {person.expression === 'sad' && <mesh position={[0, 0.88, 0.235]}><torusGeometry args={[0.052, 0.016, 8, 16, Math.PI]} /><meshStandardMaterial color="#8f3e52" /></mesh>}
    {person.expression === 'surprised' && <mesh position={[0, 0.88, 0.235]}><sphereGeometry args={[0.045, 12, 10]} /><meshStandardMaterial color="#8f3e52" /></mesh>}
    {person.expression === 'angry' && <><mesh position={[-0.085, 1.045, 0.215]} rotation={[0,0,0.28]}><boxGeometry args={[0.085,0.018,0.018]} /><meshStandardMaterial color="#39202c" /></mesh><mesh position={[0.085, 1.045, 0.215]} rotation={[0,0,-0.28]}><boxGeometry args={[0.085,0.018,0.018]} /><meshStandardMaterial color="#39202c" /></mesh><mesh position={[0,0.88,0.235]}><boxGeometry args={[0.1,0.018,0.018]} /><meshStandardMaterial color="#8f3e52" /></mesh></>}
    {person.expression === 'love' && <mesh position={[0, 0.88, 0.235]}><torusGeometry args={[0.04, 0.012, 8, 16]} /><meshStandardMaterial color="#e11d48" /></mesh>}
    {person.expression === 'shy' && <><mesh position={[-0.14,0.91,0.21]}><sphereGeometry args={[0.035,10,8]} /><meshStandardMaterial color="#f472b6" /></mesh><mesh position={[0.14,0.91,0.21]}><sphereGeometry args={[0.035,10,8]} /><meshStandardMaterial color="#f472b6" /></mesh><mesh position={[0,0.88,0.235]}><boxGeometry args={[0.045,0.014,0.014]} /><meshStandardMaterial color="#8f3e52" /></mesh></>}
    {person.accessory === 'cap' && <group position={[0, 1.17, 0]}><mesh><sphereGeometry args={[0.24, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#27203a" /></mesh><mesh position={[0, -0.02, 0.16]}><boxGeometry args={[0.28, 0.035, 0.22]} /><meshStandardMaterial color="#27203a" /></mesh></group>}
    {person.accessory === 'crown' && <mesh position={[0, 1.23, 0]}><cylinderGeometry args={[0.13, 0.19, 0.14, 8, 1, true]} /><meshStandardMaterial color="#fbbf24" metalness={0.55} roughness={0.3} /></mesh>}
    {person.accessory === 'horns' && <group position={[0, 1.15, 0]}><mesh position={[-0.13, 0.08, 0]} rotation={[0, 0, -0.35]}><coneGeometry args={[0.07, 0.23, 8]} /><meshStandardMaterial color="#e879f9" /></mesh><mesh position={[0.13, 0.08, 0]} rotation={[0, 0, 0.35]}><coneGeometry args={[0.07, 0.23, 8]} /><meshStandardMaterial color="#e879f9" /></mesh></group>}
    {person.accessory === 'halo' && <mesh position={[0, 1.25, 0]} rotation={[Math.PI / 2.7, 0, 0]}><torusGeometry args={[0.18, 0.025, 8, 24]} /><meshStandardMaterial color="#fde68a" emissive="#f59e0b" emissiveIntensity={0.4} /></mesh>}
    {person.accessory === 'ears' && <group position={[0, 1.15, 0]}><mesh position={[-0.17, 0.08, 0]} rotation={[0, 0, -0.25]}><coneGeometry args={[0.09, 0.28, 8]} /><meshStandardMaterial color={bodyColor} /></mesh><mesh position={[0.17, 0.08, 0]} rotation={[0, 0, 0.25]}><coneGeometry args={[0.09, 0.28, 8]} /><meshStandardMaterial color={bodyColor} /></mesh></group>}
    <mesh position={[0, 1.55, 0]}><sphereGeometry args={[0.035, 8, 8]} /><meshBasicMaterial color={local ? '#34d399' : '#c4b5fd'} /></mesh>
  </group>;
}
function CinemaScene({ participants, selfId, position, color, accessory, expression, pose, socialEffects, nearbySeat, onSitChair }: {
  participants: Participant[]; selfId: string; position: { x: number; z: number; rotation: number };
  color: string; accessory: string; expression: string; pose: 'standing' | 'sitting' | 'sitting_chair' | 'fallen'; socialEffects: SocialEffect[];
  nearbySeat: { x: number; z: number } | null; onSitChair: (() => void) | undefined;
}) {
  const localPerson: Participant = { id: selfId || 'local', displayName: 'Você', color, accessory, expression, ...position, connected: true, pose };
  return <>
    <color attach="background" args={['#11101b']} /><fog attach="fog" args={['#11101b', 12, 26]} />
    <ambientLight intensity={1.1} /><directionalLight position={[0, 7, 3]} intensity={2.1} castShadow shadow-mapSize-width={512} shadow-mapSize-height={512} />
    <pointLight position={[0, 4, -5]} color="#8b5cf6" intensity={18} distance={15} />
    <mesh position={[0, -0.12, 0]} receiveShadow><boxGeometry args={[20, 0.2, 22]} /><meshStandardMaterial color="#242033" roughness={0.8} /></mesh>
    <mesh position={[0, 3.1, -10.7]}><boxGeometry args={[20, 6.4, 0.3]} /><meshStandardMaterial color="#211c30" /></mesh>
    <mesh position={[0, 3.2, -10.48]}><boxGeometry args={[10.5, 5.2, 0.08]} /><meshStandardMaterial color="#06070d" emissive="#080c20" emissiveIntensity={0.8} /></mesh>
    <mesh position={[0, 3.2, -10.4]}><boxGeometry args={[10.1, 4.8, 0.04]} /><meshStandardMaterial color="#152a4c" emissive="#142c52" emissiveIntensity={0.75} /></mesh>
    <mesh position={[0, 0.08, -9.8]}><boxGeometry args={[12, 0.16, 0.65]} /><meshStandardMaterial color="#a78bfa" emissive="#7c3aed" emissiveIntensity={0.6} /></mesh>
    {Array.from({ length: 5 }, (_, row) => Array.from({ length: 8 }, (_, col) => <Seat key={row + '-' + col} position={[(col - 3.5) * 1.25, 0, 1 + row * 1.65]} />))}
    {nearbySeat && onSitChair && <Html position={[nearbySeat.x, 1.45, nearbySeat.z]} center distanceFactor={8}>
      <button type="button" className="world-chair-button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSitChair(); }}>🪑 Sentar</button>
    </Html>}
    <mesh position={[-9.7, 2.6, 0]}><boxGeometry args={[0.3, 5.2, 21]} /><meshStandardMaterial color="#31263f" /></mesh>
    <mesh position={[9.7, 2.6, 0]}><boxGeometry args={[0.3, 5.2, 21]} /><meshStandardMaterial color="#31263f" /></mesh>
    <mesh position={[0, 5.8, 0]}><boxGeometry args={[19.4, 0.3, 21]} /><meshStandardMaterial color="#191622" /></mesh>
    {Array.from({ length: 9 }, (_, i) => <pointLight key={i} position={[(i - 4) * 2.2, 5.5, 3]} color={i % 2 ? '#8b5cf6' : '#60a5fa'} intensity={1.2} distance={4} />)}
    <Avatar person={localPerson} local socialEffects={socialEffects} allPeople={[localPerson, ...participants.filter((person) => person.id !== selfId && person.connected)]} />
    {participants.filter((person) => person.id !== selfId && person.connected).map((person) => <Avatar key={person.id} person={person} socialEffects={socialEffects} allPeople={[localPerson, ...participants.filter((candidate) => candidate.id !== selfId && candidate.connected)]} />)}
    {socialEffects.filter((effect) => ['throw_popcorn', 'throw_tomato'].includes(effect.action) && Date.now() - effect.sentAt < 1800).map((effect) => {
      const thrower = participants.find((person) => person.id === effect.actorId) ?? (effect.actorId === selfId ? localPerson : undefined);
      return thrower ? <ThrownSnack key={effect.id} effect={effect} x={thrower.x} z={thrower.z} /> : null;
    })}
    <OrbitControls target={[0, 1.2, -2]} enablePan={false} minDistance={4} maxDistance={15} minPolarAngle={0.45} maxPolarAngle={1.55} />
  </>;
}
function ThrownSnack({ effect, x, z }: { effect: SocialEffect; x: number; z: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!mesh.current) return;
    const t = Math.min(1, Math.max(0, (Date.now() - effect.sentAt) / 1400));
    const targetX = x * 0.35;
    mesh.current.position.set(THREE.MathUtils.lerp(x, targetX, t), 1.2 + Math.sin(t * Math.PI) * 2.1, THREE.MathUtils.lerp(z, -10.2, t));
    mesh.current.scale.setScalar(effect.action === 'throw_tomato' ? 0.16 : 0.09);
    mesh.current.rotation.set(t * 7, t * 11, t * 5);
    mesh.current.visible = t < 1;
  });
  return <mesh ref={mesh} position={[x, 1.2, z]} castShadow>
    <sphereGeometry args={[1, 12, 10]} />
    <meshStandardMaterial color={effect.action === 'throw_tomato' ? '#ef4444' : '#fbbf24'} roughness={0.55} />
  </mesh>;
}
export function CinemaCanvas({ participants, selfId, position, color, accessory, expression, pose, socialEffects, nearbySeat, onSitChair }: {
  participants: Participant[]; selfId: string; position: { x: number; z: number; rotation: number };
  color: string; accessory: string; expression: string; pose: 'standing' | 'sitting' | 'sitting_chair' | 'fallen'; socialEffects: SocialEffect[];
  nearbySeat: { x: number; z: number } | null; onSitChair: (() => void) | undefined;
}) {
  return <Canvas camera={{ position: [0, 5.5, 10], fov: 54 }} dpr={[1, 1.35]} shadows fallback={<p>Este dispositivo não consegue renderizar a cena 3D.</p>}>
    <CinemaScene participants={participants} selfId={selfId} position={position} color={color} accessory={accessory} expression={expression} pose={pose} socialEffects={socialEffects} nearbySeat={nearbySeat} onSitChair={onSitChair} />
  </Canvas>;
}
