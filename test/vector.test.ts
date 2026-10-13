import { describe, it, expect } from 'vitest';
import { vec3, magnitude, normalize, angleBetweenDeg, dot, isFiniteVec3 } from '../src/core/math/vector.js';

describe('vector', () => {
  it('computes magnitude', () => {
    expect(magnitude(vec3(3, 4, 0))).toBeCloseTo(5, 10);
  });

  it('normalizes to unit length', () => {
    const u = normalize(vec3(0, 0, 9.81))!;
    expect(magnitude(u)).toBeCloseTo(1, 10);
    expect(u.z).toBeCloseTo(1, 10);
  });

  it('returns null when normalizing a zero vector', () => {
    expect(normalize(vec3(0, 0, 0))).toBeNull();
  });

  it('angle between identical directions is 0', () => {
    expect(angleBetweenDeg(vec3(0, 0, 2), vec3(0, 0, 9))).toBeCloseTo(0, 6);
  });

  it('angle between orthogonal vectors is 90', () => {
    expect(angleBetweenDeg(vec3(1, 0, 0), vec3(0, 0, 1))).toBeCloseTo(90, 6);
  });

  it('angle between opposite vectors is 180', () => {
    expect(angleBetweenDeg(vec3(0, 0, 1), vec3(0, 0, -1))).toBeCloseTo(180, 6);
  });

  it('angle is null for degenerate input', () => {
    expect(angleBetweenDeg(vec3(0, 0, 0), vec3(0, 0, 1))).toBeNull();
  });

  it('dot product', () => {
    expect(dot(vec3(1, 2, 3), vec3(4, 5, 6))).toBe(32);
  });

  it('isFiniteVec3 rejects NaN/Infinity', () => {
    expect(isFiniteVec3(vec3(1, 2, 3))).toBe(true);
    expect(isFiniteVec3(vec3(NaN, 0, 0))).toBe(false);
    expect(isFiniteVec3(vec3(0, Infinity, 0))).toBe(false);
    expect(isFiniteVec3(null)).toBe(false);
  });
});
