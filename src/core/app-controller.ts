/**
 * AppController: the core application controller.
 *
 * Owns initialization, the service graph, the render context, global input
 * routing, calibration capture, lifecycle (foreground/exit), and shutdown with
 * full listener cleanup. Hardware-independent: it talks to a BridgePort, so the
 * same controller runs against the real adapter, the simulator, or the mock.
 */

import { OsEventTypeList } from '@evenrealities/even_hub_sdk';
import type { BridgePort, EvenHubEvent, Unsubscribe } from '../sdk/bridge-port.js';
import { Diagnostics } from './diagnostics.js';
import { SettingsService, type LevelXSettings } from './settings.js';
import { ImuService, type ProcessedImu } from '../sensors/imu-service.js';
import { InputController, type InputEvent } from '../input/input-controller.js';
import { DisplayScheduler, type DisplayStats } from '../display/display-scheduler.js';
import { Framebuffer } from '../display/framebuffer.js';
import { CANVAS_W, CANVAS_H } from '../display/canvas.js';
import { buildPage, OVERLAY, READOUT, STATUS, MENU_CALIBRATE, MENU_HOLD, MENU_MODE, MENU_EXIT } from '../display/layout.js';
import { validatePage } from '../display/page-rules.js';
import { toGlassesText } from './glasses-text.js';
import { ModeManager, type ModeContext, type OrientationState } from './mode-manager.js';
import { SmartLevelMode } from '../modes/smart-level.js';
import { ReticleMode } from '../modes/reticle.js';
import { PhotoMode } from '../modes/photo.js';
import { AngleMode } from '../modes/angle.js';
import { type Vec3, vec3, angleBetweenDeg } from './math/vector.js';
import { gravityPitchRoll } from './math/orientation.js';
import { applyCalibration, captureCalibration, type CalibrationProfile } from './math/calibration.js';
import type { AxisMapping } from './math/orientation.js';

export interface AppStatus {
  ready: boolean;
  running: boolean;
  deviceModel: string | null;
  calibrating: boolean;
  lastOrientation: OrientationState | null;
}

const CAL_BUFFER = 32;

function canonicalUp(m: AxisMapping): Vec3 {
  const v = vec3(0, 0, 0);
  v[m.up] = m.signUp;
  return v;
}

export class AppController {
  readonly diag: Diagnostics;
  readonly settings: SettingsService;
  private imu: ImuService;
  private input: InputController;
  private scheduler: DisplayScheduler;
  private fb: Framebuffer;
  private modes: ModeManager;

  private lifecycleUnsub: Unsubscribe | null = null;
  private imuUnsub: (() => void) | null = null;
  private inputUnsub: (() => void) | null = null;

  private recentRaw: Vec3[] = [];
  private calibrating = false;
  private _running = false;
  private deviceModel: string | null = null;
  private lastOrientation: OrientationState | null = null;
  private stateListeners = new Set<(s: OrientationState) => void>();

  constructor(
    private bridge: BridgePort,
    opts: { mirrorConsole?: boolean } = {},
  ) {
    this.diag = new Diagnostics({ mirrorConsole: opts.mirrorConsole ?? false });
    this.settings = new SettingsService(bridge);
    this.fb = new Framebuffer(CANVAS_W, CANVAS_H);
    this.scheduler = new DisplayScheduler(bridge, this.diag, {
      containerID: OVERLAY.id,
      containerName: OVERLAY.name,
    });
    this.imu = new ImuService(bridge, this.diag);
    this.input = new InputController(bridge, this.diag);

    const ctx: ModeContext = {
      fb: this.fb,
      scheduler: this.scheduler,
      settings: this.settings,
      diag: this.diag,
      drawOverlay: () => this.scheduler.requestImage(() => this.fb.toBytes('gray8')),
      setReadout: (text) =>
        this.scheduler.requestText({ containerID: READOUT.id, containerName: READOUT.name, content: toGlassesText(text) }),
      setStatus: (text) => this.setStatusText(text),
    };
    this.modes = new ModeManager(ctx);
    this.modes.register(new SmartLevelMode());
    this.modes.register(new ReticleMode());
    this.modes.register(new PhotoMode());
    this.modes.register(new AngleMode());
  }

  get status(): AppStatus {
    return {
      ready: this.bridge.ready,
      running: this._running,
      deviceModel: this.deviceModel,
      calibrating: this.calibrating,
      lastOrientation: this.lastOrientation,
    };
  }

