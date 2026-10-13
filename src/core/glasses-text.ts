/**
 * The glasses render text with one firmware font and silently drop characters
 * it doesn't contain. Map the symbols LEVEL X uses to plain ASCII before any
 * string reaches a glasses text container. The phone panel keeps the symbols.
 */

const MAP: [RegExp, string][] = [
  [/°/g, ''],
  [/±/g, '+/-'],
  [/Δ/g, 'd'],
  [/·/g, '|'],
  [/[—–]/g, '-'],
  [/…/g, '...'],
];

export function toGlassesText(s: string): string {
  let out = s;
  for (const [re, rep] of MAP) out = out.replace(re, rep);
  // Drop anything else outside printable ASCII rather than let the firmware do it unpredictably.
  return out.replace(/[^\x20-\x7e]/g, '');
}
