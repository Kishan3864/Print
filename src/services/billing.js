import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, meta, now } from '../db.js';
import { config, paths } from '../config.js';
import { addDays, formatDate, randomHex, safeEqual, waNumber, ymd } from '../lib/util.js';
import { getShopById } from './shops.js';
import { notifyAdmin, notifyShop } from './notifications.js';
import { sendMail } from './notify.js';
import { publishShop } from '../lib/live.js';
import { audit } from './audit.js';
import { LIFETIME_END, addonInPlan, getAddon, grantAddon, isLifetime, planFeatureList, shopAddon, addonActive, setCareUntil } from './entitlements.js';
import { onServicePaid } from './services.js';

// What shops pay Brighton Solution for. One payments table, four products:
//   plan     starter / pro / business – monthly, yearly or lifetime (lifetime: paid_until = LIFETIME_END,
//            and one year of "Updates & Support" included)
//   addon    an add-on such as Bills – monthly, yearly or lifetime (see entitlements.js)
//   care     Updates & Support for lifetime plans – one year at a time
//   service  paid help (setup, change review, quoted custom work – see services.js)
//
// A payment only counts when it is REALLY paid: PayU's reverse hash must match AND PayU's own
// verify API must confirm "success" for the exact amount (webhook + a recheck job cover closed browsers).
// UPI / cash / bank payments are recorded by the admin. Every change is written to the audit log.

export const CYCLES = { monthly: 'Monthly', yearly: 'Yearly', lifetime: 'Lifetime' };
export const PRODUCT_LABEL = { plan: 'Plan', addon: 'Add-on', care: 'Updates & Support', service: 'Service' };

export const DEFAULT_PLANS = [
  { key: 'starter', name: 'Starter', monthly: 299, yearly: 2990, lifetime: 8999, care: 1499, storageGb: 10, active: true, popular: false },
  { key: 'pro', name: 'Pro', monthly: 499, yearly: 4990, lifetime: 14999, care: 2499, storageGb: 30, active: true, popular: true },
  { key: 'business', name: 'Business', monthly: 999, yearly: 9990, lifetime: 29999, care: 4499, storageGb: 100, active: true, popular: false },
];
export const PLAN_KEYS = DEFAULT_PLANS.map((p) => p.key);
const RANK = Object.fromEntries(PLAN_KEYS.map((k, i) => [k, i]));

/** Plans with admin-edited prices (meta 'plans'). Whole rupees; a lifetime price of 0 = lifetime not offered. */
export function getPlans() {
  let saved = {};
  try {
    saved = Object.fromEntries((JSON.parse(meta.get('plans') || '[]') || []).map((p) => [p.key, p]));
  } catch {
    /* defaults */
  }
  return DEFAULT_PLANS.map((d) => {
    const s = saved[d.key] || {};
    const num = (v, f) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : f);
    return {
      key: d.key,
      name: typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 30) : d.name,
      monthly: num(s.monthly, d.monthly),
      yearly: num(s.yearly, d.yearly),
      lifetime: num(s.lifetime, d.lifetime),
      care: num(s.care, d.care),
      storageGb: num(s.storageGb, d.storageGb),
      active: s.active === undefined ? d.active : Boolean(s.active),
      popular: s.popular === undefined ? d.popular : Boolean(s.popular),
    };
  });
}
export const activePlans = () => getPlans().filter((p) => p.active);
export const getPlan = (key) => getPlans().find((p) => p.key === key) || null;

export function savePlans(list) {
  const clean = DEFAULT_PLANS.map((d) => {
    const p = list.find((x) => x.key === d.key) || {};
    return { key: d.key, name: p.name, monthly: p.monthly, yearly: p.yearly, lifetime: p.lifetime, care: p.care, storageGb: p.storageGb, active: p.active, popular: p.popular };
  });
  meta.set('plans', JSON.stringify(clean));
}

export const priceRupees = (plan, cycle) => (cycle === 'yearly' ? plan.yearly : cycle === 'lifetime' ? plan.lifetime : plan.monthly);
export const formatINR = (rupees) => '₹' + Number(rupees || 0).toLocaleString('en-IN');

/** Kept for older callers: the plan list for cards. */
export const featureList = (key) => planFeatureList(key);

export const isSampleShop = (shop) => Boolean(shop?.is_demo) && shop.slug === config.demo.slug;

/** Storage cap in bytes for uploads to this shop (0 = none). */
export function storageCapBytes(shop) {
  if (shop.is_demo) return config.limits.demoStorageBytes;
  if (config.limits.shopQuotaBytes) return config.limits.shopQuotaBytes;
  // Per-shop admin override first, then the plan's storage.
  let gb = 0;
  try {
    gb = Number(JSON.parse(shop.overrides || '{}')?.limits?.storageGb) || 0;
  } catch {
    gb = 0;
  }
  const plan = getPlan(shop.plan);
  gb = gb || (plan ? plan.storageGb : 0);
  return gb ? gb * 1024 * 1024 * 1024 : 0;
}

