import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { html } from '../lib/html.js';
import { config } from '../config.js';
import { db } from '../db.js';
import { clean, cleanLine, flash, formatDate, safeEqual, ymd } from '../lib/util.js';
import { PLANS, PLAN_LABEL } from '../lib/status.js';
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
import { emailShopApproved, mailEnabled } from '../services/notify.js';
import { messagePage, render } from '../views/layout.js';
import { loginView } from '../views/admin/login.js';
import { FILTERS, overviewView } from '../views/admin/overview.js';
import { shopView } from '../views/admin/shop.js';
import { EXTEND, MAX_PAID_MONTHS, addMonths, extendBase, validDate } from '../views/admin/common.js';

// Super-admin area (Brighton Solution). Mounted at /admin.

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
  render(res, { title: 'Admin sign in', variant: 'admin', body: loginView(res, { disabled: !adminConfigured(), ...data }) }, status);
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

function notFound(res) {
  messagePage(res, {
    status: 404,
    title: 'Shop not found',
    text: 'This shop does not exist or was removed.',
    variant: 'admin',
    iconName: 'search',
    action: html`<a class="btn btn-primary" href="/admin">Back to all shops</a>`,
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
  res.redirect(backTo(req, shop));
}

const pickPlan = (value) => (typeof value === 'string' && PLANS.includes(value) ? value : null);

/** paid_until from a quick-extend button or the date field. Returns { date } or { error }. */
function resolvePaidUntil(body, shop, today) {
  const ext = typeof body.extend === 'string' && Object.hasOwn(EXTEND, body.extend) ? EXTEND[body.extend] : null;
  const date = ext ? addMonths(extendBase(shop, today), ext.months) : String(body.paid_until || '').trim();
  if (!validDate(date)) return { error: 'Choose a valid paid-until date.' };
  if (date < today) return { error: 'The paid-until date cannot be in the past.' };
  if (date > addMonths(today, MAX_PAID_MONTHS)) return { error: 'Choose a paid-until date within the next 5 years.' };
  return { date };
}

const demoBlocked = (req, res, shop, what) => finish(req, res, shop, 'warn', `The demo shop cannot be ${what}.`);
const DEMO_PLAN = 'changed here – its plan is managed automatically';

// ---------- overview ----------
router.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? cleanLine(req.query.q, 80) : '';
  const status = typeof req.query.status === 'string' && FILTERS.includes(req.query.status) ? req.query.status : '';
  const all = listShopsForAdmin({ q });
  const counts = { '': all.length };
  for (const s of all) counts[s.state] = (counts[s.state] || 0) + 1;
  const shops = status ? all.filter((s) => s.state === status) : all;
  render(res, {
    title: 'Admin',
    variant: 'admin',
    body: overviewView(res, { overview: adminOverview(), shops, counts, q, status, today: ymd() }),
  });
});

// ---------- one shop ----------
router.get(SHOP, loadShop, (req, res) => {
  const shop = req.adminShop;
  const reveal = res.locals.pwReveal && res.locals.pwReveal.id === shop.id ? String(res.locals.pwReveal.pw || '') : '';
  if (reveal) res.setHeader('Cache-Control', 'no-store');
  render(res, {
    title: `${shop.name} · Admin`,
    variant: 'admin',
    body: shopView(res, {
      shop,
      state: shopState(shop),
      counts: shopCounts(shop.id),
      storage: storageUsed(shop.id),
      liveFiles: qLiveFiles.get(shop.id).n,
      recent: qRecentOrders.all(shop.id),
      today: ymd(),
      reveal,
    }),
  });
});

router.post(`${SHOP}/approve`, loadShop, (req, res) => {
  const shop = req.adminShop;
  if (shop.is_demo) return demoBlocked(req, res, shop, DEMO_PLAN);
  const plan = pickPlan(req.body.plan);
  if (!plan) return finish(req, res, shop, 'error', 'Choose a plan: Starter, Pro or Business.');
  const today = ymd();
  const paid = resolvePaidUntil(req.body, shop, today);
  if (paid.error) return finish(req, res, shop, 'error', paid.error);
  const wasPending = shop.status === 'pending';
  const wasActive = shop.status === 'active';
  approveShop(shop.id, { plan, paid_until: paid.date });
  if (wasPending) emailShopApproved(getShopById(shop.id));
  const terms = `${PLAN_LABEL[plan]}, paid until ${formatDate(paid.date)}`;
  if (wasActive) return finish(req, res, shop, 'success', `Plan saved for ${shop.name}: ${terms}.`);
  const mailNote = wasPending ? (mailEnabled() ? ' Approval email sent to the owner.' : ' Email is not set up – let the owner know on WhatsApp.') : '';
  finish(req, res, shop, 'success', `${shop.name} is approved (${terms}). Their order link is live.${mailNote}`);
});