  onState(cb: (s: OrientationState) => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  get perf(): { display: DisplayStats; imuRunning: boolean; ringSeen: boolean; hasCalibration: boolean } {
    return {
      display: this.scheduler.snapshot,
      imuRunning: this.imu.isRunning,
      ringSeen: this.input.ringSeen,
      hasCalibration: this.settings.value.calibration !== null,
    };
  }

  activeModeId(): string | null {
    return this.modes.active?.id ?? null;
  }

  /** Trigger a semantic action from the control panel (works on real or mock). */
  trigger(action: InputEvent['action'], itemID?: number): void {
    this.routeAction({ gesture: 'menu', source: 'unknown', action, ...(itemID !== undefined ? { itemID } : {}) });
  }

  /** Snapshot of the overlay framebuffer for the on-screen preview. */
  getPreview(): { width: number; height: number; data: Uint8Array } {
    return { width: this.fb.width, height: this.fb.height, data: this.fb.data };
  }

  modeList(): { id: string; title: string }[] {
    return this.modes.list().map((m) => ({ id: m.id, title: m.title }));
  }

  async init(): Promise<void> {
    await this.bridge.init();
    this.diag.info('app', 'bridge ready');
    await this.settings.load();

    try {
      const info = await this.bridge.getDeviceInfo();
      this.deviceModel = info?.model ?? null;
      this.diag.info('app', `device: ${this.deviceModel ?? 'unknown'}`);
    } catch (e) {
      this.diag.warn('app', `getDeviceInfo failed: ${(e as Error).message}`);
    }

    await this.showPage();

    this.lifecycleUnsub = this.bridge.onEvent((e) => this.handleLifecycle(e));
    this.input.start();
    this.inputUnsub = this.input.onAction((e) => this.routeAction(e));
    this.imuUnsub = this.imu.onSample((s) => this.handleImu(s));

    this.modes.activate(this.settings.value.activeMode);
    await this.start();
  }

  /**
   * Put the LEVEL X page on the glasses. Validates locally first so a rejected
   * layout reports the exact rule it broke. If create fails, a page may already
   * exist (a dev reload), so try rebuild. Older Even app versions may not accept
   * the context menu, so the menu-less layout is the last resort.
   */
  private async showPage(): Promise<void> {
    const errors: string[] = [];
    for (const withMenu of [true, false]) {
      const label = withMenu ? 'with menu' : 'without menu';
      const page = buildPage(withMenu);
      const local = validatePage(page);
      if (local) {
        errors.push(`${label}: ${local}`);
        continue;
      }
      const created = await this.bridge.createPage(page);
      if (created === 'success') {
        this.diag.info('app', `page created (${label})`);
        return;
      }
      if (await this.bridge.rebuildPage(page)) {
        this.diag.info('app', `page rebuilt (${label}) after create returned ${created}`);
        return;
      }
      errors.push(`${label}: create=${created}, rebuild failed`);
      this.diag.warn('app', `page ${label} rejected (create=${created})`);
    }
    const msg = `glasses page rejected - ${errors.join('; ')}`;
    this.diag.error('app', msg);
    throw new Error(msg);
  }

  private setStatusText(text: string): void {
    this.scheduler.requestText({ containerID: STATUS.id, containerName: STATUS.name, content: toGlassesText(text) });
  }

  async start(): Promise<void> {
    if (this._running) return;
    const ok = await this.imu.start(this.settings.value.imu.pace);
    this.imu.setResponsiveness(this.settings.value.imu.responsiveness);
    this._running = ok;
    this.diag.info('app', ok ? 'started' : 'start failed (IMU)');
  }

  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;
    await this.imu.stop();
    this.diag.info('app', 'stopped');
  }

  /** Apply a settings change coming from the control panel. */
  async applySettings(patch: Partial<LevelXSettings>): Promise<void> {
    const s = await this.settings.update(patch);
    this.imu.setResponsiveness(s.imu.responsiveness);
    if (s.activeMode !== this.modes.active?.id) this.modes.activate(s.activeMode);
  }

  async shutdown(): Promise<void> {
    await this.stop();
    this.scheduler.stop();
    this.imu.dispose();
    this.input.dispose();
    this.lifecycleUnsub?.();
    this.imuUnsub?.();
    this.inputUnsub?.();
    this.stateListeners.clear();
    try {
      await this.bridge.shutdown(0);
    } catch {
      /* ignore */
    }
    this.bridge.dispose();
    this.diag.info('app', 'shutdown complete');
  }

