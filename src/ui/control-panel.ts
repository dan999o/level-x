/**
 * Companion control panel (phone WebView UI).
 *
 * The same page that drives the glasses also hosts this panel. It works on a
 * real device (buttons drive the controller, which drives the glasses) and in a
 * plain browser against the MockBridge, where it additionally offers an IMU
 * stream simulator, a gesture injector, and a live preview of the glasses
 * overlay. No cloud, no registration.
 */

import { ImuReportPace, OsEventTypeList, EventSourceType } from '@evenrealities/even_hub_sdk';
import type { AppController } from '../core/app-controller.js';
import type { OrientationState } from '../core/mode-manager.js';
import type { MockBridge } from '../sdk/mock-bridge.js';
import type { ReticleStyle, PhotoGuide } from '../core/settings.js';
import {
  type ImuStream,
  stationaryStream,
  headTiltStream,
  rapidMovementStream,
  noisyStream,
  calibrationStream,
  upVector,
} from '../sdk/sim-streams.js';

type Child = Node | string;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props as Record<string, unknown> & { class?: string };
  if (cls) node.className = cls;
  Object.assign(node, rest);
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

const STREAMS: Record<string, () => ImuStream> = {
  stationary: () => stationaryStream(1.5, -0.7),
  'head tilt': () => headTiltStream(20, 6),
  rapid: () => rapidMovementStream(),
  noisy: () => noisyStream(0, 0, 0.03),
  calibration: () => calibrationStream(1.0),
};

