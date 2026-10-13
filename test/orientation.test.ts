import { describe, it, expect } from 'vitest';
import { vec3, toRadians } from '../src/core/math/vector.js';
import {
  gravityPitchRoll,
  tiltFromReferenceDeg,
  tiltComponents,
  DEFAULT_AXIS_MAPPING,
} from '../src/core/math/orientation.js';

// Synthetic gravity-reaction vectors (pointing "up" along +z by default).
const g = (pitchDeg: number, rollDeg: number) => {
  // Build an up-vector tilted by roll about forward axis and pitch about right.
  const p = toRadians(pitchDeg);
  const r = toRadians(rollDeg);
  // right = sin(roll)*cos(pitch), forward = -sin(pitch), up = cos(roll)*cos(pitch)
  return vec3(Math.sin(r) * Math.cos(p), -Math.sin(p), Math.cos(r) * Math.cos(p));
};

describe('orientation — horizontal reference', () => {
  it('level vector reads pitch 0, roll 0', () => {
    const pr = gravityPitchRoll(vec3(0, 0, 1))!;
    expect(pr.pitchDeg).toBeCloseTo(0, 6);
    expect(pr.rollDeg).toBeCloseTo(0, 6);
  });

  it('magnitude does not affect the angle (direction only)', () => {
    const a = gravityPitchRoll(vec3(0, 0, 1))!;
    const b = gravityPitchRoll(vec3(0, 0, 100))!;
    expect(a.pitchDeg).toBeCloseTo(b.pitchDeg, 9);
    expect(a.rollDeg).toBeCloseTo(b.rollDeg, 9);
  });
});

describe('orientation — positive and negative tilt', () => {
  it('positive roll of 30 degrees', () => {
    const pr = gravityPitchRoll(g(0, 30))!;
    expect(pr.rollDeg).toBeCloseTo(30, 5);
    expect(pr.pitchDeg).toBeCloseTo(0, 5);
  });

  it('negative roll of -45 degrees', () => {
    const pr = gravityPitchRoll(g(0, -45))!;
    expect(pr.rollDeg).toBeCloseTo(-45, 5);
  });

  it('positive pitch of 20 degrees', () => {
    const pr = gravityPitchRoll(g(20, 0))!;
    expect(pr.pitchDeg).toBeCloseTo(20, 5);
    expect(pr.rollDeg).toBeCloseTo(0, 5);
  });

  it('negative pitch of -15 degrees', () => {
    const pr = gravityPitchRoll(g(-15, 0))!;
    expect(pr.pitchDeg).toBeCloseTo(-15, 5);
  });

  it('combined pitch and roll', () => {
    const pr = gravityPitchRoll(g(10, 25))!;
    expect(pr.pitchDeg).toBeCloseTo(10, 4);
    expect(pr.rollDeg).toBeCloseTo(25, 4);
  });
});

describe('orientation — vertical reference', () => {
  it('reports null-safe behavior and ~90 deg tilt when held vertical', () => {
    // Up-vector pointing along +x means the device is on its side (90 deg).
    const tilt = tiltFromReferenceDeg(vec3(1, 0, 0), vec3(0, 0, 1));
    expect(tilt).toBeCloseTo(90, 5);
  });
});

describe('orientation — tilt from reference', () => {
  it('zero tilt against itself', () => {
    expect(tiltFromReferenceDeg(vec3(0, 0, 1), vec3(0, 0, 1))).toBeCloseTo(0, 6);
  });

  it('30 degree scalar tilt', () => {
    expect(tiltFromReferenceDeg(g(0, 30), vec3(0, 0, 1))).toBeCloseTo(30, 5);
  });

  it('returns null for degenerate reading', () => {
    expect(tiltFromReferenceDeg(vec3(0, 0, 0), vec3(0, 0, 1))).toBeNull();
  });
});

describe('orientation — tilt components vs a reference', () => {
  it('differences pitch/roll against a tilted reference', () => {
    const ref = g(5, 5);
    const cur = g(12, 20);
    const comp = tiltComponents(cur, ref, DEFAULT_AXIS_MAPPING)!;
    expect(comp.pitchDeg).toBeCloseTo(7, 3);
    expect(comp.rollDeg).toBeCloseTo(15, 3);
  });
});
