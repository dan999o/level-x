/**
 * Mode B — Precision Reticle.
 * Visual reference overlays (crosshair / dot / circle / fine-line) with size and
 * position, a tilt indicator, and motion feedback.
 *
 * NOTE: reticles are visual references only — not calibrated sights or
 * world-anchored targeting. See KNOWN_LIMITATIONS.md.
 */

import type { Mode, ModeContext, OrientationState } from '../core/mode-manager.js';
import type { InputEvent } from '../input/input-controller.js';
import type { ReticleStyle } from '../core/settings.js';
import { renderReticle } from '../display/renderer/overlays.js';
import { fmtSignedDeg } from '../core/format.js';

const STYLES: ReticleStyle[] = ['crosshair', 'dot', 'circle', 'fineline'];

export class ReticleMode implements Mode {
  readonly id = 'reticle' as const;
  readonly title = 'Precision Reticle';
  private ctx!: ModeContext;
  private last: OrientationState | null = null;

  enter(ctx: ModeContext): void {
    this.ctx = ctx;
    this.ctx.setStatus('RETICLE — tap: style · scroll: size');
  }

  exit(): void {
    this.last = null;
  }

  onOrientation(state: OrientationState): void {
    this.last = state;
    this.draw(state);
  }

  onAction(e: InputEvent): boolean {
    switch (e.action) {
      case 'toggleHold': {
        const cur = this.ctx.settings.value.reticle.style;
        const next = STYLES[(STYLES.indexOf(cur) + 1) % STYLES.length]!;
        void this.ctx.settings.update((s) => ({ ...s, reticle: { ...s.reticle, style: next } }));
        if (this.last) this.draw(this.last);
        return true;
      }
      case 'adjustUp':
        void this.ctx.settings.update((s) => ({
          ...s,
          reticle: { ...s.reticle, sizePx: Math.min(60, s.reticle.sizePx + 2) },
        }));
        if (this.last) this.draw(this.last);
        return true;
      case 'adjustDown':
        void this.ctx.settings.update((s) => ({
          ...s,
          reticle: { ...s.reticle, sizePx: Math.max(4, s.reticle.sizePx - 2) },
        }));
        if (this.last) this.draw(this.last);
        return true;
      default:
        return false;
    }
  }

  private draw(s: OrientationState): void {
    const r = this.ctx.settings.value.reticle;
    renderReticle(this.ctx.fb, {
      style: r.style,
      offsetX: r.offsetX,
      offsetY: r.offsetY,
      sizePx: r.sizePx,
      rollDeg: s.rollDeg,
      stable: s.stable,
      showTilt: r.showTilt,
    });
    this.ctx.drawOverlay();
    this.ctx.setReadout(`${r.style}  ${r.sizePx}px`);
    this.ctx.setStatus(`tilt ${fmtSignedDeg(s.rollDeg)} · ${s.stable ? 'STEADY' : 'MOVING'}`);
  }
}
