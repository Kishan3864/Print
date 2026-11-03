import crypto from 'node:crypto';
import { config } from '../config.js';

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
export const randomHex = (bytes = 16) => crypto.randomBytes(bytes).toString('hex');

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ---------- input cleaning ----------
// Only strings/numbers count as input: bracket field names (name[x]=…) arrive
// as null-prototype objects that String() cannot convert.
export function clean(value, max = 200) {
  const s = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}
export const cleanLine = (value, max = 120) => clean(value, max).replace(/\s+/g, ' ');

export function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export const isEmail = (v) => {
  const s = typeof v === 'string' ? v : '';
  return s.length <= 160 && /^[A-Za-z0-9._%+'-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/.test(s);
};
export const isHexColor = (v) => /^#[0-9a-f]{6}$/i.test(String(v || ''));
export const isIsoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));

// ---------- shop links ----------
export const RESERVED_SLUGS = new Set([
  'admin', 'shop', 'shops', 'register', 'signup', 'login', 'logout', 'demo', 'api', 'static', 'assets', 'css', 'js',
  'fonts', 'icons', 'img', 'images', 'uploads', 'files', 'file', 'brand', 'logo', 'offline', 'sw', 'manifest',
  'healthz', 'health', 'robots', 'favicon', 'about', 'help', 'support', 'terms', 'privacy', 'pricing', 'contact',
  'www', 'app', 'print', 'printdesk', 'brighton', 'brightonsolution', 'blog', 'docs', 'settings', 'order', 'orders',
  'o', 'track', 'account', 'dashboard', 'root', 'system', 'null', 'undefined', 'test', 'mail', 'email',
  config.demo.slug,
]);

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/** Returns an error message or null. */
export function slugError(slug) {
  if (!slug) return 'Choose a link name.';
  if (slug.length < 3 || slug.length > 40) return 'Link name must be 3–40 characters.';
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) return 'Use only lowercase letters, numbers and hyphens (not at the start or end).';
  if (slug.includes('--')) return 'Link name cannot contain two hyphens in a row.';
  if (RESERVED_SLUGS.has(slug)) return 'That link name is reserved. Try another one.';
  return null;
}

export const SLUG_ROUTE = '[a-z0-9][a-z0-9-]{1,38}[a-z0-9]';

// ---------- phones & WhatsApp ----------
export function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Indian-style mobile check: 10 digits (optionally prefixed with 0 / 91 / +91), or any 8–15 digit intl number with +. */
export function isMobile(value) {
  const d = digits(value);
  return d.length >= 10 && d.length <= 15;
}

/** Number for wa.me links: digits only, with country code (default +91). */
export function waNumber(value) {
  let d = digits(value);
  if (!d) return '';
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = config.countryCode + d;
  return d;
}

/** wa.me link with a pre-written message. Falls back to the contact picker when the number is unusable (e.g. masked demo numbers). */
export function waLink(mobile, text) {
  const n = waNumber(mobile);
  return n.length >= 10 ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function maskPhone(value) {
  const d = digits(value).slice(-10);
  if (d.length < 6) return d;
  return d.slice(0, 2) + 'x'.repeat(d.length - 4) + d.slice(-2);
}

export function prettyPhone(value) {
  const d = digits(value);
  if (d.length === 10) return `${d.slice(0, 5)} ${d.slice(5)}`;
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return String(value || '');
}

// ---------- dates (stored as UTC ISO strings, shown in APP_TZ) ----------
const dtf = (opts) => new Intl.DateTimeFormat('en-IN', { timeZone: config.timeZone, ...opts });
const fmtDate = dtf({ day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = dtf({ day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const fmtTime = dtf({ hour: 'numeric', minute: '2-digit', hour12: true });
const fmtYmd = new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });

export const formatDate = (iso) => (iso ? fmtDate.format(new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso)) : '—');
export const formatDateTime = (iso) => (iso ? fmtDateTime.format(new Date(iso)) : '—');
export const formatTime = (iso) => (iso ? fmtTime.format(new Date(iso)) : '');

/** YYYY-MM-DD for "today" (or a given Date) in APP_TZ. */
export const ymd = (date = new Date()) => fmtYmd.format(date);

const fmtParts = dtf({ hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function tzOffsetMs(date) {
  const p = Object.fromEntries(fmtParts.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** UTC ISO timestamp of the start of today in APP_TZ. */
export function startOfTodayIso() {
  const nowDate = new Date();
  return new Date(Date.parse(ymd(nowDate) + 'T00:00:00Z') - tzOffsetMs(nowDate)).toISOString();
}

export function addDays(ymdStr, days) {
  const d = new Date(ymdStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
  return formatDate(iso);
}

export function formatBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < units.length - 1);
  return `${n >= 100 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

// ---------- colours ----------
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** Picks dark ink or white text for a background colour – whichever contrasts more. */
export function inkFor(hex) {
  if (!isHexColor(hex)) return '#ffffff';
  return contrast(hex, '#0b1220') >= contrast(hex, '#ffffff') ? '#0b1220' : '#ffffff';
}

/** Brand colour for dark mode: lightened toward white in 10% steps until it reads on the dark surface. */
export function brandForDark(hex) {
  if (!isHexColor(hex)) return hex;
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const d = '#' + ch.map((c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, '0')).join('');
    if (contrast(d, '#111a2b') >= 3) return d;
  }
  return '#ffffff';
}

// ---------- flash messages ----------
export function flash(req, type, text) {
  const list = Array.isArray(req.session.flash) ? req.session.flash : [];
  list.push({ type, text: String(text).slice(0, 300) });
  req.session.flash = list.slice(-3);
}
