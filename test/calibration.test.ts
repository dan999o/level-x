import { describe, it, expect } from 'vitest';
import {
  captureCalibration,
  applyCalibration,
  magnitudeDrift,
} from '../src/core/math/calibration.js';
import { vec3, toRadians } from '../src/core/math/vector.js';

const g = (pitchDeg: number, rollDeg: number, mag = 1) => {
  const p = toRadians(pitchDeg);
  const r = toRadians(rollDeg);
  return vec3(
    mag * Math.sin(r) * Math.cos(p),
    mag * -Math.sin(p),
    mag * Math.cos(r) * Math.cos(p),
  );
};

const burst = (v: ReturnType<typeof g>, n: number) => Array.from({ length: n }, () => v);

const OPTS = { minSamples: 8, maxSpreadMagnitude: 0.05 };

describe('calibration — capture', () => {
  it('captures a clean stationary burst', () => {
    const res = captureCalibration(burst(g(0, 0), 16), OPTS);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.profile.pitchOffsetDeg).toBeCloseTo(0, 5);
      expect(res.profile.rollOffsetDeg).toBeCloseTo(0, 5);
      expect(res.profile.referenceMagnitude).toBeCloseTo(1, 6);
    }
  });

  it('captures offsets when "level" is actually tilted', () => {
    const res = captureCalibration(burst(g(6, -4), 16), OPTS);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.profile.pitchOffsetDeg).toBeCloseTo(6, 4);
      expect(res.profile.rollOffsetDeg).toBeCloseTo(-4, 4);
    }
  });

  it('rejects too few samples', () => {
    const res = captureCalibration(burst(g(0, 0), 3), OPTS);
    expect(res).toMatchObject({ ok: false, reason: 'too-few-samples' });
  });

  it('rejects a noisy (moving) burst', () => {
    const noisy = [
      g(0, 0), g(0, 0), g(0, 0), g(0, 0),
      g(10, 0), g(-8, 5), g(0, 12), g(4, -9),
    ];
    const res = captureCalibration(noisy, OPTS);
    expect(res).toMatchObject({ ok: false, reason: 'too-noisy' });
  });

  it('rejects a degenerate (zero) burst', () => {
    const res = captureCalibration(burst(vec3(0, 0, 0), 16), OPTS);
    expect(res.ok).toBe(false);
  });

  it('drops individual invalid samples but still succeeds with enough clean ones', () => {
    const mixed = [...burst(g(0, 0), 16), vec3(NaN, 0, 0), vec3(0, Infinity, 0)];
    const res = captureCalibration(mixed, OPTS);
    expect(res.ok).toBe(true);
  });
});

describe('calibration — apply offsets', () => {
  it('a reading at the calibrated pose reads zero', () => {
    const res = captureCalibration(burst(g(6, -4), 16), OPTS);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const corrected = applyCalibration(g(6, -4), res.profile)!;
      expect(corrected.pitchDeg).toBeCloseTo(0, 4);
      expect(corrected.rollDeg).toBeCloseTo(0, 4);
    }
  });

  it('removes the baseline tilt from a new reading', () => {
    const res = captureCalibration(burst(g(6, 0), 16), OPTS);
    if (res.ok) {
      const corrected = applyCalibration(g(16, 0), res.profile)!;
      expect(corrected.pitchDeg).toBeCloseTo(10, 3);
    }
  });

  it('returns null for degenerate live reading', () => {
    const res = captureCalibration(burst(g(0, 0), 16), OPTS);
    if (res.ok) {
      expect(applyCalibration(vec3(0, 0, 0), res.profile)).toBeNull();
    }
  });
});

describe('calibration — magnitude drift', () => {
  it('is ~0 at the baseline magnitude', () => {
    const res = captureCalibration(burst(g(0, 0, 1), 16), OPTS);
    if (res.ok) {
      expect(magnitudeDrift(g(0, 0, 1), res.profile)).toBeCloseTo(0, 6);
    }
  });

  it('grows as magnitude departs from baseline', () => {
    const res = captureCalibration(burst(g(0, 0, 1), 16), OPTS);
    if (res.ok) {
      expect(magnitudeDrift(g(0, 0, 1.5), res.profile)).toBeCloseTo(0.5, 6);
    }
  });
});
