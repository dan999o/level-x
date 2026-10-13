/**
 * Mode E — optional voice assistant (EXPERIMENTAL).
 *
 * Design guarantees:
 *  - Explicit activation only: the mic is opened via bridge.audioControl on a
 *    deliberate start call, and a recording flag is exposed for a UI indicator.
 *  - Offline-safe: control commands are parsed locally; a missing STT/provider
 *    only disables open-ended Q&A, never the core app.
 *  - No secrets client-side: STT/AiProvider implementations are expected to call
 *    a server-side proxy. See AI_INTEGRATION.md.
 *  - Failures are contained: every async step is guarded so an AI error can
 *    never break leveling/reticle/angle.
 */

import type { BridgePort, EvenHubEvent, Unsubscribe, AudioInputSource } from '../sdk/bridge-port.js';
import type { Diagnostics } from '../core/diagnostics.js';
import type { AppController } from '../core/app-controller.js';
import { parseCommand } from './command-parser.js';
import type { SpeechToText, AiProvider, AiCommand } from './types.js';
import type { ModeId, ReticleStyle } from '../core/settings.js';
import { fmtSignedDeg } from '../core/format.js';

export interface AssistantDeps {
  stt?: SpeechToText;
  provider?: AiProvider;
}

export class VoiceAssistant {
  private recording = false;
  private sub: Unsubscribe | null = null;
  private chunks: number[] = [];
  private replyListeners = new Set<(text: string) => void>();

  constructor(
    private bridge: BridgePort,
    private app: AppController,
    private diag: Diagnostics,
    private deps: AssistantDeps = {},
  ) {}

  get isRecording(): boolean {
    return this.recording;
  }

  onReply(cb: (text: string) => void): () => void {
    this.replyListeners.add(cb);
    return () => this.replyListeners.delete(cb);
  }

  private reply(text: string): void {
    this.diag.info('ai', `reply: ${text}`);
    for (const l of [...this.replyListeners]) l(text);
  }

  /** Begin capturing audio from the chosen source (explicit user action). */
  async startListening(source: AudioInputSource): Promise<boolean> {
    if (this.recording) return true;
    this.chunks = [];
    this.sub = this.bridge.onEvent((e) => this.collect(e));
    const ok = await this.bridge.setAudio(true, source).catch(() => false);
    this.recording = ok;
    if (!ok) {
      this.sub?.();
      this.sub = null;
      this.diag.warn('ai', 'microphone could not be opened');
    } else {
      this.diag.info('ai', `listening (${source})`);
    }
    return ok;
  }

  private collect(e: EvenHubEvent): void {
    const pcm = e.audioEvent?.audioPcm;
    if (pcm) for (const b of pcm) this.chunks.push(b);
  }

  /** Stop capturing, transcribe (if STT present), and execute the command. */
  async stopAndProcess(): Promise<string> {
    if (!this.recording) return '';
    this.recording = false;
    this.sub?.();
    this.sub = null;
    await this.bridge.setAudio(false).catch(() => undefined);

    if (!this.deps.stt) {
      const msg = 'speech-to-text not configured';
      this.diag.warn('ai', msg);
      return msg;
    }
    try {
      const text = await this.deps.stt.transcribe(new Uint8Array(this.chunks));
      return await this.handleText(text);
    } catch (err) {
      this.diag.error('ai', `processing failed: ${(err as Error).message}`);
      return 'sorry, I could not process that';
    }
  }

  /** Execute a command from already-transcribed text (also used by the panel). */
  async handleText(text: string): Promise<string> {
    const cmd = parseCommand(text);
    this.diag.info('ai', `heard "${text}" -> ${cmd.kind}${cmd.arg ? ':' + cmd.arg : ''}`);
    const reply = await this.execute(cmd);
    this.reply(reply);
    return reply;
  }

  private async execute(cmd: AiCommand): Promise<string> {
    switch (cmd.kind) {
      case 'switchMode': {
        if (cmd.arg) {
          await this.app.applySettings({ activeMode: cmd.arg as ModeId });
          return `switched to ${cmd.arg} mode`;
        }
        this.app.trigger('switchMode');
        return `switched to ${this.app.activeModeId()} mode`;
      }
      case 'setZero':
        await this.app.applySettings({ activeMode: 'angle' });
        this.app.trigger('toggleHold');
        return 'zero set';
      case 'hold':
        this.app.trigger('toggleHold');
        return 'holding';
      case 'release':
        this.app.trigger('toggleHold');
        return 'released';
      case 'setReticle':
        await this.app.applySettings({
          activeMode: 'reticle',
          reticle: { ...this.app.settings.value.reticle, ...(cmd.arg ? { style: cmd.arg as ReticleStyle } : {}) },
        });
        return `reticle ${cmd.arg ?? this.app.settings.value.reticle.style}`;
      case 'explain': {
        const o = this.app.status.lastOrientation;
        if (!o) return 'no reading yet';
        return `roll ${fmtSignedDeg(o.rollDeg)}, pitch ${fmtSignedDeg(o.pitchDeg)}, ${o.stable ? 'steady' : 'moving'}`;
      }
      case 'suggest':
        return this.suggestMode();
      default:
        // Fall back to the provider for anything the grammar can't resolve.
        if (this.deps.provider) {
          try {
            return await this.deps.provider.ask(cmd.utterance, this.contextString());
          } catch {
            return 'the assistant is unavailable right now';
          }
        }
        return "sorry, I didn't understand";
    }
  }

  private suggestMode(): string {
    const o = this.app.status.lastOrientation;
    if (o && Math.abs(o.rollDeg) > 10) return 'try Smart Level to bring it back to horizontal';
    return 'Smart Level for leveling, Reticle for aiming, Photography for composition, Angle for relative measurements';
  }

  private contextString(): string {
    const o = this.app.status.lastOrientation;
    const mode = this.app.activeModeId();
    return o
      ? `mode=${mode} roll=${o.rollDeg.toFixed(1)} pitch=${o.pitchDeg.toFixed(1)} tilt=${o.tiltDeg.toFixed(1)} stable=${o.stable}`
      : `mode=${mode} no-reading`;
  }

  dispose(): void {
    this.sub?.();
    this.sub = null;
    this.replyListeners.clear();
  }
}
