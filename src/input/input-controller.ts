/**
 * InputController: normalizes glasses/ring firmware events into gestures, maps
 * them to semantic actions via a configurable table, and tracks whether the R1
 * ring has been seen (for a graceful fallback indicator).
 *
 * Only the gesture vocabulary the SDK actually defines is handled: click,
 * double-click, long-press (+release), scroll up/down, and context-menu select.
 * There is no swipe-vector event, so "reposition by swipe" is implemented with
 * scroll up/down, not an invented gesture.
 */

import { OsEventTypeList, EventSourceType } from '@evenrealities/even_hub_sdk';
import type { BridgePort, EvenHubEvent, Unsubscribe } from '../sdk/bridge-port.js';
import type { Diagnostics } from '../core/diagnostics.js';

export type Gesture =
  | 'click'
  | 'doubleClick'
  | 'longPress'
  | 'longPressRelease'
  | 'scrollUp'
  | 'scrollDown'
  | 'menu';

export type InputSource = 'glassesR' | 'glassesL' | 'ring' | 'unknown';

export type ActionId =
  | 'toggleHold'
  | 'switchMode'
  | 'calibrateStart'
  | 'calibrateCommit'
  | 'adjustUp'
  | 'adjustDown'
  | 'menuSelect'
  | 'none';

export interface InputEvent {
  gesture: Gesture;
  source: InputSource;
  action: ActionId;
  itemID?: number;
}

export type ActionMap = Record<Gesture, ActionId>;

/** Suggested by the community event notes: scroll events can fire rapidly. */
export const SCROLL_COOLDOWN_MS = 300;

export const DEFAULT_ACTION_MAP: ActionMap = {
  click: 'toggleHold',
  doubleClick: 'switchMode',
  longPress: 'calibrateStart',
  longPressRelease: 'calibrateCommit',
  scrollUp: 'adjustUp',
  scrollDown: 'adjustDown',
  menu: 'menuSelect',
};

function mapSource(src: EventSourceType | undefined): InputSource {
  switch (src) {
    case EventSourceType.TOUCH_EVENT_FROM_GLASSES_R:
      return 'glassesR';
    case EventSourceType.TOUCH_EVENT_FROM_GLASSES_L:
      return 'glassesL';
    case EventSourceType.TOUCH_EVENT_FROM_RING:
      return 'ring';
    default:
      return 'unknown';
  }
}

function mapGesture(evt: OsEventTypeList | undefined): Gesture | null {
  switch (evt) {
    case OsEventTypeList.CLICK_EVENT:
      return 'click';
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      return 'doubleClick';
    case OsEventTypeList.LONG_PRESS_EVENT:
      return 'longPress';
    case OsEventTypeList.LONG_PRESS_RELEASE_EVENT:
      return 'longPressRelease';
    case OsEventTypeList.SCROLL_TOP_EVENT:
      return 'scrollUp';
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      return 'scrollDown';
    default:
      return null;
  }
}

export class InputController {
  private sub: Unsubscribe | null = null;
  private listeners = new Set<(e: InputEvent) => void>();
  private map: ActionMap;
  private _ringSeen = false;
  private lastScrollAt = new Map<Gesture, number>();

  constructor(
    private bridge: BridgePort,
    private diag: Diagnostics,
    map: Partial<ActionMap> = {},
  ) {
    this.map = { ...DEFAULT_ACTION_MAP, ...map };
  }

  /** True once any event has arrived from the ring. */
  get ringSeen(): boolean {
    return this._ringSeen;
  }

  setMapping(map: Partial<ActionMap>): void {
    this.map = { ...this.map, ...map };
  }

  getMapping(): ActionMap {
    return { ...this.map };
  }

  start(): void {
    if (this.sub) return;
    this.sub = this.bridge.onEvent((e) => this.handle(e));
  }

  stop(): void {
    this.sub?.();
    this.sub = null;
  }

  dispose(): void {
    this.stop();
    this.listeners.clear();
  }

  onAction(cb: (e: InputEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: InputEvent): void {
    for (const l of [...this.listeners]) l(e);
  }

  private handle(e: EvenHubEvent): void {
    if (e.menuItemClickEvent) {
      this.emit({
        gesture: 'menu',
        source: 'unknown',
        action: this.map.menu,
        ...(e.menuItemClickEvent.itemID !== undefined ? { itemID: e.menuItemClickEvent.itemID } : {}),
      });
      return;
    }

    // The simulator delivers gestures as sysEvent; real hardware delivers them as
    // textEvent/listEvent from the isEventCapture container. Accept all three.
    const sys = e.sysEvent;
    const wrapper = e.listEvent ?? e.textEvent ?? sys;
    if (!wrapper) return;
    if (sys?.imuData) return; // IMU samples are handled by ImuService

    // The SDK's fromJson often normalizes CLICK_EVENT (0) to undefined.
    const type = wrapper.eventType ?? OsEventTypeList.CLICK_EVENT;
    const gesture = mapGesture(type);
    if (!gesture) return; // lifecycle events are handled by AppController

    if (this.isBounce(gesture)) return;

    // Only sysEvent carries the touch source; text/list events can't tell ring from temple.
    const source = mapSource(sys?.eventSource);
    if (source === 'ring' && !this._ringSeen) {
      this._ringSeen = true;
      this.diag.info('input', 'R1 ring input detected');
    }
    this.emit({ gesture, source, action: this.map[gesture] });
  }

  /** Scroll gestures fire in rapid bursts; drop repeats of the same one inside the cooldown. */
  private isBounce(gesture: Gesture): boolean {
    if (gesture !== 'scrollUp' && gesture !== 'scrollDown') return false;
    const now = Date.now();
    const last = this.lastScrollAt.get(gesture) ?? -Infinity;
    if (now - last < SCROLL_COOLDOWN_MS) return true;
    this.lastScrollAt.set(gesture, now);
    return false;
  }
}
