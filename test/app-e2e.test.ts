/**
 * End-to-end MVP verification through the mock bridge. This exercises the full
 * chain — init, IMU -> orientation -> render, input, calibration, persistence,
 * mode switching, R1, offline operation, shutdown — exactly as the simulator or
 * real app would drive it, with no network and no glasses.
 */
import { describe, it, expect, vi } from 'vitest';
import { OsEventTypeList, EventSourceType } from '@evenrealities/even_hub_sdk';
import { MockBridge } from '../src/sdk/mock-bridge.js';
import { AppController } from '../src/core/app-controller.js';
import { SettingsService } from '../src/core/settings.js';
import { upVector } from '../src/sdk/sim-streams.js';

const feed = (b: MockBridge, p: number, r: number, n: number) => {
  for (let i = 0; i < n; i++) b.emitImu(upVector(p, r));
};
const tick = () => new Promise((res) => setTimeout(res, 20));

describe('LEVEL X — MVP end to end', () => {
  it('initializes, creates the page, and enables IMU', async () => {
    const bridge = new MockBridge();
    const app = new AppController(bridge);
    await app.init();
    expect(app.status.ready).toBe(true); // (1) initializes
    expect(bridge.log.creates).toHaveLength(1); // page created
    expect(bridge.imuEnabled).toBe(true); // (3) IMU requested
    expect(app.activeModeId()).toBe('level');
    await app.shutdown();
  });

  it('computes orientation from IMU data and renders overlay + readout', async () => {
    const bridge = new MockBridge();
    const app = new AppController(bridge);
    await app.init();

    feed(bridge, 0.3, -0.2, 12); // nearly level, steady

    // (4) orientation calculated — synchronous on each sample
    const o = app.status.lastOrientation!;
    expect(o).toBeTruthy();
    expect(Math.abs(o.rollDeg)).toBeLessThan(2);
    expect(Math.abs(o.pitchDeg)).toBeLessThan(2);

    // (2) alignment overlay + numeric readout pushed (display is paced, so poll)
    await vi.waitFor(() => {
      expect(bridge.log.images.length).toBeGreaterThan(0);
      const readout = [...bridge.log.texts].reverse().find((t) => t.containerID === 2);
      expect(readout?.content).toMatch(/R [-+]/);
    });
    await app.shutdown();
  });

  it('responds to touch controls: double-tap switches mode', async () => {
    const bridge = new MockBridge();
    const app = new AppController(bridge);
    await app.init();
    expect(app.activeModeId()).toBe('level');
    bridge.emitInput(OsEventTypeList.DOUBLE_CLICK_EVENT, EventSourceType.TOUCH_EVENT_FROM_GLASSES_R);
    expect(app.activeModeId()).toBe('reticle'); // (6) supported controls
    expect(app.settings.value.activeMode).toBe('reticle');
    await app.shutdown();
  });

  it('supports calibration and zeroes a tilted "level" pose', async () => {
    const bridge = new MockBridge();
    const app = new AppController(bridge);
    await app.init();

    feed(bridge, 3, -2, 20); // treat this tilted pose as "level"
    bridge.emitInput(OsEventTypeList.LONG_PRESS_EVENT);
    bridge.emitInput(OsEventTypeList.LONG_PRESS_RELEASE_EVENT);
    expect(app.perf.hasCalibration).toBe(true); // (5) calibration

    feed(bridge, 3, -2, 6);
    await tick();
    const o = app.status.lastOrientation!;
    expect(Math.abs(o.rollDeg)).toBeLessThan(1.5);
    expect(Math.abs(o.pitchDeg)).toBeLessThan(1.5);
    expect(o.calibrated).toBe(true);
    await app.shutdown();
  });

  it('persists settings + calibration (8) and operates offline (9)', async () => {
    const bridge = new MockBridge();
    const app = new AppController(bridge);
    await app.init();
    bridge.emitInput(OsEventTypeList.DOUBLE_CLICK_EVENT); // -> reticle
    feed(bridge, 2, -1, 20);
    app.commitCalibration();

    // A fresh settings reader on the same host storage sees the persisted state.
    const reloaded = await new SettingsService(bridge).load();
    expect(reloaded.activeMode).toBe('reticle');
    expect(reloaded.calibration).not.toBeNull();
    await app.shutdown();
  });

  it('recognizes the R1 ring (7)', async () => {
    const bridge = new MockBridge();
    const app = new AppController(bridge);
    await app.init();
    bridge.emitInput(OsEventTypeList.CLICK_EVENT, EventSourceType.TOUCH_EVENT_FROM_RING);
    expect(app.perf.ringSeen).toBe(true);
    await app.shutdown();
  });

  it('pauses and resumes on foreground lifecycle events', async () => {
    const bridge = new MockBridge();
    const app = new AppController(bridge);
    await app.init();
    expect(app.status.running).toBe(true);
    bridge.emitInput(OsEventTypeList.FOREGROUND_EXIT_EVENT);
    await tick();
    expect(bridge.imuEnabled).toBe(false);
    bridge.emitInput(OsEventTypeList.FOREGROUND_ENTER_EVENT);
    await tick();
    expect(bridge.imuEnabled).toBe(true);
    await app.shutdown();
  });

  it('creates a page the glasses accept (regression: "failed: invalid")', async () => {
    const bridge = new MockBridge();
    const app = new AppController(bridge);
    await app.init();
    expect(bridge.lastPageError).toBeNull();
    expect(bridge.log.creates).toHaveLength(1);
    await app.shutdown();
  });

  it('responds to real-hardware style input (textEvent from the capture container)', async () => {
    const bridge = new MockBridge();
    const app = new AppController(bridge);
    await app.init();
    bridge.emitHardwareInput(OsEventTypeList.DOUBLE_CLICK_EVENT);
    expect(app.activeModeId()).toBe('reticle');
    await app.shutdown();
  });

  it('falls back to rebuild when a page already exists', async () => {
    const bridge = new MockBridge();
    bridge.createPage = async () => 'invalid'; // e.g. page left over from a dev reload
    const app = new AppController(bridge);
    await app.init();
    expect(bridge.log.rebuilds).toHaveLength(1);
    await app.shutdown();
  });

  it('reports the failing rule when the page is rejected everywhere', async () => {
    const bridge = new MockBridge();
    bridge.createPage = async () => 'invalid';
    bridge.rebuildPage = async () => false;
    const app = new AppController(bridge);
    await expect(app.init()).rejects.toThrow(/glasses page rejected/);
  });

  it('sends only ASCII to glasses text containers', async () => {
    const bridge = new MockBridge();
    const app = new AppController(bridge);
    await app.init();
    feed(bridge, 2, -1, 10);
    await vi.waitFor(() => expect(bridge.log.texts.length).toBeGreaterThan(1));
    for (const t of bridge.log.texts) expect(t.content ?? '').toMatch(/^[\x20-\x7e]*$/);
    await app.shutdown();
  });

  it('shuts down cleanly', async () => {
    const bridge = new MockBridge();
    const app = new AppController(bridge);
    await app.init();
    await app.shutdown();
    expect(bridge.lastExitMode).toBe(0);
    expect(bridge.imuEnabled).toBe(false);
  });
});
