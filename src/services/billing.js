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

// Subscriptions: a shop buys a plan for one month or one year. Paying extends
// shops.paid_until from max(today, current paid_until). When paid_until passes
// the shop is 'expired' (order link closed, dashboard locked to billing/support).
// Payments go through PayU hosted checkout (no card data here)
// or are recorded manually by the admin (UPI / cash / bank transfer).

export const CYCLES = { monthly: 'Monthly', yearly: 'Yearly' };

export const DEFAULT_PLANS = [
  { key: 'starter', name: 'Starter', monthly: 299, yearly: 3229, storageGb: 10, active: true, popular: false },
  { key: 'pro', name: 'Pro', monthly: 499, yearly: 5389, storageGb: 30, active: true, popular: true },
  { key: 'business', name: 'Business', monthly: 999, yearly: 10789, storageGb: 100, active: true, popular: false },
];
export const PLAN_KEYS = DEFAULT_PLANS.map((p) => p.key);

/** Plans with admin-edited prices (stored in meta 'plans'). Prices are whole rupees. */
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
      storageGb: num(s.storageGb, d.storageGb),
      active: s.active === undefined ? d.active : Boolean(s.active),
      popular: s.popular === undefined ? d.popular : Boolean(s.popular),
    };
  });
}
export const activePlans = () => getPlans().filter((p) => p.active);
export const getPlan = (key) => getPlans().find((p) => p.key === key) || null;

/** Saves plan settings (admin). `list` items: {key, name, monthly, yearly, storageGb, active, popular}. */
export function savePlans(list) {
  const clean = DEFAULT_PLANS.map((d) => {
    const p = list.find((x) => x.key === d.key) || {};
    return { key: d.key, name: p.name, monthly: p.monthly, yearly: p.yearly, storageGb: p.storageGb, active: p.active, popular: p.popular };
  });
  meta.set('plans', JSON.stringify(clean));
}

export const priceRupees = (plan, cycle) => (cycle === 'yearly' ? plan.yearly : plan.monthly);
export const formatINR = (rupees) => '₹' + Number(rupees || 0).toLocaleString('en-IN');

export const isSampleShop = (shop) => Boolean(shop?.is_demo) && shop.slug === config.demo.slug;

/** Storage cap in bytes for uploads to this shop (0 = none). */
export function storageCapBytes(shop) {
  if (shop.is_demo) return config.limits.demoStorageBytes;
  if (config.limits.shopQuotaBytes) return config.limits.shopQuotaBytes;
  const plan = getPlan(shop.plan);
  return plan ? plan.storageGb * 1024 * 1024 * 1024 : 0;
}

/** End date (YYYY-MM-DD) one cycle after `start` (inclusive day count, clamps month ends). */
export function periodEnd(start, cycle) {
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
  if (!shop.is_demo && shop.status === 'active' && shop.paid_until && shop.paid_until >= today) return addDays(shop.paid_until, 1);
  return today;
}

export const daysLeft = (shop) => (shop.paid_until ? Math.round((Date.parse(shop.paid_until + 'T00:00:00Z') - Date.parse(ymd() + 'T00:00:00Z')) / 86400000) : null);

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
  const thisMonth = sum("AND substr(paid_at, 1, 7) = ?", month);
  const total = sum('');
  const today = ymd();
  const live = db.prepare("SELECT paid_until FROM shops WHERE is_demo = 0 AND status = 'active'").all();
  return {
    monthRupees: thisMonth.n / 100,
    monthCount: thisMonth.c,
    totalRupees: total.n / 100,
    totalCount: total.c,
    activeSubscriptions: live.filter((s) => s.paid_until && s.paid_until >= today).length,
    expiringSoon: live.filter((s) => s.paid_until && s.paid_until >= today && s.paid_until <= addDays(today, 7)).length,
    expired: live.filter((s) => !s.paid_until || s.paid_until < today).length,
  };
}

function createPaymentRow(shop, plan, cycle, method, note = '') {
  const reference = `pd_${shop.id}_${randomHex(6)}`;
  const info = db
    .prepare(
      "INSERT INTO payments (shop_id, plan, cycle, amount_paise, method, status, reference, note, created_at) VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?)"
    )
    .run(shop.id, plan.key, cycle, Math.round(priceRupees(plan, cycle) * 100), method, reference, note, now());
  return getPayment(info.lastInsertRowid);
}

/**
 * Marks a payment paid (idempotent) and extends the shop. A demo shop that pays
 * goes live: demo orders/files are cleared and its link moves to /<slug>.
 */
