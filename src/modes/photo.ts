/**
 * Mode C — Photography Assistant.
 * Composition overlays (rule of thirds, horizon, center, symmetry, portrait).
 * Works with no camera: these are reference overlays on the glasses display.
 * Any phone-camera capture is an optional extension, not part of this mode.
 */

import type { Mode, ModeContext, OrientationState } from '../core/mode-manager.js';
import type { InputEvent } from '../input/input-controller.js';
import type { PhotoGuide } from '../core/settings.js';
import { renderPhoto } from '../display/renderer/overlays.js';
import { fmtSignedDeg } from '../core/format.js';

const GUIDES: PhotoGuide[] = ['thirds', 'horizon', 'center', 'symmetry', 'portrait'];

export class PhotoMode implements Mode {
  readonly id = 'photo' as const;
  readonly title = 'Photography';
  private ctx!: ModeContext;
  private last: OrientationState | null = null;

  enter(ctx: ModeContext): void {
    this.ctx = ctx;
    this.ctx.setStatus('PHOTO — tap/scroll: switch guide');
  }

  exit(): void {
    this.last = null;
  }

  onOrientation(state: OrientationState): void {
    this.last = state;
    this.draw(state);
  }

  onAction(e: InputEvent): boolean {
    const cur = this.ctx.settings.value.photo.guide;
    const step = (dir: number) => {
      const next = GUIDES[(GUIDES.indexOf(cur) + dir + GUIDES.length) % GUIDES.length]!;
      void this.ctx.settings.update((s) => ({ ...s, photo: { guide: next } }));
      if (this.last) this.draw(this.last);
    };
    switch (e.action) {
      case 'toggleHold':
      case 'adjustUp':
        step(1);
        return true;
      case 'adjustDown':
        step(-1);
        return true;
      default:
        return false;
    }
  }

  private draw(s: OrientationState): void {
    const guide = this.ctx.settings.value.photo.guide;
    renderPhoto(this.ctx.fb, { guide, rollDeg: s.rollDeg });
    this.ctx.drawOverlay();
    this.ctx.setReadout(`guide: ${guide}`);
    this.ctx.setStatus(`tilt ${fmtSignedDeg(s.rollDeg)} · ${s.stable ? 'STEADY' : 'MOVING'}`);
  }
}