/** End date (YYYY-MM-DD) one cycle after `start` (inclusive day count, clamps month ends). Lifetime: LIFETIME_END. */
export function periodEnd(start, cycle) {
  if (cycle === 'lifetime') return LIFETIME_END;
  const [y, m, d] = start.split('-').map(Number);
  const months = cycle === 'yearly' ? 12 : 1;
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return addDays(target.toISOString().slice(0, 10), -1);
}

/** Date a new payment starts from: the day after the current period if still running, else today. */
export function nextPeriodStart(shop) {
  const today = ymd();
  if (!shop.is_demo && shop.status === 'active' && shop.paid_until && shop.paid_until >= today && !isLifetime(shop)) return addDays(shop.paid_until, 1);
  return today;
}

export const daysLeft = (shop) => (shop.paid_until ? Math.round((Date.parse(shop.paid_until + 'T00:00:00Z') - Date.parse(ymd() + 'T00:00:00Z')) / 86400000) : null);

/** "Lifetime" / "till 4 Dec 2026" – for every place that shows how long a plan runs. */
export const validityText = (shop) => (isLifetime(shop) ? 'Lifetime – never expires' : shop.paid_until ? `till ${formatDate(shop.paid_until)}` : 'not paid yet');

// ---------- payments ----------
export const getPayment = (id) => db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(id) || 0);
export const getShopPayment = (shopId, id) => db.prepare('SELECT * FROM payments WHERE id = ? AND shop_id = ?').get(Number(id) || 0, shopId);
export const shopPayments = (shopId) => db.prepare('SELECT * FROM payments WHERE shop_id = ? ORDER BY id DESC').all(shopId);

export function listPayments({ status = 'paid', limit = 200 } = {}) {
  return db
    .prepare(
      `SELECT p.*, s.name AS shop_name, s.slug AS shop_slug FROM payments p JOIN shops s ON s.id = p.shop_id
       WHERE (? = '' OR p.status = ?) ORDER BY COALESCE(p.paid_at, p.created_at) DESC LIMIT ?`
    )
    .all(status, status, limit);
}

export function revenueStats() {
  const month = ymd().slice(0, 7);
  const sum = (where, ...args) => db.prepare(`SELECT COALESCE(SUM(amount_paise), 0) AS n, COUNT(*) AS c FROM payments WHERE status = 'paid' ${where}`).get(...args);
  const thisMonth = sum('AND substr(paid_at, 1, 7) = ?', month);
  const total = sum('');
  const today = ymd();
  const live = db.prepare("SELECT paid_until, billing_cycle FROM shops WHERE is_demo = 0 AND status = 'active'").all();
  return {
    monthRupees: thisMonth.n / 100,
    monthCount: thisMonth.c,
    totalRupees: total.n / 100,
    totalCount: total.c,
    activeSubscriptions: live.filter((s) => s.paid_until && s.paid_until >= today).length,
    lifetime: live.filter((s) => s.billing_cycle === 'lifetime').length,
    expiringSoon: live.filter((s) => s.billing_cycle !== 'lifetime' && s.paid_until && s.paid_until >= today && s.paid_until <= addDays(today, 7)).length,
    expired: live.filter((s) => !s.paid_until || s.paid_until < today).length,
  };
}

/** What a payment was for, in words ("Pro plan · Yearly", "Bills add-on · Lifetime", "Updates & Support · 1 year"). */
export function paymentTitle(p) {
  if (p.title) return p.title;
  if (p.product === 'addon') return `${getAddon(p.item)?.name || p.item} add-on · ${CYCLES[p.cycle] || p.cycle}`;
  if (p.product === 'care') return 'Updates & Support · 1 year';
  if (p.product === 'service') return 'Service';
  return `${getPlan(p.plan || p.item)?.name || p.plan} plan · ${CYCLES[p.cycle] || p.cycle}`;
}

