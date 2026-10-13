/**
 * ImuService: turns raw bridge IMU events into a conditioned sample stream.
 *
 * Responsibilities (all honest to the {x,y,z}-only payload):
 *  - enable/disable reporting via the bridge;
 *  - decode only genuine IMU_DATA_REPORT sys-events;
 *  - reject non-finite / degenerate samples;
 *  - low-pass filter (EMA) with an adjustable responsiveness;
 *  - flag stationary vs moving via the sliding-window detector;
 *  - measure the ACTUAL arrival rate (Hz) rather than trusting the pace code.
 */

import { OsEventTypeList } from '@evenrealities/even_hub_sdk';
import type { BridgePort, EvenHubEvent, ImuReportPace, Unsubscribe } from '../sdk/bridge-port.js';
import type { Diagnostics } from '../core/diagnostics.js';
import { type Vec3, isFiniteVec3, magnitude } from '../core/math/vector.js';
import { LowPassVec3, StabilityDetector, responsivenessToAlpha } from '../core/math/filters.js';

export interface ProcessedImu {
  raw: Vec3;
  filtered: Vec3;
  stable: boolean;
  spread: number;
  /** Measured sample rate in Hz (empirical, not derived from the pace code). */
  rateHz: number;
}

export interface ImuServiceOptions {
  responsiveness?: number;
  stabilityWindow?: number;
  stabilityTolerance?: number;
}

export class ImuService {
  private sub: Unsubscribe | null = null;
  private lpf: LowPassVec3;
  private stability: StabilityDetector;
  private listeners = new Set<(s: ProcessedImu) => void>();
  private lastSampleAt = 0;
  private rateEma = 0;
  private running = false;

  constructor(
    private bridge: BridgePort,
    private diag: Diagnostics,
    opts: ImuServiceOptions = {},
  ) {
    this.lpf = new LowPassVec3(responsivenessToAlpha(opts.responsiveness ?? 0.35));
    this.stability = new StabilityDetector({
      windowSize: opts.stabilityWindow ?? 8,
      toleranceMagnitude: opts.stabilityTolerance ?? 0.05,
    });
  }

  get isRunning(): boolean {
    return this.running;
  }

  setResponsiveness(r: number): void {
    this.lpf.setAlpha(responsivenessToAlpha(r));
  }

  onSample(cb: (s: ProcessedImu) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async start(pace: ImuReportPace): Promise<boolean> {
    if (this.running) return true;
    this.sub = this.bridge.onEvent((e) => this.handleEvent(e));
    const ok = await this.bridge.setImu(true, pace);
    this.running = ok;
    if (!ok) {
      this.diag.error('imu', 'bridge.setImu(true) returned false');
      this.sub?.();
      this.sub = null;
    } else {
      this.diag.info('imu', `IMU reporting enabled (pace=${pace})`);
    }
    return ok;
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.sub?.();
    this.sub = null;
    this.lpf.reset();
    this.stability.reset();
    this.lastSampleAt = 0;
    this.rateEma = 0;
    await this.bridge.setImu(false);
    this.diag.info('imu', 'IMU reporting disabled');
  }

  dispose(): void {
    this.sub?.();
    this.sub = null;
    this.listeners.clear();
  }

  private handleEvent(e: EvenHubEvent): void {
    const sys = e.sysEvent;
    if (!sys || sys.eventType !== OsEventTypeList.IMU_DATA_REPORT || !sys.imuData) return;

    const raw: Vec3 = { x: sys.imuData.x ?? NaN, y: sys.imuData.y ?? NaN, z: sys.imuData.z ?? NaN };
    if (!isFiniteVec3(raw) || magnitude(raw) < 1e-6) {
      this.diag.warn('imu', 'dropped invalid/degenerate IMU sample');
      return;
    }

    // Empirical rate measurement.
    const now = Date.now();
    if (this.lastSampleAt > 0) {
      const dt = (now - this.lastSampleAt) / 1000;
      if (dt > 0) {
        const inst = 1 / dt;
        this.rateEma = this.rateEma === 0 ? inst : 0.2 * inst + 0.8 * this.rateEma;
      }
    }
    this.lastSampleAt = now;

    const filtered = this.lpf.update(raw);
    const st = this.stability.update(raw);
    const sample: ProcessedImu = {
      raw,
      filtered: { ...filtered },
      stable: st.stable,
      spread: st.spread,
      rateHz: Math.round(this.rateEma * 10) / 10,
    };
    this.diag.setGauge('imu.rateHz', sample.rateHz);
    for (const l of [...this.listeners]) l(sample);
  }
}
