import * as THREE from 'three';

export type ProjectileKind = 'throw_popcorn' | 'throw_tomato' | 'throw_egg';

export type ProjectileAimPoint = {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
};

/**
 * Uses the rendered camera's real forward vector. This avoids maintaining a second,
 * subtly different camera-direction formula in the projectile code.
 */
export function getProjectileAimPoint(
  camera: THREE.Camera,
  scene: THREE.Scene,
  raycaster: THREE.Raycaster,
  maxDistance = 30,
  directionOverride?: THREE.Vector3,
): ProjectileAimPoint {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  const origin = camera.getWorldPosition(new THREE.Vector3());
  // O mouse pode mudar a mira entre dois frames. Quando disponível, usa yaw/pitch
  // atuais do controle em vez da orientação da câmera do frame anterior.
  const direction = (directionOverride ?? camera.getWorldDirection(new THREE.Vector3())).clone().normalize();

  raycaster.set(origin, direction);
  raycaster.near = 0.05;
  raycaster.far = maxDistance;

  const hits = raycaster.intersectObjects(scene.children, true);
  const hit = hits.find(({ object }) => {
    let node: THREE.Object3D | null = object;
    while (node) {
      if (node.userData?.isSocialEffect || node.userData?.isLocalAvatar || node.userData?.isProjectilePreview) return false;
      if (!node.visible) return false;
      node = node.parent;
    }
    return true;
  });

  if (!hit) {
    const end = origin.clone().addScaledVector(direction, maxDistance);
    return { x: end.x, y: end.y, z: end.z, nx: -direction.x, ny: -direction.y, nz: -direction.z };
  }

  const normal = hit.face
    ? hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()
    : new THREE.Vector3(0, 1, 0);

  return {
    x: hit.point.x, y: hit.point.y, z: hit.point.z,
    nx: normal.x, ny: normal.y, nz: normal.z,
  };
}

/** A ballistic throw whose horizontal direction is locked to the camera, never to the aim point. */
export function solveProjectileVelocity(
  start: THREE.Vector3,
  target: THREE.Vector3,
  flightSeconds: number,
  gravity = 9.81,
): THREE.Vector3 {
  const time = Math.max(0.12, flightSeconds);
  return target.clone().sub(start).add(new THREE.Vector3(0, 0.5 * gravity * time * time, 0)).divideScalar(time);
}

export function projectileFlightSeconds(start: THREE.Vector3, target: THREE.Vector3): number {
  const distance = start.distanceTo(target);
  // Um tempo mínimo evita arcos quase retos em alvos próximos; o teto evita que
  // a parábola suba excessivamente ao mirar longe e saia da área visível.
  return THREE.MathUtils.clamp(distance / 11.5, 0.42, 1.55);
}

export function projectilePositionAt(
  start: THREE.Vector3,
  velocity: THREE.Vector3,
  seconds: number,
  gravity = 9.81,
): THREE.Vector3 {
  return new THREE.Vector3(
    start.x + velocity.x * seconds,
    start.y + velocity.y * seconds - 0.5 * gravity * seconds * seconds,
    start.z + velocity.z * seconds,
  );
}

export function buildProjectileArc(
  start: THREE.Vector3,
  target: THREE.Vector3,
  segments = 28,
): THREE.Vector3[] {
  const flight = projectileFlightSeconds(start, target);
  const velocity = solveProjectileVelocity(start, target, flight);
  return Array.from({ length: segments + 1 }, (_, index) =>
    projectilePositionAt(start, velocity, flight * index / segments),
  );
}
