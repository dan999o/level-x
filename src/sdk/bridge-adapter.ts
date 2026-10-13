/**
 * Real bridge adapter: wraps the official EvenAppBridge behind BridgePort.
 *
 * Only instantiated in a WebView/browser host (the Even app or the simulator).
 * It is never driven in Node tests — those use MockBridge — but importing it is
 * safe because EvenAppBridge only touches `window` when its methods are called,
 * not at module load.
 */

import {
  waitForEvenAppBridge,
  EvenAppBridge,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  ImageRawDataUpdate,
  TextContainerUpgrade,
  StartUpPageCreateResult,
  ImageRawDataUpdateResult,
  type EvenHubEvent,
  type DeviceStatus,
  type DeviceInfo,
  type LaunchSource,
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

function toCreateContainer(page: PageData): CreateStartUpPageContainer {
  return new CreateStartUpPageContainer({
    containerTotalNum: page.containerTotalNum,
    ...(page.textObject ? { textObject: page.textObject.map((t) => ({ ...t }) as never) } : {}),
    ...(page.imageObject ? { imageObject: page.imageObject.map((i) => ({ ...i }) as never) } : {}),
    ...(page.menuObject ? { menuObject: { menuItems: page.menuObject.menuItems } as never } : {}),
  });
}

function toRebuildContainer(page: PageData): RebuildPageContainer {
  return new RebuildPageContainer({
    containerTotalNum: page.containerTotalNum,
    ...(page.textObject ? { textObject: page.textObject.map((t) => ({ ...t }) as never) } : {}),
    ...(page.imageObject ? { imageObject: page.imageObject.map((i) => ({ ...i }) as never) } : {}),
    ...(page.menuObject ? { menuObject: { menuItems: page.menuObject.menuItems } as never } : {}),
  });
}

function mapCreateResult(r: StartUpPageCreateResult): PageCreateOutcome {
  switch (r) {
    case StartUpPageCreateResult.success:
      return 'success';
    case StartUpPageCreateResult.oversize:
      return 'oversize';
    case StartUpPageCreateResult.outOfMemory:
      return 'outOfMemory';
    default:
      return 'invalid';
  }
}

function mapImageResult(r: ImageRawDataUpdateResult): ImageUpdateOutcome {
  switch (r) {
    case ImageRawDataUpdateResult.success:
      return 'success';
    case ImageRawDataUpdateResult.imageException:
      return 'imageException';
    case ImageRawDataUpdateResult.imageSizeInvalid:
      return 'imageSizeInvalid';
    case ImageRawDataUpdateResult.imageToGray4Failed:
      return 'imageToGray4Failed';
    default:
      return 'sendFailed';
  }
}

export class EvenBridgeAdapter implements BridgePort {
  private bridge: EvenAppBridge | null = null;
  private subs: Unsubscribe[] = [];

  get ready(): boolean {
    return this.bridge?.ready ?? false;
  }

  async init(): Promise<void> {
    this.bridge = await waitForEvenAppBridge();
  }

  private require(): EvenAppBridge {
    if (!this.bridge) throw new Error('EvenBridgeAdapter.init() not called / not ready');
    return this.bridge;
  }

  getDeviceInfo(): Promise<DeviceInfo | null> {
    return this.require().getDeviceInfo();
  }

  async getItem(key: string): Promise<string | null> {
    const v = await this.require().getLocalStorage(key);
    return v === undefined || v === null || v === '' ? null : v;
  }

  setItem(key: string, value: string): Promise<boolean> {
    return this.require().setLocalStorage(key, value);
  }

  async createPage(page: PageData): Promise<PageCreateOutcome> {
    const r = await this.require().createStartUpPageContainer(toCreateContainer(page));
    return mapCreateResult(r);
  }

  rebuildPage(page: PageData): Promise<boolean> {
    return this.require().rebuildPageContainer(toRebuildContainer(page));
  }

  async updateImage(data: ImageUpdateData): Promise<ImageUpdateOutcome> {
    const r = await this.require().updateImageRawData(
      new ImageRawDataUpdate({
        containerID: data.containerID,
        containerName: data.containerName,
        imageData: data.imageData,
      }),
    );
    return mapImageResult(r);
  }

  upgradeText(data: TextUpdateData): Promise<boolean> {
    return this.require().textContainerUpgrade(new TextContainerUpgrade({ ...data }));
  }

  setImu(on: boolean, pace?: ImuReportPace): Promise<boolean> {
    return this.require().imuControl(on, pace);
  }

  setAudio(on: boolean, source?: AudioInputSource): Promise<boolean> {
    return this.require().audioControl(on, source);
  }

  shutdown(exitMode = 0): Promise<boolean> {
    return this.require().shutDownPageContainer(exitMode);
  }

  onEvent(cb: (e: EvenHubEvent) => void): Unsubscribe {
    const un = this.require().onEvenHubEvent(cb);
    this.subs.push(un);
    return un;
  }

  onDeviceStatus(cb: (s: DeviceStatus) => void): Unsubscribe {
    const un = this.require().onDeviceStatusChanged(cb);
    this.subs.push(un);
    return un;
  }

  onLaunchSource(cb: (s: LaunchSource) => void): Unsubscribe {
    const un = this.require().onLaunchSource(cb);
    this.subs.push(un);
    return un;
  }

  dispose(): void {
    for (const un of this.subs.splice(0)) {
      try {
        un();
      } catch {
        /* best effort */
      }
    }
  }
}
