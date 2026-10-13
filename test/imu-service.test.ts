import { describe, it, expect, beforeEach } from 'vitest';
import { ImuReportPace } from '@evenrealities/even_hub_sdk';
import { MockBridge } from '../src/sdk/mock-bridge.js';
import { Diagnostics } from '../src/core/diagnostics.js';
import { ImuService, type ProcessedImu } from '../src/sensors/imu-service.js';
import { upVector } from '../src/sdk/sim-streams.js';
import { vec3 } from '../src/core/math/vector.js';

describe('ImuService', () => {
  let bridge: MockBridge;
  let imu: ImuService;
  let samples: ProcessedImu[];

  beforeEach(() => {
    bridge = new MockBridge();
    imu = new ImuService(bridge, new Diagnostics(), { responsiveness: 1 });
    samples = [];
    imu.onSample((s) => samples.push(s));
  });

  it('does not deliver samples before start (firmware gating)', () => {
    bridge.emitImu(upVector(0, 0));
    expect(samples).toHaveLength(0);
  });

  it('enables IMU reporting on start with the given pace', async () => {
    const ok = await imu.start(ImuReportPace.P200);
    expect(ok).toBe(true);
    expect(bridge.imuEnabled).toBe(true);
    expect(bridge.imuPace).toBe(ImuReportPace.P200);
    expect(imu.isRunning).toBe(true);
  });

  it('delivers conditioned samples after start', async () => {
    await imu.start(ImuReportPace.P200);
    bridge.emitImu(upVector(0, 0));
    expect(samples).toHaveLength(1);
    expect(samples[0]!.raw.z).toBeCloseTo(1, 6);
    expect(samples[0]!.filtered.z).toBeCloseTo(1, 6); // alpha=1 -> passes through
  });

  it('drops invalid / degenerate samples', async () => {
    await imu.start(ImuReportPace.P200);
    bridge.emitImu(vec3(0, 0, 0)); // degenerate
    bridge.emitImu(vec3(NaN, 1, 1)); // invalid
    expect(samples).toHaveLength(0);
  });

  it('flags moving vs steady via the stability detector', async () => {
    imu = new ImuService(bridge, new Diagnostics(), {
      responsiveness: 1,
      stabilityWindow: 4,
      stabilityTolerance: 0.02,
    });
    const got: ProcessedImu[] = [];
    imu.onSample((s) => got.push(s));
    await imu.start(ImuReportPace.P200);
    for (let i = 0; i < 6; i++) bridge.emitImu(upVector(0, 0));
    expect(got.at(-1)!.stable).toBe(true);
    bridge.emitImu(upVector(40, -30));
    bridge.emitImu(upVector(-20, 35));
    expect(got.at(-1)!.stable).toBe(false);
  });

  it('disables reporting on stop', async () => {
    await imu.start(ImuReportPace.P200);
    await imu.stop();
    expect(bridge.imuEnabled).toBe(false);
    expect(imu.isRunning).toBe(false);
    bridge.emitImu(upVector(0, 0));
    expect(samples).toHaveLength(0);
  });
});
