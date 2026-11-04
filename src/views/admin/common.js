import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { addDays, formatDate, isHexColor, isIsoDate, inkFor, waNumber, ymd } from '../../lib/util.js';
import { PLANS, PLAN_LABEL } from '../../lib/status.js';
import { CYCLES, getPlan, isSampleShop } from '../../services/billing.js';
import { orderFormUrl, shopPath } from '../../services/notify.js';
import { db } from '../../db.js';

// Shared helpers for the super-admin views (and the date maths used by the admin routes).

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

/** Quick-extend buttons for live shops. */
export const EXTEND = {
  '1m': { months: 1, label: '+1 month' },
  '3m': { months: 3, label: '+3 months' },
  '1y': { months: 12, label: '+1 year' },
};
/** Quick-extend buttons for personal demo shops. */
export const DEMO_EXTEND = {
  '7d': { days: 7, label: '+7 days' },
  '14d': { days: 14, label: '+14 days' },
};
export const MAX_PAID_MONTHS = 60;
export const MAX_DEMO_DAYS = 90;

/** Quick extensions count from the later of today and the current paid-until date. */
export const extendBase = (shop, today = ymd()) => (validDate(shop.paid_until) && shop.paid_until > today ? shop.paid_until : today);

/** Default value for a paid-until date input. */
export const defaultPaidUntil = (shop, today = ymd()) => {
  if (validDate(shop.paid_until) && shop.paid_until >= today) return shop.paid_until;
  return shop.is_demo ? addDays(today, 7) : addMonths(today, 1);
};

/** Plain-language validity: { text, tone: 'ok'|'warn'|'danger'|'muted', days }. */
export function paidInfo(shop, today = ymd()) {
  if (isSampleShop(shop)) return { text: 'Sample shop · never expires', tone: 'muted', days: null };
  const what = shop.is_demo ? 'Demo' : 'Plan';
  if (!validDate(shop.paid_until)) return { text: shop.status === 'pending' ? 'Not paid yet' : 'No end date', tone: 'muted', days: null };
  const days = daysBetween(today, shop.paid_until);
  if (days < 0) return { text: `${what} ended ${-days} day${days === -1 ? '' : 's'} ago`, tone: 'danger', days };
  if (days === 0) return { text: `${what} ends today`, tone: 'warn', days };
  if (days <= 7) return { text: `${days} day${days === 1 ? '' : 's'} left`, tone: 'warn', days };
  return { text: `${days} days left`, tone: 'ok', days };
}

export const planName = (key) => getPlan(key)?.name || PLAN_LABEL[key] || '';
export const cycleName = (key) => CYCLES[key] || '';

export const planOptions = (selected) =>
  PLANS.map((p) => html`<option value="${p}"${p === selected ? raw(' selected') : ''}>${planName(p)}</option>`);

// ---------- shop list filters ----------
const isLive = (s) => !s.is_demo;
/** Filter chips on /admin/shops. `s.state` comes from listShopsForAdmin(). */
export const SHOP_FILTERS = [
  { key: '', label: 'All', test: () => true },
  { key: 'active', label: 'Active', test: (s) => isLive(s) && s.state === 'active' },
  { key: 'expiring', label: 'Expiring', test: (s, today) => isLive(s) && s.state === 'active' && daysBetween(today, s.paid_until) <= 7 },
  { key: 'expired', label: 'Expired', test: (s) => isLive(s) && s.state === 'expired' },
  { key: 'pending', label: 'Awaiting payment', test: (s) => s.state === 'pending' },
  { key: 'demo', label: 'Demo', test: (s) => Boolean(s.is_demo) },
  { key: 'paused', label: 'Paused', test: (s) => s.state === 'paused' },
  { key: 'rejected', label: 'Rejected', test: (s) => s.state === 'rejected' },
];
export const shopFilter = (key) => SHOP_FILTERS.find((f) => f.key === key) || SHOP_FILTERS[0];

// ---------- shop list sorting (server side; public/js/admin.js re-sorts in place without a reload) ----------
const STATE_RANK = { pending: 0, expired: 1, active: 2, paused: 3, rejected: 4 };
/** Sortable columns: value(shop, today) and the direction a first click uses. Empty values always sort last. */
export const SHOP_SORTS = {
  name: { label: 'Name A–Z', dir: 'asc', value: (s) => String(s.name || '').toLowerCase() },
  status: { label: 'Status', dir: 'asc', value: (s) => STATE_RANK[s.state] ?? 9 },
  plan: { label: 'Plan ends soonest', dir: 'asc', value: (s, today) => (isSampleShop(s) || !validDate(s.paid_until) ? '' : daysBetween(today, s.paid_until)) },
  orders: { label: 'Most orders', dir: 'desc', value: (s) => Number(s.orders_count || 0) },
  storage: { label: 'Most storage', dir: 'desc', value: (s) => Number(s.storage_bytes || 0) },
  activity: { label: 'Latest order', dir: 'desc', value: (s) => s.last_order_at || '' },
  joined: { label: 'Newest first', dir: 'desc', value: (s) => s.created_at || '' },
};
export const sortKey = (v) => (typeof v === 'string' && Object.hasOwn(SHOP_SORTS, v) ? v : '');
export const sortDir = (v, key) => (v === 'asc' || v === 'desc' ? v : SHOP_SORTS[key]?.dir || 'asc');

