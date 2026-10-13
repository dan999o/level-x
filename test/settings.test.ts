import { describe, it, expect } from 'vitest';
import { ImuReportPace } from '@evenrealities/even_hub_sdk';
import { MockBridge } from '../src/sdk/mock-bridge.js';
import { SettingsService, mergeSettings, DEFAULT_SETTINGS } from '../src/core/settings.js';

describe('mergeSettings', () => {
  it('returns defaults for non-objects', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid fields and rejects invalid ones', () => {
    const merged = mergeSettings({
      activeMode: 'reticle',
      level: { toleranceDeg: 2 },
      imu: { pace: 99999, responsiveness: 5 },
      reticle: { style: 'bogus', sizePx: 30 },
    });
    expect(merged.activeMode).toBe('reticle');
    expect(merged.level.toleranceDeg).toBe(2);
    expect(merged.imu.pace).toBe(DEFAULT_SETTINGS.imu.pace); // invalid pace rejected
    expect(merged.imu.responsiveness).toBe(1); // clamped
    expect(merged.reticle.style).toBe(DEFAULT_SETTINGS.reticle.style); // invalid rejected
    expect(merged.reticle.sizePx).toBe(30);
  });

  it('enforces a tolerance floor', () => {
    expect(mergeSettings({ level: { toleranceDeg: -3 } }).level.toleranceDeg).toBe(0.1);
  });
});

describe('SettingsService', () => {
  it('loads defaults when storage is empty', async () => {
    const svc = new SettingsService(new MockBridge());
    const s = await svc.load();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('persists updates through the bridge and reloads them', async () => {
    const bridge = new MockBridge();
    const svc = new SettingsService(bridge);
    await svc.load();
    await svc.update({ imu: { pace: ImuReportPace.P500, responsiveness: 0.8 } });

    const svc2 = new SettingsService(bridge);
    const reloaded = await svc2.load();
    expect(reloaded.imu.pace).toBe(ImuReportPace.P500);
    expect(reloaded.imu.responsiveness).toBe(0.8);
  });

  it('supports functional updates', async () => {
    const svc = new SettingsService(new MockBridge());
    await svc.load();
    await svc.update((s) => ({ ...s, level: { toleranceDeg: s.level.toleranceDeg + 1 } }));
    expect(svc.value.level.toleranceDeg).toBeCloseTo(DEFAULT_SETTINGS.level.toleranceDeg + 1, 6);
  });

  it('round-trips export/import', async () => {
    const svc = new SettingsService(new MockBridge());
    await svc.load();
    await svc.update({ activeMode: 'photo' });
    const json = svc.exportJson();

    const svc2 = new SettingsService(new MockBridge());
    const imported = await svc2.importJson(json);
    expect(imported.activeMode).toBe('photo');
  });

  it('notifies change listeners', async () => {
    const svc = new SettingsService(new MockBridge());
    await svc.load();
    let fired = 0;
    svc.onChange(() => fired++);
    await svc.update({ activeMode: 'angle' });
    expect(fired).toBe(1);
  });
});