export function mountControlPanel(root: HTMLElement, app: AppController, mock?: MockBridge): void {
  root.innerHTML = '';
  const s = app.settings.value;

  // --- status / connection ---
  const devEl = el('span', { class: 'val' }, ['—']);
  const runEl = el('span', { class: 'val' }, ['—']);
  const ringEl = el('span', { class: 'val' }, ['—']);
  const calEl = el('span', { class: 'val' }, ['—']);
  const statusCard = card('Connection', [
    row('Device', devEl),
    row('Running', runEl),
    row('R1 ring', ringEl),
    row('Calibration', calEl),
  ]);

  // --- live orientation + preview ---
  const rollEl = el('span', { class: 'big' }, ['0.0°']);
  const pitchEl = el('span', { class: 'big' }, ['0.0°']);
  const tiltEl = el('span', { class: 'big' }, ['0.0°']);
  const steadyEl = el('span', { class: 'pill' }, ['—']);
  const rateEl = el('span', { class: 'val' }, ['0 Hz']);
  const preview = el('canvas', { class: 'preview', width: 288, height: 144 });
  const pctx = preview.getContext('2d')!;
  const liveCard = card('Orientation', [
    el('div', { class: 'grid3' }, [stat('Roll', rollEl), stat('Pitch', pitchEl), stat('Tilt', tiltEl)]),
    el('div', { class: 'statusline' }, [steadyEl, el('span', { class: 'val' }, ['rate ']), rateEl]),
    el('div', { class: 'previewwrap' }, [preview]),
  ]);

  // --- modes ---
  const modeBtns = app.modeList().map((m) =>
    el('button', { class: 'mode', onclick: () => void app.applySettings({ activeMode: m.id as never }) }, [m.title]),
  );
  const modeCard = card('Mode', [el('div', { class: 'btnrow' }, modeBtns)]);

  // --- actions ---
  const actionCard = card('Actions', [
    el('div', { class: 'btnrow' }, [
      el('button', { onclick: () => app.trigger('toggleHold') }, ['Hold / Release']),
      el('button', { onclick: () => app.trigger('switchMode') }, ['Next mode']),
      el('button', { class: 'primary', onclick: () => app.commitCalibration() }, ['Calibrate']),
      el('button', { onclick: () => app.clearCalibration() }, ['Clear cal']),
    ]),
  ]);

  // --- settings ---
  const tol = slider(0.1, 10, 0.1, s.level.toleranceDeg, (v) => app.applySettings({ level: { toleranceDeg: v } }));
  const resp = slider(0, 1, 0.01, s.imu.responsiveness, (v) =>
    app.applySettings({ imu: { pace: app.settings.value.imu.pace, responsiveness: v } }),
  );
  const paceSel = select(
    Object.values(ImuReportPace).filter((v) => typeof v === 'number') as number[],
    s.imu.pace,
    (v) => app.applySettings({ imu: { pace: v as ImuReportPace, responsiveness: app.settings.value.imu.responsiveness } }),
  );
  const reticleStyle = select<ReticleStyle>(['crosshair', 'dot', 'circle', 'fineline'], s.reticle.style, (v) =>
    app.applySettings({ reticle: { ...app.settings.value.reticle, style: v } }),
  );
  const reticleSize = slider(4, 60, 1, s.reticle.sizePx, (v) =>
    app.applySettings({ reticle: { ...app.settings.value.reticle, sizePx: v } }),
  );
  const photoGuide = select<PhotoGuide>(['thirds', 'horizon', 'center', 'symmetry', 'portrait'], s.photo.guide, (v) =>
    app.applySettings({ photo: { guide: v } }),
  );
  const settingsCard = card('Settings', [
    row('Level tolerance (°)', tol.wrap),
    row('Responsiveness', resp.wrap),
    row('IMU pace code', paceSel),
    row('Reticle style', reticleStyle),
    row('Reticle size (px)', reticleSize.wrap),
    row('Photo guide', photoGuide),
  ]);

  // --- diagnostics ---
  const perfEl = el('pre', { class: 'perf' }, ['—']);
  const logEl = el('pre', { class: 'log' }, ['']);
  const diagCard = card('Diagnostics', [perfEl, logEl]);

  // --- import / export ---
  const io = el('textarea', { class: 'io', rows: 5 });
  const ioCard = card('Settings import / export', [
    io,
    el('div', { class: 'btnrow' }, [
      el('button', { onclick: () => (io.value = app.settings.exportJson()) }, ['Export']),
      el('button', {
        onclick: () => {
          void app.settings.importJson(io.value).then(() => mountControlPanel(root, app, mock));
        },
      }, ['Import']),
    ]),
  ]);

  // --- simulator (mock only) ---
  const cards = [statusCard, liveCard, modeCard, actionCard, settingsCard];
  if (mock) cards.push(buildSimulator(mock));
  cards.push(diagCard, ioCard);

  root.append(el('h1', {}, ['LEVEL X']), el('p', { class: 'sub' }, ['Even G2 alignment · reticle · composition · angle']), ...cards);

  // --- live updates ---
  const paint = (o: OrientationState) => {
    rollEl.textContent = `${o.rollDeg.toFixed(1)}°`;
    pitchEl.textContent = `${o.pitchDeg.toFixed(1)}°`;
    tiltEl.textContent = `${o.tiltDeg.toFixed(1)}°`;
    steadyEl.textContent = o.stable ? 'STEADY' : 'MOVING';
    steadyEl.className = `pill ${o.stable ? 'ok' : 'warn'}`;
    rateEl.textContent = `${o.rateHz.toFixed(1)} Hz`;
  };
  app.onState(paint);

  const renderPreview = () => {
    const f = app.getPreview();
    const img = pctx.createImageData(f.width, f.height);
    for (let i = 0; i < f.data.length; i++) {
      const g = f.data[i]!;
      img.data[i * 4] = 0;
      img.data[i * 4 + 1] = g; // green monochrome
      img.data[i * 4 + 2] = 0;
      img.data[i * 4 + 3] = 255;
    }
    pctx.putImageData(img, 0, 0);
  };

  const refresh = () => {
    const st = app.status;
    devEl.textContent = st.deviceModel ?? 'offline (mock)';
    runEl.textContent = st.running ? 'yes' : 'no';
    const perf = app.perf;
    ringEl.textContent = perf.ringSeen ? 'detected' : 'not seen';
    calEl.textContent = perf.hasCalibration ? 'set' : 'none';
    perfEl.textContent = [
      `fps(avg push)  frames=${perf.display.framesPushed} dropped=${perf.display.framesDropped}`,
      `text=${perf.display.textPushed} failures=${perf.display.failures}`,
      `latency=${perf.display.latencyMs}ms  minInterval=${perf.display.minIntervalMs}ms`,
      `imu rate=${(st.lastOrientation?.rateHz ?? 0).toFixed(1)}Hz running=${perf.imuRunning}`,
    ].join('\n');
    logEl.textContent = app.diag
      .recent(14)
      .map((l) => `${new Date(l.t).toLocaleTimeString()} ${l.level.toUpperCase()} [${l.tag}] ${l.message}`)
      .join('\n');
    renderPreview();
  };
  refresh();
  setInterval(refresh, 300);

  // highlight active mode button
  const markActive = () => {
    const active = app.activeModeId();
    app.modeList().forEach((m, i) => modeBtns[i]!.classList.toggle('active', m.id === active));
  };
  markActive();
  setInterval(markActive, 300);
}

