import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieSession from 'cookie-session';
import { config, paths, ROOT } from './config.js';
import { html } from './lib/html.js';
import { csrfProtect, loadSession, requireAdmin } from './lib/security.js';
import { cssBundle } from './lib/assets.js';
import { handlePayuReturn } from './services/billing.js';
import { publishShop, stream } from './lib/live.js';
import { getOrderByToken } from './services/orders.js';
import { isHexColor, inkFor, SLUG_ROUTE } from './lib/util.js';
import { getShopBySlug, logoPath } from './services/shops.js';
import { messagePage } from './views/layout.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import shopRoutes from './routes/shop.js';
import customerRoutes from './routes/customer.js';
import adminBillingRoutes from './routes/admin-billing.js';
import adminSupportRoutes from './routes/admin-support.js';
import { adminDemoRouter, tryRouter } from './routes/demo-links.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('etag', 'weak');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          manifestSrc: ["'self'"],
          workerSrc: ["'self'"],
          mediaSrc: ["'self'"],
          formAction: ["'self'", 'https://secure.payu.in', 'https://test.payu.in'],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          ...(config.secureCookies ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.secureCookies ? { maxAge: 15552000, includeSubDomains: false } : false,
      referrerPolicy: { policy: 'same-origin' },
    })
  );
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    next();
  });

  // ---------- static assets (no session/cookies) ----------
  const day = 24 * 60 * 60 * 1000;
  app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Service-Worker-Allowed', '/');
    res.type('application/javascript').sendFile(path.join(paths.public, 'sw.js'));
  });
  app.get('/manifest.webmanifest', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type('application/manifest+json').sendFile(path.join(paths.public, 'manifest.webmanifest'));
  });
  // One stylesheet, built in memory from public/css/*.css (src/lib/assets.js).
  app.get('/css/app.css', (req, res) => {
    res.setHeader('Cache-Control', config.isProd ? 'public, max-age=604800' : 'no-cache');
    res.type('text/css').send(cssBundle());
  });
  app.use('/fonts/poppins', express.static(path.join(ROOT, 'node_modules/@fontsource/poppins/files'), { maxAge: 365 * day, immutable: true, fallthrough: false }));
  app.use('/fonts/comfortaa', express.static(path.join(ROOT, 'node_modules/@fontsource/comfortaa/files'), { maxAge: 365 * day, immutable: true, fallthrough: false }));
  app.use(
    express.static(paths.public, {
      index: false,
      maxAge: 7 * day,
      setHeaders(res, file) {
        if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );

  // Per-shop brand colour (keeps CSP free of inline styles).
  app.get(`/brand/:slug(${SLUG_ROUTE}).css`, (req, res) => {
    const shop = getShopBySlug(req.params.slug);
    const color = shop && isHexColor(shop.brand_color) ? shop.brand_color : '#1a5d40';
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('text/css').send(`:root{--brand:${color};--brand-ink:${inkFor(color)}}`);
  });

  // Public shop logo (png/jpg/webp only, validated on upload).
  app.get(`/logo/:slug(${SLUG_ROUTE})`, (req, res, next) => {
    const shop = getShopBySlug(req.params.slug);
    const file = shop && logoPath(shop);
    if (!file || !fs.existsSync(file)) return next();
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(file);
  });

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  // PayU posts the result back here from its own site (no session cookie, no CSRF token):
  // the payment is identified by txnid and verified with PayU's reverse hash.
  app.post('/pay/payu/return', express.urlencoded({ extended: false, limit: '50kb' }), (req, res) => {
    let id = '';
    try {
      const payment = handlePayuReturn(req.body || {});
      id = payment.id;
    } catch (err) {
      console.error('[payu]', err.message);
    }
    res.redirect(303, id ? `/shop/billing/waiting/${id}` : '/shop/billing?payment=error');
  });

  // Admin panel on its own host (ADMIN_HOST): admin.example.com/x is served as /admin/x,
  // and /admin on the main host redirects there.
  if (config.adminHost) {
    app.use((req, res, next) => {
      const isAdminPath = req.path === '/admin' || req.path.startsWith('/admin/');
      if (req.hostname === config.adminHost) {
        if (!isAdminPath) req.url = '/admin' + (req.url === '/' ? '' : req.url);
        return next();
      }
      if (isAdminPath) return res.redirect(302, config.adminUrl.slice(0, -'/admin'.length) + req.originalUrl);
      next();
    });
  }

  // ---------- dynamic pages ----------
  app.use(express.urlencoded({ extended: false, limit: '200kb', parameterLimit: 200 }));
  app.use(
    cookieSession({
      name: 'pd_sess',
      keys: [config.sessionSecret],
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureCookies,
      maxAge: 30 * day,
    })
  );
  app.use(loadSession);
  app.use((req, res, next) => {
    // Pages are per-user: never cache them in shared caches; logged-in pages not at all.
    res.setHeader('Cache-Control', req.shop || res.locals.isAdmin ? 'no-store' : 'private, no-cache');
    next();
  });
  app.use(csrfProtect);

  // Live updates: after any successful admin/shop action, refresh every open page of that shop.
  app.use((req, res, next) => {
    if (req.method === 'POST') {
      res.on('finish', () => {
        if (res.statusCode >= 400) return;
        const m = /\/admin\/shops\/(\d+)/.exec(req.originalUrl);
        if (m) publishShop(Number(m[1]));
        else if (req.shop) publishShop(req.shop.id);
      });
    }
    next();
  });

  // Server-Sent Events stream: admin, the logged-in shop, and/or one customer order (slug + token).
  app.get('/live', (req, res) => {
    const channels = [];
    if (res.locals.isAdmin) channels.push('admin');
    if (req.shop) channels.push(`shop:${req.shop.id}`);
    const shop = req.query.s ? getShopBySlug(String(req.query.s)) : null;
    const order = shop && req.query.t ? getOrderByToken(shop.id, String(req.query.t)) : null;
    if (order) channels.push(`order:${order.id}`);
    if (!channels.length) return res.status(204).end();
    stream(req, res, channels);
  });

  app.use('/', tryRouter);
  app.use('/', publicRoutes);
  app.use('/admin', adminRoutes);
  app.use('/admin', requireAdmin, adminBillingRoutes);
  app.use('/admin', requireAdmin, adminSupportRoutes);
  app.use('/admin', adminDemoRouter);
  app.use('/shop', shopRoutes);
  // Customer pages: live shops at /<slug>, demo shops at /demo/<slug>.
  app.use('/demo', customerRoutes);
  app.use('/', customerRoutes);

  // ---------- 404 + errors ----------
  app.use((req, res) => {
    messagePage(res, {
      status: 404,
      title: 'Page not found',
      text: 'This link does not exist. Please check the address or ask the shop for their correct link.',
      iconName: 'search',
      action: html`<a class="btn btn-primary" href="/">Go to Brighton Print</a>`,
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('[error]', req.method, req.originalUrl, err);
    if (res.headersSent) return;
    const text = err.expose && typeof err.expose === 'string' ? err.expose : status === 413 ? 'That request was too large.' : status < 500 ? 'The request could not be processed.' : 'Something went wrong on our side. Please try again.';
    if (req.xhr || req.get('accept')?.includes('application/json') || req.path.includes('/api/')) return res.status(status).json({ error: text });
    messagePage(res, {
      status,
      title: status === 403 ? 'Please try again' : status === 429 ? 'Slow down a little' : status < 500 ? 'Something is not right' : 'Something went wrong',
      text,
      iconName: 'alert',
      action: html`<a class="btn btn-primary" href="/" data-back>Go back</a>`,
    });
  });

  return app;
}
