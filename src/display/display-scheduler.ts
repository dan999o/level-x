/**
 * DisplayScheduler: the single choke-point for glasses redraws.
 *
 * The G2 display is driven over BLE via the phone; there is no documented frame
 * rate and no browser-style 60 FPS. This scheduler therefore:
 *   - serializes all bridge render calls (never two in flight at once);
 *   - coalesces rapid image redraw requests into the latest frame only;
 *   - measures real round-trip latency and adapts the minimum push interval;
 *   - prefers cheap text upgrades over full image pushes;
 *   - degrades gracefully on failure results instead of hammering the link.
 */

import type { BridgePort, TextUpdateData, ImageUpdateOutcome } from '../sdk/bridge-port.js';
import type { Diagnostics } from '../core/diagnostics.js';
import { LowPassScalar } from '../core/math/filters.js';
import { clamp } from '../core/math/vector.js';

export interface DisplaySchedulerOptions {
  containerID: number;
  containerName: string;
  /** Floor for the interval between pushes, ms. */
  baseIntervalMs?: number;
  /** Ceiling for the adaptive interval, ms. */
  maxIntervalMs?: number;
}

export interface DisplayStats {
  latencyMs: number;
  minIntervalMs: number;
  framesPushed: number;
  framesDropped: number;
  /** Frames not sent because they were identical to the last pushed frame. */
  framesSkipped: number;
  textPushed: number;
  failures: number;
}

function sameBytes(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class DisplayScheduler {
  private inFlight = false;
  private stopped = false;
  private pendingImage: (() => number[]) | null = null;
  /** Coalesced latest text per container (readout/status never pile up). */
  private pendingTexts = new Map<number, TextUpdateData>();
  /** Fairness toggle so a steady image stream never starves text, or vice versa. */
  private lastWasImage = false;
  /** Last successfully pushed frame / text per container, for change detection. */
  private lastImage: number[] | null = null;
  private lastText = new Map<number, string>();
  private lastPushAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private latencyEma = new LowPassScalar(0.3);
  private minIntervalMs: number;
  private readonly baseIntervalMs: number;
  private readonly maxIntervalMs: number;

  private stats: DisplayStats = {
    latencyMs: 0,
    minIntervalMs: 0,
    framesPushed: 0,
    framesDropped: 0,
    framesSkipped: 0,
    textPushed: 0,
    failures: 0,
  };

  constructor(
    private bridge: BridgePort,
    private diag: Diagnostics,
    private opts: DisplaySchedulerOptions,
  ) {
    // Each updateImageRawData holds the image path ~104 ms (Even Hub docs), so
    // pushing faster than that only queues work on the glasses.
    this.baseIntervalMs = opts.baseIntervalMs ?? 110;
    this.maxIntervalMs = opts.maxIntervalMs ?? 500;
    this.minIntervalMs = this.baseIntervalMs;
    this.stats.minIntervalMs = this.minIntervalMs;
  }

  /** Queue the latest image. A still-pending previous frame is dropped (coalesced). */
  requestImage(render: () => number[]): void {
    if (this.pendingImage) {
      this.stats.framesDropped++;
    }
    this.pendingImage = render;
    this.kick();
  }

  /** Queue a small text update; superseded updates to the same container are coalesced. */
  requestText(data: TextUpdateData): void {
    if (data.textColor === undefined && data.content === this.lastText.get(data.containerID)) {
      // Already showing this text; also cancel any stale pending change.
      this.pendingTexts.delete(data.containerID);
      return;
    }
    this.pendingTexts.set(data.containerID, data);
    this.kick();
  }

  get snapshot(): DisplayStats {
    return { ...this.stats };
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingImage = null;
    this.pendingTexts.clear();
  }

  private kick(): void {
    if (this.stopped || this.inFlight || this.timer) return;
    const since = Date.now() - this.lastPushAt;
    const wait = Math.max(0, this.minIntervalMs - since);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pump();
    }, wait);
  }

  private hasWork(): boolean {
    return this.pendingImage !== null || this.pendingTexts.size > 0;
  }

  private async pump(): Promise<void> {
    if (this.stopped || this.inFlight || !this.hasWork()) return;

    const haveImage = this.pendingImage !== null;
    const haveText = this.pendingTexts.size > 0;
    // When both are pending, alternate so neither starves the other.
    const doImage = haveImage && haveText ? !this.lastWasImage : haveImage;

    if (!doImage && haveText) {
      const [key, data] = this.pendingTexts.entries().next().value!;
      this.pendingTexts.delete(key);
      this.lastWasImage = false;
      await this.run(async () => {
        const ok = await this.bridge.upgradeText(data);
        if (!ok) {
          this.stats.failures++;
          this.diag.warn('display', `text upgrade failed for ${data.containerName}`);
        } else {
          this.stats.textPushed++;
          if (data.content !== undefined) this.lastText.set(data.containerID, data.content);
        }
      });
    } else if (this.pendingImage) {
      const render = this.pendingImage;
      this.pendingImage = null;
      this.lastWasImage = true;
      const bytes = render();
      if (this.lastImage && sameBytes(bytes, this.lastImage)) {
        // Identical frame: skip the BLE round trip entirely.
        this.stats.framesSkipped++;
        if (this.hasWork()) this.kick();
        return;
      }
      await this.run(async () => {
        const outcome: ImageUpdateOutcome = await this.bridge.updateImage({
          containerID: this.opts.containerID,
          containerName: this.opts.containerName,
          imageData: bytes,
        });
        if (outcome === 'success') {
          this.stats.framesPushed++;
          this.lastImage = bytes;
        } else {
          this.stats.failures++;
          this.diag.warn('display', `image update outcome: ${outcome}`);
          // A failed frame is dropped, not retried, to avoid link congestion.
        }
      });
    }

    if (this.hasWork()) this.kick();
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.inFlight = true;
    const t0 = Date.now();
    try {
      await fn();
    } catch (err) {
      this.stats.failures++;
      this.diag.error('display', `render threw: ${(err as Error).message}`);
    } finally {
      const dt = Date.now() - t0;
      const ema = this.latencyEma.update(dt);
      this.minIntervalMs = clamp(ema * 1.2, this.baseIntervalMs, this.maxIntervalMs);
      this.stats.latencyMs = Math.round(ema);
      this.stats.minIntervalMs = Math.round(this.minIntervalMs);
      this.diag.setGauge('display.latencyMs', this.stats.latencyMs);
      this.diag.setGauge('display.minIntervalMs', this.stats.minIntervalMs);
      this.lastPushAt = Date.now();
      this.inFlight = false;
    }
  }
}
