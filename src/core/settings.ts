/**
 * Settings & persistence.
 *
 * Persists a single JSON blob through the bridge's host-backed storage
 * (setItem/getItem). The core app never requires cloud or registration: if the
 * host storage is unavailable, an in-memory copy keeps the session working and
 * a browser `localStorage` fallback (when present) preserves it across reloads.
 * Unknown/missing fields are merged against defaults for forward-compatibility.
 */

import { ImuReportPace } from './../sdk/bridge-port.js';
import { type AxisMapping, DEFAULT_AXIS_MAPPING } from './math/orientation.js';
import type { CalibrationProfile } from './math/calibration.js';
import type { BridgePort } from '../sdk/bridge-port.js';

export type ModeId = 'level' | 'reticle' | 'photo' | 'angle';
export type ReticleStyle = 'crosshair' | 'dot' | 'circle' | 'fineline';
export type PhotoGuide = 'thirds' | 'horizon' | 'center' | 'symmetry' | 'portrait';

export interface LevelXSettings {
  activeMode: ModeId;
  level: {
    toleranceDeg: number;
  };
  reticle: {
    style: ReticleStyle;
    sizePx: number;
    offsetX: number;
    offsetY: number;
    showTilt: boolean;
  };
  photo: {
    guide: PhotoGuide;
  };
  imu: {
    pace: ImuReportPace;
    /** 0 = heavily smoothed, 1 = raw. */
    responsiveness: number;
  };
  display: {
    glow: boolean;
  };
  ai: {
    enabled: boolean;
    endpoint: string;
  };
  axisMapping: AxisMapping;
  calibration: CalibrationProfile | null;
}

export const DEFAULT_SETTINGS: LevelXSettings = {
  activeMode: 'level',
  level: { toleranceDeg: 0.5 },
  reticle: { style: 'crosshair', sizePx: 24, offsetX: 0, offsetY: 0, showTilt: true },
  photo: { guide: 'thirds' },
  imu: { pace: ImuReportPace.P200, responsiveness: 0.35 },
  display: { glow: false },
  ai: { enabled: false, endpoint: '' },
  axisMapping: DEFAULT_AXIS_MAPPING,
  calibration: null,
};

const STORAGE_KEY = 'levelx.settings.v1';

/** Deep-merge a partial parsed blob onto defaults, keeping types sane. */
export function mergeSettings(partial: unknown): LevelXSettings {
  const d = DEFAULT_SETTINGS;
  if (typeof partial !== 'object' || partial === null) return structuredClone(d);
  const p = partial as Record<string, unknown>;
  const obj = (k: string): Record<string, unknown> =>
    typeof p[k] === 'object' && p[k] !== null ? (p[k] as Record<string, unknown>) : {};
  const num = (v: unknown, fb: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const str = (v: unknown, fb: string): string => (typeof v === 'string' ? v : fb);
  const bool = (v: unknown, fb: boolean): boolean => (typeof v === 'boolean' ? v : fb);

  const level = obj('level');
  const reticle = obj('reticle');
  const photo = obj('photo');
  const imu = obj('imu');
  const display = obj('display');
  const ai = obj('ai');

  const paceRaw = num(imu['pace'], d.imu.pace);
  const pace = (Object.values(ImuReportPace) as number[]).includes(paceRaw)
    ? (paceRaw as ImuReportPace)
    : d.imu.pace;

  return {
    activeMode: (['level', 'reticle', 'photo', 'angle'] as const).includes(p['activeMode'] as ModeId)
      ? (p['activeMode'] as ModeId)
      : d.activeMode,
    level: { toleranceDeg: Math.max(0.1, num(level['toleranceDeg'], d.level.toleranceDeg)) },
    reticle: {
      style: (['crosshair', 'dot', 'circle', 'fineline'] as const).includes(reticle['style'] as ReticleStyle)
        ? (reticle['style'] as ReticleStyle)
        : d.reticle.style,
      sizePx: Math.max(4, num(reticle['sizePx'], d.reticle.sizePx)),
      offsetX: num(reticle['offsetX'], d.reticle.offsetX),
      offsetY: num(reticle['offsetY'], d.reticle.offsetY),
      showTilt: bool(reticle['showTilt'], d.reticle.showTilt),
    },
    photo: {
      guide: (['thirds', 'horizon', 'center', 'symmetry', 'portrait'] as const).includes(
        photo['guide'] as PhotoGuide,
      )
        ? (photo['guide'] as PhotoGuide)
        : d.photo.guide,
    },
    imu: { pace, responsiveness: Math.min(1, Math.max(0, num(imu['responsiveness'], d.imu.responsiveness))) },
    display: { glow: bool(display['glow'], d.display.glow) },
    ai: { enabled: bool(ai['enabled'], d.ai.enabled), endpoint: str(ai['endpoint'], d.ai.endpoint) },
    // Axis mapping and calibration are stored verbatim when present (they are
    // produced by our own code), else defaults.
    axisMapping:
      typeof p['axisMapping'] === 'object' && p['axisMapping'] !== null
        ? (p['axisMapping'] as AxisMapping)
        : d.axisMapping,
    calibration:
      typeof p['calibration'] === 'object' && p['calibration'] !== null
        ? (p['calibration'] as CalibrationProfile)
        : null,
  };
}

export class SettingsService {
  private current: LevelXSettings = structuredClone(DEFAULT_SETTINGS);
  private listeners = new Set<(s: LevelXSettings) => void>();

  constructor(private bridge: BridgePort) {}

  get value(): LevelXSettings {
    return this.current;
  }

  async load(): Promise<LevelXSettings> {
    let raw: string | null = null;
    try {
      raw = await this.bridge.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (raw === null) raw = readLocalFallback(STORAGE_KEY);
    if (raw) {
      try {
        this.current = mergeSettings(JSON.parse(raw));
      } catch {
        this.current = structuredClone(DEFAULT_SETTINGS);
      }
    }
    return this.current;
  }

  /** Replace settings with a merged update and persist. */
  async update(patch: Partial<LevelXSettings> | ((s: LevelXSettings) => LevelXSettings)): Promise<LevelXSettings> {
    const next = typeof patch === 'function' ? patch(structuredClone(this.current)) : { ...this.current, ...patch };
    this.current = mergeSettings(next);
    await this.persist();
    for (const l of [...this.listeners]) l(this.current);
    return this.current;
  }

  private async persist(): Promise<void> {
    const raw = JSON.stringify(this.current);
    writeLocalFallback(STORAGE_KEY, raw);
    try {
      await this.bridge.setItem(STORAGE_KEY, raw);
    } catch {
      /* host storage unavailable; local fallback already written */
    }
  }

  onChange(cb: (s: LevelXSettings) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  exportJson(): string {
    return JSON.stringify(this.current, null, 2);
  }

  async importJson(json: string): Promise<LevelXSettings> {
    this.current = mergeSettings(JSON.parse(json));
    await this.persist();
    for (const l of [...this.listeners]) l(this.current);
    return this.current;
  }
}

function readLocalFallback(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch {
    /* ignore */
  }
  return null;
}

function writeLocalFallback(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
