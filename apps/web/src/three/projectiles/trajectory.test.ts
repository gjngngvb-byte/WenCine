import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildProjectileArc,
  projectileFlightSeconds,
  projectilePositionAt,
  solveProjectileVelocity,
} from './trajectory';

describe('projectile trajectory', () => {
  it('starts at the hand and ends at the exact aimed point', () => {
    const start = new THREE.Vector3(1, 1.2, 2);
    const target = new THREE.Vector3(-3, 0.8, -7);
    const flight = projectileFlightSeconds(start, target);
    const velocity = solveProjectileVelocity(start, target, flight);
    const points = buildProjectileArc(start, target, 32);
    const end = projectilePositionAt(start, velocity, flight);

    expect(points).toHaveLength(33);
    expect(points[0]!.distanceTo(start)).toBeLessThan(1e-8);
    expect(points[32]!.distanceTo(target)).toBeLessThan(1e-8);
    expect(end.distanceTo(target)).toBeLessThan(1e-8);
  });

  it('produces an arc above a level target instead of a straight line', () => {
    const start = new THREE.Vector3(0, 1.2, 0);
    const target = new THREE.Vector3(0, 1.2, -8);
    const points = buildProjectileArc(start, target, 32);

    expect(Math.max(...points.map((point) => point.y))).toBeGreaterThan(start.y);
    expect(points[16]!.z).toBeCloseTo(-4, 1);
  });
});