function buildSimulator(mock: MockBridge): HTMLElement {
  let timer: ReturnType<typeof setInterval> | null = null;
  let t = 0;
  let stream: ImuStream = STREAMS['stationary']!();

  const streamSel = select(Object.keys(STREAMS), 'stationary', (k) => {
    stream = STREAMS[k]!();
    t = 0;
  });

  const play = el('button', { class: 'primary' }, ['▶ Play']);
  play.onclick = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      play.textContent = '▶ Play';
    } else {
      timer = setInterval(() => {
        t += 0.05;
        mock.emitImu(stream(t));
      }, 50);
      play.textContent = '⏸ Pause';
    }
  };

  // manual pose sliders (emit a single sample)
  const emitManual = (p: number, r: number) => mock.emitImu(upVector(p, r));
  const mp = slider(-60, 60, 1, 0, () => emitManual(+mp.input.value, +mr.input.value));
  const mr = slider(-60, 60, 1, 0, () => emitManual(+mp.input.value, +mr.input.value));

  const gest = (label: string, evt: OsEventTypeList, src = EventSourceType.TOUCH_EVENT_FROM_GLASSES_R) =>
    el('button', { onclick: () => mock.emitInput(evt, src) }, [label]);

  return card('Simulator (mock hardware)', [
    row('IMU stream', streamSel),
    el('div', { class: 'btnrow' }, [play]),
    row('Manual pitch', mp.wrap),
    row('Manual roll', mr.wrap),
    el('div', { class: 'label' }, ['Inject gestures']),
    el('div', { class: 'btnrow' }, [
      gest('Click', OsEventTypeList.CLICK_EVENT),
      gest('Double', OsEventTypeList.DOUBLE_CLICK_EVENT),
      gest('Long', OsEventTypeList.LONG_PRESS_EVENT),
      gest('Long↑', OsEventTypeList.LONG_PRESS_RELEASE_EVENT),
      gest('Scroll↑', OsEventTypeList.SCROLL_TOP_EVENT),
      gest('Scroll↓', OsEventTypeList.SCROLL_BOTTOM_EVENT),
      gest('Ring click', OsEventTypeList.CLICK_EVENT, EventSourceType.TOUCH_EVENT_FROM_RING),
    ]),
  ]);
}

// --- tiny DOM helpers ---
function card(title: string, children: Child[]): HTMLElement {
  return el('section', { class: 'card' }, [el('h2', {}, [title]), ...children]);
}
function row(label: string, control: Node): HTMLElement {
  return el('label', { class: 'rowline' }, [el('span', { class: 'label' }, [label]), control]);
}
function stat(label: string, valueEl: Node): HTMLElement {
  return el('div', { class: 'stat' }, [el('div', { class: 'label' }, [label]), valueEl]);
}
function slider(
  min: number,
  max: number,
  step: number,
  value: number,
  onInput: (v: number) => void,
): { wrap: HTMLElement; input: HTMLInputElement } {
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  const out = el('span', { class: 'out' }, [String(value)]);
  input.oninput = () => {
    out.textContent = (+input.value).toString();
    onInput(+input.value);
  };
  return { wrap: el('span', { class: 'sliderwrap' }, [input, out]), input };
}
function select<T extends string | number>(options: T[], value: T, onChange: (v: T) => void): HTMLSelectElement {
  const sel = el('select', {});
  for (const o of options) sel.append(el('option', { value: String(o), selected: o === value }, [String(o)]));
  sel.onchange = () => {
    const raw = sel.value;
    const num = Number(raw);
    onChange((typeof value === 'number' && !Number.isNaN(num) ? (num as T) : (raw as T)));
  };
  return sel;
}
