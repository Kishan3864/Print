import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { addDays, formatDate, isHexColor, isIsoDate, inkFor, waNumber, ymd } from '../../lib/util.js';
import { PLANS, PLAN_LABEL } from '../../lib/status.js';

// Shared helpers for the super-admin views (and the plan maths used by the admin routes).

// ---------- dates & plans ----------
/** Strict YYYY-MM-DD that is a real calendar day (V8 would roll 2026-02-31 over to March). */
export const validDate = (v) => isIsoDate(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** Adds calendar months, clamped to the month end (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(ymdStr, months) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

export const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5);

/** Quick-extend buttons on the plan form. */
export const EXTEND = {
  '1m': { months: 1, label: '+1 month' },
  '3m': { months: 3, label: '+3 months' },
  '1y': { months: 12, label: '+1 year' },
};
export const MAX_PAID_MONTHS = 60;

/** Quick extensions count from the later of today and the current paid-until date. */
export const extendBase = (shop, today = ymd()) => (validDate(shop.paid_until) && shop.paid_until > today ? shop.paid_until : today);

/** Default value for a paid-until date input. */
export const defaultPaidUntil = (shop, today = ymd()) => (validDate(shop.paid_until) && shop.paid_until >= today ? shop.paid_until : addDays(today, 30));

/** Plain-language plan validity: { text, tone: 'ok'|'warn'|'danger'|'muted' }. */
export function paidInfo(shop, today = ymd()) {
  if (shop.is_demo) return { text: 'Demo – never expires', tone: 'muted' };
  if (!validDate(shop.paid_until)) return { text: shop.status === 'pending' ? 'Not approved yet' : 'No end date set', tone: 'muted' };
  const days = daysBetween(today, shop.paid_until);
  if (days < 0) return { text: `Ended ${-days} day${days === -1 ? '' : 's'} ago`, tone: 'danger' };
  if (days === 0) return { text: 'Ends today', tone: 'warn' };
  if (days <= 7) return { text: `${days} day${days === 1 ? '' : 's'} left`, tone: 'warn' };
  return { text: `${days} days left`, tone: 'ok' };
}

export const planOptions = (selected) =>
  PLANS.map((p) => html`<option value="${p}"${p === selected ? raw(' selected') : ''}>${PLAN_LABEL[p]}</option>`);

// ---------- links ----------
/** /admin list URL that survives safeNext() (no "+" or quote characters). */
export function listHref({ q = '', status = '' } = {}) {
  const enc = (v) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const parts = [];
  if (status) parts.push(`status=${enc(status)}`);
  if (q) parts.push(`q=${enc(q)}`);
  return '/admin' + (parts.length ? `?${parts.join('&')}` : '');
}

export const telHref = (mobile) => {
  const n = waNumber(mobile);
  return n.length >= 10 ? `tel:+${n}` : '';
};

export const loginUrl = () => `${config.baseUrl}/login`;

// ---------- small pieces ----------
export const num = (n) => Number(n || 0).toLocaleString('en-IN');

export const demoTag = () => html`<span class="adm-tag">Demo</span>`;

export const toneClass = (tone) => (tone === 'warn' ? 'adm-warn' : tone === 'danger' ? 'adm-danger' : 'adm-sub');

/** Shop logo, or its first letter on the shop's brand colour (SVG attributes keep the CSP happy). */
export function shopAvatar(shop, size = 38, cls = '') {
  const klass = `adm-avatar${cls ? ' ' + cls : ''}`;
  if (shop.logo_file) {
    return html`<span class="${klass}"><img src="/logo/${shop.slug}?v=${shop.logo_file.slice(0, 8)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async"></span>`;
  }
  const bg = isHexColor(shop.brand_color) ? shop.brand_color : '#0077b6';
  const letter = (Array.from(String(shop.name || '').trim())[0] || '?').toUpperCase();
  return html`<span class="${klass}" aria-hidden="true"><svg viewBox="0 0 40 40" width="${size}" height="${size}" focusable="false"><rect width="40" height="40" fill="${bg}"/><text x="20" y="21" text-anchor="middle" dominant-baseline="middle" font-size="18" font-weight="800" fill="${inkFor(bg)}">${letter}</text></svg></span>`;
}

export const dateOrDash = (iso) => (iso ? formatDate(iso) : '—');
