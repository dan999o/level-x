import { describe, it, expect } from 'vitest';
import { Framebuffer, WHITE } from '../src/display/framebuffer.js';

describe('Framebuffer', () => {
  it('rejects out-of-range dimensions', () => {
    expect(() => new Framebuffer(10, 50)).toThrow();
    expect(() => new Framebuffer(300, 50)).toThrow();
    expect(() => new Framebuffer(100, 200)).toThrow();
    expect(() => new Framebuffer(100.5, 50)).toThrow();
  });

  it('allocates width*height bytes and clears', () => {
    const fb = new Framebuffer(288, 144);
    expect(fb.data.length).toBe(288 * 144);
    fb.clear(0);
    expect(fb.data.every((b) => b === 0)).toBe(true);
  });

  it('sets and reads a pixel; ignores out of bounds', () => {
    const fb = new Framebuffer(64, 32);
    fb.set(10, 5, 200);
    expect(fb.get(10, 5)).toBe(200);
    fb.set(-1, -1, 255); // no throw
    fb.set(999, 999, 255);
    expect(fb.get(0, 0)).toBe(0);
  });

  it('draws a horizontal line of the expected length', () => {
    const fb = new Framebuffer(64, 32);
    fb.hLine(5, 15, 10, WHITE);
    let count = 0;
    for (let x = 0; x < 64; x++) if (fb.get(x, 10) === WHITE) count++;
    expect(count).toBe(11);
  });

  it('crosshair with a gap leaves the center clear', () => {
    const fb = new Framebuffer(64, 64);
    fb.crosshair(32, 32, 10, 3, WHITE);
    expect(fb.get(32, 32)).toBe(0); // gap
    expect(fb.get(32 - 10, 32)).toBe(WHITE);
    expect(fb.get(32, 32 - 10)).toBe(WHITE);
  });

  it('circle paints pixels roughly r from the center', () => {
    const fb = new Framebuffer(64, 64);
    fb.circle(32, 32, 10, WHITE);
    expect(fb.get(42, 32)).toBe(WHITE);
    expect(fb.get(32, 42)).toBe(WHITE);
    expect(fb.get(32, 32)).toBe(0);
  });

  it('toBytes gray8 is one byte per pixel', () => {
    const fb = new Framebuffer(20, 20);
    expect(fb.toBytes('gray8').length).toBe(400);
  });

  it('toBytes gray4 packs two pixels per byte', () => {
    const fb = new Framebuffer(20, 20);
    expect(fb.toBytes('gray4').length).toBe(200);
  });

  it('gray4 packs high/low nibbles from 8-bit levels', () => {
    const fb = new Framebuffer(20, 20);
    fb.set(0, 0, 0xff); // -> nibble 0x0f
    fb.set(1, 0, 0x00); // -> nibble 0x00
    expect(fb.toBytes('gray4')[0]).toBe(0xf0);
  });
});
