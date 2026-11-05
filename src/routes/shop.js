import { Router } from 'express';
import { html } from '../lib/html.js';
import { config } from '../config.js';
import { demoWriteLimiter, requireShop, safeNext, shopWriteLimiter } from '../lib/security.js';
import { flash } from '../lib/util.js';
import { isSampleShop } from '../services/billing.js';
import { needsConsent, recordShopConsent } from '../services/legal.js';
import { consentView } from '../views/consent.js';
import { shopState } from '../services/shops.js';
import { render } from '../views/layout.js';
import { csrfField, icon, logoMark } from '../views/components.js';
import ordersRouter from './shop-orders.js';
import settingsRouter from './shop-settings.js';
import billingRouter from './shop-billing.js';
import supportRouter from './shop-support.js';
import billsRouter from './shop-bills.js';
import servicesRouter from './shop-services.js';

// Everything under /shop: login required.
//   active            full access
//   paused            full access, order link closed (banner)
//   pending / expired only Plan & billing, Support, Notifications, Settings –
//                     everything else redirects to /shop/billing (pay to start / renew)
//   rejected          a "not approved" screen

const router = Router();
router.use(requireShop);

// Terms, Privacy & Refund policy: shop owners accept before using anything (again after we publish a new version).
router.get('/consent', (req, res) => {
  if (!needsConsent(req.shop)) return res.redirect(303, safeNext(req.query.next));
  render(res, consentView(res, { shop: req.shop, next: safeNext(req.query.next) }));
});
router.post('/consent', (req, res) => {
  const next = safeNext(req.body.next);
  if (req.body.agree !== '1') return render(res, consentView(res, { shop: req.shop, next, error: 'Please tick the box to accept.' }), 400);
  recordShopConsent(req.shop, req);
  flash(req, 'success', 'Thank you – you are all set.');
  res.redirect(303, next);
});
router.use((req, res, next) => {
  if (!needsConsent(req.shop) || isSampleShop(req.shop)) return next();
  if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Please accept the terms first' });
  res.redirect(303, '/shop/consent?next=' + encodeURIComponent(req.method === 'GET' ? req.originalUrl.slice(0, 200) : '/shop'));
});

// Pages that stay open when the plan is not active (pay, get help, export your own data).
const ALWAYS_OPEN = /^\/(billing|support|notifications|settings|services)(\/|$)|^\/bills\/export\.csv$/;

router.use((req, res, next) => {
  const state = shopState(req.shop);
  req.shopState = res.locals.shopState = state;
  if (state === 'rejected') {
    if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Account not active' });
    if (req.method !== 'GET') return res.redirect(303, '/shop');
    return renderRejected(req, res);
  }
  if (state === 'expired' && req.shop.is_demo) {
    if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Demo ended' });
    if (req.method !== 'GET') return res.redirect(303, '/shop');
    return renderDemoEnded(req, res);
  }
  if ((state === 'pending' || state === 'expired') && !ALWAYS_OPEN.test(req.path)) {
    if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Plan not active' });
    return res.redirect(303, '/shop/billing');
  }
  next();
});

// Every write in the shop area is rate-limited; the shared demo shop much more strictly.
router.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  return (req.shop.is_demo && req.shop.slug === config.demo.slug ? demoWriteLimiter : shopWriteLimiter)(req, res, next);
});

function renderDemoEnded(req, res) {
  render(res, {
    title: 'Demo ended',
    variant: 'bare',
    body: html`<section class="waiting">
      <div class="waiting-card card">
        <div class="waiting-mark">${logoMark(56)}</div>
        <span class="pill pill-shop-expired">Demo ended</span>
        <h1>Your demo time is over</h1>
        <p class="lead">Thanks for trying Brighton Print. Register your own shop to start taking real orders – it takes 2 minutes.</p>
        <div class="waiting-actions">
          <a class="btn btn-primary btn-lg" href="/register">Register your shop</a>
          <a class="btn btn-secondary" href="https://ig.me/m/${config.instagram}" target="_blank" rel="noopener">Message us</a>
          <form method="post" action="/logout" class="inline-form">${csrfField(res)}<button class="btn btn-ghost" type="submit">${icon('logout')}<span>Log out</span></button></form>
        </div>
      </div>
    </section>`,
  });
}

function renderRejected(req, res) {
  render(res, {
    title: 'Account not approved',
    variant: 'bare',
    body: html`<section class="waiting">
      <div class="waiting-card card">
        <div class="waiting-mark">${logoMark(56)}</div>
        <span class="pill pill-shop-rejected">Not approved</span>
        <h1>This account is not active</h1>
        <p class="lead">If you think this is a mistake, please contact us and we will help.</p>
        <div class="waiting-actions">
          <a class="btn btn-primary" href="https://ig.me/m/${config.instagram}" target="_blank" rel="noopener">DM @${config.instagram}</a>
          <form method="post" action="/logout" class="inline-form">${csrfField(res)}<button class="btn btn-ghost" type="submit">${icon('logout')}<span>Log out</span></button></form>
        </div>
      </div>
    </section>`,
  });
}

router.use('/', ordersRouter);
router.use('/', settingsRouter);
router.use('/', billingRouter);
router.use('/', supportRouter);
router.use('/', billsRouter);
router.use('/', servicesRouter);

export default router;
