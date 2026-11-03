// Generates the PWA / favicon icons in public/icons/ from the PrintDesk mark
// (same geometry as logoMark() in src/views/components.js, viewBox 64).
// Pure Node: supersampled rasteriser + the zlib/CRC32 PNG writer in src/lib/png.js.
//   node scripts/make-icons.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, hexRgb } from '../src/lib/png.js';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const INK = '#0b1220';
const TILE = { x: 0, y: 0, w: 64, h: 64, r: 16, color: INK };
const STRIPES = [
  { x: 14, y: 14, w: 8, h: 36, r: 4, color: '#00aeef' },
  { x: 25, y: 14, w: 8, h: 36, r: 4, color: '#ec008c' },
  { x: 36, y: 14, w: 8, h: 36, r: 4, color: '#ffd200' },
  { x: 47, y: 14, w: 4, h: 36, r: 2, color: '#ffffff', opacity: 0.9 },
];

const inRoundRect = (u, v, s) => {
  if (u < s.x || v < s.y || u > s.x + s.w || v > s.y + s.h) return false;
  const dx = Math.max(s.x + s.r - u, 0, u - (s.x + s.w - s.r));
  const dy = Math.max(s.y + s.r - v, 0, v - (s.y + s.h - s.r));
  return dx * dx + dy * dy <= s.r * s.r;
};

/** Scales shapes around the centre of the 64-unit box. */
const scaled = (shapes, k) =>
  shapes.map((s) => ({ ...s, x: 32 + (s.x - 32) * k, y: 32 + (s.y - 32) * k, w: s.w * k, h: s.h * k, r: s.r * k }));

/**
 * Renders a layer list at `size` px. `background` fills the whole square
 * (full-bleed, opaque); otherwise everything outside the shapes is transparent.
 * Anti-aliased by averaging an n×n grid of samples per pixel.
 */
function render(size, shapes, { background = null, samples = 6 } = {}) {
  const layers = shapes.map((s) => ({ ...s, rgb: hexRgb(s.color), a: s.opacity ?? 1 }));
  const bg = background ? hexRgb(background) : null;
  const px = new Uint8ClampedArray(size * size * 4);
  const unit = 64 / size;
  const n = samples;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const u = (x + (i + 0.5) / n) * unit;
          const v = (y + (j + 0.5) / n) * unit;
          // Painter's algorithm, premultiplied colour.
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;
          if (bg) [r, g, b, a] = [bg[0], bg[1], bg[2], 1];
          for (const l of layers) {
            if (!inRoundRect(u, v, l)) continue;
            r = l.rgb[0] * l.a + r * (1 - l.a);
            g = l.rgb[1] * l.a + g * (1 - l.a);
            b = l.rgb[2] * l.a + b * (1 - l.a);
            a = l.a + a * (1 - l.a);
          }
          sr += r;
          sg += g;
          sb += b;
          sa += a;
        }
      }
      const k = (y * size + x) * 4;
      const total = n * n;
      if (sa > 0) {
        px[k] = Math.round(sr / sa);
        px[k + 1] = Math.round(sg / sa);
        px[k + 2] = Math.round(sb / sa);
      }
      px[k + 3] = Math.round((sa / total) * 255);
    }
  }
  return encodePng(size, size, px, { alpha: !bg });
}

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#0b1220"/><rect x="14" y="14" width="8" height="36" rx="4" fill="#00aeef"/><rect x="25" y="14" width="8" height="36" rx="4" fill="#ec008c"/><rect x="36" y="14" width="8" height="36" rx="4" fill="#ffd200"/><rect x="47" y="14" width="4" height="36" rx="2" fill="#ffffff" opacity=".9"/></svg>\n';

const ICONS = [
  // Rounded tile, transparent corners ("any" purpose).
  { file: 'icon-192.png', size: 192, shapes: [TILE, ...STRIPES] },
  { file: 'icon-512.png', size: 512, shapes: [TILE, ...STRIPES] },
  // Full-bleed ink background, stripes scaled into the 80 % safe zone.
  { file: 'maskable-192.png', size: 192, shapes: scaled(STRIPES, 0.78), background: INK },
  { file: 'maskable-512.png', size: 512, shapes: scaled(STRIPES, 0.78), background: INK },
  // iOS rounds the corners itself: full-bleed, no transparency.
  { file: 'apple-touch-icon.png', size: 180, shapes: STRIPES, background: INK },
  { file: 'favicon-32.png', size: 32, shapes: [TILE, ...STRIPES], samples: 12 },
];

fs.mkdirSync(OUT, { recursive: true });
for (const icon of ICONS) {
  const png = render(icon.size, icon.shapes, { background: icon.background, samples: icon.samples });
  fs.writeFileSync(path.join(OUT, icon.file), png);
  console.log(`  ${icon.file.padEnd(22)} ${icon.size}x${icon.size}  ${png.length} bytes`);
}
fs.writeFileSync(path.join(OUT, 'favicon.svg'), svg);
console.log('  favicon.svg');
console.log(`Icons written to ${OUT}`);
