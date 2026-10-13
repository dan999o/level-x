/**
 * BridgePort: the narrow, stable surface the rest of LEVEL X depends on.
 *
 * Why an interface instead of using EvenAppBridge directly:
 *  - The app must run with no glasses (mock) and under the simulator/real app
 *    (adapter) behind the SAME contract.
 *  - The SDK's payload/event types are CLASSES (they carry methods), so plain
 *    object literals are not type-assignable to them. The port speaks plain
 *    data; the real adapter maps that data onto genuine SDK class instances.
 *
 * Event payloads reuse the SDK's own types (type-only import) so parsing stays
 * identical to the host path.
 */

import type {
  EvenHubEvent,
  DeviceStatus,
  DeviceInfo,
  LaunchSource,
} from '@evenrealities/even_hub_sdk';
import { AudioInputSource, ImuReportPace } from '@evenrealities/even_hub_sdk';

export { AudioInputSource, ImuReportPace };
export type { EvenHubEvent, DeviceStatus, DeviceInfo, LaunchSource };

export type Unsubscribe = () => void;

/** Result of a page-create call, normalized to a simple discriminated value. */
export type PageCreateOutcome = 'success' | 'invalid' | 'oversize' | 'outOfMemory';
export type ImageUpdateOutcome =
  | 'success'
  | 'imageException'
  | 'imageSizeInvalid'
  | 'imageToGray4Failed'
  | 'sendFailed';

export interface TextContainerData {
  containerID: number;
  containerName: string;
  xPosition: number;
  yPosition: number;
  width: number;
  height: number;
  content?: string;
  /** Brightness 0..4; omit to use device default. */
  textColor?: number;
  zOrderIndex?: number;
  isEventCapture?: number;
}

export interface ImageContainerData {
  containerID: number;
  containerName: string;
  xPosition: number;
  yPosition: number;
  /** 20..288 per SDK. */
  width: number;
  /** 20..144 per SDK. */
  height: number;
  zOrderIndex?: number;
}

export interface MenuData {
  menuItems: { itemName: string; itemID: number }[];
}

export interface PageData {
  /** 1..12 */
  containerTotalNum: number;
  textObject?: TextContainerData[];
  imageObject?: ImageContainerData[];
  menuObject?: MenuData;
}

export interface ImageUpdateData {
  containerID: number;
  containerName: string;
  /** Grayscale bytes, row-major. Host converts to gray4 and LZ4-compresses. */
  imageData: number[];
}

export interface TextUpdateData {
  containerID: number;
  containerName: string;
  content?: string;
  textColor?: number;
  contentOffset?: number;
  contentLength?: number;
}

export interface BridgePort {
  /** Resolve once the bridge is ready to use. */
  init(): Promise<void>;
  readonly ready: boolean;

  getDeviceInfo(): Promise<DeviceInfo | null>;

  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<boolean>;

  createPage(page: PageData): Promise<PageCreateOutcome>;
  rebuildPage(page: PageData): Promise<boolean>;
  updateImage(data: ImageUpdateData): Promise<ImageUpdateOutcome>;
  upgradeText(data: TextUpdateData): Promise<boolean>;

  setImu(on: boolean, pace?: ImuReportPace): Promise<boolean>;
  setAudio(on: boolean, source?: AudioInputSource): Promise<boolean>;

  shutdown(exitMode?: number): Promise<boolean>;

  onEvent(cb: (e: EvenHubEvent) => void): Unsubscribe;
  onDeviceStatus(cb: (s: DeviceStatus) => void): Unsubscribe;
  onLaunchSource(cb: (s: LaunchSource) => void): Unsubscribe;

  /** Release all listeners/resources. */
  dispose(): void;
}
