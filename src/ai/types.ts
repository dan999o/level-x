/**
 * Optional AI assistant interfaces (Mode E).
 *
 * Everything here is PLUGGABLE and OFFLINE-SAFE: the core app never imports a
 * concrete provider, no API key ever lives in client code, and any failure is
 * swallowed so the offline level/reticle/angle features keep working.
 */

/** Pluggable speech-to-text. Implementations may call a server-side proxy. */
export interface SpeechToText {
  transcribe(pcm: Uint8Array, sampleHintHz?: number): Promise<string>;
}

/** Pluggable natural-language provider (e.g. a Claude-backed proxy). */
export interface AiProvider {
  /** Answer a short question given a compact textual context. */
  ask(prompt: string, context: string): Promise<string>;
}

export type AiCommandKind =
  | 'switchMode'
  | 'setZero'
  | 'hold'
  | 'release'
  | 'setReticle'
  | 'explain'
  | 'suggest'
  | 'unknown';

export interface AiCommand {
  kind: AiCommandKind;
  /** Resolved argument when relevant (mode id or reticle style). */
  arg?: string;
  /** The original utterance, for logging. */
  utterance: string;
}
