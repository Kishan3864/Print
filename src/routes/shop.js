import { Router } from 'express';
import { html } from '../lib/html.js';
import { config } from '../config.js';
import { demoWriteLimiter, requireShop, shopWriteLimiter } from '../lib/security.js';
import { shopState } from '../services/shops.js';
import { formatDate } from '../lib/util.js';
import { render } from '../views/layout.js';
import { csrfField, icon, logoMark } from '../views/components.js';
import ordersRouter from './shop-orders.js';
import settingsRouter from './shop-settings.js';

// Everything under /shop: login required. Pending / rejected accounts only
// see a waiting screen; paused / expired accounts keep dashboard access
// (layout shows the renew banner) but their public order form is closed.

const router = Router();
router.use(requireShop);

router.use((req, res, next) => {
  const state = shopState(req.shop);
  req.shopState = res.locals.shopState = state;
  if (state !== 'pending' && state !== 'rejected') return next();
  if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Account not active' });
  if (req.method !== 'GET') return res.redirect(303, '/shop');
  return renderWaiting(req, res, state);
});

// Every write in the shop area is rate-limited; the shared demo shop much more strictly.
router.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  return (req.shop.is_demo ? demoWriteLimiter : shopWriteLimiter)(req, res, next);
});

function renderWaiting(req, res, state) {
  const shop = req.shop;
  const pending = state === 'pending';
  render(res, {
    title: pending ? 'Waiting for approval' : 'Application not approved',
    variant: 'bare',
    body: html`<section class="waiting">
      <div class="waiting-card card">
        <div class="waiting-mark">${logoMark(56)}</div>
        <span class="pill ${pending ? 'pill-shop-pending' : 'pill-shop-rejected'}">${pending ? 'Waiting for approval' : 'Not approved'}</span>
        <h1>${pending ? html`Thanks, ${shop.owner_name || shop.name}!` : 'Your application was not approved'}</h1>
        <p class="lead">${pending
          ? 'Your PrintDesk account is created. Our team will check your details and switch it on, usually within one working day.'
          : 'If you think this is a mistake, please contact us and we will help.'}</p>
        <dl class="kv">
          <div><dt>Shop</dt><dd>${shop.name}</dd></div>
          <div><dt>Your order link</dt><dd class="mono">${config.baseUrl.replace(/^https?:\/\//, '')}/${shop.slug}</dd></div>
          <div><dt>Mobile</dt><dd>${shop.mobile}</dd></div>
          <div><dt>Registered</dt><dd>${formatDate(shop.created_at)}</dd></div>
        </dl>
        ${pending
          ? html`<ol class="waiting-steps">
              <li class="is-done">${icon('check')}<span>Account created</span></li>
              <li class="is-current">${icon('clock')}<span>Brighton Solution approves your shop</span></li>
              <li>${icon('link')}<span>Share your order link and start taking orders</span></li>
            </ol>`
          : ''}
        <div class="waiting-actions">
          <a class="btn btn-primary" href="https://ig.me/m/${config.instagram}" target="_blank" rel="noopener">DM @${config.instagram}</a>
          <a class="btn btn-secondary" href="/demo">Explore the demo</a>
          <form method="post" action="/logout" class="inline-form">${csrfField(res)}<button class="btn btn-ghost" type="submit">${icon('logout')}<span>Log out</span></button></form>
        </div>
      </div>
    </section>`,
  });
}

router.use('/', ordersRouter);
router.use('/', settingsRouter);

export default router;
