import { describe, it, expect } from 'vitest';
import { parseCommand } from '../src/ai/command-parser.js';

describe('parseCommand', () => {
  it('switches mode by name', () => {
    expect(parseCommand('switch to level mode')).toMatchObject({ kind: 'switchMode', arg: 'level' });
    expect(parseCommand('change to photography grid')).toMatchObject({ kind: 'switchMode', arg: 'photo' });
    expect(parseCommand('go to angle mode')).toMatchObject({ kind: 'switchMode', arg: 'angle' });
  });

  it('handles set zero', () => {
    expect(parseCommand('set zero').kind).toBe('setZero');
    expect(parseCommand('zero').kind).toBe('setZero');
  });

  it('handles hold and release', () => {
    expect(parseCommand('hold this angle').kind).toBe('hold');
    expect(parseCommand('freeze').kind).toBe('hold');
    expect(parseCommand('release').kind).toBe('release');
    expect(parseCommand('resume').kind).toBe('release');
  });

  it('changes reticle style', () => {
    expect(parseCommand('change to the dot reticle')).toMatchObject({ kind: 'setReticle', arg: 'dot' });
    expect(parseCommand('set the circle reticle')).toMatchObject({ kind: 'setReticle', arg: 'circle' });
  });

  it('recognizes explain questions', () => {
    expect(parseCommand('how far off level am i').kind).toBe('explain');
    expect(parseCommand('what is my tilt').kind).toBe('explain');
  });

  it('recognizes suggest questions', () => {
    expect(parseCommand('which mode should i use').kind).toBe('suggest');
  });

  it('returns unknown for gibberish', () => {
    expect(parseCommand('banana helicopter').kind).toBe('unknown');
  });

  it('never throws on odd input', () => {
    expect(() => parseCommand('')).not.toThrow();
    expect(parseCommand('').kind).toBe('unknown');
  });
});
