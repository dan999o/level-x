import { describe, it, expect, beforeEach } from 'vitest';
import { OsEventTypeList, EventSourceType } from '@evenrealities/even_hub_sdk';
import { MockBridge } from '../src/sdk/mock-bridge.js';
import { Diagnostics } from '../src/core/diagnostics.js';
import { InputController, type InputEvent } from '../src/input/input-controller.js';

describe('InputController', () => {
  let bridge: MockBridge;
  let ic: InputController;
  let events: InputEvent[];

  beforeEach(() => {
    bridge = new MockBridge();
    ic = new InputController(bridge, new Diagnostics());
    events = [];
    ic.start();
    ic.onAction((e) => events.push(e));
  });

  it('maps click from the right touchpad to toggleHold', () => {
    bridge.emitInput(OsEventTypeList.CLICK_EVENT, EventSourceType.TOUCH_EVENT_FROM_GLASSES_R);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ gesture: 'click', source: 'glassesR', action: 'toggleHold' });
  });

  it('maps double-click to switchMode', () => {
    bridge.emitInput(OsEventTypeList.DOUBLE_CLICK_EVENT);
    expect(events[0]).toMatchObject({ gesture: 'doubleClick', action: 'switchMode' });
  });

  it('maps long press and release to calibrate start/commit', () => {
    bridge.emitInput(OsEventTypeList.LONG_PRESS_EVENT);
    bridge.emitInput(OsEventTypeList.LONG_PRESS_RELEASE_EVENT);
    expect(events.map((e) => e.action)).toEqual(['calibrateStart', 'calibrateCommit']);
  });

  it('maps scroll up/down to adjust', () => {
    bridge.emitInput(OsEventTypeList.SCROLL_TOP_EVENT);
    bridge.emitInput(OsEventTypeList.SCROLL_BOTTOM_EVENT);
    expect(events.map((e) => e.action)).toEqual(['adjustUp', 'adjustDown']);
  });

  it('detects the R1 ring as the event source and sets ringSeen', () => {
    expect(ic.ringSeen).toBe(false);
    bridge.emitInput(OsEventTypeList.CLICK_EVENT, EventSourceType.TOUCH_EVENT_FROM_RING);
    expect(events[0]!.source).toBe('ring');
    expect(ic.ringSeen).toBe(true);
  });

  it('emits menuSelect with itemID', () => {
    bridge.emitMenu(3);
    expect(events[0]).toMatchObject({ gesture: 'menu', action: 'menuSelect', itemID: 3 });
  });

  it('ignores IMU reports', () => {
    bridge.emitInput(OsEventTypeList.IMU_DATA_REPORT);
    expect(events).toHaveLength(0);
  });

  it('honors a custom mapping', () => {
    ic.setMapping({ click: 'switchMode' });
    bridge.emitInput(OsEventTypeList.CLICK_EVENT);
    expect(events[0]!.action).toBe('switchMode');
  });

  it('accepts real-hardware taps delivered as textEvent with CLICK normalized to undefined', () => {
    bridge.emitHardwareInput(OsEventTypeList.CLICK_EVENT);
    expect(events[0]).toMatchObject({ gesture: 'click', action: 'toggleHold', source: 'unknown' });
  });

  it('accepts real-hardware double-tap and scroll as textEvent', () => {
    bridge.emitHardwareInput(OsEventTypeList.DOUBLE_CLICK_EVENT);
    bridge.emitHardwareInput(OsEventTypeList.SCROLL_BOTTOM_EVENT);
    expect(events.map((e) => e.action)).toEqual(['switchMode', 'adjustDown']);
  });

  it('debounces rapid repeats of the same scroll gesture', () => {
    bridge.emitInput(OsEventTypeList.SCROLL_TOP_EVENT);
    bridge.emitInput(OsEventTypeList.SCROLL_TOP_EVENT);
    bridge.emitInput(OsEventTypeList.SCROLL_TOP_EVENT);
    expect(events.filter((e) => e.action === 'adjustUp')).toHaveLength(1);
  });

  it('does not debounce taps', () => {
    bridge.emitInput(OsEventTypeList.CLICK_EVENT);
    bridge.emitInput(OsEventTypeList.CLICK_EVENT);
    expect(events).toHaveLength(2);
  });

  it('does not treat IMU samples as clicks', () => {
    bridge.imuEnabled = true;
    bridge.emitImu({ x: 0, y: 0, z: 1 });
    expect(events).toHaveLength(0);
  });

  it('stops delivering after stop()', () => {
    ic.stop();
    bridge.emitInput(OsEventTypeList.CLICK_EVENT);
    expect(events).toHaveLength(0);
  });
});