/** Inserts a payment row (status created). */
export function createPayment(shop, { product = 'plan', item, cycle, amountPaise, method = 'payu', kind = 'new', creditPaise = 0, note = '', title = '', refId = null }) {
  const reference = `pd_${shop.id}_${randomHex(6)}`;
  const info = db
    .prepare(
      `INSERT INTO payments (shop_id, product, item, plan, cycle, amount_paise, method, status, reference, note, title, ref_id, created_at, kind, credit_paise)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(shop.id, product, item, product === 'plan' ? item : '', cycle, Math.round(amountPaise), method, reference, note, title, refId, now(), kind, creditPaise);
  const p = getPayment(info.lastInsertRowid);
  if (!p.title) db.prepare('UPDATE payments SET title = ? WHERE id = ?').run(paymentTitle(p), p.id);
  return getPayment(p.id);
}

/** The paid plan payment whose period covers today (the plan in use), if any. */
export function currentPayment(shop) {
  const today = ymd();
  return db
    .prepare(
      "SELECT * FROM payments WHERE shop_id = ? AND product = 'plan' AND status = 'paid' AND superseded_at IS NULL AND period_start <= ? AND period_end >= ? ORDER BY id DESC LIMIT 1"
    )
    .get(shop.id, today, today);
}

const dayCount = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000) + 1;

/**
 * What choosing plan/cycle costs right now:
 *   new       – not on a running plan: full price from today
 *   renew     – same plan & cycle: full price, starts after the current end date
 *   upgrade   – higher value per day (or any move to lifetime): starts today, unused days credited
 *   lifetime-upgrade – lifetime to a bigger lifetime plan: pay the difference
 *   owned     – already on this lifetime plan
 *   downgrade – not possible mid-period (choose it when the current plan ends)
 */
export function quotePlanChange(shop, planKey, cycle) {
  const plan = activePlans().find((p) => p.key === planKey);
  if (!plan || !CYCLES[cycle]) throw new Error('Choose a plan and billing cycle.');
  const price = priceRupees(plan, cycle);
  if (cycle === 'lifetime' && price < 1) throw new Error(`${plan.name} is not sold as lifetime right now.`);
  const today = ymd();
  const running = shop.status === 'active' && !shop.is_demo && shop.paid_until >= today;

  if (running && isLifetime(shop)) {
    const cur = getPlan(shop.plan);
    if (cycle !== 'lifetime') return { kind: 'downgrade', plan, cycle, price, credit: 0, due: 0, currentName: cur?.name || shop.plan, lifetimeNow: true };
    if (plan.key === shop.plan) return { kind: 'owned', plan, cycle, price, credit: 0, due: 0, currentName: cur?.name || shop.plan };
    if (RANK[plan.key] < RANK[shop.plan]) return { kind: 'downgrade', plan, cycle, price, credit: 0, due: 0, currentName: cur?.name || shop.plan, lifetimeNow: true };
    const credit = cur ? cur.lifetime : 0;
    return { kind: 'upgrade', lifetimeUpgrade: true, plan, cycle, price, credit, due: Math.max(1, price - credit), start: today, end: LIFETIME_END, currentName: cur?.name || shop.plan };
  }

  // Paid periods that have not started yet (renewed early) are replaced by an upgrade – credit them in full.
  const future = running
    ? Math.floor(
        db.prepare("SELECT COALESCE(SUM(amount_paise + credit_paise), 0) AS n FROM payments WHERE shop_id = ? AND product = 'plan' AND status = 'paid' AND superseded_at IS NULL AND period_start > ?").get(shop.id, today).n / 100
      )
    : 0;
  const cur = running ? currentPayment(shop) : null;
  if (!cur) {
    if (cycle === 'lifetime' && future > 0) return { kind: 'upgrade', plan, cycle, price, credit: future, due: Math.max(1, price - future), start: today, end: LIFETIME_END, currentName: getPlan(shop.plan)?.name || shop.plan, used: 0, left: 0, total: 0, futureOnly: true };
    return { kind: 'new', plan, cycle, price, credit: 0, due: price, start: today, end: periodEnd(today, cycle) };
  }
  if (cur.plan === plan.key && cur.cycle === cycle) {
    const start = addDays(shop.paid_until, 1);
    return { kind: 'renew', plan, cycle, price, credit: 0, due: price, start, end: periodEnd(start, cycle), current: cur };
  }
  const total = dayCount(cur.period_start, cur.period_end);
  const left = Math.max(0, dayCount(today, cur.period_end));
  const used = total - left;
  const perDayOld = (cur.amount_paise + (cur.credit_paise || 0)) / 100 / total;
  const base = { plan, cycle, price, current: cur, used, left, total, currentName: getPlan(cur.plan)?.name || cur.plan };
  if (cycle !== 'lifetime') {
    const perDayNew = price / dayCount(today, periodEnd(today, cycle));
    if (perDayNew <= perDayOld) return { ...base, kind: 'downgrade', credit: 0, due: 0, start: addDays(shop.paid_until, 1), end: periodEnd(addDays(shop.paid_until, 1), cycle) };
  }
  const credit = Math.floor(perDayOld * left) + future;
  return { ...base, kind: 'upgrade', credit, due: Math.max(1, price - credit), start: today, end: periodEnd(today, cycle) };
}

/** Add-on purchase: { kind: new|renew|included|owned|unavailable, price, due, start, end }. */
export function quoteAddon(shop, key, cycle) {
  const addon = getAddon(key);
  if (!addon || !addon.active) throw new Error('This add-on is not available.');
  if (!CYCLES[cycle]) throw new Error('Choose monthly, yearly or lifetime.');
  const price = cycle === 'yearly' ? addon.yearly : cycle === 'lifetime' ? addon.lifetime : addon.monthly;
  if (price < 1) throw new Error(`${addon.name} is not sold ${CYCLES[cycle].toLowerCase()} right now.`);
  if (addonInPlan(addon, shop.plan)) return { kind: 'included', addon, cycle, price, due: 0 };
  const row = shopAddon(shop.id, key);
  const today = ymd();
  if (addonActive(row) && !row.ends_on) return { kind: 'owned', addon, cycle, price, due: 0 };
  const start = addonActive(row) && cycle !== 'lifetime' ? addDays(row.ends_on, 1) : today;
  return { kind: addonActive(row) ? 'renew' : 'new', addon, cycle, price, due: price, start, end: periodEnd(start, cycle) };
}

/** Updates & Support for a lifetime plan: one more year after the current end (or from today). */
export function quoteCare(shop) {
  if (!isLifetime(shop)) throw new Error('Updates & Support is for lifetime plans – subscriptions already include it.');
  const plan = getPlan(shop.plan);
  if (!plan || plan.care < 1) throw new Error('Updates & Support is not sold right now.');
  const today = ymd();
  const start = shop.care_until && shop.care_until >= today ? addDays(shop.care_until, 1) : today;
  return { kind: shop.care_until && shop.care_until >= today ? 'renew' : 'new', plan, price: plan.care, due: plan.care, start, end: periodEnd(start, 'yearly') };
}

// ---------- marking paid (the only place that switches things on after money) ----------
/**
 * Marks a payment paid (idempotent) and applies it. A demo shop that buys a plan goes live:
 * demo orders/files are cleared and its link moves to /<slug>.
 */
export function markPaid(paymentId, { providerPaymentId = null, amountPaise = null, actor = 'system', verified = false } = {}) {
  const payment = getPayment(paymentId);
  if (!payment || payment.status === 'paid') return payment;
  if (amountPaise != null && Number(amountPaise) !== payment.amount_paise) throw new Error('Paid amount does not match.');
  const shop = getShopById(payment.shop_id);
  if (!shop || isSampleShop(shop)) throw new Error('Shop not found.');
  const at = now();
  const today = ymd();
  const setPaid = (start, end) =>
    db
      .prepare(
        "UPDATE payments SET status = 'paid', paid_at = ?, provider_payment_id = COALESCE(?, provider_payment_id), period_start = ?, period_end = ?, verified_at = ?, gateway_status = CASE WHEN ? THEN 'success' ELSE gateway_status END WHERE id = ?"
      )
      .run(at, providerPaymentId, start, end, verified ? at : null, verified ? 1 : 0, payment.id);
  const amount = formatINR(payment.amount_paise / 100);
  const title = paymentTitle(payment);
  let shopMsg = '';
  let demoFiles = [];
  const wasDemo = Boolean(shop.is_demo);

  if (payment.product === 'plan') {
    const lifetime = payment.cycle === 'lifetime';
    const start = payment.kind === 'upgrade' || lifetime ? today : nextPeriodStart(shop);
    const end = periodEnd(start, payment.cycle);
    db.transaction(() => {
      if (payment.kind === 'upgrade' || lifetime) {
        db.prepare("UPDATE payments SET superseded_at = ? WHERE shop_id = ? AND product = 'plan' AND status = 'paid' AND superseded_at IS NULL AND id <> ?").run(at, shop.id, payment.id);
      }
      setPaid(start, end);
      if (wasDemo) {
        demoFiles = db.prepare('SELECT shop_id, stored_name FROM files WHERE shop_id = ?').all(shop.id);
        db.prepare('DELETE FROM orders WHERE shop_id = ?').run(shop.id);
        db.prepare('DELETE FROM bills WHERE shop_id = ?').run(shop.id);
        db.prepare('UPDATE shops SET is_demo = 0, next_order_no = 1001, next_bill_no = 1001, went_live_at = ? WHERE id = ?').run(at, shop.id);
      }
      db.prepare("UPDATE shops SET status = 'active', plan = ?, billing_cycle = ?, paid_until = ?, approved_at = COALESCE(approved_at, ?) WHERE id = ?").run(
        payment.plan, payment.cycle, end, at, shop.id
      );
      // Lifetime comes with one year of Updates & Support (never shortens a longer one).
      if (lifetime) {
        const care = periodEnd(today, 'yearly');
        if (!shop.care_until || shop.care_until < care) db.prepare('UPDATE shops SET care_until = ? WHERE id = ?').run(care, shop.id);
      }
    })();
    shopMsg = lifetime ? `${title}: yours for life. Updates & Support included for one year.` : `${title} active till ${formatDate(end)}.`;
  } else if (payment.product === 'addon') {
    db.transaction(() => {
      const row = grantAddon(shop.id, payment.item, { cycle: payment.cycle, source: 'payment', paymentId: payment.id, actor, note: `Paid ${amount}` });
      setPaid(row.starts_on, row.ends_on || LIFETIME_END);
    })();
    const row = shopAddon(shop.id, payment.item);
    shopMsg = `${title} is on${row.ends_on ? ` till ${formatDate(row.ends_on)}` : ' – no end date'}.`;
  } else if (payment.product === 'care') {
    const q = quoteCare(shop);
    db.transaction(() => {
      setPaid(q.start, q.end);
      setCareUntil(shop.id, q.end, { actor, note: `Paid ${amount}` });
    })();
    shopMsg = `Updates & Support active till ${formatDate(q.end)}.`;
  } else if (payment.product === 'service') {
    db.transaction(() => {
      setPaid(today, today);
      onServicePaid(payment);
    })();
    shopMsg = `${title} – paid. We are on it.`;
  }
  for (const f of demoFiles) fs.rm(path.join(paths.uploads, String(f.shop_id), f.stored_name), { force: true }, () => {});

  audit({ actor, shopId: shop.id, action: 'payment.paid', detail: `${title} · ${amount} · ${payment.method}${verified ? ' · verified with PayU' : ''} · ${payment.reference}` });
  notifyShop(shop.id, { kind: 'payment', title: wasDemo && payment.product === 'plan' ? 'Your shop is live!' : 'Payment received – thank you', body: shopMsg, link: '/shop/billing' });
  notifyAdmin({
    kind: 'payment',
    title: `Payment ${amount} from ${shop.name}`,
    body: `${title} · ${payment.method === 'manual' ? 'recorded manually' : 'PayU'}${wasDemo && payment.product === 'plan' ? ' · went live from demo' : ''}`,
    link: `/admin/shops/${shop.id}`,
  });
  if (config.adminEmail && payment.method !== 'manual') {
    sendMail({ to: config.adminEmail, subject: `Brighton Print payment ${amount} – ${shop.name}`, text: `${shop.name} paid ${amount} for ${title}.\n\n${config.adminUrl}/shops/${shop.id}` });
  }
  sendMail({ to: shop.email, subject: `Brighton Print receipt – ${amount}`, text: `Hi ${shop.owner_name || shop.name},\n\nWe received ${amount} for ${title}. ${shopMsg}\n\nReceipt: ${config.baseUrl}/shop/billing/receipt/${payment.id}\n\nBrighton Solution` });
  publishShop(shop.id);
  return getPayment(payment.id);
}

/** Admin records money received outside PayU (UPI, cash, bank) for any product. */
export function recordManualPayment(shop, { product = 'plan', item, planKey, cycle, amountRupees, note = '', refId = null, title = '' }) {
  if (isSampleShop(shop)) throw new Error('The sample demo shop cannot be billed.');
  item = item || planKey;
  let amount = amountRupees;
  let kind = 'new';
  if (product === 'plan') {
    const plan = getPlan(item);
    if (!plan || !CYCLES[cycle]) throw new Error('Choose a plan and billing cycle.');
    if (amount == null) amount = priceRupees(plan, cycle);
    kind = cycle === 'lifetime' ? 'upgrade' : 'new';
  } else if (product === 'addon') {
    const addon = getAddon(item);
    if (!addon || !CYCLES[cycle]) throw new Error('Choose an add-on and billing cycle.');
    if (amount == null) amount = cycle === 'yearly' ? addon.yearly : cycle === 'lifetime' ? addon.lifetime : addon.monthly;
  } else if (product === 'care') {
    const q = quoteCare(shop);
    cycle = 'yearly';
    item = 'care';
    if (amount == null) amount = q.price;
  } else if (product === 'service') {
    cycle = 'once';
    if (amount == null) throw new Error('Enter the amount.');
  } else throw new Error('Unknown product.');
  const payment = createPayment(shop, { product, item, cycle, amountPaise: Math.round(Number(amount) * 100), method: 'manual', note, kind, refId, title });
  return markPaid(payment.id, { actor: 'admin' });
}

// ---------- PayU (hosted checkout) ----------
// The shop's browser POSTs a signed form to PayU; PayU POSTs the result back to /pay/payu/return
// and (webhook) to /pay/payu/webhook. Both are checked with the reverse hash, then confirmed with
// PayU's verify_payment API before anything is switched on. No card data touches us.
export const payuEnabled = () => config.payu.enabled;
/** Real payments are on hold until PAYMENTS_OPEN=true; listed tester emails can always pay. */
export const paymentsOpenFor = (shop) => config.payu.enabled && (config.payu.open || config.payu.testers.includes(String(shop.email).toLowerCase()));
const sha512 = (s) => crypto.createHash('sha512').update(s).digest('hex');
const payuAmount = (p) => (p.amount_paise / 100).toFixed(2);

/**
 * Starts an online payment for this shop. what = { product, item, cycle } (or a service payment via
 * services.js). Validates, prices it on the server and returns the payment row.
 */
export function startCheckout(shop, { product = 'plan', item, cycle }) {
  if (!payuEnabled()) throw new Error('Online payment is not switched on yet. Please contact Brighton Solution.');
  if (shop.is_demo) throw new Error('Demo shops cannot be paid for. Register your real shop to go live.');
  if (product === 'plan') {
    const q = quotePlanChange(shop, item, cycle);
    if (q.kind === 'downgrade') throw new Error(q.lifetimeNow ? `You are on a lifetime plan – you can only move up to a bigger lifetime plan.` : `You can switch to ${q.plan.name} when your current plan ends on ${formatDate(shop.paid_until)}.`);
    if (q.kind === 'owned') throw new Error(`You already own ${q.plan.name} for life.`);
    const note = q.kind === 'upgrade' ? (q.lifetimeUpgrade ? `Lifetime upgrade from ${q.currentName}: credit ₹${q.credit}` : `Upgrade from ${q.currentName}: ${q.used} of ${q.total} days used, credit ₹${q.credit}`) : '';
    return createPayment(shop, { product, item: q.plan.key, cycle, amountPaise: q.due * 100, kind: q.kind, creditPaise: q.credit * 100, note });
  }
  if (product === 'addon') {
    if (shopStateActive(shop) === false) throw new Error('Your plan is not active. Renew your plan first, then add extras.');
    const q = quoteAddon(shop, item, cycle);
    if (q.kind === 'included') throw new Error(`${q.addon.name} is already included in your plan.`);
    if (q.kind === 'owned') throw new Error(`You already have ${q.addon.name} for life.`);
    return createPayment(shop, { product, item, cycle, amountPaise: q.due * 100, kind: q.kind });
  }
  if (product === 'care') {
    const q = quoteCare(shop);
    return createPayment(shop, { product, item: 'care', cycle: 'yearly', amountPaise: q.due * 100, kind: q.kind });
  }
  throw new Error('Choose what to pay for.');
}
const shopStateActive = (shop) => shop.status === 'active' && shop.paid_until && shop.paid_until >= ymd();

/** Fields for the auto-submitted form to PayU. */
export function payuForm(payment, shop) {
  const f = {
    key: config.payu.key,
    txnid: payment.reference,
    amount: payuAmount(payment),
    productinfo: `Brighton Print ${paymentTitle(payment)}`.replace(/[^\w ·&().-]/g, '').slice(0, 100),
    firstname: String(shop.owner_name || shop.name).replace(/[^A-Za-z0-9 .]/g, '').slice(0, 60) || 'Customer',
    email: shop.email,
    phone: waNumber(shop.mobile).slice(-10),
    udf1: String(shop.id),
    surl: `${config.baseUrl}/pay/payu/return`,
    furl: `${config.baseUrl}/pay/payu/return`,
  };
  f.hash = sha512(`${f.key}|${f.txnid}|${f.amount}|${f.productinfo}|${f.firstname}|${f.email}|${f.udf1}||||||||||${config.payu.salt}`);
  return { action: config.payu.test ? 'https://test.payu.in/_payment' : 'https://secure.payu.in/_payment', fields: f };
}

/** Asks PayU itself what happened to this transaction: { status: success|failure|pending|…, amount, mihpayid }. */
export async function verifyWithPayu(payment) {
  const url = config.payu.test ? 'https://test.payu.in/merchant/postservice.php?form=2' : 'https://info.payu.in/merchant/postservice.php?form=2';
  const command = 'verify_payment';
  const body = new URLSearchParams({ key: config.payu.key, command, var1: payment.reference, hash: sha512(`${config.payu.key}|${command}|${payment.reference}|${config.payu.salt}`) });
  const res = await fetch(url, { method: 'POST', body, headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`PayU verify HTTP ${res.status}`);
  const json = await res.json();
  const t = json?.transaction_details?.[payment.reference] || {};
  return { status: String(t.status || json?.msg || '').toLowerCase(), amount: String(t.amt ?? t.transaction_amount ?? ''), mihpayid: t.mihpayid ? String(t.mihpayid) : null };
}

/** Confirms a PayU payment with the verify API, then marks it paid / failed. Safe to call repeatedly. */
export async function confirmPayuPayment(paymentId, { actor = 'payu' } = {}) {
  let payment = getPayment(paymentId);
  if (!payment || payment.status !== 'created' || payment.method !== 'payu') return payment;
  if (!config.payu.verify) {
    // Verification switched off (local testing only): trust the signed callback.
    return payment;
  }
  let v;
  try {
    v = await verifyWithPayu(payment);
  } catch (err) {
    db.prepare("UPDATE payments SET gateway_status = 'verify_error' WHERE id = ?").run(payment.id);
    console.error('[payu] verify failed:', payment.reference, err.message);
    return getPayment(payment.id);
  }
  if (v.status === 'success') {
    if (Number(v.amount).toFixed(2) !== payuAmount(payment)) {
      db.prepare("UPDATE payments SET gateway_status = 'amount_mismatch' WHERE id = ?").run(payment.id);
      audit({ actor, shopId: payment.shop_id, action: 'payment.mismatch', detail: `${payment.reference}: PayU says ₹${v.amount}, expected ₹${payuAmount(payment)}` });
      notifyAdmin({ kind: 'warn', title: 'Payment amount mismatch', body: `${payment.reference}: PayU ₹${v.amount} vs ₹${payuAmount(payment)} – check it.`, link: `/admin/shops/${payment.shop_id}`, dedupe: `mismatch:${payment.id}` });
      return getPayment(payment.id);
    }
    return markPaid(payment.id, { providerPaymentId: v.mihpayid, actor, verified: true });
  }
  if (['failure', 'failed', 'usercancelled', 'cancelled', 'dropped', 'bounced'].includes(v.status)) {
    db.prepare("UPDATE payments SET status = 'failed', gateway_status = ?, provider_payment_id = COALESCE(?, provider_payment_id) WHERE id = ? AND status = 'created'").run(v.status, v.mihpayid, payment.id);
    audit({ actor, shopId: payment.shop_id, action: 'payment.failed', detail: `${paymentTitle(payment)} · ${payment.reference} · ${v.status}` });
    publishShop(payment.shop_id);
  } else db.prepare('UPDATE payments SET gateway_status = ? WHERE id = ?').run(v.status.slice(0, 40), payment.id);
  return getPayment(payment.id);
}

/** Checks the hash PayU signs its POST with. Returns the payment row or throws. */
function checkPayuPost(b) {
  const s = (k) => String(b[k] ?? '');
  const payment = db.prepare("SELECT * FROM payments WHERE reference = ? AND method = 'payu'").get(s('txnid'));
  if (!payment) throw new Error('Payment not found.');
  const reverse = `${config.payu.salt}|${s('status')}||||||${s('udf5')}|${s('udf4')}|${s('udf3')}|${s('udf2')}|${s('udf1')}|${s('email')}|${s('firstname')}|${s('productinfo')}|${s('amount')}|${s('txnid')}|${config.payu.key}`;
  const extra = b.additionalCharges ? `${s('additionalCharges')}|` : '';
  if (!config.payu.salt || !safeEqual(sha512(extra + reverse), s('hash').toLowerCase())) throw new Error('We could not verify this payment. If money was taken, contact support – we will fix it.');
  return payment;
}

/** PayU's browser POST back (and the server-to-server webhook). Returns the payment row. */
export async function handlePayuReturn(b) {
  const payment = checkPayuPost(b);
  const status = String(b.status ?? '');
  if (status === 'success') {
    if (String(b.amount ?? '') !== payuAmount(payment)) throw new Error('Paid amount does not match. Please contact support.');
    if (!config.payu.verify) return markPaid(payment.id, { providerPaymentId: String(b.mihpayid || '') || null, actor: 'payu' });
    return confirmPayuPayment(payment.id);
  }
  if (status === 'failure') {
    db.prepare("UPDATE payments SET status = 'failed', gateway_status = 'failure', provider_payment_id = ? WHERE id = ? AND status = 'created'").run(String(b.mihpayid || '') || null, payment.id);
  }
  return getPayment(payment.id);
}

/** Job: re-checks recent unfinished PayU payments (browser closed, webhook missed) and drops stale ones. */
export async function reconcilePayu() {
  if (!payuEnabled() || !config.payu.verify) return 0;
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const until = new Date(Date.now() - 2 * 60000).toISOString();
  const rows = db.prepare("SELECT id FROM payments WHERE method = 'payu' AND status = 'created' AND created_at BETWEEN ? AND ? ORDER BY id LIMIT 50").all(since, until);
  let n = 0;
  for (const r of rows) {
    const p = await confirmPayuPayment(r.id, { actor: 'system' });
    if (p?.status === 'paid') n++;
  }
  db.prepare("UPDATE payments SET status = 'cancelled', gateway_status = 'expired' WHERE method = 'payu' AND status = 'created' AND created_at < ?").run(since);
  return n;
}

// ---------- daily reminders ----------
/** Plan, add-on and Updates & Support reminders before expiry + expiry notices. Idempotent (dedupe keys). */
export function runReminders() {
  const today = ymd();
  const shops = db.prepare("SELECT * FROM shops WHERE status = 'active' AND paid_until IS NOT NULL").all();
  for (const shop of shops) {
    if (isSampleShop(shop)) continue;
    const left = daysLeft(shop);
    if (shop.is_demo) {
      if (left === 2 || left === 0) {
        notifyShop(shop.id, { kind: 'warn', title: left ? 'Your demo ends in 2 days' : 'Your demo ends today', body: 'Go live to keep your link and start taking real orders.', link: '/shop/billing', dedupe: `demo-end:${shop.id}:${shop.paid_until}:${left}` });
      }
      continue;
    }
    if (!isLifetime(shop) && config.reminderDays.includes(left)) {
      const fresh = notifyShop(shop.id, { kind: 'warn', title: `Your plan ends in ${left} day${left === 1 ? '' : 's'}`, body: `Renew before ${formatDate(shop.paid_until)} to keep taking orders.`, link: '/shop/billing', dedupe: `remind:${shop.id}:${shop.paid_until}:${left}` });
      if (fresh) sendMail({ to: shop.email, subject: `Brighton Print: your plan ends in ${left} day${left === 1 ? '' : 's'}`, text: `Hi ${shop.owner_name || shop.name},\n\nYour Brighton Print plan ends on ${formatDate(shop.paid_until)}. Renew here to keep your order link open:\n${config.baseUrl}/shop/billing\n\nBrighton Solution` });
    }
    if (shop.paid_until < today) {
      const fresh = notifyShop(shop.id, { kind: 'warn', title: 'Your plan has ended', body: 'Your order link is closed and paid features are paused. Renew to switch everything back on.', link: '/shop/billing', dedupe: `expired:${shop.id}:${shop.paid_until}` });
      if (fresh) {
        notifyAdmin({ kind: 'warn', title: `${shop.name}'s plan expired`, body: `Ended ${formatDate(shop.paid_until)}`, link: `/admin/shops/${shop.id}`, dedupe: `admin-expired:${shop.id}:${shop.paid_until}` });
        sendMail({ to: shop.email, subject: 'Brighton Print: your plan has ended', text: `Hi ${shop.owner_name || shop.name},\n\nYour Brighton Print plan ended on ${formatDate(shop.paid_until)}, so your order link is closed. Renew to switch it back on:\n${config.baseUrl}/shop/billing\n\nBrighton Solution` });
      }
    }
    // Lifetime: Updates & Support renewal (30 / 7 days before, on the day it ends).
    if (isLifetime(shop) && shop.care_until) {
      const careLeft = Math.round((Date.parse(shop.care_until + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
      if ([30, 7, 0].includes(careLeft)) {
        notifyShop(shop.id, {
          kind: 'warn',
          title: careLeft ? `Updates & Support ends in ${careLeft} days` : 'Updates & Support ends today',
          body: 'Your lifetime plan keeps working. Renew to keep getting new features and priority help.',
          link: '/shop/billing#care',
          dedupe: `care:${shop.id}:${shop.care_until}:${careLeft}`,
        });
      }
    }
  }
  // Add-ons with an end date.
  const addons = db.prepare("SELECT a.*, s.name AS shop_name, s.email, s.owner_name FROM shop_addons a JOIN shops s ON s.id = a.shop_id WHERE a.status = 'active' AND a.ends_on IS NOT NULL AND s.is_demo = 0").all();
  for (const a of addons) {
    const left = Math.round((Date.parse(a.ends_on + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
    const name = getAddon(a.addon)?.name || a.addon;
    if (config.reminderDays.includes(left)) {
      notifyShop(a.shop_id, { kind: 'warn', title: `${name} ends in ${left} day${left === 1 ? '' : 's'}`, body: `Renew before ${formatDate(a.ends_on)} to keep using ${name}.`, link: '/shop/billing#addons', dedupe: `addon:${a.shop_id}:${a.addon}:${a.ends_on}:${left}` });
    }
    if (left === -1) {
      notifyShop(a.shop_id, { kind: 'warn', title: `${name} has ended`, body: `${name} is paused. Your data is safe – renew to switch it back on.`, link: '/shop/billing#addons', dedupe: `addon-end:${a.shop_id}:${a.addon}:${a.ends_on}` });
      audit({ actor: 'system', shopId: a.shop_id, action: 'addon.expired', detail: `${a.addon} ended ${a.ends_on}` });
    }
  }
}