export function sortShops(list, key, dir, today = ymd()) {
  const def = SHOP_SORTS[key];
  if (!def) return list;
  const sign = dir === 'desc' ? -1 : 1;
  return list
    .map((s) => ({ s, v: def.value(s, today) }))
    .sort((a, b) => {
      if (a.v === '' || b.v === '') return a.v === b.v ? 0 : a.v === '' ? 1 : -1;
      return (typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v))) * sign;
    })
    .map((x) => x.s);
}

/** Days left drawn as a thin bar (SVG attributes – no inline styles under the CSP). */
export function daysMeter(shop, info) {
  if (info.days == null) return '';
  const span = shop.is_demo ? 14 : shop.billing_cycle === 'yearly' ? 365 : 30;
  const pct = info.days < 0 ? 0 : Math.max(4, Math.min(100, Math.round((info.days / span) * 100)));
  return html`<svg class="adm-days is-${info.tone}" viewBox="0 0 100 4" preserveAspectRatio="none" width="100" height="4" aria-hidden="true" focusable="false"><rect class="adm-days-track" width="100" height="4"/><rect class="adm-days-fill" width="${pct}" height="4"/></svg>`;
}

// ---------- links ----------
/** /admin/shops URL that survives safeNext() (no "+" or quote characters). */
export function listHref({ q = '', status = '', sort = '', dir = '' } = {}, base = '/admin/shops') {
  const enc = (v) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const parts = [];
  if (status) parts.push(`status=${enc(status)}`);
  if (q) parts.push(`q=${enc(q)}`);
  if (sort) parts.push(`sort=${enc(sort)}`, `dir=${enc(dir || 'asc')}`);
  return base + (parts.length ? `?${parts.join('&')}` : '');
}

export const telHref = (mobile) => {
  const n = waNumber(mobile);
  return n.length >= 10 ? `tel:+${n}` : '';
};

/** Shop-owner login on the main host (absolute: relative links are rewritten on the admin host). */
export const loginUrl = () => `${config.baseUrl}/login`;

/** Customer page: absolute URL (works from the admin host) + the short path to show. */
export const customerLink = (shop) => ({ href: orderFormUrl(shop), label: shopPath(shop) });

// ---------- badge counts for the admin chrome ----------
/** Live shops that registered but have not paid yet (red badge on Shops). Counted once per response. */
export function pendingShopCount(res) {
  if (res.locals.adminPending == null) {
    res.locals.adminPending = db.prepare("SELECT COUNT(*) AS n FROM shops WHERE is_demo = 0 AND status = 'pending'").get().n;
  }
  return res.locals.adminPending;
}

/** Plain-text search key for a row (type-to-filter in public/js/admin.js): words plus the mobile's digits. */
export const searchKey = (...parts) => parts.filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ').trim();

/** Red count badge (nothing when zero). */
export const countBadge = (n, label = '') =>
  n ? html`<span class="badge"${label ? raw(` title="${label}: ${n}"`) : ''}>${n > 99 ? '99+' : n}</span>` : '';

/** Ticket status pill (admin colours). */
export const ticketStatusPill = (status, label) => html`<span class="pill adm-tk-${status}">${label || status}</span>`;

// ---------- small pieces ----------
export const num =(n) => Number(n || 0).toLocaleString('en-IN');

export const demoTag = (shop) =>
  shop && isSampleShop(shop) ? html`<span class="adm-tag adm-tag-sample">Sample</span>` : html`<span class="adm-tag">Demo</span>`;

export const toneClass = (tone) => (tone === 'warn' ? 'adm-warn' : tone === 'danger' ? 'adm-danger' : tone === 'ok' ? 'adm-ok' : 'adm-sub');

/** Shop logo, or its first letter on the shop's brand colour (SVG attributes keep the CSP happy). */
export function shopAvatar(shop, size = 38, cls = '') {
  const klass = `adm-avatar${cls ? ' ' + cls : ''}`;
  if (shop.logo_file) {
    return html`<span class="${klass}"><img src="/logo/${shop.slug}?v=${shop.logo_file.slice(0, 8)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async"></span>`;
  }
  const bg = isHexColor(shop.brand_color) ? shop.brand_color : '#1a5d40';
  const letter = (Array.from(String(shop.name || '').trim())[0] || '?').toUpperCase();
  return html`<span class="${klass}" aria-hidden="true"><svg viewBox="0 0 40 40" width="${size}" height="${size}" focusable="false"><rect width="40" height="40" fill="${bg}"/><text x="20" y="21" text-anchor="middle" dominant-baseline="middle" font-size="17" font-weight="800" fill="${inkFor(bg)}">${letter}</text></svg></span>`;
}

export const dateOrDash = (iso) => (iso ? formatDate(iso) : '—');

/** Admin-only icons (same format as components.icon). */
const AI = {
  rupee: '<path d="M6 4h12M6 9h12M14.5 20 7 13h2.5a4.5 4.5 0 0 0 0-9"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><path d="M7.5 7.5h.01"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  hourglass: '<path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M17 6l3 3M14 9l2 2"/>',
  note: '<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4M8 9h8M8 13h5"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  sort: '<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>',
  sortUp: '<path d="M8 14l4-4 4 4"/>',
  sortDown: '<path d="M8 10l4 4 4-4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  caret: '<path d="M7 10l5 5 5-5"/>',
  filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 6a9 9 0 0 1 0 12"/>',
};
export function adminIcon(name, cls = '') {
  return raw(
    `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${AI[name] || ''}</svg>`
  );
}

/** "1 day" / "3 days" */
export const plural = (n, word) => `${num(n)} ${word}${Number(n) === 1 ? '' : 's'}`;
