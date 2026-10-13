/**
 * Mode D — Angle Measurement.
 * Relative angle from a user-set zero, reference hold, and threshold alerts.
 * Absolute orientation limits are documented in KNOWN_LIMITATIONS.md: with a
 * gravity-only sensor, yaw cannot be measured; angles here are gravity-relative.
 */

import type { Mode, ModeContext, OrientationState } from '../core/mode-manager.js';
import type { InputEvent } from '../input/input-controller.js';
import type { Vec3 } from '../core/math/vector.js';
import { renderLevel } from '../display/renderer/overlays.js';
import { angleDifferenceDeg } from '../core/math/angles.js';
import { tiltFromReferenceDeg } from '../core/math/orientation.js';
import { fmtSignedDeg, fmtDeg } from '../core/format.js';

interface ZeroRef {
  rollDeg: number;
  pitchDeg: number;
  up: Vec3;
}

export class AngleMode implements Mode {
  readonly id = 'angle' as const;
  readonly title = 'Angle';
  private ctx!: ModeContext;
  private ref: ZeroRef | null = null;
  private hold = false;
  private thresholdDeg: number;
  private last: OrientationState | null = null;

  constructor(defaultThresholdDeg = 1) {
    this.thresholdDeg = defaultThresholdDeg;
  }

  enter(ctx: ModeContext): void {
    this.ctx = ctx;
    this.hold = false;
    this.ctx.setStatus('ANGLE — tap: set/clear zero · scroll: threshold');
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
        // In angle mode, the primary tap sets or clears the zero reference.
        if (this.ref) {
          this.ref = null;
          this.ctx.diag.info('angle', 'zero cleared');
        } else if (this.last) {
          this.ref = { rollDeg: this.last.rollDeg, pitchDeg: this.last.pitchDeg, up: { ...this.last.up } };
          this.ctx.diag.info('angle', 'zero set');
        }
        if (this.last) this.draw(this.last);
        return true;
      case 'adjustUp':
        this.thresholdDeg = Math.min(45, +(this.thresholdDeg + 0.5).toFixed(1));
        if (this.last) this.draw(this.last);
        return true;
      case 'adjustDown':
        this.thresholdDeg = Math.max(0.5, +(this.thresholdDeg - 0.5).toFixed(1));
        if (this.last) this.draw(this.last);
        return true;
      default:
        return false;
    }
  }

  private draw(s: OrientationState): void {
    const dRoll = this.ref ? angleDifferenceDeg(s.rollDeg, this.ref.rollDeg) : 0;
    const dPitch = this.ref ? angleDifferenceDeg(s.pitchDeg, this.ref.pitchDeg) : 0;
    const tilt = this.ref ? (tiltFromReferenceDeg(s.up, this.ref.up) ?? 0) : 0;

    renderLevel(this.ctx.fb, {
      rollDeg: dRoll,
      pitchDeg: dPitch,
      toleranceDeg: this.thresholdDeg,
      stable: s.stable,
      hold: this.hold,
    });
    this.ctx.drawOverlay();

    if (this.ref) {
      this.ctx.setReadout(`Δ ${fmtDeg(tilt)}  (R ${fmtSignedDeg(dRoll)} P ${fmtSignedDeg(dPitch)})`);
      const over = tilt > this.thresholdDeg;
      this.ctx.setStatus(
        [over ? 'OVER' : 'within', `thr ${this.thresholdDeg.toFixed(1)}°`, s.stable ? 'STEADY' : 'MOVING'].join(' · '),
      );
    } else {
      this.ctx.setReadout('no zero set — tap to set');
      this.ctx.setStatus(`thr ${this.thresholdDeg.toFixed(1)}° · ${s.stable ? 'STEADY' : 'MOVING'}`);
    }
  }
}
