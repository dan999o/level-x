/**
 * MockBridge: a full BridgePort implementation with no glasses attached.
 *
 * Used for headless unit tests and for running the app in a plain browser
 * (dev/offline). It constructs GENUINE SDK event objects (Sys_ItemEvent,
 * IMU_Report_Data, …) so consumers exercise exactly the shapes the real host
 * delivers — nothing about the event contract is faked.
 */

import {
  type EvenHubEvent,
  DeviceStatus,
  DeviceInfo,
  DeviceConnectType,
  DeviceModel,
  type LaunchSource,
  Sys_ItemEvent,
  Text_ItemEvent,
  IMU_Report_Data,
  MenuItemClickEvent,
  OsEventTypeList,
  EventSourceType,
} from '@evenrealities/even_hub_sdk';

import type {
  BridgePort,
  PageData,
  ImageUpdateData,
  TextUpdateData,
  PageCreateOutcome,
  ImageUpdateOutcome,
  Unsubscribe,
  AudioInputSource,
  ImuReportPace,
} from './bridge-port.js';
import type { Vec3 } from '../core/math/vector.js';
import { validatePage } from '../display/page-rules.js';
import { READOUT } from '../display/layout.js';

type Listener<T> = (v: T) => void;

export interface MockRenderLog {
  creates: PageData[];
  rebuilds: PageData[];
  images: ImageUpdateData[];
  texts: TextUpdateData[];
}

export interface MockBridgeOptions {
  /** Simulated latency (ms) applied to render calls, to exercise the scheduler. */
  renderLatencyMs?: number;
  deviceModel?: DeviceModel;
  sn?: string;
}

export class MockBridge implements BridgePort {
  private _ready = false;
  private storage = new Map<string, string>();
  private eventListeners = new Set<Listener<EvenHubEvent>>();
  private statusListeners = new Set<Listener<DeviceStatus>>();
  private launchListeners = new Set<Listener<LaunchSource>>();

  readonly log: MockRenderLog = { creates: [], rebuilds: [], images: [], texts: [] };

  imuEnabled = false;
  imuPace: ImuReportPace | undefined;
  audioEnabled = false;
  lastExitMode: number | null = null;

  constructor(private opts: MockBridgeOptions = {}) {}

  get ready(): boolean {
    return this._ready;
  }

  async init(): Promise<void> {
    this._ready = true;
  }

  async getDeviceInfo(): Promise<DeviceInfo | null> {
    const sn = this.opts.sn ?? 'MOCK-G2-0001';
    return new DeviceInfo({
      model: this.opts.deviceModel ?? DeviceModel.G2,
      sn,
      status: new DeviceStatus({ sn, connectType: DeviceConnectType.Connected, batteryLevel: 88, isWearing: true }),
    });
  }

  async getItem(key: string): Promise<string | null> {
    return this.storage.has(key) ? this.storage.get(key)! : null;
  }

  async setItem(key: string, value: string): Promise<boolean> {
    this.storage.set(key, value);
    return true;
  }

  private async delay(): Promise<void> {
    const ms = this.opts.renderLatencyMs ?? 0;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }

  /** Last page-validation failure, for test assertions. */
  lastPageError: string | null = null;

  async createPage(page: PageData): Promise<PageCreateOutcome> {
    await this.delay();
    // Reject exactly what the SDK/host reject, so bad layouts fail in tests too.
    this.lastPageError = validatePage(page);
    if (this.lastPageError) return 'invalid';
    this.log.creates.push(structuredClone(page));
    return 'success';
  }

  async rebuildPage(page: PageData): Promise<boolean> {
    await this.delay();
    this.lastPageError = validatePage(page);
    if (this.lastPageError) return false;
    this.log.rebuilds.push(structuredClone(page));
    return true;
  }

  async updateImage(data: ImageUpdateData): Promise<ImageUpdateOutcome> {
    await this.delay();
    // Validate size the way firmware would, so the mock surfaces real mistakes.
    if (data.imageData.length === 0) return 'imageSizeInvalid';
    this.log.images.push({ ...data, imageData: data.imageData.slice() });
    return 'success';
  }

  async upgradeText(data: TextUpdateData): Promise<boolean> {
    await this.delay();
    this.log.texts.push({ ...data });
    return true;
  }

  async setImu(on: boolean, pace?: ImuReportPace): Promise<boolean> {
    this.imuEnabled = on;
    this.imuPace = on ? pace : undefined;
    return true;
  }

  async setAudio(on: boolean, _source?: AudioInputSource): Promise<boolean> {
    this.audioEnabled = on;
    return true;
  }

  async shutdown(exitMode = 0): Promise<boolean> {
    this.lastExitMode = exitMode;
    return true;
  }

  onEvent(cb: Listener<EvenHubEvent>): Unsubscribe {
    this.eventListeners.add(cb);
    return () => this.eventListeners.delete(cb);
  }

  onDeviceStatus(cb: Listener<DeviceStatus>): Unsubscribe {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  onLaunchSource(cb: Listener<LaunchSource>): Unsubscribe {
    this.launchListeners.add(cb);
    return () => this.launchListeners.delete(cb);
  }

  dispose(): void {
    this.eventListeners.clear();
    this.statusListeners.clear();
    this.launchListeners.clear();
  }

  // ---- Test / simulation injection -------------------------------------

  private dispatch(e: EvenHubEvent): void {
    for (const l of [...this.eventListeners]) l(e);
  }

  /** Emit one IMU sample (only delivered if IMU reporting is "on", like firmware). */
  emitImu(v: Vec3): void {
    if (!this.imuEnabled) return;
    const sys = new Sys_ItemEvent({
      eventType: OsEventTypeList.IMU_DATA_REPORT,
      imuData: new IMU_Report_Data({ x: v.x, y: v.y, z: v.z }),
    });
    this.dispatch({ sysEvent: sys });
  }

  /** Emit a touch/ring input event the way the simulator does (as a sysEvent). */
  emitInput(eventType: OsEventTypeList, source: EventSourceType = EventSourceType.TOUCH_EVENT_FROM_GLASSES_R): void {
    const sys = new Sys_ItemEvent({ eventType, eventSource: source });
    this.dispatch({ sysEvent: sys });
  }

  /**
   * Emit a gesture the way real hardware does: as a textEvent from the capture
   * container, with CLICK_EVENT (0) normalized to undefined like the SDK parser.
   */
  emitHardwareInput(eventType: OsEventTypeList): void {
    const text = new Text_ItemEvent({
      containerID: READOUT.id,
      containerName: READOUT.name,
      ...(eventType === OsEventTypeList.CLICK_EVENT ? {} : { eventType }),
    });
    this.dispatch({ textEvent: text });
  }

  /** Emit a context-menu selection. */
  emitMenu(itemID: number): void {
    this.dispatch({ menuItemClickEvent: new MenuItemClickEvent({ itemID }) });
  }

  emitDeviceStatus(status: Partial<{ connectType: DeviceConnectType; batteryLevel: number; isWearing: boolean }>): void {
    const sn = this.opts.sn ?? 'MOCK-G2-0001';
    const s = new DeviceStatus({ sn, connectType: status.connectType ?? DeviceConnectType.Connected, ...status });
    for (const l of [...this.statusListeners]) l(s);
  }

  emitLaunchSource(src: LaunchSource): void {
    for (const l of [...this.launchListeners]) l(src);
  }
}
