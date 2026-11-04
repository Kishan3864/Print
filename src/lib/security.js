import crypto from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { meta } from '../db.js';
import { flash, randomToken, safeEqual } from './util.js';
import { getShopById, todoCount } from '../services/shops.js';
import { unreadAdminCount, unreadShopCount } from '../services/notifications.js';
import { adminOpenTickets, shopUnreadTickets } from '../services/support.js';

// ---------- CSRF (synchroniser token kept in the signed cookie session) ----------
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = randomToken(24);
  return req.session.csrf;
}

/**
 * Checks `_csrf` from the urlencoded body, the `x-csrf-token` header, or the
 * `?_csrf=` query string (used by multipart forms so the check happens before
 * any file is written to disk).
 */
export function csrfProtect(req, res, next) {
  res.locals.csrf = csrfToken(req);
  if (SAFE.has(req.method)) return next();
  const sent = req.get('x-csrf-token') || req.body?._csrf || req.query?._csrf;
  if (safeEqual(sent, req.session.csrf)) return next();
  const err = new Error('Invalid CSRF token');
  err.status = 403;
  err.expose = 'Your session expired or the form was open too long. Please go back, refresh the page and try again.';
  next(err);
}

// ---------- sessions ----------
// Cookie sessions cannot be deleted server-side, so they carry a login time
// (expiry) and, for the admin, a version that logging out bumps.
const ADMIN_TTL = 12 * 60 * 60 * 1000;
const SHOP_TTL = 30 * 24 * 60 * 60 * 1000;
const adminVersion = () => meta.get('admin_sv') || '0';
const adminSig = () =>
  crypto.createHash('sha256').update(`${config.adminEmail}:${config.adminPassword}:${config.sessionSecret}:${adminVersion()}`).digest('base64url').slice(0, 22);

export function loginAdmin(req) {
  req.session = { admin: true, as: adminSig(), iat: Date.now(), csrf: randomToken(24) };
}

/** Ends every admin session (all devices). */
export function revokeAdminSessions() {
  meta.set('admin_sv', randomToken(8));
}

export function loginShop(req, shop, { demo = false } = {}) {
  req.session = { shopId: shop.id, pv: shop.pw_version, demo: demo || Boolean(shop.is_demo), iat: Date.now(), csrf: randomToken(24) };
}

export function logout(req) {
  req.session = { csrf: randomToken(24) };
}

/** Loads req.shop / res.locals.shop and res.locals.isAdmin from the session. */
export function loadSession(req, res, next) {
  const s = req.session;
  const age = Date.now() - (Number(s.iat) || 0);
  res.locals.isAdmin = Boolean(s.admin && config.adminPassword && age < ADMIN_TTL && safeEqual(s.as, adminSig()));
  if (s.admin && !res.locals.isAdmin) delete s.admin;
  if (s.shopId) {
    const shop = getShopById(s.shopId);
    if (shop && shop.pw_version === s.pv && age < SHOP_TTL) {
      req.shop = shop;
      res.locals.shop = shop;
      res.locals.isDemo = Boolean(shop.is_demo);
    } else {
      delete s.shopId;
      delete s.pv;
      delete s.demo;
    }
  }
  // Badge counts for the app chrome.
  if (res.locals.isAdmin) {
    res.locals.adminUnread = unreadAdminCount();
    res.locals.openTickets = adminOpenTickets();
  }
  if (req.shop) {
    res.locals.shopUnread = unreadShopCount(req.shop.id);
    res.locals.ticketsUnread = shopUnreadTickets(req.shop.id);
    res.locals.ordersTodo = todoCount(req.shop.id);
  }
  // Flash messages are read once.
  res.locals.flash = Array.isArray(s.flash) ? s.flash : [];
  if (s.flash) delete s.flash;
  next();
}

export function requireAdmin(req, res, next) {
  if (res.locals.isAdmin) return next();
  if (req.method === 'GET') return res.redirect('/admin/login');
  res.status(403).send('Forbidden');
}

export function requireShop(req, res, next) {
  if (req.shop) return next();
  const wantsJson = req.path.startsWith('/api/') || req.xhr || (req.get('accept') || '').includes('application/json');
  if (wantsJson) return res.status(401).json({ error: 'Logged out' });
  // A form posted from a page whose login has ended: back to login, then to that order/page.
  const url = req.originalUrl.split('?')[0];
  const target = req.method === 'GET' ? req.originalUrl : url.replace(/\/orders\/(\d+)\/.*$/, '/orders/$1').replace(/\/settings\/.*$/, '/settings');
  if (req.method !== 'GET') flash(req, 'info', 'You were logged out. Please log in again.');
  res.redirect(303, '/login?next=' + encodeURIComponent(safeNext(target.slice(0, 200))));
}

/** Only allow local redirect targets like "/shop/orders/1001". */
export function safeNext(value, fallback = '/shop') {
  const v = String(value || '');
  return /^\/(?!\/)[\w\-./?=&%#]*$/.test(v) && !v.includes('\\') ? v : fallback;
}

// ---------- rate limits ----------
function limiter({ windowMin, limit, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs: windowMin * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
    skip: () => config.rateLimitOff,
    handler: (req, res, next) => {
      const err = new Error('Too many requests');
      err.status = 429;
      err.expose = message;
      next(err);
    },
  });
}

export const loginLimiter = limiter({ windowMin: 15, limit: 10, message: 'Too many login attempts. Please wait 15 minutes and try again.', skipSuccessfulRequests: true });
export const registerLimiter = limiter({ windowMin: 60, limit: 6, message: 'Too many sign-ups from this network. Please try again in an hour.' });
export const orderLimiter = limiter({ windowMin: 60, limit: 30, message: 'Too many orders from this network. Please wait a while and try again.' });
export const actionLimiter = limiter({ windowMin: 15, limit: 60, message: 'Too many requests. Please slow down and try again shortly.' });
export const shopWriteLimiter = limiter({ windowMin: 15, limit: 400, message: 'Too many changes in a short time. Please wait a minute and try again.' });
export const demoWriteLimiter = limiter({ windowMin: 15, limit: 40, message: 'The demo allows a limited number of changes. Please wait a few minutes.' });
export const demoLimiter = limiter({ windowMin: 15, limit: 30, message: 'Too many demo logins. Please wait a few minutes.' });
