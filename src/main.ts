/**
 * Browser / WebView entry point.
 *
 * Chooses the real EvenBridgeAdapter when a Flutter WebView host is present
 * (the Even app or the simulator), otherwise falls back to the MockBridge so
 * the app runs fully offline in a plain browser for development.
 */

import { AppController } from './core/app-controller.js';
import { MockBridge } from './sdk/mock-bridge.js';
import { EvenBridgeAdapter } from './sdk/bridge-adapter.js';
import { mountControlPanel } from './ui/control-panel.js';
import type { BridgePort } from './sdk/bridge-port.js';
import { upVector } from './sdk/sim-streams.js';

declare global {
  interface Window {
    flutter_inappwebview?: unknown;
    levelx?: AppController;
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;

  const params = new URLSearchParams(location.search);
  const forceMock = params.get('mock') === '1';
  const forceReal = params.get('real') === '1';
  const hasHost = typeof window.flutter_inappwebview !== 'undefined';
  const useReal = forceReal || (hasHost && !forceMock);

  let mock: MockBridge | undefined;
  let bridge: BridgePort;
  if (useReal) {
    bridge = new EvenBridgeAdapter();
  } else {
    mock = new MockBridge({ renderLatencyMs: 8 });
    bridge = mock;
  }

  const app = new AppController(bridge, { mirrorConsole: !useReal });
  window.levelx = app;

  try {
    await app.init();
  } catch (err) {
    const fatal = document.createElement('div');
    fatal.className = 'fatal';
    const h = document.createElement('h1');
    h.textContent = 'LEVEL X failed to start';
    const pre = document.createElement('pre');
    pre.textContent = (err as Error).message;
    const hint = document.createElement('p');
    hint.textContent = useReal
      ? 'Running inside the Even app. Recent log lines are below; share them when reporting this.'
      : 'No Even app host detected. Append ?mock=1 to the URL to run the offline mock.';
    const log = document.createElement('pre');
    log.textContent = app.diag
      .recent(12)
      .map((l) => `${l.level.toUpperCase()} [${l.tag}] ${l.message}`)
      .join('\n');
    fatal.append(h, pre, hint, log);
    root.replaceChildren(fatal);
    return;
  }

  mountControlPanel(root, app, mock);

  // Seed a few samples so the offline preview isn't blank before "Play".
  if (mock) {
    for (let i = 0; i < 6; i++) mock.emitImu(upVector(1.5, -0.7));
  }

  window.addEventListener('beforeunload', () => void app.shutdown());
}

void boot();
