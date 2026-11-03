// Tiny dependency-free PNG writer + raster canvas (zlib + CRC32 only).
// Used for the generated app icons and the demo shop's sample images.
import zlib from 'node:zlib';

// ---------- PNG encoding ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Predictor of PNG filter `f` for byte i (a = left, b = up, c = up-left). */
function predict(f, cur, prev, i, bpp) {
  if (f === 0) return 0;
  const a = i >= bpp ? cur[i - bpp] : 0;
  if (f === 1) return a;
  const b = prev[i];
  if (f === 2) return b;
  if (f === 3) return (a + b) >> 1;
  return paeth(a, b, i >= bpp ? prev[i - bpp] : 0);
}

/**
 * Writes row `cur` filtered with `f` into `o`; returns the sum of absolute
 * values, stopping early once it reaches `limit` (the row then cannot win).
 */
function filterRow(f, cur, prev, o, bpp, limit) {
  let sum = 0;
  for (let i = 0; i < cur.length && sum < limit; i++) {
    const v = (cur[i] - predict(f, cur, prev, i, bpp)) & 0xff;
    o[i] = v;
    sum += v < 128 ? v : 256 - v;
  }
  return sum;
}

/**
 * Encodes straight-alpha RGBA pixels (Uint8Array/Uint8ClampedArray, w*h*4)
 * as a PNG. `alpha: false` writes an opaque RGB image (smaller files).
 * `filters` = PNG row filters to try (0 none, 1 sub, 2 up, 3 average, 4 paeth);
 * fewer filters + a lower zlib `level` trade a little size for speed.
 */
