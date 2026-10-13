/**
 * Minimal 3-vector math for IMU processing.
 *
 * The component names `x/y/z` deliberately match the SDK's `IMU_Report_Data`
 * shape so raw events can be consumed without re-mapping. Nothing here assumes
 * a physical unit or axis orientation — that is resolved by calibration and
 * documented as hardware-validation-pending in SDK_RESEARCH.md.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const DEG_PER_RAD = 180 / Math.PI;
export const RAD_PER_DEG = Math.PI / 180;

export function toDegrees(rad: number): number {
  return rad * DEG_PER_RAD;
}

export function toRadians(deg: number): number {
  return deg * RAD_PER_DEG;
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function magnitude(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

/** Returns a unit vector, or null if the input has (near-)zero length. */
export function normalize(a: Vec3): Vec3 | null {
  const m = magnitude(a);
  if (!Number.isFinite(m) || m < 1e-9) return null;
  return { x: a.x / m, y: a.y / m, z: a.z / m };
}

/** Clamp a scalar into [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Angle between two vectors, in degrees, in [0, 180].
 * Returns null if either vector is (near-)zero, where direction is undefined.
 */
export function angleBetweenDeg(a: Vec3, b: Vec3): number | null {
  const ua = normalize(a);
  const ub = normalize(b);
  if (!ua || !ub) return null;
  // Clamp guards against floating-point drift just outside [-1, 1].
  const c = clamp(dot(ua, ub), -1, 1);
  return toDegrees(Math.acos(c));
}

/** True when every component is a finite number. */
export function isFiniteVec3(a: Vec3 | null | undefined): a is Vec3 {
  return (
    !!a &&
    Number.isFinite(a.x) &&
    Number.isFinite(a.y) &&
    Number.isFinite(a.z)
  );
}
