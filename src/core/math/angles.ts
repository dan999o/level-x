/**
 * Angle bookkeeping helpers kept separate from vector math so they can be
 * reused by the angle-measurement mode and tested in isolation.
 */

/** Wrap an angle in degrees to the half-open range (-180, 180]. */
export function normalizeDeg(deg: number): number {
  if (!Number.isFinite(deg)) return NaN;
  let a = deg % 360;
  if (a <= -180) a += 360;
  else if (a > 180) a -= 360;
  // Guard the -0 case for stable display/formatting.
  return a === 0 ? 0 : a;
}

/**
 * Smallest signed difference `target - reference`, wrapped to (-180, 180].
 * Positive means `target` is counter-clockwise ahead of `reference`.
 */
export function angleDifferenceDeg(target: number, reference: number): number {
  return normalizeDeg(target - reference);
}

/** Absolute shortest angular distance between two angles, in [0, 180]. */
export function angularDistanceDeg(a: number, b: number): number {
  return Math.abs(angleDifferenceDeg(a, b));
}

/** True when two angles are within `tolaranceDeg` of each other (wrap-aware). */
export function anglesWithin(a: number, b: number, toleranceDeg: number): boolean {
  return angularDistanceDeg(a, b) <= toleranceDeg;
}

/**
 * Round to a fixed number of decimal places for display. Measurement accuracy
 * is a separate concern from display resolution (see KNOWN_LIMITATIONS.md);
 * this only governs what is shown, never what is computed.
 */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