router.post(`${SHOP}/plan`, loadShop, (req, res) => {
  const shop = req.adminShop;
  if (shop.is_demo) return demoBlocked(req, res, shop, DEMO_PLAN);
  if (shop.status === 'pending' || shop.status === 'rejected') return finish(req, res, shop, 'error', 'Approve this shop first, then set its plan.');
  const plan = pickPlan(req.body.plan);
  if (!plan) return finish(req, res, shop, 'error', 'Choose a plan: Starter, Pro or Business.');
  const paid = resolvePaidUntil(req.body, shop, ymd());
  if (paid.error) return finish(req, res, shop, 'error', paid.error);
  qSetPlan.run(plan, paid.date, shop.id);
  const paused = shop.status === 'paused' ? ' The account is still paused – activate it to reopen the order link.' : '';
  finish(req, res, shop, 'success', `Plan saved: ${PLAN_LABEL[plan]}, paid until ${formatDate(paid.date)}.${paused}`);
});

router.post(`${SHOP}/activate`, loadShop, (req, res) => {
  const shop = req.adminShop;
  if (shop.is_demo) return demoBlocked(req, res, shop, DEMO_PLAN);
  const today = ymd();
  if (shop.status === 'active') {
    const msg = shopState(shop) === 'expired' ? 'This shop is already switched on but its plan has ended – set a new paid-until date to renew.' : `${shop.name} is already active.`;
    return finish(req, res, shop, 'info', msg);
  }
  const plan = pickPlan(req.body.plan) || pickPlan(shop.plan);
  if (!plan) return finish(req, res, shop, 'error', 'Choose a plan: Starter, Pro or Business.');
  let paidUntil = shop.paid_until;
  if (req.body.paid_until || req.body.extend) {
    const paid = resolvePaidUntil(req.body, shop, today);
    if (paid.error) return finish(req, res, shop, 'error', paid.error);
    paidUntil = paid.date;
  } else if (!validDate(paidUntil) || paidUntil < today) {
    return finish(req, res, shop, 'error', 'The plan has ended. Choose a new paid-until date to activate this shop.');
  }
  const wasPending = shop.status === 'pending';
  approveShop(shop.id, { plan, paid_until: paidUntil });
  if (wasPending) emailShopApproved(getShopById(shop.id));
  finish(req, res, shop, 'success', `${shop.name} is active again (${PLAN_LABEL[plan]}, paid until ${formatDate(paidUntil)}). Their order link is taking orders.`);
});

router.post(`${SHOP}/pause`, loadShop, (req, res) => {
  const shop = req.adminShop;
  if (shop.is_demo) return demoBlocked(req, res, shop, 'paused');
  if (shop.status !== 'active') return finish(req, res, shop, 'info', 'Only active shops can be paused.');
  setShopStatus(shop.id, 'paused');
  finish(req, res, shop, 'success', `${shop.name} is paused. Their order link no longer takes new orders.`);
});

router.post(`${SHOP}/reject`, loadShop, (req, res) => {
  const shop = req.adminShop;
  if (shop.is_demo) return demoBlocked(req, res, shop, 'rejected');
  if (shop.status === 'rejected') return finish(req, res, shop, 'info', `${shop.name} is already rejected.`);
  setShopStatus(shop.id, 'rejected');
  finish(req, res, shop, 'success', `${shop.name} was rejected. They will see a “not approved” screen when they log in.`);
});

router.post(`${SHOP}/reset-password`, loadShop, (req, res) => {
  const shop = req.adminShop;
  if (shop.is_demo) return demoBlocked(req, res, shop, 'given a new password');
  const password = generatePassword();
  setPassword(shop.id, password);
  req.session.pwReveal = { id: shop.id, pw: password };
  res.redirect(`/admin/shops/${shop.id}`);
});

router.post(`${SHOP}/note`, loadShop, (req, res) => {
  const shop = req.adminShop;
  const note = clean(typeof req.body.note === 'string' ? req.body.note : '', 2000);
  setAdminNote(shop.id, note);
  flash(req, 'success', note ? 'Note saved.' : 'Note cleared.');
  res.redirect(`/admin/shops/${shop.id}#note`);
});

export default router;
