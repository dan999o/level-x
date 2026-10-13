/**
 * Orientation estimation from a single gravity-aligned 3-vector.
 *
 * IMPORTANT (see SDK_RESEARCH.md §3): the Even G2 IMU payload is only {x,y,z}
 * with NO gyroscope. Axis orientation, sign, and units are NOT documented.
 * Therefore:
 *   - We derive tilt from the DIRECTION of the vector only (ratios / atan2),
 *     which is unit-agnostic.
 *   - Which component is "up" is configurable via AxisMapping and must be
 *     confirmed on real hardware (HARDWARE_TEST_PLAN.md).
 *   - Yaw / heading is NOT derivable from a gravity vector alone and is not
 *     offered. Do not add it without a magnetometer the SDK does not expose.
 */

import { type Vec3, normalize, toDegrees, angleBetweenDeg } from './vector.js';

export type Axis = 'x' | 'y' | 'z';

/**
 * Maps raw IMU components onto a body frame of (right, forward, up) with signs.
 * The default assumes gravity-reaction points along +z; this is the first thing
 * to verify on device and can be overridden (and persisted) after calibration.
 */
export interface AxisMapping {
  up: Axis;
  forward: Axis;
  right: Axis;
  signUp: 1 | -1;
  signForward: 1 | -1;
  signRight: 1 | -1;
}

export const DEFAULT_AXIS_MAPPING: AxisMapping = {
  up: 'z',
  forward: 'y',
  right: 'x',
  signUp: 1,
  signForward: 1,
  signRight: 1,
};

export interface PitchRoll {
  /** Nose up/down, degrees. */
  pitchDeg: number;
  /** Side-to-side bank, degrees. */
  rollDeg: number;
}

interface BodyVec {
  right: number;
  forward: number;
  up: number;
}

function toBody(v: Vec3, m: AxisMapping): BodyVec {
  return {
    right: v[m.right] * m.signRight,
    forward: v[m.forward] * m.signForward,
    up: v[m.up] * m.signUp,
  };
}

/**
 * Standard accelerometer tilt formulas (gravity-reaction pointing up):
 *   roll  = atan2(right, up)
 *   pitch = atan2(-forward, hypot(right, up))
 * Returns null when the vector is degenerate (no reliable direction).
 */
export function gravityPitchRoll(
  v: Vec3,
  mapping: AxisMapping = DEFAULT_AXIS_MAPPING,
): PitchRoll | null {
  const u = normalize(v);
  if (!u) return null;
  const b = toBody(u, mapping);
  const rollDeg = toDegrees(Math.atan2(b.right, b.up));
  const pitchDeg = toDegrees(Math.atan2(-b.forward, Math.hypot(b.right, b.up)));
  return { pitchDeg, rollDeg };
}

/**
 * Single-scalar tilt: the angle between the current gravity direction and a
 * reference direction, in [0, 180]. This is the most robust, assumption-free
 * "how far off" metric and underpins the "off level" readout. Returns null if
 * either direction is undefined.
 */
export function tiltFromReferenceDeg(current: Vec3, reference: Vec3): number | null {
  return angleBetweenDeg(current, reference);
}

/**
 * Deviation of the current up-vector from a reference, split into the two tilt
 * axes, by differencing pitch/roll. Used by Smart Level to show both axes.
 * Returns null if either reading is degenerate.
 */
export function tiltComponents(
  current: Vec3,
  reference: Vec3,
  mapping: AxisMapping = DEFAULT_AXIS_MAPPING,
): PitchRoll | null {
  const cur = gravityPitchRoll(current, mapping);
  const ref = gravityPitchRoll(reference, mapping);
  if (!cur || !ref) return null;
  return {
    pitchDeg: cur.pitchDeg - ref.pitchDeg,
    rollDeg: cur.rollDeg - ref.rollDeg,
  };
}
