import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, paths } from '../config.js';

// The site ships ONE stylesheet, /css/app.css, built in memory from the area
// files in public/css (no build step). Order matters: core first, compat last.
const CSS_ORDER = ['core', 'public', 'shop', 'account', 'customer', 'billing', 'support', 'admin', 'platform', 'zz-compat'];

function buildCss() {
  return CSS_ORDER.map((n) => path.join(paths.public, 'css', `${n}.css`))
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
}

const builtCss = buildCss();

/** The stylesheet (rebuilt on every request in development so edits show up). */
export const cssBundle = () => (config.isProd ? builtCss : buildCss());

// Cache-busting version for /css/app.css and /js/*.js (changes when files change on restart).
export const ASSET_V = (() => {
  const h = crypto.createHash('sha1').update(builtCss);
  const scripts = fs.readdirSync(path.join(paths.public, 'js')).filter((n) => n.endsWith('.js')).sort();
  for (const f of ['sw.js', ...scripts.map((n) => 'js/' + n)]) {
    try {
      h.update(fs.readFileSync(path.join(paths.public, f)));
    } catch {
      /* optional file */
    }
  }
  return h.digest('hex').slice(0, 10);
})();
