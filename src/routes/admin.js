import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { html } from '../lib/html.js';
import { config } from '../config.js';
import { db } from '../db.js';
import { addDays, clean, cleanLine, flash, formatDate, safeEqual, ymd } from '../lib/util.js';
import { PLANS } from '../lib/status.js';
import { loginAdmin, loginLimiter, logout, requireAdmin, revokeAdminSessions, safeNext } from '../lib/security.js';
import {
  adminOverview,
  approveShop,
  generatePassword,
  getShopById,
  listShopsForAdmin,
  setAdminNote,
  setPassword,
  setShopStatus,
  shopCounts,
  shopState,
  storageUsed,
} from '../services/shops.js';
import { isSampleShop, listPayments, revenueStats, shopPayments, storageCapBytes } from '../services/billing.js';
import { adminOpenTickets, listAllTickets, listShopTickets } from '../services/support.js';
import { notifyShop } from '../services/notifications.js';
import { orderFormUrl, sendMail } from '../services/notify.js';
import { messagePage, render } from '../views/layout.js';
import { loginView } from '../views/admin/login.js';
import { overviewView } from '../views/admin/overview.js';
import { shopsView } from '../views/admin/shops.js';
import { shopView } from '../views/admin/shop.js';
import {
  DEMO_EXTEND,
  EXTEND,
  MAX_DEMO_DAYS,
  MAX_PAID_MONTHS,
  SHOP_FILTERS,
  addMonths,
  daysBetween,
  extendBase,
  planName,
  shopFilter,
  validDate,
} from '../views/admin/common.js';

// Super-admin area (Brighton Solution). Mounted at /admin. Payments, plans,
// tickets and notifications live in admin-billing.js / admin-support.js.

const router = Router();

// ---------- login ----------
const adminConfigured = () => Boolean(config.adminEmail && config.adminPassword);
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

/** ADMIN_PASSWORD may be a bcrypt hash ("$2…") or plain text (compared in constant time). */
function adminPasswordOk(password) {
  const stored = config.adminPassword;
  if (stored.startsWith('$2')) {
    try {
      return bcrypt.compareSync(password, stored);
    } catch {
      return false;
    }
  }
  return safeEqual(sha(password), sha(stored));
}

function renderLogin(res, data = {}, status = 200) {
  render(res, { title: 'Admin sign in', variant: 'admin', bodyClass: 'adm-login-page', body: loginView(res, { disabled: !adminConfigured(), ...data }) }, status);
}

router.get('/login', (req, res) => {
  if (res.locals.isAdmin) return res.redirect('/admin');
  renderLogin(res);
});

router.post('/login', loginLimiter, (req, res) => {
  if (!adminConfigured()) return renderLogin(res, {}, 503);
  const email = cleanLine(req.body.email, 160).toLowerCase();
  const password = String(req.body.password ?? '').slice(0, 200);
  if (!email || !password) return renderLogin(res, { email, error: 'Enter your email and password.' }, 400);
  // Check both before deciding, so timing does not reveal which one was wrong.
  const passOk = adminPasswordOk(password);
  const emailOk = safeEqual(sha(email), sha(config.adminEmail));
  if (!passOk || !emailOk) return renderLogin(res, { email, error: 'Email or password is incorrect.' }, 401);
  loginAdmin(req);
  res.redirect('/admin');
});

router.post('/logout', (req, res) => {
  // Admin cookies cannot be deleted server-side: logging out ends every admin session.
  if (res.locals.isAdmin) revokeAdminSessions();
  logout(req);
  res.setHeader('Clear-Site-Data', '"cache"');
  flash(req, 'info', 'You are logged out.');
  res.redirect('/admin/login');
});

// ---------- everything below needs the admin session ----------
router.use(requireAdmin);

// A reset password is shown once: hand it to the next admin page view, then forget it.
router.use((req, res, next) => {
  if (req.method === 'GET' && req.session.pwReveal) {
    res.locals.pwReveal = req.session.pwReveal;
    delete req.session.pwReveal;
  }
  next();
});

