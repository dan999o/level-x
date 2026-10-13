/**
 * Overlay renderers: pure functions that paint a Framebuffer for each mode.
 *
 * They are deliberately free of any SDK/bridge dependency so they can be unit
 * tested by inspecting pixels. All angles are in degrees. "appears level when
 * the device is level" means the horizon is drawn rotated by -roll.
 */

import { Framebuffer, BLACK } from '../framebuffer.js';
import { CANVAS_W, CANVAS_H, CENTER_X, CENTER_Y, DIM, MID, BRIGHT } from '../canvas.js';
import { toRadians } from '../../core/math/vector.js';
import type { ReticleStyle, PhotoGuide } from '../../core/settings.js';

export interface LevelOverlayParams {
  rollDeg: number;
  pitchDeg: number;
  toleranceDeg: number;
  stable: boolean;
  hold: boolean;
}

/** Draw a line through (cx,cy) at `angleDeg`, half-length `len`. */
function lineThrough(fb: Framebuffer, cx: number, cy: number, angleDeg: number, len: number, v: number): void {
  const a = toRadians(angleDeg);
  const dx = Math.cos(a) * len;
  const dy = Math.sin(a) * len;
  fb.line(cx - dx, cy - dy, cx + dx, cy + dy, v);
}

export function renderLevel(fb: Framebuffer, p: LevelOverlayParams): Framebuffer {
  fb.clear(BLACK);

  // Fixed reference ticks at the sides (true horizontal datum).
  fb.hLine(6, 26, CENTER_Y, DIM);
  fb.hLine(CANVAS_W - 27, CANVAS_W - 7, CENTER_Y, DIM);

  // Rotating horizon bar shows roll; level device -> horizontal bar.
  lineThrough(fb, CENTER_X, CENTER_Y, -p.rollDeg, 96, BRIGHT);

  // Pitch marker: a short bar offset vertically by pitch (clamped on-canvas).
  const pitchPx = Math.max(-54, Math.min(54, -p.pitchDeg * 1.6));
  fb.hLine(CENTER_X - 14, CENTER_X + 14, CENTER_Y + pitchPx, MID);

  // Center reference crosshair.
  fb.crosshair(CENTER_X, CENTER_Y, 8, 3, BRIGHT);

  // In-tolerance brackets when both axes are within tolerance.
  const within = Math.abs(p.rollDeg) <= p.toleranceDeg && Math.abs(p.pitchDeg) <= p.toleranceDeg;
  if (within) {
    const r = 16;
    // corner brackets
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const x = CENTER_X + sx * r;
      const y = CENTER_Y + sy * r;
      fb.hLine(x, x - sx * 6, y, BRIGHT);
      fb.vLine(x, y, y - sy * 6, BRIGHT);
    }
  }

  // Unstable: dashed border hint so the reading isn't trusted blindly.
  if (!p.stable) {
    for (let x = 0; x < CANVAS_W; x += 8) fb.set(x, 1, DIM);
  }
  // Hold: solid top border.
  if (p.hold) fb.hLine(0, CANVAS_W - 1, 0, BRIGHT);

  return fb;
}

export interface ReticleOverlayParams {
  style: ReticleStyle;
  offsetX: number;
  offsetY: number;
  sizePx: number;
  rollDeg: number;
  stable: boolean;
  showTilt: boolean;
}

export function renderReticle(fb: Framebuffer, p: ReticleOverlayParams): Framebuffer {
  fb.clear(BLACK);
  const cx = Math.round(CENTER_X + p.offsetX);
  const cy = Math.round(CENTER_Y + p.offsetY);
  const s = Math.max(4, Math.round(p.sizePx));

  switch (p.style) {
    case 'crosshair':
      fb.crosshair(cx, cy, s, Math.max(2, Math.round(s / 4)), BRIGHT);
      break;
    case 'dot':
      fb.dot(cx, cy, Math.max(1, Math.round(s / 10)), BRIGHT);
      break;
    case 'circle':
      fb.circle(cx, cy, s, BRIGHT);
      fb.dot(cx, cy, 1, BRIGHT);
      break;
    case 'fineline':
      fb.hLine(cx - s, cx + s, cy, BRIGHT);
      fb.set(cx, cy - 1, BRIGHT);
      fb.set(cx, cy + 1, BRIGHT);
      break;
  }

  // Tilt indicator: a short rotating tick at the top shows roll.
  if (p.showTilt) {
    lineThrough(fb, cx, Math.max(10, cy - s - 10), -p.rollDeg, 10, MID);
  }

  // Motion feedback: a faint ring appears while moving.
  if (!p.stable) fb.circle(cx, cy, s + 6, DIM);

  return fb;
}

export interface PhotoOverlayParams {
  guide: PhotoGuide;
  rollDeg: number;
}

export function renderPhoto(fb: Framebuffer, p: PhotoOverlayParams): Framebuffer {
  fb.clear(BLACK);
  const w = CANVAS_W;
  const h = CANVAS_H;

  switch (p.guide) {
    case 'thirds': {
      const x1 = Math.round(w / 3);
      const x2 = Math.round((2 * w) / 3);
      const y1 = Math.round(h / 3);
      const y2 = Math.round((2 * h) / 3);
      fb.vLine(x1, 0, h - 1, MID);
      fb.vLine(x2, 0, h - 1, MID);
      fb.hLine(0, w - 1, y1, MID);
      fb.hLine(0, w - 1, y2, MID);
      break;
    }
    case 'horizon': {
      fb.hLine(0, w - 1, CENTER_Y, DIM); // datum
      lineThrough(fb, CENTER_X, CENTER_Y, -p.rollDeg, w / 2 - 4, BRIGHT); // live horizon
      break;
    }
    case 'center': {
      fb.crosshair(CENTER_X, CENTER_Y, 14, 4, BRIGHT);
      break;
    }
    case 'symmetry': {
      fb.vLine(CENTER_X, 0, h - 1, BRIGHT);
      fb.vLine(Math.round(w / 4), 0, h - 1, DIM);
      fb.vLine(Math.round((3 * w) / 4), 0, h - 1, DIM);
      break;
    }
    case 'portrait': {
      // Simple head-and-shoulders placement guide.
      fb.circle(CENTER_X, Math.round(h * 0.38), 22, BRIGHT);
      fb.rect(CENTER_X - 40, Math.round(h * 0.62), 80, Math.round(h * 0.3), MID);
      break;
    }
  }
  return fb;
}