  // ---- IMU -> orientation ----------------------------------------------

  private handleImu(s: ProcessedImu): void {
    this.recentRaw.push(s.raw);
    if (this.recentRaw.length > CAL_BUFFER) this.recentRaw.shift();

    const settings = this.settings.value;
    const profile = settings.calibration;
    let pitchDeg: number;
    let rollDeg: number;
    let tiltDeg: number;
    let calibrated = false;

    if (profile) {
      const c = applyCalibration(s.filtered, profile);
      const pr = gravityPitchRoll(s.filtered, profile.mapping);
      pitchDeg = c?.pitchDeg ?? pr?.pitchDeg ?? 0;
      rollDeg = c?.rollDeg ?? pr?.rollDeg ?? 0;
      tiltDeg = angleBetweenDeg(s.filtered, profile.referenceUp) ?? 0;
      calibrated = true;
    } else {
      const pr = gravityPitchRoll(s.filtered, settings.axisMapping);
      pitchDeg = pr?.pitchDeg ?? 0;
      rollDeg = pr?.rollDeg ?? 0;
      tiltDeg = angleBetweenDeg(s.filtered, canonicalUp(settings.axisMapping)) ?? 0;
    }

    const state: OrientationState = {
      pitchDeg,
      rollDeg,
      tiltDeg,
      stable: s.stable,
      rateHz: s.rateHz,
      calibrated,
      up: { ...s.filtered },
    };
    this.lastOrientation = state;
    this.modes.onOrientation(state);
    for (const l of [...this.stateListeners]) l(state);
  }

  // ---- input routing ---------------------------------------------------

  private routeAction(e: InputEvent): void {
    // Global actions take precedence over mode-local handling.
    if (e.action === 'switchMode') {
      this.modes.next();
      void this.settings.update((s) => ({ ...s, activeMode: this.modes.active!.id as LevelXSettings['activeMode'] }));
      return;
    }
    if (e.action === 'calibrateStart') {
      this.beginCalibration();
      return;
    }
    if (e.action === 'calibrateCommit') {
      this.commitCalibration();
      return;
    }
    if (e.action === 'menuSelect') {
      this.handleMenu(e.itemID);
      return;
    }
    this.modes.onAction(e);
  }

  private handleMenu(itemID?: number): void {
    switch (itemID) {
      case MENU_CALIBRATE:
        this.commitCalibration();
        break;
      case MENU_HOLD:
        this.modes.onAction({ gesture: 'click', source: 'unknown', action: 'toggleHold' });
        break;
      case MENU_MODE:
        this.modes.next();
        void this.settings.update((s) => ({ ...s, activeMode: this.modes.active!.id as LevelXSettings['activeMode'] }));
        break;
      case MENU_EXIT:
        void this.shutdown();
        break;
      default:
        break;
    }
  }

  // ---- calibration -----------------------------------------------------

  private beginCalibration(): void {
    this.calibrating = true;
    this.diag.info('cal', 'calibration started — hold still');
    this.setStatusText('CALIBRATING - hold still');
  }

  /** Capture a profile from the recent sample buffer and persist it. */
  commitCalibration(): CalibrationProfile | null {
    this.calibrating = false;
    const res = captureCalibration(this.recentRaw, {
      minSamples: Math.min(8, CAL_BUFFER),
      maxSpreadMagnitude: 0.08,
      mapping: this.settings.value.axisMapping,
    });
    if (!res.ok) {
      this.diag.warn('cal', `calibration rejected: ${res.reason}`);
      this.setStatusText(`CAL FAILED: ${res.reason}`);
      return null;
    }
    void this.settings.update((s) => ({ ...s, calibration: res.profile }));
    this.diag.info('cal', 'calibration committed');
    return res.profile;
  }

  clearCalibration(): void {
    void this.settings.update((s) => ({ ...s, calibration: null }));
    this.diag.info('cal', 'calibration cleared');
  }

  // ---- lifecycle -------------------------------------------------------

  private handleLifecycle(e: EvenHubEvent): void {
    const t = e.sysEvent?.eventType;
    if (t === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
      this.diag.info('app', 'foreground exit — pausing');
      void this.stop();
    } else if (t === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
      this.diag.info('app', 'foreground enter — resuming');
      void this.start();
    } else if (t === OsEventTypeList.SYSTEM_EXIT_EVENT || t === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
      this.diag.warn('app', `exit event ${t} — cleaning up`);
      void this.shutdown();
    }
  }
}
