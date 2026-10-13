/**
 * Synthetic IMU streams for offline development and simulator-free testing.
 *
 * Each generator maps a time `t` (seconds) to a gravity-reaction vector in
 * arbitrary-but-consistent units (|g| ~= 1), matching the "direction only"
 * contract of the orientation engine. A small deterministic PRNG keeps noisy
 * streams reproducible in tests.
 */

import { type Vec3, toRadians } from '../core/math/vector.js';

/** Up-vector for a given pitch/roll (degrees), |v| scaled by `mag`. */
export function upVector(pitchDeg: number, rollDeg: number, mag = 1): Vec3 {
  const p = toRadians(pitchDeg);
  const r = toRadians(rollDeg);
  return {
    x: mag * Math.sin(r) * Math.cos(p),
    y: mag * -Math.sin(p),
    z: mag * Math.cos(r) * Math.cos(p),
  };
}

/** Deterministic mulberry32 PRNG. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ImuStream = (t: number) => Vec3;

/** Perfectly still, slightly off level. */
export function stationaryStream(pitchDeg = 1.5, rollDeg = -0.7): ImuStream {
  const v = upVector(pitchDeg, rollDeg);
  return () => v;
}

/** Slow head tilt sweeping roll and pitch sinusoidally. */
export function headTiltStream(ampDeg = 20, periodS = 6): ImuStream {
  const w = (2 * Math.PI) / periodS;
  return (t) => upVector(ampDeg * Math.sin(w * t) * 0.5, ampDeg * Math.sin(w * t + 1), 1);
}

/** Fast, large movements (should read as "unstable"). */
export function rapidMovementStream(seed = 7): ImuStream {
  const rng = makeRng(seed);
  return () => upVector((rng() - 0.5) * 120, (rng() - 0.5) * 120, 0.8 + rng() * 0.4);
}

/** A steady pose with additive white noise of amplitude `noise`. */
export function noisyStream(pitchDeg = 0, rollDeg = 0, noise = 0.03, seed = 13): ImuStream {
  const rng = makeRng(seed);
  const base = upVector(pitchDeg, rollDeg);
  return () => ({
    x: base.x + (rng() - 0.5) * 2 * noise,
    y: base.y + (rng() - 0.5) * 2 * noise,
    z: base.z + (rng() - 0.5) * 2 * noise,
  });
}

/**
 * A calibration-friendly stream: noisy while "settling", then rock-steady after
 * `settleS` seconds — lets a capture flow exercise both the reject and accept
 * paths deterministically.
 */
export function calibrationStream(settleS = 1.0, seed = 21): ImuStream {
  const noisy = noisyStream(3, -2, 0.08, seed);
  const steady = upVector(3, -2);
  return (t) => (t < settleS ? noisy(t) : steady);
}
