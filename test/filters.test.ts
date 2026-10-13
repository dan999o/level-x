import { describe, it, expect } from 'vitest';
import {
  LowPassScalar,
  LowPassVec3,
  StabilityDetector,
  responsivenessToAlpha,
} from '../src/core/math/filters.js';
import { vec3 } from '../src/core/math/vector.js';

describe('LowPassScalar', () => {
  it('first sample passes through', () => {
    const f = new LowPassScalar(0.5);
    expect(f.update(10)).toBe(10);
  });

  it('smooths toward the input', () => {
    const f = new LowPassScalar(0.5);
    f.update(0);
    expect(f.update(10)).toBeCloseTo(5, 10);
    expect(f.update(10)).toBeCloseTo(7.5, 10);
  });

  it('ignores non-finite samples but keeps last value', () => {
    const f = new LowPassScalar(0.5);
    f.update(4);
    expect(f.update(NaN)).toBe(4);
  });

  it('rejects invalid alpha', () => {
    expect(() => new LowPassScalar(0)).toThrow();
    expect(() => new LowPassScalar(1.5)).toThrow();
  });
});

describe('LowPassVec3', () => {
  it('smooths each axis independently', () => {
    const f = new LowPassVec3(0.5);
    f.update(vec3(0, 0, 0));
    const out = f.update(vec3(10, 20, 30));
    expect(out).toEqual({ x: 5, y: 10, z: 15 });
  });
});

describe('responsivenessToAlpha', () => {
  it('maps 0..1 into a safe (0,1] band', () => {
    expect(responsivenessToAlpha(0)).toBeGreaterThan(0);
    expect(responsivenessToAlpha(0)).toBeLessThan(0.1);
    expect(responsivenessToAlpha(1)).toBeCloseTo(1, 10);
  });

  it('clamps out-of-range input', () => {
    expect(responsivenessToAlpha(-5)).toBe(responsivenessToAlpha(0));
    expect(responsivenessToAlpha(9)).toBe(responsivenessToAlpha(1));
  });
});

describe('StabilityDetector — stationary vs moving', () => {
  it('is not stable until the window is full', () => {
    const d = new StabilityDetector({ windowSize: 5, toleranceMagnitude: 0.05 });
    for (let i = 0; i < 4; i++) {
      expect(d.update(vec3(0, 0, 1)).stable).toBe(false);
    }
    expect(d.update(vec3(0, 0, 1)).stable).toBe(true);
  });

  it('reports stable for a stationary signal', () => {
    const d = new StabilityDetector({ windowSize: 4, toleranceMagnitude: 0.02 });
    let s = d.update(vec3(0, 0, 1));
    for (let i = 0; i < 6; i++) s = d.update(vec3(0, 0, 1.001));
    expect(s.stable).toBe(true);
    expect(s.spread).toBeLessThan(0.02);
  });

  it('reports unstable for a moving signal', () => {
    const d = new StabilityDetector({ windowSize: 4, toleranceMagnitude: 0.02 });
    const samples = [vec3(0, 0, 1), vec3(0.3, 0, 1), vec3(-0.2, 0.1, 1), vec3(0.4, -0.3, 1)];
    let s = d.update(samples[0]);
    for (let i = 1; i < samples.length; i++) s = d.update(samples[i]);
    expect(s.stable).toBe(false);
    expect(s.spread).toBeGreaterThan(0.02);
  });

  it('recovers to stable after movement settles', () => {
    const d = new StabilityDetector({ windowSize: 3, toleranceMagnitude: 0.02 });
    d.update(vec3(1, 1, 1));
    d.update(vec3(0, 0, 1));
    d.update(vec3(0, 0, 1));
    const s = d.update(vec3(0, 0, 1));
    expect(s.stable).toBe(true);
  });
});
