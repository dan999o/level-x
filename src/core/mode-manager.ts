/**
 * Mode system: a small contract every mode implements plus a manager that owns
 * the active mode and cycling between them. Modes are hardware-agnostic — they
 * receive orientation + input and draw into a shared framebuffer via the
 * context; they never touch the bridge directly.
 */

import type { Framebuffer } from '../display/framebuffer.js';
import type { DisplayScheduler } from '../display/display-scheduler.js';
import type { SettingsService, ModeId } from './settings.js';
import type { Diagnostics } from './diagnostics.js';
import type { InputEvent } from '../input/input-controller.js';
import type { Vec3 } from './math/vector.js';

export interface OrientationState {
  pitchDeg: number;
  rollDeg: number;
  /** Scalar tilt from the calibrated/reference "up", degrees. */
  tiltDeg: number;
  stable: boolean;
  rateHz: number;
  calibrated: boolean;
  /** Filtered gravity direction (for reference capture by modes). */
  up: Vec3;
}

export interface ModeContext {
  readonly fb: Framebuffer;
  readonly scheduler: DisplayScheduler;
  readonly settings: SettingsService;
  readonly diag: Diagnostics;
  /** Push the current framebuffer to the overlay image container. */
  drawOverlay(): void;
  /** Update the large readout text line. */
  setReadout(text: string): void;
  /** Update the small status text line. */
  setStatus(text: string): void;
}

export interface Mode {
  readonly id: ModeId;
  readonly title: string;
  enter(ctx: ModeContext): void;
  exit(): void;
  onOrientation(state: OrientationState): void;
  /** Return true if the input was consumed by the mode. */
  onAction(e: InputEvent): boolean;
}

export class ModeManager {
  private modes: Mode[] = [];
  private activeIndex = -1;

  constructor(private ctx: ModeContext) {}

  register(mode: Mode): void {
    this.modes.push(mode);
  }

  get active(): Mode | null {
    return this.activeIndex >= 0 ? this.modes[this.activeIndex]! : null;
  }

  list(): Mode[] {
    return [...this.modes];
  }

  activate(id: ModeId): boolean {
    const idx = this.modes.findIndex((m) => m.id === id);
    if (idx < 0) return false;
    if (idx === this.activeIndex) return true;
    this.active?.exit();
    this.activeIndex = idx;
    this.active!.enter(this.ctx);
    this.ctx.diag.info('mode', `activated ${this.active!.id}`);
    return true;
  }

  next(): void {
    if (this.modes.length === 0) return;
    const idx = (this.activeIndex + 1) % this.modes.length;
    this.activate(this.modes[idx]!.id);
  }

  prev(): void {
    if (this.modes.length === 0) return;
    const idx = (this.activeIndex - 1 + this.modes.length) % this.modes.length;
    this.activate(this.modes[idx]!.id);
  }

  onOrientation(state: OrientationState): void {
    this.active?.onOrientation(state);
  }

  onAction(e: InputEvent): boolean {
    return this.active?.onAction(e) ?? false;
  }
}
