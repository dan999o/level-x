import { describe, it, expect, vi } from 'vitest';
import { MockBridge } from '../src/sdk/mock-bridge.js';
import { Diagnostics } from '../src/core/diagnostics.js';
import { DisplayScheduler } from '../src/display/display-scheduler.js';

const bytes = () => Array.from({ length: 40 }, (_, i) => i);

describe('DisplayScheduler', () => {
  it('pushes a requested image to the bridge', async () => {
    const bridge = new MockBridge();
    const s = new DisplayScheduler(bridge, new Diagnostics(), {
      containerID: 1,
      containerName: 'overlay',
      baseIntervalMs: 2,
    });
    s.requestImage(bytes);
    await vi.waitFor(() => expect(bridge.log.images.length).toBe(1));
    expect(s.snapshot.framesPushed).toBe(1);
    s.stop();
  });

  it('coalesces rapid image requests into the latest frame', async () => {
    const bridge = new MockBridge();
    const s = new DisplayScheduler(bridge, new Diagnostics(), {
      containerID: 1,
      containerName: 'overlay',
      baseIntervalMs: 50,
    });
    // Three synchronous requests before the first push can run.
    s.requestImage(() => [1]);
    s.requestImage(() => [2]);
    s.requestImage(() => [3]);
    await vi.waitFor(() => expect(bridge.log.images.length).toBe(1));
    expect(bridge.log.images[0]!.imageData).toEqual([3]); // latest wins
    expect(s.snapshot.framesDropped).toBe(2);
    s.stop();
  });

  it('serializes and delivers both text and image work', async () => {
    const bridge = new MockBridge({ renderLatencyMs: 1 });
    const s = new DisplayScheduler(bridge, new Diagnostics(), {
      containerID: 1,
      containerName: 'overlay',
      baseIntervalMs: 1,
    });
    s.requestText({ containerID: 2, containerName: 'readout', content: 'hi' });
    s.requestImage(bytes);
    await vi.waitFor(() => {
      expect(bridge.log.texts.length).toBe(1);
      expect(bridge.log.images.length).toBe(1);
    });
    s.stop();
  });

  it('records a failure when the image is rejected', async () => {
    const bridge = new MockBridge();
    const s = new DisplayScheduler(bridge, new Diagnostics(), {
      containerID: 1,
      containerName: 'overlay',
      baseIntervalMs: 1,
    });
    s.requestImage(() => []); // empty -> mock returns imageSizeInvalid
    await vi.waitFor(() => expect(s.snapshot.failures).toBe(1));
    expect(s.snapshot.framesPushed).toBe(0);
    s.stop();
  });

  it('skips pushing a frame identical to the last one', async () => {
    const bridge = new MockBridge();
    const s = new DisplayScheduler(bridge, new Diagnostics(), {
      containerID: 1,
      containerName: 'overlay',
      baseIntervalMs: 1,
    });
    s.requestImage(bytes);
    await vi.waitFor(() => expect(bridge.log.images.length).toBe(1));
    s.requestImage(bytes);
    await vi.waitFor(() => expect(s.snapshot.framesSkipped).toBe(1));
    expect(bridge.log.images.length).toBe(1);
    s.stop();
  });

  it('skips re-sending unchanged text', async () => {
    const bridge = new MockBridge();
    const s = new DisplayScheduler(bridge, new Diagnostics(), {
      containerID: 1,
      containerName: 'overlay',
      baseIntervalMs: 1,
    });
    s.requestText({ containerID: 2, containerName: 'readout', content: 'R +1.0' });
    await vi.waitFor(() => expect(bridge.log.texts.length).toBe(1));
    s.requestText({ containerID: 2, containerName: 'readout', content: 'R +1.0' });
    await new Promise((r) => setTimeout(r, 20));
    expect(bridge.log.texts.length).toBe(1);
    s.stop();
  });

  it('defaults to at least the ~104 ms image-path hold between pushes', () => {
    const s = new DisplayScheduler(new MockBridge(), new Diagnostics(), { containerID: 1, containerName: 'overlay' });
    expect(s.snapshot.minIntervalMs).toBeGreaterThanOrEqual(104);
    s.stop();
  });

  it('stops cleanly and drops pending work', async () => {
    const bridge = new MockBridge({ renderLatencyMs: 20 });
    const s = new DisplayScheduler(bridge, new Diagnostics(), {
      containerID: 1,
      containerName: 'overlay',
      baseIntervalMs: 100,
    });
    s.requestImage(bytes);
    s.stop();
    await new Promise((r) => setTimeout(r, 30));
    expect(bridge.log.images.length).toBe(0);
  });
});
