/**
 * Offline intent parser for voice/text commands. Pure and fully testable; it
 * runs locally with no network so basic control works even without an AI
 * provider. The optional AiProvider is only consulted for open-ended questions
 * ("explain", "suggest") that this grammar cannot resolve.
 */

import type { AiCommand } from './types.js';
import type { ModeId, ReticleStyle } from '../core/settings.js';

const MODE_WORDS: Record<string, ModeId> = {
  level: 'level',
  leveling: 'level',
  reticle: 'reticle',
  crosshair: 'reticle',
  sight: 'reticle',
  photo: 'photo',
  photography: 'photo',
  composition: 'photo',
  grid: 'photo',
  angle: 'angle',
};

const RETICLE_WORDS: Record<string, ReticleStyle> = {
  crosshair: 'crosshair',
  cross: 'crosshair',
  dot: 'dot',
  circle: 'circle',
  ring: 'circle',
  fine: 'fineline',
  fineline: 'fineline',
  line: 'fineline',
};

function firstMatch<T>(text: string, table: Record<string, T>): T | undefined {
  for (const [word, val] of Object.entries(table)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return val;
  }
  return undefined;
}

/** Parse an utterance into a structured command. Never throws. */
export function parseCommand(utterance: string): AiCommand {
  const text = utterance.toLowerCase().trim();

  if (/\b(set|reset|zero)\b.*\bzero\b|^zero$|\bset zero\b/.test(text)) {
    return { kind: 'setZero', utterance };
  }
  if (/\b(hold|freeze|lock)\b/.test(text)) return { kind: 'hold', utterance };
  if (/\b(release|unlock|resume|unfreeze)\b/.test(text)) return { kind: 'release', utterance };

  if (/\b(reticle|crosshair|sight)\b/.test(text) && /\b(change|set|switch|use|make)\b/.test(text)) {
    const style = firstMatch(text, RETICLE_WORDS);
    return { kind: 'setReticle', utterance, ...(style ? { arg: style } : {}) };
  }

  if (/\b(switch|change|go|set)\b.*\bmode\b|\bswitch to\b|\bchange to\b/.test(text)) {
    const mode = firstMatch(text, MODE_WORDS);
    return { kind: 'switchMode', utterance, ...(mode ? { arg: mode } : {}) };
  }
  // A bare mode word like "photography grid" also switches.
  const bareMode = firstMatch(text, MODE_WORDS);
  if (bareMode && /\b(mode|grid|view)\b/.test(text)) {
    return { kind: 'switchMode', utterance, arg: bareMode };
  }

  if (/\bhow (far|much)\b.*\b(off|level|tilt|angle)\b|\bam i level\b|\bwhat.*(angle|tilt)\b/.test(text)) {
    return { kind: 'explain', utterance };
  }
  if (/\b(which|what|suggest|recommend|best)\b.*\bmode\b/.test(text)) {
    return { kind: 'suggest', utterance };
  }

  return { kind: 'unknown', utterance };
}
