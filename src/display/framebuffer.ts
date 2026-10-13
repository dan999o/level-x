/**
 * Monochrome grayscale framebuffer for glasses image containers.
 *
 * Storage is one byte per pixel (0..255), row-major, which maps onto the G2's
 * green monochrome display. The host converts to gray4 (16 levels) and
 * LZ4-compresses, so we hand it plain grayscale bytes via `toBytes()`.
 *
 * ASSUMPTION (see SDK_RESEARCH.md §5, HARDWARE_TEST_PLAN.md): the exact byte
 * layout the host expects for `updateImageRawData` is not documented beyond
 * "grayscale bytes". `toBytes('gray8')` emits one byte/pixel; `toBytes('gray4')`
 * emits packed 4-bit pairs. gray8 is the default and the format to verify first.
 *
 * SDK image-container limits are enforced here so we never build a bitmap the
 * firmware will reject: width 20..288, height 20..144.
 */

export const IMG_MIN_W = 20;
export const IMG_MAX_W = 288;
export const IMG_MIN_H = 20;
export const IMG_MAX_H = 144;

export const BLACK = 0;
export const WHITE = 255;

export type GrayFormat = 'gray8' | 'gray4';

export class Framebuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      throw new RangeError('framebuffer dimensions must be integers');
    }
    if (width < IMG_MIN_W || width > IMG_MAX_W) {
      throw new RangeError(`width ${width} out of SDK range ${IMG_MIN_W}..${IMG_MAX_W}`);
    }
    if (height < IMG_MIN_H || height > IMG_MAX_H) {
      throw new RangeError(`height ${height} out of SDK range ${IMG_MIN_H}..${IMG_MAX_H}`);
    }
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height);
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  clear(level = BLACK): this {
    this.data.fill(level & 0xff);
    return this;
  }

  set(x: number, y: number, v = WHITE): this {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (this.inBounds(xi, yi)) this.data[yi * this.width + xi] = v & 0xff;
    return this;
  }

  get(x: number, y: number): number {
    return this.inBounds(x, y) ? this.data[y * this.width + x]! : 0;
  }

  hLine(x0: number, x1: number, y: number, v = WHITE): this {
    const [a, b] = x0 <= x1 ? [x0, x1] : [x1, x0];
    for (let x = Math.round(a); x <= Math.round(b); x++) this.set(x, y, v);
    return this;
  }

  vLine(x: number, y0: number, y1: number, v = WHITE): this {
    const [a, b] = y0 <= y1 ? [y0, y1] : [y1, y0];
    for (let y = Math.round(a); y <= Math.round(b); y++) this.set(x, y, v);
    return this;
  }

  /** Bresenham line. */
  line(x0: number, y0: number, x1: number, y1: number, v = WHITE): this {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const xe = Math.round(x1);
    const ye = Math.round(y1);
    const dx = Math.abs(xe - x);
    const dy = -Math.abs(ye - y);
    const sx = x < xe ? 1 : -1;
    const sy = y < ye ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x, y, v);
      if (x === xe && y === ye) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    return this;
  }

  /** Rectangle outline. */
  rect(x: number, y: number, w: number, h: number, v = WHITE): this {
    this.hLine(x, x + w - 1, y, v);
    this.hLine(x, x + w - 1, y + h - 1, v);
    this.vLine(x, y, y + h - 1, v);
    this.vLine(x + w - 1, y, y + h - 1, v);
    return this;
  }

  /** Midpoint circle outline centered at (cx, cy). */
  circle(cx: number, cy: number, r: number, v = WHITE): this {
    if (r <= 0) return this.set(cx, cy, v);
    let x = r;
    let y = 0;
    let err = 1 - r;
    while (x >= y) {
      for (const [px, py] of [
        [cx + x, cy + y],
        [cx + y, cy + x],
        [cx - y, cy + x],
        [cx - x, cy + y],
        [cx - x, cy - y],
        [cx - y, cy - x],
        [cx + y, cy - x],
        [cx + x, cy - y],
      ] as const) {
        this.set(px, py, v);
      }
      y++;
      if (err < 0) err += 2 * y + 1;
      else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
    return this;
  }

  /** Centered crosshair with an optional center gap. */
  crosshair(cx: number, cy: number, size: number, gap = 0, v = WHITE): this {
    if (gap > 0) {
      this.hLine(cx - size, cx - gap, cy, v);
      this.hLine(cx + gap, cx + size, cy, v);
      this.vLine(cx, cy - size, cy - gap, v);
      this.vLine(cx, cy + gap, cy + size, v);
    } else {
      this.hLine(cx - size, cx + size, cy, v);
      this.vLine(cx, cy - size, cy + size, v);
    }
    return this;
  }

  /** A filled square "dot" of half-extent r. */
  dot(cx: number, cy: number, r = 1, v = WHITE): this {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) this.set(cx + dx, cy + dy, v);
    return this;
  }

  /** Serialize to the grayscale byte array the bridge expects. */
  toBytes(format: GrayFormat = 'gray8'): number[] {
    if (format === 'gray8') return Array.from(this.data);
    // gray4: two pixels per byte, high nibble first. Pixel 0..255 -> 0..15.
    const out: number[] = [];
    for (let i = 0; i < this.data.length; i += 2) {
      const hi = (this.data[i]! >> 4) & 0x0f;
      const lo = (((this.data[i + 1] ?? 0) as number) >> 4) & 0x0f;
      out.push((hi << 4) | lo);
    }
    return out;
  }
}
