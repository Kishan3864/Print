import { db, meta, now } from '../db.js';
import { config } from '../config.js';
import { addDays, ymd } from '../lib/util.js';
import { publishShop } from '../lib/live.js';
import { shopState } from './shops.js';
import { getPlan, periodEnd } from './billing.js'; // used at call time only (billing.js imports this file too)
import { audit } from './audit.js';

// Entitlements: what each shop may use, decided in ONE place.
//
//   plan (starter / pro / business)  →  a feature matrix the admin can edit (meta 'plan_features')
//   add-ons (Bills …)                →  shop_addons rows with their own validity (monthly / yearly / lifetime / free)
//   lifetime plans                   →  paid_until = LIFETIME_END; new features released after the shop's
//                                       "Updates & Support" (care_until) ended need care renewed
//   admin overrides                  →  shops.overrides: force a feature on/off, change a limit, per shop
//   plan not active (expired/paused) →  nothing but the core is usable (the /shop gate locks most pages too)
//
// Every route and view asks can(shop, key) / limits(shop) – never the plan key directly.

export const LIFETIME_END = '2999-12-31';
export const isLifetime = (shop) => shop?.billing_cycle === 'lifetime';

/** Features that existed when lifetime plans launched – every lifetime plan keeps these for ever. */
const BASE_SINCE = '2026-11-01';

// ---------- catalog (add a feature here, then use can(shop, key) where it applies) ----------
export const FEATURES = [
  { key: 'orders', label: 'Order link, QR code & order dashboard', core: true },
  { key: 'whatsapp', label: 'WhatsApp-ready messages & customer tracking page', core: true },
  { key: 'branding', label: 'Your logo & shop colour on the order page' },
  { key: 'reprint', label: 'One-tap reprints' },
  { key: 'bills', label: 'Bills – rate list and PDF bills in your shop name', addon: 'bills' },
  { key: 'bills_gst', label: 'GST tax invoices + UPI “scan to pay” on bills', addon: 'bills', requires: 'bills' },
  { key: 'priority', label: 'Priority support', care: true },
];
export const FEATURE = Object.fromEntries(FEATURES.map((f) => [f.key, f]));

export const LIMITS = [
  { key: 'files', label: 'Files per order', unit: '', min: 1, max: config.limits.orderFiles },
  { key: 'fileMB', label: 'Size per file', unit: 'MB', min: 1, max: Math.round(config.limits.orderFileBytes / 1048576) },
];

const DEFAULT_MATRIX = {
  starter: { branding: false, reprint: false, bills: false, bills_gst: false, priority: false, files: 3, fileMB: 50 },
  pro: { branding: true, reprint: true, bills: true, bills_gst: true, priority: false, files: 5, fileMB: 100 },
  business: { branding: true, reprint: true, bills: true, bills_gst: true, priority: true, files: 5, fileMB: 100 },
};

/** Plan → features/limits, with the admin's edits (meta 'plan_features') over the defaults. */
export function planMatrix() {
  let saved = {};
  try {
    saved = JSON.parse(meta.get('plan_features') || '{}') || {};
  } catch {
    /* defaults */
  }
  const out = {};
  for (const [plan, def] of Object.entries(DEFAULT_MATRIX)) {
    const s = saved[plan] || {};
    const row = {};
    for (const f of FEATURES) if (!f.core) row[f.key] = typeof s[f.key] === 'boolean' ? s[f.key] : Boolean(def[f.key]);
    for (const l of LIMITS) {
      const n = Number(s[l.key]);
      row[l.key] = Number.isInteger(n) && n >= l.min && n <= l.max ? n : def[l.key];
    }
    out[plan] = row;
  }
  return out;
}
export const savePlanMatrix = (matrix) => meta.set('plan_features', JSON.stringify(matrix));

// ---------- add-ons ----------
export const ADDON_DEFS = [
  {
    key: 'bills',
    name: 'Bills',
    blurb: 'Rate list, quick manual bills, proper PDF bills in your shop’s name, WhatsApp sharing.',
    features: ['bills', 'bills_gst'],
    monthly: 99,
    yearly: 990,
    lifetime: 2499,
  },
];

