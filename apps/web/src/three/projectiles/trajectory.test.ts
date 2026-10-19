import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildProjectileArcFromDirection,
  PROJECTILE_FLIGHT_SECONDS,
  projectilePositionAt,
  projectileVelocityFromDirection,
} from './trajectory';

describe('projectile trajectory', () => {
  it('starts at the launch point and travels along the supplied aim direction', () => {
    const start = new THREE.Vector3(1, 1.2, 2);
    const direction = new THREE.Vector3(0, 0, -1);
    const points = buildProjectileArcFromDirection(start, direction, 32);
    const velocity = projectileVelocityFromDirection(direction);
    const end = projectilePositionAt(start, velocity, PROJECTILE_FLIGHT_SECONDS);

    expect(points).toHaveLength(33);
    expect(points[0]!.distanceTo(start)).toBeLessThan(1e-8);
    expect(points[32]!.distanceTo(end)).toBeLessThan(1e-8);
    expect(end.z).toBeLessThan(start.z);
    expect(end.x).toBeCloseTo(start.x);
  });

  it('follows a changed aim direction rather than the avatar movement direction', () => {
    const start = new THREE.Vector3(0, 1.2, 0);
    const forwardAim = buildProjectileArcFromDirection(start, new THREE.Vector3(0, 0, -1), 32);
    const rightAim = buildProjectileArcFromDirection(start, new THREE.Vector3(1, 0, 0), 32);

    expect(forwardAim[32]!.z).toBeLessThan(start.z);
    expect(forwardAim[32]!.x).toBeCloseTo(start.x);
    expect(rightAim[32]!.x).toBeGreaterThan(start.x);
    expect(rightAim[32]!.z).toBeCloseTo(start.z);
  });

  it('produces a curved ballistic path due to gravity', () => {
    const start = new THREE.Vector3(0, 1.2, 0);
    const points = buildProjectileArcFromDirection(start, new THREE.Vector3(0, 0, -1), 32);

    expect(Math.max(...points.map((point) => point.y))).toBeGreaterThan(start.y);
    expect(points[16]!.z).toBeCloseTo(-PROJECTILE_FLIGHT_SECONDS * 12 / 2, 0);
    expect(points[32]!.y).toBeLessThan(points[16]!.y);
  });
});
