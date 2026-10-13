/** Small display formatters. Display resolution (0.1°) is separate from
 * measurement accuracy — see KNOWN_LIMITATIONS.md. */

export function fmtSignedDeg(v: number): string {
  if (!Number.isFinite(v)) return '--.-°';
  const s = v < 0 ? '-' : '+';
  return `${s}${Math.abs(v).toFixed(1)}°`;
}

export function fmtDeg(v: number): string {
  if (!Number.isFinite(v)) return '--.-°';
  return `${v.toFixed(1)}°`;
}