/** Add-ons with the admin's prices (meta 'addons'). A price of 0 means "not sold that way". */
export function getAddons() {
  let saved = {};
  try {
    saved = JSON.parse(meta.get('addons') || '{}') || {};
  } catch {
    /* defaults */
  }
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : d);
  return ADDON_DEFS.map((a) => {
    const s = saved[a.key] || {};
    return { ...a, monthly: num(s.monthly, a.monthly), yearly: num(s.yearly, a.yearly), lifetime: num(s.lifetime, a.lifetime), active: s.active === undefined ? true : Boolean(s.active) };
  });
}
export const getAddon = (key) => getAddons().find((a) => a.key === key) || null;
export const saveAddons = (list) =>
  meta.set('addons', JSON.stringify(Object.fromEntries(list.map((a) => [a.key, { monthly: a.monthly, yearly: a.yearly, lifetime: a.lifetime, active: a.active }]))));

/** True when every feature of the add-on is already in the plan (nothing to buy). */
export const addonInPlan = (addon, planKey) => {
  const row = planMatrix()[planKey];
  return Boolean(row) && addon.features.every((k) => row[k]);
};

export const shopAddonRows = (shopId) => db.prepare('SELECT * FROM shop_addons WHERE shop_id = ?').all(shopId);
export const shopAddon = (shopId, key) => db.prepare('SELECT * FROM shop_addons WHERE shop_id = ? AND addon = ?').get(shopId, key);
export const addonActive = (row, today = ymd()) => Boolean(row && row.status === 'active' && (!row.ends_on || row.ends_on >= today));

/**
 * Switches an add-on on (or extends it). cycle: monthly | yearly (adds a period after the current end),
 * lifetime (no end), free (admin: endsOn date or null for no end).
 */
export function grantAddon(shopId, key, { cycle, endsOn = null, source = 'admin', paymentId = null, note = '', actor = 'admin', ip = '' }) {
  if (!getAddon(key)) throw new Error('Unknown add-on.');
  const today = ymd();
  const cur = shopAddon(shopId, key);
  let starts = today;
  let ends = endsOn || null;
  if (cycle === 'monthly' || cycle === 'yearly') {
    if (addonActive(cur) && cur.ends_on) starts = addDays(cur.ends_on, 1);
    else if (addonActive(cur) && !cur.ends_on) throw new Error('This add-on already has no end date.');
    ends = periodEnd(starts, cycle);
  } else if (cycle === 'lifetime') ends = null;
  const at = now();
  db.prepare(
    `INSERT INTO shop_addons (shop_id, addon, cycle, starts_on, ends_on, status, source, payment_id, note, created_at, updated_at)
     VALUES (@shopId, @key, @cycle, @starts, @ends, 'active', @source, @paymentId, @note, @at, @at)
     ON CONFLICT(shop_id, addon) DO UPDATE SET cycle = @cycle, starts_on = CASE WHEN shop_addons.status = 'active' AND (shop_addons.ends_on IS NULL OR shop_addons.ends_on >= @today) THEN shop_addons.starts_on ELSE @starts END,
       ends_on = @ends, status = 'active', source = @source, payment_id = COALESCE(@paymentId, shop_addons.payment_id), note = @note, updated_at = @at`
  ).run({ shopId, key, cycle, starts, ends, source, paymentId, note, at, today });
  audit({ actor, shopId, action: 'addon.on', detail: `${key} · ${cycle}${ends ? ` · till ${ends}` : ' · no end date'}${note ? ` · ${note}` : ''}`, ip });
  publishShop(shopId);
  return shopAddon(shopId, key);
}

export function revokeAddon(shopId, key, { actor = 'admin', note = '', ip = '' } = {}) {
  const info = db.prepare("UPDATE shop_addons SET status = 'revoked', note = ?, updated_at = ? WHERE shop_id = ? AND addon = ?").run(note, now(), shopId, key);
  if (info.changes) audit({ actor, shopId, action: 'addon.off', detail: `${key}${note ? ` · ${note}` : ''}`, ip });
  publishShop(shopId);
}

// ---------- per-shop overrides (admin) ----------
/** { features: { key: true|false }, limits: { key: n } } */
export function shopOverrides(shop) {
  try {
    const o = JSON.parse(shop?.overrides || '{}') || {};
    return { features: o.features && typeof o.features === 'object' ? o.features : {}, limits: o.limits && typeof o.limits === 'object' ? o.limits : {} };
  } catch {
    return { features: {}, limits: {} };
  }
}

export function saveOverrides(shopId, overrides, { actor = 'admin', ip = '', summary = '' } = {}) {
  db.prepare('UPDATE shops SET overrides = ? WHERE id = ?').run(JSON.stringify(overrides), shopId);
  audit({ actor, shopId, action: 'overrides', detail: summary || JSON.stringify(overrides), ip });
  publishShop(shopId);
}

