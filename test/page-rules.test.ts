/**
 * Regression tests for the on-device failure "createStartUpPageContainer
 * failed: invalid" (duplicate zOrderIndex, no isEventCapture container).
 */
import { describe, it, expect } from 'vitest';
import { validatePage } from '../src/display/page-rules.js';
import { buildPage, READOUT, STATUS } from '../src/display/layout.js';
import { DISPLAY_W, DISPLAY_H } from '../src/display/canvas.js';
import { toGlassesText } from '../src/core/glasses-text.js';
import type { PageData } from '../src/sdk/bridge-port.js';

const clone = (p: PageData): PageData => structuredClone(p);

describe('LEVEL X page layout', () => {
  it('passes the SDK validator and the documented host rules, with and without menu', () => {
    expect(validatePage(buildPage(true))).toBeNull();
    expect(validatePage(buildPage(false))).toBeNull();
  });

  it('has exactly one input-capturing container', () => {
    const caps = (buildPage().textObject ?? []).filter((t) => t.isEventCapture === 1);
    expect(caps).toHaveLength(1);
  });

  it('keeps every container inside the 576x288 display', () => {
    const p = buildPage();
    for (const c of [...(p.textObject ?? []), ...(p.imageObject ?? [])]) {
      expect(c.xPosition + c.width).toBeLessThanOrEqual(DISPLAY_W);
      expect(c.yPosition + c.height).toBeLessThanOrEqual(DISPLAY_H);
    }
  });
});

describe('validatePage rejects what the glasses reject', () => {
  it('duplicate zOrderIndex (the original on-device bug)', () => {
    const p = clone(buildPage());
    p.imageObject![0]!.zOrderIndex = 1;
    p.textObject![0]!.zOrderIndex = 5;
    p.textObject![1]!.zOrderIndex = 5;
    expect(validatePage(p)).toMatch(/DUPLICATE_Z_ORDER_INDEX/);
  });

  it('partial zOrderIndex (all-or-nothing rule)', () => {
    const p = clone(buildPage());
    p.textObject![0]!.zOrderIndex = 2;
    expect(validatePage(p)).not.toBeNull();
  });

  it('no isEventCapture container', () => {
    const p = clone(buildPage());
    p.textObject!.forEach((t) => (t.isEventCapture = 0));
    expect(validatePage(p)).toMatch(/exactly one container/);
  });

  it('two isEventCapture containers', () => {
    const p = clone(buildPage());
    p.textObject!.forEach((t) => (t.isEventCapture = 1));
    expect(validatePage(p)).toMatch(/exactly one container/);
  });

  it('container outside the display', () => {
    const p = clone(buildPage());
    p.textObject![1]!.yPosition = 270;
    expect(validatePage(p)).toMatch(/outside/);
  });

  it('containerName over 16 characters', () => {
    const p = clone(buildPage());
    p.textObject![0]!.containerName = 'a-very-long-container-name';
    expect(validatePage(p)).toMatch(/16 characters/);
  });

  it('containerTotalNum mismatch', () => {
    const p = clone(buildPage());
    p.containerTotalNum = 5;
    expect(validatePage(p)).toMatch(/containerTotalNum/);
  });

  it('duplicate container IDs', () => {
    const p = clone(buildPage());
    p.textObject![1]!.containerID = READOUT.id;
    expect(validatePage(p)).toMatch(/duplicate containerID/);
    expect(STATUS.id).not.toBe(READOUT.id);
  });
});

describe('toGlassesText', () => {
  it('maps symbols the firmware font may lack to ASCII', () => {
    expect(toGlassesText('R +1.2°  P -0.4°')).toBe('R +1.2  P -0.4');
    expect(toGlassesText('LEVEL · STEADY · ±0.5°')).toBe('LEVEL | STEADY | +/-0.5');
    expect(toGlassesText('Δ 3.0° — tap…')).toBe('d 3.0 - tap...');
  });

  it('drops any other non-ASCII character', () => {
    expect(toGlassesText('ok ✓ 中')).toBe('ok  ');
  });
});
