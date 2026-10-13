/**
 * Lightweight diagnostics: a bounded in-memory ring buffer of timestamped log
 * lines plus named counters/gauges, surfaced in the control panel. No I/O, so
 * it is safe on glasses (no console spam over the bridge) and in tests.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  t: number;
  level: LogLevel;
  tag: string;
  message: string;
}

export interface DiagnosticsOptions {
  capacity?: number;
  /** Mirror warn/error to console (off by default; on in dev). */
  mirrorConsole?: boolean;
}

export class Diagnostics {
  private buf: LogEntry[] = [];
  private readonly capacity: number;
  private readonly mirror: boolean;
  private gauges = new Map<string, number>();
  private listeners = new Set<(e: LogEntry) => void>();

  constructor(opts: DiagnosticsOptions = {}) {
    this.capacity = Math.max(16, opts.capacity ?? 300);
    this.mirror = opts.mirrorConsole ?? false;
  }

  log(level: LogLevel, tag: string, message: string): void {
    const e: LogEntry = { t: Date.now(), level, tag, message };
    this.buf.push(e);
    if (this.buf.length > this.capacity) this.buf.shift();
    if (this.mirror && (level === 'warn' || level === 'error')) {
      // eslint-disable-next-line no-console
      console[level](`[${tag}] ${message}`);
    }
    for (const l of [...this.listeners]) l(e);
  }

  debug(tag: string, m: string): void {
    this.log('debug', tag, m);
  }
  info(tag: string, m: string): void {
    this.log('info', tag, m);
  }
  warn(tag: string, m: string): void {
    this.log('warn', tag, m);
  }
  error(tag: string, m: string): void {
    this.log('error', tag, m);
  }

  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  getGauge(name: string): number | undefined {
    return this.gauges.get(name);
  }

  snapshotGauges(): Record<string, number> {
    return Object.fromEntries(this.gauges);
  }

  recent(count = 50): LogEntry[] {
    return this.buf.slice(-count);
  }

  onLog(cb: (e: LogEntry) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  clear(): void {
    this.buf = [];
  }
}
