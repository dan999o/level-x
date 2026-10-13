/**
 * Signal conditioning for the raw IMU stream.
 *
 * With no gyroscope available, we cannot do complementary/Kalman fusion. What
 * we CAN do honestly is: low-pass the noisy gravity vector, detect whether the
 * device is stationary enough to trust a reading, and expose a responsiveness
 * knob. All of this operates on direction, so it is unit-agnostic.
 */

import { type Vec3, magnitude, sub } from './vector.js';

/**
 * Exponential moving average (first-order low-pass) for a scalar.
 * `alpha` in (0,1]: higher = more responsive / less smoothing.
 */
export class LowPassScalar {
  private value: number | null = null;

  constructor(private alpha: number) {
    if (!(alpha > 0 && alpha <= 1)) throw new RangeError('alpha must be in (0,1]');
  }

  setAlpha(alpha: number): void {
    if (!(alpha > 0 && alpha <= 1)) throw new RangeError('alpha must be in (0,1]');
    this.alpha = alpha;
  }

  reset(): void {
    this.value = null;
  }

  update(sample: number): number {
    if (!Number.isFinite(sample)) return this.value ?? NaN;
    this.value = this.value === null ? sample : this.alpha * sample + (1 - this.alpha) * this.value;
    return this.value;
  }

  get current(): number | null {
    return this.value;
  }
}

/** Per-axis EMA low-pass for a 3-vector. */
export class LowPassVec3 {
  private value: Vec3 | null = null;

  constructor(private alpha: number) {
    if (!(alpha > 0 && alpha <= 1)) throw new RangeError('alpha must be in (0,1]');
  }

  setAlpha(alpha: number): void {
    if (!(alpha > 0 && alpha <= 1)) throw new RangeError('alpha must be in (0,1]');
    this.alpha = alpha;
  }

  reset(): void {
    this.value = null;
  }

  update(sample: Vec3): Vec3 {
    const a = this.alpha;
    if (this.value === null) {
      this.value = { ...sample };
    } else {
      this.value = {
        x: a * sample.x + (1 - a) * this.value.x,
        y: a * sample.y + (1 - a) * this.value.y,
        z: a * sample.z + (1 - a) * this.value.z,
      };
    }
    return this.value;
  }

  get current(): Vec3 | null {
    return this.value;
  }
}

/**
 * Maps a human "responsiveness" setting (0 = heavily smoothed, 1 = raw) to an
 * EMA alpha, so the UI can expose one intuitive slider.
 */
export function responsivenessToAlpha(responsiveness: number): number {
  const r = Math.min(1, Math.max(0, responsiveness));
  // Keep a floor so the filter never fully stalls, and a ceiling of 1.
  return 0.02 + r * 0.98;
}

export interface StabilityOptions {
  /** Number of recent samples to consider. */
  windowSize: number;
  /**
   * Max allowed spread (max distance from the window mean) for the window to
   * count as "stable". In the same units as the incoming vector.
   */
  toleranceMagnitude: number;
}

export interface StabilityState {
  stable: boolean;
  /** Spread metric actually observed (max deviation from mean magnitude). */
  spread: number;
  /** How many samples are currently buffered. */
  samples: number;
}

/**
 * Sliding-window stationarity detector. The device is "stable" when, over the
 * last N samples, no sample deviates from the window-mean vector by more than
 * `toleranceMagnitude`. This gates the "measurement is trustworthy" indicator
 * and is required before a calibration capture is accepted.
 */
export class StabilityDetector {
  private buf: Vec3[] = [];

  constructor(private opts: StabilityOptions) {
    if (opts.windowSize < 2) throw new RangeError('windowSize must be >= 2');
    if (!(opts.toleranceMagnitude > 0)) throw new RangeError('toleranceMagnitude must be > 0');
  }

  reset(): void {
    this.buf = [];
  }

  update(sample: Vec3): StabilityState {
    this.buf.push({ ...sample });
    if (this.buf.length > this.opts.windowSize) this.buf.shift();

    if (this.buf.length < this.opts.windowSize) {
      return { stable: false, spread: Infinity, samples: this.buf.length };
    }

    const n = this.buf.length;
    const mean = this.buf.reduce(
      (acc, v) => ({ x: acc.x + v.x / n, y: acc.y + v.y / n, z: acc.z + v.z / n }),
      { x: 0, y: 0, z: 0 },
    );
    let spread = 0;
    for (const v of this.buf) {
      spread = Math.max(spread, magnitude(sub(v, mean)));
    }
    return {
      stable: spread <= this.opts.toleranceMagnitude,
      spread,
      samples: n,
    };
  }

  get isFull(): boolean {
    return this.buf.length >= this.opts.windowSize;
  }
}
