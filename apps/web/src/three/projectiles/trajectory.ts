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
  originOverride?: THREE.Vector3,
): ProjectileAimPoint {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  // Para projéteis, a mira parte da mão do avatar. Partir da câmera em terceira
  // pessoa pode fazer o raio atravessar o próprio avatar e selecionar um ponto atrás dele.
  const origin = (originOverride ?? camera.getWorldPosition(new THREE.Vector3())).clone();
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

/** Camera direction controls forward travel; gravity bends the path downward. */
export const PROJECTILE_FLIGHT_SECONDS = 1.35;
export const PROJECTILE_SPEED = 12;
export const PROJECTILE_LOFT = 3.2;

export function projectileVelocityFromDirection(
  direction: THREE.Vector3,
  speed = PROJECTILE_SPEED,
  loft = PROJECTILE_LOFT,
): THREE.Vector3 {
  return direction.clone().normalize().multiplyScalar(speed).add(new THREE.Vector3(0, loft, 0));
}

/** Solve initial velocity so the projectile reaches the camera's exact aim point on a gravity arc. */
export function projectileVelocityToTarget(
  start: THREE.Vector3,
  target: THREE.Vector3,
  flightSeconds = PROJECTILE_FLIGHT_SECONDS,
  gravity = 9.81,
): THREE.Vector3 {
  const duration = Math.max(0.1, flightSeconds);
  return new THREE.Vector3(
    (target.x - start.x) / duration,
    (target.y - start.y + 0.5 * gravity * duration * duration) / duration,
    (target.z - start.z) / duration,
  );
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

export function buildProjectileArcToTarget(
  start: THREE.Vector3,
  target: THREE.Vector3,
  segments = 96,
): THREE.Vector3[] {
  const velocity = projectileVelocityToTarget(start, target);
  return Array.from({ length: segments + 1 }, (_, index) =>
    projectilePositionAt(start, velocity, PROJECTILE_FLIGHT_SECONDS * index / segments),
  );
}

export function buildProjectileArcFromDirection(
  start: THREE.Vector3,
  direction: THREE.Vector3,
  segments = 96,
): THREE.Vector3[] {
  const velocity = projectileVelocityFromDirection(direction);
  return Array.from({ length: segments + 1 }, (_, index) =>
    projectilePositionAt(start, velocity, PROJECTILE_FLIGHT_SECONDS * index / segments),
  );
}