const SHOP = '/shops/:id(\\d+)';
const ADMIN_PATH = /^\/admin(?:[/?#]|$)/;

const qRecentOrders = db.prepare(
  `SELECT o.order_no, o.status, o.is_sample, o.created_at,
     (SELECT COUNT(*) FROM files f WHERE f.order_id = o.id AND f.kind = 'customer') AS file_count
   FROM orders o WHERE o.shop_id = ? ORDER BY o.id DESC LIMIT 10`
);
const qLiveFiles = db.prepare('SELECT COUNT(*) AS n FROM files WHERE shop_id = ? AND deleted_at IS NULL');
const qSetPlan = db.prepare('UPDATE shops SET plan = ?, paid_until = ? WHERE id = ?');
const qSetPaidUntil = db.prepare('UPDATE shops SET paid_until = ? WHERE id = ?');
const qActivateDemo = db.prepare("UPDATE shops SET status = 'active', paid_until = ? WHERE id = ? AND is_demo = 1");

function notFound(res) {
  messagePage(res, {
    status: 404,
    title: 'Shop not found',
    text: 'This shop does not exist or was removed.',
    variant: 'admin',
    iconName: 'search',
    action: html`<a class="btn btn-primary" href="/admin/shops">Back to all shops</a>`,
  });
}

function loadShop(req, res, next) {
  const shop = getShopById(Number(req.params.id));
  if (!shop) return notFound(res);
  req.adminShop = shop;
  next();
}

/** Where to go after an action: a local /admin URL from the form, else the shop page. */
function backTo(req, shop) {
  const next = safeNext(req.body?.next, '');
  return ADMIN_PATH.test(next) ? next : `/admin/shops/${shop.id}`;
}

function finish(req, res, shop, type, text) {
  flash(req, type, text);
  res.redirect(303, backTo(req, shop));
}

const pickPlan = (value) => (typeof value === 'string' && PLANS.includes(value) ? value : null);

/**
 * New paid-until (live shop) or demo end date (demo shop) from a quick-extend
 * button or the date field. Returns { date } or { error }.
 */
function resolvePaidUntil(body, shop, today) {
  const demo = Boolean(shop.is_demo);
  const quick = demo ? DEMO_EXTEND : EXTEND;
  const key = typeof body.extend === 'string' && Object.hasOwn(quick, body.extend) ? body.extend : '';
  const base = extendBase(shop, today);
  let date = String(body.paid_until || '').trim();
  if (key) date = demo ? addDays(base, quick[key].days) : addMonths(base, quick[key].months);
  if (!validDate(date)) return { error: 'Choose a valid date.' };
  if (date < today) return { error: 'The date cannot be in the past.' };
  if (demo && date > addDays(today, MAX_DEMO_DAYS)) return { error: `A demo can run at most ${MAX_DEMO_DAYS} days from today.` };
  if (!demo && date > addMonths(today, MAX_PAID_MONTHS)) return { error: 'Choose a date within the next 5 years.' };
  return { date };
}

/** The shared sample shop is view only. */
function blockSample(req, res, next) {
  if (isSampleShop(req.adminShop)) return finish(req, res, req.adminShop, 'warn', 'The sample demo shop is view only.');
  next();
}

// ---------- overview ----------
router.get('/', (req, res) => {
  // Old bookmarks: /admin?status=… / ?q=… now live on /admin/shops.
  if (typeof req.query.status === 'string' || typeof req.query.q === 'string') {
    const qs = new URLSearchParams();
    if (typeof req.query.status === 'string' && SHOP_FILTERS.some((f) => f.key === req.query.status)) qs.set('status', req.query.status);
    if (typeof req.query.q === 'string') qs.set('q', cleanLine(req.query.q, 80));
    return res.redirect(`/admin/shops${qs.toString() ? '?' + qs : ''}`);
  }
  const today = ymd();
  const all = listShopsForAdmin();
  const expiring = all
    .filter((s) => !s.is_demo && s.state === 'active' && daysBetween(today, s.paid_until) <= 7)
    .sort((a, b) => a.paid_until.localeCompare(b.paid_until));
  const signups = all
    .filter((s) => !isSampleShop(s))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6);
  render(res, {
    title: 'Overview · Admin',
    variant: 'admin',
    active: 'overview',
    body: overviewView(res, {
      rev: revenueStats(),
      overview: adminOverview(),
      demoActive: all.filter((s) => s.is_demo && !isSampleShop(s) && s.state === 'active').length,
      openTickets: adminOpenTickets(),
      expiring,
      payments: listPayments({ status: 'paid', limit: 6 }),
      signups,
      tickets: listAllTickets({ status: 'open' }).slice(0, 5),
      today,
    }),
  });
});

// ---------- all shops ----------
router.get('/shops', (req, res) => {
  const q = typeof req.query.q === 'string' ? cleanLine(req.query.q, 80) : '';
  const status = typeof req.query.status === 'string' && SHOP_FILTERS.some((f) => f.key === req.query.status) ? req.query.status : '';
  const today = ymd();
  const all = listShopsForAdmin({ q });
  const counts = Object.fromEntries(SHOP_FILTERS.map((f) => [f.key, all.filter((s) => f.test(s, today)).length]));
  const filter = shopFilter(status);
  const shops = all.filter((s) => filter.test(s, today));
  if (status === 'expiring') shops.sort((a, b) => a.paid_until.localeCompare(b.paid_until));
  if (status === 'expired') shops.sort((a, b) => String(b.paid_until || '').localeCompare(String(a.paid_until || '')));
  render(res, {
    title: 'Shops · Admin',
    variant: 'admin',
    active: 'shops',
    body: shopsView(res, { shops, counts, q, status, today }),
  });
});

// ---------- one shop ----------
router.get(SHOP, loadShop, (req, res) => {
  const shop = req.adminShop;
  const reveal = res.locals.pwReveal && res.locals.pwReveal.id === shop.id ? String(res.locals.pwReveal.pw || '') : '';
  render(res, {
    title: `${shop.name} · Admin`,
    variant: 'admin',
    active: 'shops',
    // Enhancements for the embedded payment / message forms.
    scripts: ['/js/billing.js', '/js/support.js'],
    body: shopView(res, {
      shop,
      state: shopState(shop),
      counts: shopCounts(shop.id),
      storage: storageUsed(shop.id),
      cap: storageCapBytes(shop),
      liveFiles: qLiveFiles.get(shop.id).n,
      recent: qRecentOrders.all(shop.id),
      payments: shopPayments(shop.id),
      tickets: listShopTickets(shop.id),
      today: ymd(),
      reveal,
    }),
  });
});

/** Switches a shop on without a payment (complimentary start, re-activation after a pause). */
function activate(req, res) {
  const shop = req.adminShop;
  const today = ymd();
  const state = shopState(shop);
  if (shop.status === 'active') {
    const msg = state === 'expired' ? 'This shop is switched on but its time has ended – set a new date to extend it.' : `${shop.name} is already active.`;
    return finish(req, res, shop, 'info', msg);
  }
  let until = shop.paid_until;
  if (req.body.paid_until || req.body.extend) {
    const paid = resolvePaidUntil(req.body, shop, today);
    if (paid.error) return finish(req, res, shop, 'error', paid.error);
    until = paid.date;
  } else if (!validDate(until) || until < today) {
    return finish(req, res, shop, 'error', 'Choose the date until which the shop stays active.');
  }

  if (shop.is_demo) {
    qActivateDemo.run(until, shop.id);
    notifyShop(shop.id, { kind: 'success', title: 'Your demo is active again', body: `Your demo link works till ${formatDate(until)}.`, link: '/shop' });
    return finish(req, res, shop, 'success', `Demo shop active again till ${formatDate(until)}.`);
  }

  const plan = pickPlan(req.body.plan) || pickPlan(shop.plan);
  if (!plan) return finish(req, res, shop, 'error', 'Choose a plan.');
  approveShop(shop.id, { plan, paid_until: until });
  notifyShop(shop.id, {
    kind: 'success',
    title: 'Your PrintDesk is active',
    body: `${planName(plan)} plan active till ${formatDate(until)}. Your order link is taking orders.`,
    link: '/shop',
  });
  if (shop.status === 'pending') {
    sendMail({
      to: shop.email,
      subject: 'Your PrintDesk account is active',
      text: `Hi ${shop.owner_name || shop.name},\n\nYour PrintDesk account is active till ${formatDate(until)}.\nLog in: ${config.baseUrl}/login\nYour customer order link: ${orderFormUrl(shop)}\n\nBrighton Solution`,
    });
  }
  finish(req, res, shop, 'success', `${shop.name} is active (${planName(plan)}, till ${formatDate(until)}). Their order link is taking orders.`);
}
router.post(`${SHOP}/activate`, loadShop, blockSample, activate);
router.post(`${SHOP}/approve`, loadShop, blockSample, activate); // old form name

/** Sets a new paid-until date (live: optionally a new plan) without recording a payment. */
function extend(req, res) {
  const shop = req.adminShop;
  if (shop.status === 'pending' || shop.status === 'rejected') return finish(req, res, shop, 'error', 'This shop is not active. Activate it or record a payment first.');
  const today = ymd();
  const paid = resolvePaidUntil(req.body, shop, today);
  if (paid.error) return finish(req, res, shop, 'error', paid.error);
  const wasExpired = shopState(shop) === 'expired';
  const paused = shop.status === 'paused' ? ' The shop is still paused – activate it to reopen the link.' : '';

  if (shop.is_demo) {
    qSetPaidUntil.run(paid.date, shop.id);
    notifyShop(shop.id, { kind: 'success', title: 'Your demo was extended', body: `Your demo now runs till ${formatDate(paid.date)}.`, link: '/shop' });
    return finish(req, res, shop, 'success', `Demo extended till ${formatDate(paid.date)}.${paused}`);
  }

  const plan = pickPlan(req.body.plan) || pickPlan(shop.plan);
  if (!plan) return finish(req, res, shop, 'error', 'Choose a plan.');
  qSetPlan.run(plan, paid.date, shop.id);
  notifyShop(shop.id, {
    kind: 'success',
    title: wasExpired ? 'Your plan is active again' : 'Your plan was updated',
    body: `${planName(plan)} plan active till ${formatDate(paid.date)}.${wasExpired ? ' Your order link is open again.' : ''}`,
    link: '/shop/billing',
  });
  finish(req, res, shop, 'success', `Saved: ${planName(plan)}, paid until ${formatDate(paid.date)}.${paused}`);
}
router.post(`${SHOP}/extend`, loadShop, blockSample, extend);
router.post(`${SHOP}/plan`, loadShop, blockSample, extend); // old form name

router.post(`${SHOP}/pause`, loadShop, blockSample, (req, res) => {
  const shop = req.adminShop;
  if (shop.status !== 'active') return finish(req, res, shop, 'info', 'Only active shops can be paused.');
  setShopStatus(shop.id, 'paused');
  notifyShop(shop.id, { kind: 'warn', title: 'Your account is paused', body: 'Your order link is not taking new orders. Please contact support.', link: '/shop/support' });
  finish(req, res, shop, 'success', `${shop.name} is paused. Their order link no longer takes new orders.`);
});

router.post(`${SHOP}/reject`, loadShop, blockSample, (req, res) => {
  const shop = req.adminShop;
  if (shop.is_demo) return finish(req, res, shop, 'info', 'Demo shops can be paused instead.');
  if (shop.status === 'rejected') return finish(req, res, shop, 'info', `${shop.name} is already rejected.`);
  setShopStatus(shop.id, 'rejected');
  finish(req, res, shop, 'success', `${shop.name} was rejected. They see a “not active” screen when they log in.`);
});

router.post(`${SHOP}/reset-password`, loadShop, blockSample, (req, res) => {
  const shop = req.adminShop;
  const password = generatePassword();
  setPassword(shop.id, password);
  req.session.pwReveal = { id: shop.id, pw: password };
  res.redirect(303, `/admin/shops/${shop.id}`);
});

router.post(`${SHOP}/note`, loadShop, (req, res) => {
  const shop = req.adminShop;
  const note = clean(typeof req.body.note === 'string' ? req.body.note : '', 2000);
  setAdminNote(shop.id, note);
  flash(req, 'success', note ? 'Note saved.' : 'Note cleared.');
  res.redirect(303, `/admin/shops/${shop.id}#note`);
});

export default router;