export function markPaid(paymentId, { providerPaymentId = null, amountPaise = null } = {}) {
  const payment = getPayment(paymentId);
  if (!payment || payment.status === 'paid') return payment;
  if (amountPaise != null && Number(amountPaise) !== payment.amount_paise) throw new Error('Paid amount does not match.');
  const shop = getShopById(payment.shop_id);
  if (!shop || isSampleShop(shop)) throw new Error('Shop not found.');
  const wasDemo = Boolean(shop.is_demo);
  const start = nextPeriodStart(shop);
  const end = periodEnd(start, payment.cycle);
  const at = now();
  let demoFiles = [];
  db.transaction(() => {
    db.prepare("UPDATE payments SET status = 'paid', paid_at = ?, provider_payment_id = COALESCE(?, provider_payment_id), period_start = ?, period_end = ? WHERE id = ?").run(
      at, providerPaymentId, start, end, payment.id
    );
    if (wasDemo) {
      demoFiles = db.prepare('SELECT shop_id, stored_name FROM files WHERE shop_id = ?').all(shop.id);
      db.prepare('DELETE FROM orders WHERE shop_id = ?').run(shop.id);
      db.prepare('UPDATE shops SET is_demo = 0, next_order_no = 1001, went_live_at = ? WHERE id = ?').run(at, shop.id);
    }
    db.prepare(
      "UPDATE shops SET status = 'active', plan = ?, billing_cycle = ?, paid_until = ?, approved_at = COALESCE(approved_at, ?) WHERE id = ?"
    ).run(payment.plan, payment.cycle, end, at, shop.id);
  })();
  for (const f of demoFiles) fs.rm(path.join(paths.uploads, String(f.shop_id), f.stored_name), { force: true }, () => {});

  const plan = getPlan(payment.plan);
  const amount = formatINR(payment.amount_paise / 100);
  notifyShop(shop.id, {
    kind: 'payment',
    title: wasDemo ? 'Your shop is live!' : 'Payment received – thank you',
    body: `${plan?.name || payment.plan} plan (${CYCLES[payment.cycle]}) active till ${formatDate(end)}.`,
    link: '/shop/billing',
  });
  notifyAdmin({
    kind: 'payment',
    title: `Payment ${amount} from ${shop.name}`,
    body: `${plan?.name || payment.plan} · ${CYCLES[payment.cycle]} · ${payment.method === 'manual' ? 'recorded manually' : 'PayU'} · till ${formatDate(end)}${wasDemo ? ' · went live from demo' : ''}`,
    link: `/admin/shops/${shop.id}`,
  });
  if (config.adminEmail && payment.method !== 'manual') {
    sendMail({ to: config.adminEmail, subject: `Brighton Print payment ${amount} – ${shop.name}`, text: `${shop.name} paid ${amount} for ${plan?.name || payment.plan} (${CYCLES[payment.cycle]}). Active till ${formatDate(end)}.\n\n${config.adminUrl}/shops/${shop.id}` });
  }
  sendMail({ to: shop.email, subject: `Brighton Print receipt – ${amount}`, text: `Hi ${shop.owner_name || shop.name},\n\nWe received ${amount} for the ${plan?.name || payment.plan} plan (${CYCLES[payment.cycle]}). Your Brighton Print is active till ${formatDate(end)}.\n\nReceipt: ${config.baseUrl}/shop/billing/receipt/${payment.id}\n\nBrighton Solution` });
  publishShop(shop.id);
  return getPayment(payment.id);
}

/** Admin records a payment received outside PayU (UPI, cash, bank). */
export function recordManualPayment(shop, { planKey, cycle, amountRupees, note = '' }) {
  const plan = getPlan(planKey);
  if (!plan || !CYCLES[cycle]) throw new Error('Choose a plan and billing cycle.');
  if (isSampleShop(shop)) throw new Error('The sample demo shop cannot be billed.');
  const payment = createPaymentRow(shop, plan, cycle, 'manual', note);
  if (amountRupees != null && Number.isFinite(Number(amountRupees))) {
    db.prepare('UPDATE payments SET amount_paise = ? WHERE id = ?').run(Math.round(Number(amountRupees) * 100), payment.id);
  }
  return markPaid(payment.id);
}

// ---------- PayU (hosted checkout) ----------
// The shop's browser POSTs a signed form to PayU; PayU POSTs the result back to
// /pay/payu/return (verified with the reverse hash). No card data touches us.
export const payuEnabled = () => config.payu.enabled;
/** Real payments are on hold until PAYMENTS_OPEN=true; listed tester emails can always pay. */
export const paymentsOpenFor = (shop) => config.payu.enabled && (config.payu.open || config.payu.testers.includes(String(shop.email).toLowerCase()));
const sha512 = (s) => crypto.createHash('sha512').update(s).digest('hex');
const payuAmount = (p) => (p.amount_paise / 100).toFixed(2);

