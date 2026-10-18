'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useCallback, useMemo, useRef } from 'react';
import * as THREE from 'three';

type Participant = {
  id: string; displayName: string; color: string; accessory: string; expression: string;
  x: number; z: number; rotation: number; connected: boolean; pose?: 'standing' | 'sitting' | 'sitting_chair' | 'fallen' | 'crouching' | 'lying_back'; holdingHandsWith?: string;
};
type SocialEffect = { id: string; action: string; actorId: string; targetId?: string; sentAt: number; hitX?: number; hitY?: number; hitZ?: number; normalX?: number; normalY?: number; normalZ?: number };
type CameraMode = 'third' | 'first';
type AimPoint = { x: number; y: number; z: number; nx: number; ny: number; nz: number };
type AimPointGetterRef = { current: (() => AimPoint | null) | null };
function Seat({ position }: { position: [number, number, number] }) {
  // O encosto fica para trás do avatar; todos os assentos olham para a tela (-Z).
  return <group position={position} rotation={[0, Math.PI, 0]}>
    <mesh position={[0, 0.38, 0]} castShadow><boxGeometry args={[0.72, 0.18, 0.72]} /><meshStandardMaterial color="#553f70" roughness={0.72} /></mesh>
    <mesh position={[0, 0.78, -0.25]} castShadow><boxGeometry args={[0.72, 0.68, 0.16]} /><meshStandardMaterial color="#684b88" roughness={0.7} /></mesh>
    <mesh position={[-0.36, 0.5, 0]}><boxGeometry args={[0.1, 0.3, 0.72]} /><meshStandardMaterial color="#8b5cf6" /></mesh>
    <mesh position={[0.36, 0.5, 0]}><boxGeometry args={[0.1, 0.3, 0.72]} /><meshStandardMaterial color="#8b5cf6" /></mesh>
    <mesh position={[0, 0.18, 0]}><boxGeometry args={[0.58, 0.3, 0.58]} /><meshStandardMaterial color="#29213d" /></mesh>
  </group>;
}
function Avatar({ person, local = false, socialEffects, allPeople, onSelectParticipant }: { person: Participant; local?: boolean; socialEffects: SocialEffect[]; allPeople: Participant[]; onSelectParticipant?: ((participantId: string) => void) | undefined }) {
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
      const duration = effect.action === 'kiss' ? 2600 : effect.action === 'peck' ? 650 : effect.action === 'hug' ? 1700 : 1150;
      return now - effect.sentAt < duration || Boolean(heldKiss);
    });
    const effectDuration = activeEffect?.action === 'kiss' ? 2600 : activeEffect?.action === 'peck' ? 650 : activeEffect?.action === 'hug' ? 1700 : 1150;
    const age = activeEffect ? Math.max(0, (now - activeEffect.sentAt) / effectDuration) : 1;
    const isContactAnimation = Boolean(activeEffect && ['kiss', 'peck', 'hug'].includes(activeEffect.action));
    const partnerId = activeEffect?.actorId === person.id ? activeEffect.targetId : activeEffect?.targetId === person.id ? activeEffect.actorId : undefined;
    const partner = isContactAnimation ? allPeople.find((candidate) => candidate.id === partnerId) : undefined;
    const contactDx = partner ? partner.x - person.x : 0;
    const contactDz = partner ? partner.z - person.z : 0;
    const contactLength = Math.hypot(contactDx, contactDz) || 1;
    // Sentado, o quadril fica um pouco acima do assento e ligeiramente à frente,
    // para não atravessar a almofada nem o encosto.
    const contactDistance = activeEffect?.action === 'hug' ? 0.24 : 0.34;
    const targetX = person.pose === 'sitting_chair' ? person.x : person.x + (partner ? contactDx / contactLength * contactDistance : 0);
    const targetZ = person.pose === 'sitting_chair' ? person.z - 0.16 : person.z + (partner ? contactDz / contactLength * contactDistance : 0);
    const sitting = person.pose === 'sitting' || person.pose === 'sitting_chair';
    const fallen = person.pose === 'fallen';
    const lyingBack = person.pose === 'lying_back';
    const crouching = person.pose === 'crouching';
    const targetY = person.pose === 'sitting_chair' ? 0.15 : person.pose === 'sitting' ? -0.22 : fallen || lyingBack ? -0.08 : 0;
    const jumpLift = activeEffect?.action === 'jump' && age < 1 ? Math.sin(Math.min(1, age) * Math.PI) * 1.05 : 0;
    // Aproximação suave tanto ao sentar quanto ao levantar. A posição de rede continua autoritativa,
    // mas o modelo visual percorre o trajeto em vez de teletransportar.
    // O servidor primeiro move o avatar ainda sentado para o ponto de retorno livre;
    // só depois troca a pose. Assim a animação de levantar pode ser suave sem atravessar a cadeira.
    group.current.position.lerp(new THREE.Vector3(targetX, targetY + jumpLift, targetZ), Math.min(1, delta * (isContactAnimation ? 7 : person.pose === 'sitting_chair' ? 4.5 : 8)));
    const targetRotation = person.pose === 'sitting_chair' ? Math.PI : partner ? Math.atan2(contactDx, contactDz) : person.rotation;
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, targetRotation, delta, isContactAnimation ? 7 : 7);
    group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, fallen ? -1.12 : 0, delta, 7);
    group.current.rotation.x = person.pose === 'sitting_chair' ? 0 : THREE.MathUtils.damp(group.current.rotation.x, lyingBack ? -Math.PI / 2 : partner ? (activeEffect?.action === 'kiss' ? -0.08 + Math.sin(performance.now() * 0.004) * 0.02 : -0.035 * Math.sin(age * Math.PI)) : 0, delta, 8);
    group.current.scale.y = THREE.MathUtils.damp(group.current.scale.y, crouching ? 0.68 : 1, delta, 12);
    const moving = !sitting && !fallen && !lyingBack && Math.hypot(person.x - lastPosition.current.x, person.z - lastPosition.current.z) > 0.002;
    lastPosition.current = { x: person.x, z: person.z };
    gait.current = THREE.MathUtils.damp(gait.current, moving ? 1 : 0, delta, 9);
    const swing = Math.sin(performance.now() * 0.012) * gait.current * 0.62;
    const holdingHands = Boolean(person.holdingHandsWith);
    const waving = activeEffect && ['slap', 'share_popcorn', 'steal_popcorn', 'hold_hands', 'kiss', 'peck', 'hug', 'handsy', 'throw_popcorn', 'throw_tomato'].includes(activeEffect.action);
    if (leftArm.current) {
      leftArm.current.rotation.x = sitting ? -0.5 : activeEffect?.action === 'hug' ? -Math.sin(age * Math.PI) * 1.25 : (holdingHands || (waving && activeEffect?.action === 'hold_hands')) ? -0.7 : swing;
      leftArm.current.rotation.z = activeEffect?.action === 'hug' ? Math.sin(age * Math.PI) * 0.48 : waving && activeEffect?.action === 'share_popcorn' ? -0.45 : 0;
    }
    if (rightArm.current) {
      rightArm.current.rotation.x = sitting ? -0.5 : activeEffect?.action === 'hug' ? -Math.sin(age * Math.PI) * 1.25 : waving ? -Math.sin(age * Math.PI) * 1.45 : holdingHands ? -0.2 : -swing;
      rightArm.current.rotation.z = activeEffect?.action === 'hug' ? -Math.sin(age * Math.PI) * 0.48 : waving && activeEffect && ['slap', 'throw_popcorn', 'throw_tomato'].includes(activeEffect.action) ? -Math.sin(age * Math.PI) * 0.9 : 0;
    }
    if (leftLeg.current) leftLeg.current.rotation.x = person.pose === 'sitting_chair' ? 0 : sitting ? -1.15 : fallen ? 0.8 : -swing * 0.8;
    if (rightLeg.current) rightLeg.current.rotation.x = person.pose === 'sitting_chair' ? 0 : sitting ? -1.15 : fallen ? -0.35 : swing * 0.8;
  });
  return <group ref={group} userData={local ? { isLocalAvatar: true } : {}} position={[person.x, 0, person.z]} onClick={(event) => { if (onSelectParticipant) { event.stopPropagation(); onSelectParticipant(person.id); } }}>
    <mesh position={[0, 0.57, 0]} castShadow><capsuleGeometry args={[0.23, 0.34, 5, 10]} /><meshStandardMaterial color={bodyColor} roughness={0.58} /></mesh>
    <mesh position={[0, 0.33, 0]} castShadow><sphereGeometry args={[0.2, 16, 12]} /><meshStandardMaterial color={bodyColor} roughness={0.7} /></mesh>
    <group ref={leftArm} position={[-0.25, 0.67, 0]}><mesh position={[0, -0.18, 0]} rotation={[0, 0, -0.12]} castShadow><capsuleGeometry args={[0.075, 0.28, 4, 8]} /><meshStandardMaterial color={bodyColor} /></mesh><mesh position={[0, -0.34, 0.015]}><sphereGeometry args={[0.075, 10, 8]} /><meshStandardMaterial color="#f1d3c3" /></mesh></group>
    <group ref={rightArm} position={[0.25, 0.67, 0]}><mesh position={[0, -0.18, 0]} rotation={[0, 0, 0.12]} castShadow><capsuleGeometry args={[0.075, 0.28, 4, 8]} /><meshStandardMaterial color={bodyColor} /></mesh><mesh position={[0, -0.34, 0.015]}><sphereGeometry args={[0.075, 10, 8]} /><meshStandardMaterial color="#f1d3c3" /></mesh></group>
    <group ref={leftLeg} position={[-0.12, person.pose === 'sitting_chair' ? 0.36 : 0.27, 0]}>{person.pose === 'sitting_chair' ? <><mesh position={[0, -0.025, 0.12]} rotation={[Math.PI / 2, 0, 0]} castShadow><capsuleGeometry args={[0.09, 0.22, 4, 8]} /><meshStandardMaterial color={bodyColor} /></mesh><group position={[0, -0.04, 0.48]}><mesh position={[0, -0.17, 0]} castShadow><capsuleGeometry args={[0.075, 0.2, 4, 8]} /><meshStandardMaterial color={bodyColor} /></mesh><mesh position={[0, -0.3, 0.045]}><boxGeometry args={[0.16, 0.09, 0.24]} /><meshStandardMaterial color="#211c30" /></mesh></group></> : <><mesh position={[0, -0.15, 0]} castShadow><capsuleGeometry args={[0.09, 0.23, 4, 8]} /><meshStandardMaterial color={bodyColor} /></mesh><mesh position={[0, -0.29, 0.06]}><boxGeometry args={[0.16, 0.09, 0.24]} /><meshStandardMaterial color="#211c30" /></mesh></>}</group>
    <group ref={rightLeg} position={[0.12, person.pose === 'sitting_chair' ? 0.36 : 0.27, 0]}>{person.pose === 'sitting_chair' ? <><mesh position={[0, -0.025, 0.12]} rotation={[Math.PI / 2, 0, 0]} castShadow><capsuleGeometry args={[0.09, 0.22, 4, 8]} /><meshStandardMaterial color={bodyColor} /></mesh><group position={[0, -0.04, 0.48]}><mesh position={[0, -0.17, 0]} castShadow><capsuleGeometry args={[0.075, 0.2, 4, 8]} /><meshStandardMaterial color={bodyColor} /></mesh><mesh position={[0, -0.3, 0.045]}><boxGeometry args={[0.16, 0.09, 0.24]} /><meshStandardMaterial color="#211c30" /></mesh></group></> : <><mesh position={[0, -0.15, 0]} castShadow><capsuleGeometry args={[0.09, 0.23, 4, 8]} /><meshStandardMaterial color={bodyColor} /></mesh><mesh position={[0, -0.29, 0.06]}><boxGeometry args={[0.16, 0.09, 0.24]} /><meshStandardMaterial color="#211c30" /></mesh></>}</group>
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
function CinemaScene({ participants, selfId, position, color, accessory, expression, pose, socialEffects, nearbySeat, onSitChair, onSelectParticipant, onAimPoint, aimPointGetterRef, cameraMode, cameraYaw, cameraPitch, cameraDistance }: {
  participants: Participant[]; selfId: string; position: { x: number; z: number; rotation: number };
  color: string; accessory: string; expression: string; pose: 'standing' | 'sitting' | 'sitting_chair' | 'fallen' | 'crouching' | 'lying_back'; socialEffects: SocialEffect[];
  nearbySeat: { x: number; z: number } | null; onSitChair: ((seat: { x: number; z: number }) => void) | undefined; onSelectParticipant?: ((participantId: string) => void) | undefined; onAimPoint?: ((point: AimPoint) => void) | undefined; aimPointGetterRef: AimPointGetterRef; cameraMode: CameraMode; cameraYaw: number; cameraPitch: number; cameraDistance: number;
}) {
  const { camera, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const aimPointCallback = useRef(onAimPoint);
  aimPointCallback.current = onAimPoint;
  const getAimPoint = useCallback((): AimPoint => {
    // Recalcula a mira no instante do arremesso, usando a câmera já atualizada.
    // Não depende do último ponto salvo pelo frame anterior.
    scene.updateMatrixWorld(true);
    camera.updateWorldMatrix(true, false);
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const direction = camera.getWorldDirection(new THREE.Vector3()).normalize();
    raycaster.set(origin, direction);
    raycaster.near = 0.05;
    raycaster.far = 30;
    const hit = raycaster.intersectObjects(scene.children, true).find((item) => {
      let node: THREE.Object3D | null = item.object;
      while (node) {
        if (node.userData?.isLocalAvatar || node.userData?.isSocialEffect) return false;
        if (!node.visible) return false;
        node = node.parent;
      }
      return true;
    });
    if (hit) {
      const normal = hit.face
        ? hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()
        : new THREE.Vector3(0, 1, 0);
      return { x: hit.point.x, y: hit.point.y, z: hit.point.z, nx: normal.x, ny: normal.y, nz: normal.z };
    }
    return {
      x: origin.x + direction.x * 20, y: origin.y + direction.y * 20, z: origin.z + direction.z * 20,
      nx: -direction.x, ny: -direction.y, nz: -direction.z,
    };
  }, [camera, scene, raycaster]);
  if (aimPointGetterRef) aimPointGetterRef.current = getAimPoint;
  useFrame((_, delta) => {
    const lookDirection = new THREE.Vector3(Math.sin(cameraYaw), Math.tan(cameraPitch), -Math.cos(cameraYaw)).normalize();
    if (cameraMode === 'first') {
      const eyeHeight = pose === 'sitting_chair' ? 1.12 : pose === 'sitting' ? 0.7 : pose === 'crouching' ? 0.92 : pose === 'lying_back' ? 0.35 : pose === 'fallen' ? 0.45 : 1.45;
      camera.position.lerp(new THREE.Vector3(position.x, eyeHeight, position.z), Math.min(1, delta * 16));
      camera.lookAt(position.x + lookDirection.x * 5, eyeHeight + lookDirection.y * 5, position.z + lookDirection.z * 5);
    } else {
      // A órbita depende apenas do mouse. O movimento lateral não reposiciona a câmera atrás do personagem.
      // Órbita esférica: inclinação ampla e contínua, inclusive para olhar o teto.
      // Ao mover o mouse para cima, o pitch aumenta e a câmera desce para olhar para cima.
      const focus = new THREE.Vector3(position.x, pose === 'sitting_chair' ? 0.9 : 1.1, position.z);
      const horizontal = Math.cos(cameraPitch) * cameraDistance;
      const targetX = THREE.MathUtils.clamp(position.x - Math.sin(cameraYaw) * horizontal, -9.1, 9.1);
      const targetZ = THREE.MathUtils.clamp(position.z + Math.cos(cameraYaw) * horizontal, -9.4, 9.1);
      const targetY = THREE.MathUtils.clamp(focus.y - Math.sin(cameraPitch) * cameraDistance, 0.12, 7.2);
      camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), Math.min(1, delta * 8));
      const viewDirection = new THREE.Vector3(Math.sin(cameraYaw) * Math.cos(cameraPitch), Math.sin(cameraPitch), -Math.cos(cameraYaw) * Math.cos(cameraPitch));
      camera.lookAt(focus.clone().add(viewDirection.multiplyScalar(5)));
    }
    aimPointCallback.current?.(getAimPoint());
  });
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
      <button type="button" className="world-chair-button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSitChair(nearbySeat); }}>🪑 Sentar</button>
    </Html>}
    <mesh position={[-9.7, 2.6, 0]}><boxGeometry args={[0.3, 5.2, 21]} /><meshStandardMaterial color="#31263f" /></mesh>
    <mesh position={[9.7, 2.6, 0]}><boxGeometry args={[0.3, 5.2, 21]} /><meshStandardMaterial color="#31263f" /></mesh>
    <mesh position={[0, 5.8, 0]}><boxGeometry args={[19.4, 0.3, 21]} /><meshStandardMaterial color="#191622" /></mesh>
    {Array.from({ length: 9 }, (_, i) => <pointLight key={i} position={[(i - 4) * 2.2, 5.5, 3]} color={i % 2 ? '#8b5cf6' : '#60a5fa'} intensity={1.2} distance={4} />)}
    {cameraMode !== 'first' && <Avatar person={localPerson} local onSelectParticipant={onSelectParticipant} socialEffects={socialEffects} allPeople={[localPerson, ...participants.filter((person) => person.id !== selfId && person.connected)]} />}
    {participants.filter((person) => person.id !== selfId && person.connected).map((person) => <Avatar key={person.id} person={person} socialEffects={socialEffects} allPeople={[localPerson, ...participants.filter((candidate) => candidate.id !== selfId && candidate.connected)]} onSelectParticipant={onSelectParticipant} />)}
    {socialEffects.filter((effect) => ['throw_popcorn', 'throw_tomato'].includes(effect.action) && Date.now() - effect.sentAt < 4300).map((effect) => {
      const thrower = participants.find((person) => person.id === effect.actorId) ?? (effect.actorId === selfId ? localPerson : undefined);
      return thrower ? <ThrownSnack key={effect.id} effect={effect} x={thrower.x} z={thrower.z} rotation={thrower.rotation} /> : null;
    })}
  </>;
}
function ThrownSnack({ effect, x, z, rotation }: { effect: SocialEffect; x: number; z: number; rotation: number }) {
  const projectile = useRef<THREE.Mesh>(null);
  const stain = useRef<THREE.Group>(null);
  const kernels = useRef<(THREE.Mesh | null)[]>([]);
  const physics = useRef<Array<{ vx: number; vy: number; vz: number }>>([]);
  const impactStarted = useRef(false);
  const hit = useMemo(() => new THREE.Vector3(effect.hitX ?? 0, effect.hitY ?? 0, effect.hitZ ?? -10.2), [effect.hitX, effect.hitY, effect.hitZ]);
  const normal = useMemo(() => new THREE.Vector3(effect.normalX ?? 0, effect.normalY ?? 1, effect.normalZ ?? 0).normalize(), [effect.normalX, effect.normalY, effect.normalZ]);
  const flightMs = 520;
  const isTomato = effect.action === 'throw_tomato';
  const seed = useMemo(() => {
    let value = 0;
    for (const char of effect.id) value = (value * 31 + char.charCodeAt(0)) >>> 0;
    return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
  }, [effect.id]);
  // Distribui as pipocas sobre o plano da superfície atingida, seja parede, cadeira ou chão.
  const kernelStarts = useMemo(() => {
    const reference = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const tangent = new THREE.Vector3().crossVectors(normal, reference).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    return Array.from({ length: 12 }, () => {
      const angle = seed() * Math.PI * 2;
      const radius = Math.sqrt(seed()) * 0.16;
      const offset = tangent.clone().multiplyScalar(Math.cos(angle) * radius)
        .add(bitangent.clone().multiplyScalar(Math.sin(angle) * radius));
      return { x: offset.x, y: offset.y, z: offset.z };
    });
  }, [seed, normal]);
  const stainParts = useMemo(() => Array.from({ length: 7 }, (_, i) => ({
    x: i === 0 ? 0 : (seed() - 0.5) * 0.34,
    y: i === 0 ? 0 : (seed() - 0.5) * 0.34,
    r: i === 0 ? 0.17 : 0.045 + seed() * 0.07,
    color: i % 2 ? '#dc2626' : '#ef4444',
  })), [seed]);
  useFrame(() => {
    const ageMs = Date.now() - effect.sentAt;
    const t = Math.max(0, Math.min(1, ageMs / flightMs));
    // Lança da frente do avatar e descreve um arco balístico até o ponto
    // atingido pela mira da câmera, em vez de deslizar em linha quase reta.
    const start = new THREE.Vector3(
      x + Math.sin(rotation) * 0.28,
      1.3,
      z + Math.cos(rotation) * 0.28,
    );
    const horizontalDistance = Math.hypot(hit.x - start.x, hit.z - start.z);
    const arcHeight = Math.min(2.4, Math.max(0.3, horizontalDistance * 0.1));
    const arc = 4 * arcHeight * t * (1 - t);
    if (projectile.current) {
      projectile.current.position.set(THREE.MathUtils.lerp(start.x, hit.x, t), THREE.MathUtils.lerp(start.y, hit.y, t) + arc, THREE.MathUtils.lerp(start.z, hit.z, t));
      projectile.current.rotation.set(t * 7, t * 11, t * 5);
      // O tomate viaja como uma peça; a pipoca já sai como várias bolinhas.
      projectile.current.visible = isTomato && ageMs < flightMs;
      projectile.current.scale.setScalar(0.15);
    }
    if (stain.current) {
      const afterHit = (ageMs - flightMs) / 1000;
      stain.current.position.copy(hit.clone().addScaledVector(normal, 0.012));
      stain.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      stain.current.visible = isTomato && afterHit >= 0 && afterHit < 3.6;
      stain.current.children.forEach((child) => {
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        material.opacity = afterHit > 3 ? Math.max(0, (3.6 - afterHit) / 0.6) : 0.92;
      });
    }
    if (!isTomato && ageMs < flightMs) {
      // Pequenas bolinhas visíveis durante todo o arremesso, abrindo levemente em leque.
      kernels.current.forEach((mesh, i) => {
        if (!mesh) return;
        const spread = t * 0.12;
        mesh.position.set(
          THREE.MathUtils.lerp(start.x, hit.x, t) + (kernelStarts[i]?.x ?? 0) * (0.25 + t) + (kernelStarts[i]?.x ?? 0) * spread,
          THREE.MathUtils.lerp(start.y, hit.y, t) + arc + (kernelStarts[i]?.y ?? 0) * t,
          THREE.MathUtils.lerp(start.z, hit.z, t) + (kernelStarts[i]?.z ?? 0) * (0.25 + t) + (kernelStarts[i]?.z ?? 0) * spread,
        );
        mesh.visible = true;
        (mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      });
    } else if (!isTomato && ageMs < flightMs + 3200) {
      const elapsed = Math.max(0, (ageMs - flightMs) / 1000);
      if (!impactStarted.current) {
        impactStarted.current = true;
        const reference = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const tangent = new THREE.Vector3().crossVectors(normal, reference).normalize();
        const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
        physics.current = kernelStarts.map(() => {
          const spreadA = (seed() - 0.5) * 2.2;
          const spreadB = (seed() - 0.5) * 2.2;
          const velocity = normal.clone().multiplyScalar(0.65 + seed() * 1.25)
            .add(tangent.clone().multiplyScalar(spreadA))
            .add(bitangent.clone().multiplyScalar(spreadB));
          velocity.y += 0.45 + seed() * 1.1;
          return { vx: velocity.x, vy: velocity.y, vz: velocity.z };
        });
      }
      kernels.current.forEach((mesh, i) => {
        if (!mesh) return;
        const velocity = physics.current[i];
        if (!velocity) return;
        const kt = Math.max(0, elapsed - (i % 3) * 0.025);
        let y = hit.y + (kernelStarts[i]?.y ?? 0) + normal.y * 0.035 + velocity.vy * kt - 4.9 * kt * kt;
        if (y < 0.045) { y = 0.045 + Math.abs(Math.sin(kt * 5 + i)) * 0.025; velocity.vx *= 0.985; velocity.vz *= 0.985; }
        mesh.position.set(
          hit.x + (kernelStarts[i]?.x ?? 0) + normal.x * 0.035 + velocity.vx * kt,
          Math.max(0.045, y),
          hit.z + (kernelStarts[i]?.z ?? 0) + normal.z * 0.035 + velocity.vz * kt,
        );
        mesh.visible = ageMs < flightMs + 3000;
        (mesh.material as THREE.MeshBasicMaterial).opacity = ageMs > flightMs + 2450 ? Math.max(0, (flightMs + 3000 - ageMs) / 550) : 1;
      });
    } else kernels.current.forEach((mesh) => { if (mesh) mesh.visible = false; });
  });
  const stainQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  return <>
    <mesh ref={projectile} position={[x, 1.18, z]} castShadow userData={{ isSocialEffect: true }}>
      <sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color={isTomato ? '#ef4444' : '#fffdf5'} roughness={0.55} />
    </mesh>
    <group ref={stain} position={[hit.x, hit.y, hit.z]} quaternion={stainQuaternion} userData={{ isSocialEffect: true }}>
      {stainParts.map((part, i) => <mesh key={i} position={[part.x, part.y, 0]} renderOrder={4}>
        <circleGeometry args={[part.r, 14]} /><meshBasicMaterial color={part.color} transparent opacity={0.92} depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>)}
    </group>
    {!isTomato && kernelStarts.map((start, i) => <mesh key={i} ref={(node) => { kernels.current[i] = node; }} position={[hit.x + start.x, hit.y + start.y, hit.z + start.z]} visible={false} userData={{ isSocialEffect: true }}>
      <sphereGeometry args={[0.035 + (i % 3) * 0.006, 8, 6]} /><meshBasicMaterial color="#fffdf5" transparent opacity={1} />
    </mesh>)}
  </>;
}
export function CinemaCanvas({ participants, selfId, position, color, accessory, expression, pose, socialEffects, nearbySeat, onSitChair, onSelectParticipant, onAimPoint, aimPointGetterRef, cameraMode, cameraYaw, cameraPitch, cameraDistance }: {
  participants: Participant[]; selfId: string; position: { x: number; z: number; rotation: number };
  color: string; accessory: string; expression: string; pose: 'standing' | 'sitting' | 'sitting_chair' | 'fallen' | 'crouching' | 'lying_back'; socialEffects: SocialEffect[];
  nearbySeat: { x: number; z: number } | null; onSitChair: ((seat: { x: number; z: number }) => void) | undefined; onSelectParticipant?: ((participantId: string) => void) | undefined; onAimPoint?: ((point: AimPoint) => void) | undefined; aimPointGetterRef: AimPointGetterRef; cameraMode: CameraMode; cameraYaw: number; cameraPitch: number; cameraDistance: number;
}) {
  return <Canvas camera={{ position: [0, 5.5, 10], fov: 54 }} dpr={[1, 1.35]} shadows fallback={<p>Este dispositivo não consegue renderizar a cena 3D.</p>}>
    <CinemaScene participants={participants} selfId={selfId} position={position} color={color} accessory={accessory} expression={expression} pose={pose} socialEffects={socialEffects} nearbySeat={nearbySeat} onSitChair={onSitChair} onSelectParticipant={onSelectParticipant} onAimPoint={onAimPoint} aimPointGetterRef={aimPointGetterRef} cameraMode={cameraMode} cameraYaw={cameraYaw} cameraPitch={cameraPitch} cameraDistance={cameraDistance} />
  </Canvas>;
}
