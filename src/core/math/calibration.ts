/**
 * Calibration: define "level" from the device itself rather than assuming any
 * axis points down. The user holds the glasses in the orientation they want to
 * treat as the zero reference; we average a short burst of samples (only while
 * the stability detector says the device is still) and store the resulting
 * reference up-vector plus the pitch/roll offsets it implies.
 */

import { type Vec3, normalize, magnitude, isFiniteVec3 } from './vector.js';
import { type AxisMapping, DEFAULT_AXIS_MAPPING, gravityPitchRoll } from './orientation.js';

export interface CalibrationProfile {
  /** Unit up-vector captured at "level". */
  referenceUp: Vec3;
  /** Pitch offset implied by the reference, degrees. */
  pitchOffsetDeg: number;
  /** Roll offset implied by the reference, degrees. */
  rollOffsetDeg: number;
  /** Mean sample magnitude at capture (used only for relative drift checks). */
  referenceMagnitude: number;
  /** Axis mapping in force when captured. */
  mapping: AxisMapping;
  /** Epoch ms when captured. */
  createdAt: number;
  /** Optional user label for a saved profile. */
  label?: string;
}

export interface CalibrationCaptureOptions {
  /** Minimum accepted samples. */
  minSamples: number;
  /**
   * Maximum allowed spread (max deviation from the mean) across the burst, in
   * input units. A capture that is noisier than this is rejected so we never
   * bake movement into the reference.
   */
  maxSpreadMagnitude: number;
  mapping?: AxisMapping;
  label?: string;
}

export type CalibrationResult =
  | { ok: true; profile: CalibrationProfile }
  | { ok: false; reason: 'too-few-samples' | 'invalid-samples' | 'too-noisy' | 'degenerate'; spread?: number };

/**
 * Build a calibration profile from a burst of samples. Pure and synchronous so
 * it is fully unit-testable; the caller is responsible for only feeding it
 * samples gathered while stationary.
 */
export function captureCalibration(
  samples: readonly Vec3[],
  opts: CalibrationCaptureOptions,
): CalibrationResult {
  const mapping = opts.mapping ?? DEFAULT_AXIS_MAPPING;
  const clean = samples.filter(isFiniteVec3);
  if (clean.length < opts.minSamples) return { ok: false, reason: 'too-few-samples' };
  if (clean.length !== samples.length && clean.length < opts.minSamples) {
    return { ok: false, reason: 'invalid-samples' };
  }

  const n = clean.length;
  const mean = clean.reduce(
    (acc, v) => ({ x: acc.x + v.x / n, y: acc.y + v.y / n, z: acc.z + v.z / n }),
    { x: 0, y: 0, z: 0 },
  );

  // Reject bursts captured while moving.
  let spread = 0;
  for (const v of clean) {
    spread = Math.max(spread, magnitude({ x: v.x - mean.x, y: v.y - mean.y, z: v.z - mean.z }));
  }
  if (spread > opts.maxSpreadMagnitude) return { ok: false, reason: 'too-noisy', spread };

  const referenceUp = normalize(mean);
  if (!referenceUp) return { ok: false, reason: 'degenerate' };

  const pr = gravityPitchRoll(mean, mapping);
  if (!pr) return { ok: false, reason: 'degenerate' };

  return {
    ok: true,
    profile: {
      referenceUp,
      pitchOffsetDeg: pr.pitchDeg,
      rollOffsetDeg: pr.rollDeg,
      referenceMagnitude: magnitude(mean),
      mapping,
      createdAt: Date.now(),
      ...(opts.label !== undefined ? { label: opts.label } : {}),
    },
  };
}

export interface CalibratedPitchRoll {
  pitchDeg: number;
  rollDeg: number;
}

/**
 * Apply a calibration profile to a live reading: compute raw pitch/roll with
 * the profile's mapping, then subtract the stored offsets so the calibrated
 * orientation reads zero. Returns null for degenerate input.
 */
export function applyCalibration(
  current: Vec3,
  profile: CalibrationProfile,
): CalibratedPitchRoll | null {
  const pr = gravityPitchRoll(current, profile.mapping);
  if (!pr) return null;
  return {
    pitchDeg: pr.pitchDeg - profile.pitchOffsetDeg,
    rollDeg: pr.rollDeg - profile.rollOffsetDeg,
  };
}

/**
 * Relative magnitude drift between a live reading and the calibration baseline,
 * as a fraction. Because absolute units are unknown, only RELATIVE change is
 * meaningful; a large value suggests the sensor characteristics changed and the
 * profile should be re-captured. Returns Infinity if the baseline is zero.
 */
export function magnitudeDrift(current: Vec3, profile: CalibrationProfile): number {
  if (profile.referenceMagnitude < 1e-9) return Infinity;
  return Math.abs(magnitude(current) - profile.referenceMagnitude) / profile.referenceMagnitude;
}
