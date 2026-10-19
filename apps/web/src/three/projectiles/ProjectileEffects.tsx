'use client';

import { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  buildProjectileArc,
  projectileFlightSeconds,
  projectilePositionAt,
  solveProjectileVelocity,
} from './trajectory';

export type ProjectileEffectData = {
  id: string;
  action: string;
  sentAt: number;
  receivedAt?: number;
  startX?: number;
  startY?: number;
  startZ?: number;
  hitX?: number;
  hitY?: number;
  hitZ?: number;
  normalX?: number;
  normalY?: number;
  normalZ?: number;
};

type Impact = { point: THREE.Vector3; normal: THREE.Vector3; at: number };

function isExcluded(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (node.userData?.isSocialEffect || node.userData?.isLocalAvatar || node.userData?.isProjectilePreview) return true;
    if (!node.visible) return true;
    node = node.parent;
  }
  return false;
}

function seeded(seed: string, index: number): number {
  let value = index + 1;
  for (let i = 0; i < seed.length; i += 1) value = (Math.imul(value ^ seed.charCodeAt(i), 16777619) >>> 0);
  value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
  return value / 4294967296;
}

export function ThrownSnack({ effect }: { effect: ProjectileEffectData }) {
  const { scene } = useThree();
  const projectile = useRef<THREE.Group>(null);
  const kernelRefs = useRef<Array<THREE.Mesh | null>>([]);
  const previousPoint = useRef<THREE.Vector3 | null>(null);
  const impactRef = useRef<Impact | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const isTomato = effect.action === 'throw_tomato';
  const isEgg = effect.action === 'throw_egg';
  const isPopcorn = effect.action === 'throw_popcorn';

  const start = useMemo(
    () => new THREE.Vector3(effect.startX ?? 0, effect.startY ?? 1.2, effect.startZ ?? 0),
    [effect.startX, effect.startY, effect.startZ],
  );
  const target = useMemo(
    () => new THREE.Vector3(effect.hitX ?? 0, effect.hitY ?? 1, effect.hitZ ?? -8),
    [effect.hitX, effect.hitY, effect.hitZ],
  );
  const flight = useMemo(() => projectileFlightSeconds(start, target), [start, target]);
  const velocity = useMemo(() => solveProjectileVelocity(start, target, flight), [start, target, flight]);
  // Use the exact same sampled parabola as the aiming preview, not a separately
  // advanced position that can drift away from the visible line between frames.
  const arcPoints = useMemo(() => buildProjectileArc(start, target, 96), [start, target]);
  const launchAt = effect.receivedAt ?? effect.sentAt;
  const kernels = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    x: (seeded(effect.id, i * 3) - 0.5) * 0.16,
    y: (seeded(effect.id, i * 3 + 1) - 0.5) * 0.13,
    z: (seeded(effect.id, i * 3 + 2) - 0.5) * 0.16,
    vx: (seeded(effect.id, i + 40) - 0.5) * 3.2,
    vy: 1.1 + seeded(effect.id, i + 80) * 2.2,
    vz: (seeded(effect.id, i + 120) - 0.5) * 3.2,
    radius: 0.035 + seeded(effect.id, i + 160) * 0.025,
  })), [effect.id]);

  useFrame(() => {
    const elapsed = Math.max(0, (Date.now() - launchAt) / 1000);
    if (!impactRef.current) {
      // O ponto marcado pela mira define a trajetória inicial, não uma colisão
      // automática no ar. O projétil continua voando até tocar uma superfície real.
      const arcProgress = Math.min(1, elapsed / flight) * (arcPoints.length - 1);
      const arcIndex = Math.min(arcPoints.length - 2, Math.floor(arcProgress));
      const arcBlend = arcProgress - arcIndex;
      const next = elapsed <= flight
        ? arcPoints[arcIndex].clone().lerp(arcPoints[arcIndex + 1], arcBlend)
        : projectilePositionAt(start, velocity, elapsed);
      const previous = previousPoint.current ?? start.clone();
      const segment = next.clone().sub(previous);
      const distance = segment.length();

      if (distance > 0.0001) {
        raycaster.set(previous, segment.normalize());
        raycaster.near = 0.001;
        raycaster.far = distance + 0.03;
        const hit = raycaster.intersectObjects(scene.children, true).find((item) => !isExcluded(item.object));
        if (hit) {
          const normal = hit.face
            ? hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()
            : new THREE.Vector3(0, 1, 0);
          const nextImpact = { point: hit.point.clone(), normal, at: Date.now() };
          impactRef.current = nextImpact;
          setImpact(nextImpact);
        }
      }

      previousPoint.current = next;
      if (projectile.current && !impactRef.current) projectile.current.position.copy(next);
    }

    if (projectile.current) projectile.current.visible = !impactRef.current;
    if (impactRef.current && isPopcorn) {
      const age = Math.max(0, (Date.now() - impactRef.current.at) / 1000);
      const normal = impactRef.current.normal;
      const origin = impactRef.current.point.clone().addScaledVector(normal, 0.045);
      kernelRefs.current.forEach((mesh, i) => {
        if (!mesh) return;
        const kernel = kernels[i];
        if (!kernel) {
          mesh.visible = false;
          return;
        }
        const t = Math.min(age, 1.5);
        const x = origin.x + kernel.x + kernel.vx * t;
        const y = origin.y + kernel.y + kernel.vy * t - 4.9 * t * t;
        const z = origin.z + kernel.z + kernel.vz * t;
        mesh.position.set(x, Math.max(0.035, y), z);
        mesh.visible = age < 15;
      });
    }
  });

  const surfaceQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const stainParts = useMemo(() => Array.from({ length: isEgg ? 8 : 9 }, (_, i) => {
    const angle = (i / (isEgg ? 8 : 9)) * Math.PI * 2 + seeded(effect.id, i) * 0.25;
    const radius = (isEgg ? 0.19 : 0.16) * (0.62 + seeded(effect.id, i + 20) * 0.58);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, r: isEgg ? 0.085 + seeded(effect.id, i + 30) * 0.045 : 0.075 + seeded(effect.id, i + 30) * 0.06 };
  }), [effect.id, isEgg]);

  return (
    <>
      <group ref={projectile} position={[start.x, start.y, start.z]} userData={{ isSocialEffect: true, isProjectilePreview: true }}>
        {isPopcorn ? [0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[(i - 2) * 0.045, (i % 2) * 0.035, ((i % 3) - 1) * 0.04]}>
            <sphereGeometry args={[0.045, 8, 7]} />
            <meshStandardMaterial color="#fff1bf" roughness={0.9} />
          </mesh>
        )) : (
          <mesh scale={isEgg ? [0.105, 0.16, 0.105] : [0.145, 0.145, 0.145]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial color={isTomato ? '#e52b32' : '#fff7e8'} roughness={0.5} />
          </mesh>
        )}
      </group>

      {impact && (
        <group
          position={[impact.point.x, impact.point.y, impact.point.z]}
          quaternion={surfaceQuaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), impact.normal)}
          userData={{ isSocialEffect: true }}
        >
          {isTomato && stainParts.map((part, i) => (
            <mesh key={i} position={[part.x, part.y, 0.006 + i * 0.0002]} renderOrder={5}>
              <circleGeometry args={[part.r, 18]} />
              <meshBasicMaterial color="#e21f2b" transparent opacity={0.96} depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
            </mesh>
          ))}
          {isEgg && (
            <>
              {stainParts.map((part, i) => (
                <mesh key={i} position={[part.x * 1.15, part.y * 1.15, 0.006 + i * 0.0002]} renderOrder={5}>
                  <circleGeometry args={[part.r * 1.25, 18]} />
                  <meshBasicMaterial color="#fff9e9" transparent opacity={0.97} depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
                </mesh>
              ))}
              <mesh position={[0, 0, 0.012]} renderOrder={6}>
                <circleGeometry args={[0.105, 24]} />
                <meshBasicMaterial color="#ffbf22" transparent opacity={0.98} depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
              </mesh>
              <mesh position={[0.035, -0.018, 0.014]} renderOrder={7}>
                <circleGeometry args={[0.045, 18]} />
                <meshBasicMaterial color="#ffdf55" transparent opacity={0.95} depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-5} polygonOffsetUnits={-5} />
              </mesh>
            </>
          )}
        </group>
      )}

      {isPopcorn && kernels.map((kernel, i) => (
        <mesh
          key={i}
          ref={(node) => { kernelRefs.current[i] = node; }}
          position={[target.x, target.y, target.z]}
          visible={false}
          userData={{ isSocialEffect: true }}
        >
          <sphereGeometry args={[kernel.radius, 8, 7]} />
          <meshStandardMaterial color={i % 3 === 0 ? '#fff8d8' : '#f6e5ad'} roughness={0.95} />
        </mesh>
      ))}
    </>
  );
}
