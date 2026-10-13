/**
 * Mode A — Smart Level.
 * Horizontal/vertical/gravity-relative leveling with a 0.1° readout, adjustable
 * tolerance, stable/unstable indication, and measurement hold.
 */

import type { Mode, ModeContext, OrientationState } from '../core/mode-manager.js';
import type { InputEvent } from '../input/input-controller.js';
import { renderLevel } from '../display/renderer/overlays.js';
import { fmtSignedDeg } from '../core/format.js';

export class SmartLevelMode implements Mode {
  readonly id = 'level' as const;
  readonly title = 'Smart Level';
  private ctx!: ModeContext;
  private hold = false;
  private last: OrientationState | null = null;

  enter(ctx: ModeContext): void {
    this.ctx = ctx;
    this.hold = false;
    this.ctx.setStatus('LEVEL — tap: hold · scroll: tolerance');
  }

  exit(): void {
    this.last = null;
  }

  onOrientation(state: OrientationState): void {
    this.last = state;
    if (this.hold) return;
    this.draw(state);
  }

  onAction(e: InputEvent): boolean {
    switch (e.action) {
      case 'toggleHold':
        this.hold = !this.hold;
        if (this.last) this.draw(this.last);
        this.ctx.diag.info('level', this.hold ? 'measurement held' : 'measurement released');
        return true;
      case 'adjustUp':
        void this.ctx.settings.update((s) => ({
          ...s,
          level: { toleranceDeg: Math.min(10, +(s.level.toleranceDeg + 0.1).toFixed(2)) },
        }));
        if (this.last) this.draw(this.last);
        return true;
      case 'adjustDown':
        void this.ctx.settings.update((s) => ({
          ...s,
          level: { toleranceDeg: Math.max(0.1, +(s.level.toleranceDeg - 0.1).toFixed(2)) },
        }));
        if (this.last) this.draw(this.last);
        return true;
      default:
        return false;
    }
  }

  private draw(s: OrientationState): void {
    const tol = this.ctx.settings.value.level.toleranceDeg;
    renderLevel(this.ctx.fb, {
      rollDeg: s.rollDeg,
      pitchDeg: s.pitchDeg,
      toleranceDeg: tol,
      stable: s.stable,
      hold: this.hold,
    });
    this.ctx.drawOverlay();

    const within = Math.abs(s.rollDeg) <= tol && Math.abs(s.pitchDeg) <= tol;
    this.ctx.setReadout(`R ${fmtSignedDeg(s.rollDeg)}  P ${fmtSignedDeg(s.pitchDeg)}`);
    const flags = [
      within ? 'LEVEL' : 'OFF',
      this.hold ? 'HOLD' : s.stable ? 'STEADY' : 'MOVING',
      `±${tol.toFixed(1)}°`,
      s.calibrated ? 'cal' : 'uncal',
    ];
    this.ctx.setStatus(flags.join(' · '));
  }
}
