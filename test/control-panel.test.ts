// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { MockBridge } from '../src/sdk/mock-bridge.js';
import { AppController } from '../src/core/app-controller.js';
import { mountControlPanel } from '../src/ui/control-panel.js';
import { upVector } from '../src/sdk/sim-streams.js';

// jsdom has no canvas backend; stub a minimal 2D context for the preview.
beforeAll(() => {
  (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {},
  });
});

describe('control panel (jsdom)', () => {
  it('mounts, reflects state, and routes gestures through the controller', async () => {
    const bridge = new MockBridge({ renderLatencyMs: 0 });
    const app = new AppController(bridge);
    await app.init();

    const root = document.createElement('div');
    document.body.append(root);
    mountControlPanel(root, app, bridge);

    // Core sections render.
    expect(root.querySelector('h1')?.textContent).toBe('LEVEL X');
    const cardTitles = [...root.querySelectorAll('.card h2')].map((e) => e.textContent);
    expect(cardTitles).toContain('Orientation');
    expect(cardTitles).toContain('Simulator (mock hardware)'); // mock-only card present

    // Live orientation paints from a sample.
    bridge.emitImu(upVector(12, -5));
    const roll = root.querySelector('.grid3 .stat .big')!;
    // paint() is wired via onState; value should no longer be the initial 0.0.
    expect(roll.textContent).not.toBe('0.0°');

    // A simulator "Double" gesture button must switch mode via the real pipeline.
    const before = app.activeModeId();
    const dbl = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Double')!;
    dbl.click();
    expect(app.activeModeId()).not.toBe(before);

    // The "Calibrate" action button commits a profile from recent samples.
    // Feed > buffer size of steady samples so earlier divergent ones are flushed.
    for (let i = 0; i < 34; i++) bridge.emitImu(upVector(3, -2));
    const calBtn = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Calibrate')!;
    calBtn.click();
    expect(app.perf.hasCalibration).toBe(true);

    await app.shutdown();
  });
});