// ---------- care: updates & support for lifetime plans ----------
/** Subscriptions always include updates; lifetime plans need care_until in the future. */
export const careActive = (shop, today = ymd()) => !isLifetime(shop) || Boolean(shop.care_until && shop.care_until >= today);

export function setCareUntil(shopId, date, { actor = 'admin', ip = '', note = '' } = {}) {
  db.prepare('UPDATE shops SET care_until = ? WHERE id = ?').run(date || null, shopId);
  audit({ actor, shopId, action: 'care', detail: `Updates & support till ${date || '—'}${note ? ` · ${note}` : ''}`, ip });
  publishShop(shopId);
}

// ---------- the one question: what can this shop use? ----------
const cache = new WeakMap(); // per shop row object (one request)

/**
 * {
 *   planKey, active, lifetime, careOn,
 *   features: { key: { on, source: core|demo|plan|addon|admin, locked: ''|plan|addon|expired|care|admin } },
 *   limits:   { files, fileMB, storageGb },
 *   addons:   { key: { row, active, inPlan } }
 * }
 */
export function entitlements(shop) {
  if (!shop) return { planKey: 'starter', active: false, lifetime: false, careOn: false, features: {}, limits: {}, addons: {} };
  if (cache.has(shop)) return cache.get(shop);
  const today = ymd();
  const demo = Boolean(shop.is_demo);
  const active = shopState(shop) === 'active';
  const planKey = demo ? 'pro' : shop.plan || 'starter';
  const matrix = planMatrix();
  const row = matrix[planKey] || matrix.starter;
  const ov = shopOverrides(shop);
  const careOn = careActive(shop, today);
  const lifetime = isLifetime(shop);

  const rows = Object.fromEntries((shop.id ? shopAddonRows(shop.id) : []).map((r) => [r.addon, r]));
  const addons = {};
  for (const a of getAddons()) addons[a.key] = { row: rows[a.key] || null, active: addonActive(rows[a.key], today), inPlan: addonInPlan(a, planKey) };

  const features = {};
  for (const f of FEATURES) {
    let on = false;
    let source = '';
    let locked = '';
    if (f.core) [on, source] = [true, 'core'];
    else if (demo) [on, source] = [true, 'demo'];
    else if (row[f.key]) [on, source] = [true, 'plan'];
    else if (f.addon && addons[f.addon]?.active) [on, source] = [true, 'addon'];
    else locked = f.addon ? 'addon' : 'plan';
    // Lifetime plans keep everything they bought; features released later come with Updates & Support.
    if (on && source === 'plan' && lifetime && (f.since || BASE_SINCE) > BASE_SINCE && (f.since || BASE_SINCE) > (shop.care_until || '')) [on, locked] = [false, 'care'];
    if (on && f.care && !careOn) [on, locked] = [false, 'care'];
    if (on && f.requires && !features[f.requires]?.on) [on, locked] = [false, features[f.requires]?.locked || 'plan'];
    if (ov.features[f.key] === true) [on, source, locked] = [true, 'admin', ''];
    else if (ov.features[f.key] === false) [on, source, locked] = [false, 'admin', 'admin'];
    if (!active && !f.core) [on, locked] = [false, 'expired'];
    features[f.key] = { on, source, locked: on ? '' : locked || 'plan' };
  }

  const plan = getPlan(planKey);
  const limit = (key, fallback) => {
    const n = Number(ov.limits[key]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const limits = { files: limit('files', row.files), fileMB: limit('fileMB', row.fileMB), storageGb: limit('storageGb', plan ? plan.storageGb : 10) };

  const out = { planKey, active, lifetime, careOn, careUntil: shop.care_until || null, features, limits, addons, overrides: ov };
  cache.set(shop, out);
  return out;
}

export const can = (shop, key) => Boolean(entitlements(shop).features[key]?.on);
export const limitsFor = (shop) => entitlements(shop).limits;

/** Plain list of what a plan includes (pricing cards). */
export function planFeatureList(planKey) {
  const row = planMatrix()[planKey] || {};
  const plan = getPlan(planKey);
  const list = [];
  list.push(`Up to ${row.files} files per order, ${row.fileMB} MB each`);
  if (plan) list.push(`${plan.storageGb} GB file storage`);
  for (const f of FEATURES) if (!f.core && row[f.key]) list.push(f.label);
  return list;
}