export function encodePng(width, height, rgba, { alpha = true, filters = [0, 1, 2, 3, 4], level = 9 } = {}) {
  const bpp = alpha ? 4 : 3;
  const stride = width * bpp;
  const out = Buffer.alloc((stride + 1) * height);
  let prev = Buffer.alloc(stride);
  let cur = Buffer.alloc(stride);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    for (let x = 0, s = y * width * 4, d = 0; x < width; x++, s += 4) {
      cur[d++] = rgba[s];
      cur[d++] = rgba[s + 1];
      cur[d++] = rgba[s + 2];
      if (alpha) cur[d++] = rgba[s + 3];
    }
    // Adaptive filtering: pick the filter with the smallest sum of absolute values
    // (a candidate stops early once it can no longer win, so the winner is always complete).
    let best = filters[0];
    let bestSum = Infinity;
    for (const f of filters) {
      const sum = filterRow(f, cur, prev, cand[f], bpp, bestSum);
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    const rowStart = y * (stride + 1);
    out[rowStart] = best;
    cand[best].copy(out, rowStart + 1);
    [prev, cur] = [cur, prev];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = alpha ? 6 : 2; // colour type RGBA / RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(out, { level })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** '#rrggbb' -> [r, g, b] */
export function hexRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const mix = (c1, c2, t) => {
  const a = typeof c1 === 'string' ? hexRgb(c1) : c1;
  const b = typeof c2 === 'string' ? hexRgb(c2) : c2;
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
};

// ---------- 5x7 pixel font (uppercase, digits, basic punctuation) ----------
const GLYPHS = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110', D: '11100 10010 10001 10001 10001 10010 11100',
  E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110', J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 10001 01010 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111', 3: '11111 00010 00100 00010 00001 10001 01110',
  4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
  '-': '00000 00000 00000 11111 00000 00000 00000', '#': '01010 01010 11111 01010 11111 01010 01010',
  '.': '00000 00000 00000 00000 00000 01100 01100', ',': '00000 00000 00000 00000 01100 00100 01000',
  ':': '00000 01100 01100 00000 01100 01100 00000', '/': '00000 00001 00010 00100 01000 10000 00000',
  "'": '01100 00100 01000 00000 00000 00000 00000', '&': '01100 10010 10100 01000 10101 10010 01101',
  '(': '00010 00100 01000 01000 01000 00100 00010', ')': '01000 00100 00010 00010 00010 00100 01000',
  '+': '00000 00100 00100 11111 00100 00100 00000', ' ': '00000 00000 00000 00000 00000 00000 00000',
};
const FONT = Object.fromEntries(Object.entries(GLYPHS).map(([k, v]) => [k, v.split(' ')]));

// ---------- canvas ----------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Minimal RGBA raster with anti-aliased shapes (coverage from signed distance). */
export class Canvas {
  constructor(width, height, background) {
    this.w = width;
    this.h = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    if (background) this.rect(0, 0, width, height, background);
  }

  /** Source-over blend of one pixel (straight alpha). */
  plot(x, y, rgb, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    if (a >= 1) {
      d[i] = rgb[0];
      d[i + 1] = rgb[1];
      d[i + 2] = rgb[2];
      d[i + 3] = 255;
      return;
    }
    const da = d[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    for (let k = 0; k < 3; k++) d[i + k] = (rgb[k] * a + d[i + k] * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
  }

  /** Rounded rectangle; `r` may be 0. `color` is '#hex' or [r,g,b]. */
  roundRect(x, y, w, h, r, color, alpha = 1) {
    const rgb = typeof color === 'string' ? hexRgb(color) : color;
    r = Math.min(r, w / 2, h / 2);
    if (r <= 0 && Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(w) && Number.isInteger(h)) {
      // Pixel-aligned plain rectangle: no edge coverage needed.
      for (let py = Math.max(0, y); py < Math.min(this.h, y + h); py++) {
        for (let px = Math.max(0, x); px < Math.min(this.w, x + w); px++) this.plot(px, py, rgb, alpha);
      }
      return;
    }
    const cx = x + w / 2;
    const cy = y + h / 2;
    const hx = w / 2 - r;
    const hy = h / 2 - r;
    const x0 = Math.max(0, Math.floor(x));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y0 = Math.max(0, Math.floor(y));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) {
      const qy = Math.abs(py + 0.5 - cy) - hy;
      for (let px = x0; px < x1; px++) {
        const qx = Math.abs(px + 0.5 - cx) - hx;
        // Signed distance to the rounded rect (cheap branch for the inner box).
        const dist = qx <= 0 && qy <= 0 ? Math.max(qx, qy) - r : Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
        const cov = clamp01(0.5 - dist);
        if (cov > 0) this.plot(px, py, rgb, cov * alpha);
      }
    }
  }

  /**
   * Soft drop shadow of a rounded rect, fading out over `blur` px. The interior
   * is skipped (draw the shape itself on top), so this stays cheap.
   */
  shadow(x, y, w, h, r, blur, color, alpha) {
    const rgb = typeof color === 'string' ? hexRgb(color) : color;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const hx = w / 2 - r;
    const hy = h / 2 - r;
    const x0 = Math.max(0, Math.floor(x - blur));
    const x1 = Math.min(this.w, Math.ceil(x + w + blur));
    const y0 = Math.max(0, Math.floor(y - blur));
    const y1 = Math.min(this.h, Math.ceil(y + h + blur));
    for (let py = y0; py < y1; py++) {
      const inner = py > y + blur && py < y + h - blur;
      const qy = Math.abs(py + 0.5 - cy) - hy;
      for (let px = x0; px < x1; px++) {
        if (inner && px > x + blur && px < x + w - blur) px = Math.floor(x + w - blur);
        const qx = Math.abs(px + 0.5 - cx) - hx;
        const dist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
        const t = 1 - clamp01(dist / blur);
        if (t > 0) this.plot(px, py, rgb, alpha * t * t);
      }
    }
  }

  rect(x, y, w, h, color, alpha = 1) {
    this.roundRect(x, y, w, h, 0, color, alpha);
  }

  circle(cx, cy, r, color, alpha = 1) {
    const rgb = typeof color === 'string' ? hexRgb(color) : color;
    const x0 = Math.max(0, Math.floor(cx - r - 1));
    const x1 = Math.min(this.w, Math.ceil(cx + r + 1));
    const y0 = Math.max(0, Math.floor(cy - r - 1));
    const y1 = Math.min(this.h, Math.ceil(cy + r + 1));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const cov = clamp01(0.5 - (Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - r));
        if (cov > 0) this.plot(px, py, rgb, cov * alpha);
      }
    }
  }

  /** Vertical gradient from c1 (top) to c2 (bottom). */
  gradient(x, y, w, h, c1, c2) {
    for (let row = 0; row < h; row++) this.rect(x, y + row, w, 1, mix(c1, c2, h > 1 ? row / (h - 1) : 0));
  }

  /** Fills from the curve y = top(x) down to `bottom` (anti-aliased top edge). */
  area(top, bottom, color, alpha = 1) {
    const rgb = typeof color === 'string' ? hexRgb(color) : color;
    for (let px = 0; px < this.w; px++) {
      const t = top(px + 0.5);
      const start = Math.max(0, Math.floor(t));
      for (let py = start; py < Math.min(this.h, bottom); py++) {
        const cov = clamp01(py + 1 - t);
        if (cov > 0) this.plot(px, py, rgb, cov * alpha);
      }
    }
  }

  /** Width in px of `text` drawn with block size `s`. */
  static measure(text, s) {
    const n = String(text).length;
    return n ? n * 6 * s - s : 0;
  }

  /** Draws uppercase pixel-font text; align 'left' | 'center' | 'right'. Returns drawn width. */
  text(str, x, y, s, color, { align = 'left', alpha = 1 } = {}) {
    const text = String(str).toUpperCase();
    const width = Canvas.measure(text, s);
    let cx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    cx = Math.round(cx);
    y = Math.round(y);
    for (const ch of text) {
      const g = FONT[ch] || FONT[' '];
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (g[row][col] === '1') this.rect(cx + col * s, y + row * s, s, s, color, alpha);
        }
      }
      cx += 6 * s;
    }
    return width;
  }

  /** Fast encode (none/sub/up filters, zlib level 6) – fine for generated flat artwork. */
  toPng({ alpha = false } = {}) {
    return encodePng(this.w, this.h, this.data, { alpha, filters: [0, 1, 2], level: 6 });
  }
}
