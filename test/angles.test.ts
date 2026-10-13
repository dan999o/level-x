import { describe, it, expect } from 'vitest';
import {
  normalizeDeg,
  angleDifferenceDeg,
  angularDistanceDeg,
  anglesWithin,
  roundTo,
} from '../src/core/math/angles.js';

describe('normalizeDeg', () => {
  it('wraps into (-180, 180]', () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(180)).toBe(180);
    expect(normalizeDeg(-180)).toBe(180); // -180 maps to 180 (half-open)
    expect(normalizeDeg(270)).toBe(-90);
    expect(normalizeDeg(-270)).toBe(90);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(450)).toBe(90);
  });
});

describe('angleDifferenceDeg', () => {
  it('takes the short way around', () => {
    expect(angleDifferenceDeg(10, 350)).toBe(20);
    expect(angleDifferenceDeg(350, 10)).toBe(-20);
    expect(angleDifferenceDeg(0, 0)).toBe(0);
  });
});

describe('angularDistanceDeg', () => {
  it('is always non-negative and wrap-aware', () => {
    expect(angularDistanceDeg(10, 350)).toBe(20);
    expect(angularDistanceDeg(0, 180)).toBe(180);
  });
});

describe('anglesWithin', () => {
  it('respects tolerance across the wrap boundary', () => {
    expect(anglesWithin(359, 1, 3)).toBe(true);
    expect(anglesWithin(359, 1, 1)).toBe(false);
  });
});

describe('roundTo', () => {
  it('rounds to 0.1 display resolution', () => {
    expect(roundTo(12.34, 1)).toBe(12.3);
    expect(roundTo(12.35, 1)).toBe(12.4);
    expect(roundTo(-0.04, 1)).toBe(-0); // rounds to 0
  });
});