/** Creates a PayU payment row for this shop / plan / cycle. */
export function startPayuPayment(shop, planKey, cycle) {
  if (!payuEnabled()) throw new Error('Online payment is not switched on yet. Please contact Brighton Solution.');
  const plan = activePlans().find((p) => p.key === planKey);
  if (!plan || !CYCLES[cycle]) throw new Error('Choose a plan and billing cycle.');
  if (shop.is_demo) throw new Error('Demo shops cannot be paid for. Register your real shop to go live.');
  return createPaymentRow(shop, plan, cycle, 'payu');
}

/** Fields for the auto-submitted form to PayU. */
export function payuForm(payment, shop) {
  const plan = getPlan(payment.plan);
  const f = {
    key: config.payu.key,
    txnid: payment.reference,
    amount: payuAmount(payment),
    productinfo: `Brighton Print ${plan?.name || payment.plan} ${CYCLES[payment.cycle]}`,
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

/** Handles PayU's POST back. Returns the payment row (paid / failed / still created). Throws on a bad hash. */
export function handlePayuReturn(b) {
  const s = (k) => String(b[k] ?? '');
  const payment = db.prepare("SELECT * FROM payments WHERE reference = ? AND method = 'payu'").get(s('txnid'));
  if (!payment) throw new Error('Payment not found.');
  const reverse = `${config.payu.salt}|${s('status')}||||||${s('udf5')}|${s('udf4')}|${s('udf3')}|${s('udf2')}|${s('udf1')}|${s('email')}|${s('firstname')}|${s('productinfo')}|${s('amount')}|${s('txnid')}|${config.payu.key}`;
  const extra = b.additionalCharges ? `${s('additionalCharges')}|` : '';
  if (!config.payu.salt || !safeEqual(sha512(extra + reverse), s('hash').toLowerCase())) throw new Error('We could not verify this payment. If money was taken, contact support – we will fix it.');
  if (s('status') === 'success') {
    if (s('amount') !== payuAmount(payment)) throw new Error('Paid amount does not match. Please contact support.');
    return markPaid(payment.id, { providerPaymentId: s('mihpayid') || null });
  }
  if (s('status') === 'failure') db.prepare("UPDATE payments SET status = 'failed', provider_payment_id = ? WHERE id = ? AND status = 'created'").run(s('mihpayid') || null, payment.id);
  return getPayment(payment.id);
}

// ---------- daily reminders ----------
/** Renewal reminders before expiry, expiry notices, and demo-ending notices. Idempotent (dedupe keys). */
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
    if (config.reminderDays.includes(left)) {
      const fresh = notifyShop(shop.id, { kind: 'warn', title: `Your plan ends in ${left} day${left === 1 ? '' : 's'}`, body: `Renew before ${formatDate(shop.paid_until)} to keep taking orders.`, link: '/shop/billing', dedupe: `remind:${shop.id}:${shop.paid_until}:${left}` });
      if (fresh) sendMail({ to: shop.email, subject: `Brighton Print: your plan ends in ${left} day${left === 1 ? '' : 's'}`, text: `Hi ${shop.owner_name || shop.name},\n\nYour Brighton Print plan ends on ${formatDate(shop.paid_until)}. Renew here to keep your order link open:\n${config.baseUrl}/shop/billing\n\nBrighton Solution` });
    }
    if (shop.paid_until < today) {
      const fresh = notifyShop(shop.id, { kind: 'warn', title: 'Your plan has ended', body: 'Your order link is closed. Renew to switch it back on.', link: '/shop/billing', dedupe: `expired:${shop.id}:${shop.paid_until}` });
      if (fresh) {
        notifyAdmin({ kind: 'warn', title: `${shop.name}'s plan expired`, body: `Ended ${formatDate(shop.paid_until)}`, link: `/admin/shops/${shop.id}`, dedupe: `admin-expired:${shop.id}:${shop.paid_until}` });
        sendMail({ to: shop.email, subject: 'Brighton Print: your plan has ended', text: `Hi ${shop.owner_name || shop.name},\n\nYour Brighton Print plan ended on ${formatDate(shop.paid_until)}, so your order link is closed. Renew to switch it back on:\n${config.baseUrl}/shop/billing\n\nBrighton Solution` });
      }
    }
  }
}
