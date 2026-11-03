import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { html, raw } from '../lib/html.js';
import { config, paths } from '../config.js';
import { shopState } from '../services/shops.js';
import { brandLockup, flashList, icon, logoMark, csrfField } from './components.js';

// Cache-busting version for /css/app.css and /js/*.js (changes when files change on restart).
export const ASSET_V = (() => {
  const h = crypto.createHash('sha1');
  const scripts = fs.readdirSync(path.join(paths.public, 'js')).filter((n) => n.endsWith('.js')).sort().map((n) => 'js/' + n);
  for (const f of ['css/app.css', 'sw.js', ...scripts]) {
    try {
      h.update(fs.readFileSync(path.join(paths.public, f)));
    } catch {
      /* optional file */
    }
  }
  return h.digest('hex').slice(0, 10);
})();

const asset = (p) => `${p}?v=${ASSET_V}`;

const DM_URL = `https://ig.me/m/${config.instagram}`;

export const demoBanner = () =>
  html`<div class="demo-banner" role="note">
    <span class="demo-banner-tag">Demo</span>
    <span>Demo with sample data. Want this for your shop? <a href="/register">Register</a> / DM <b>PRINT</b> to <a href="${DM_URL}" target="_blank" rel="noopener">@${config.instagram}</a></span>
  </div>`;

function publicHeader(active) {
  const link = (href, label, key) => html`<a href="${href}"${active === key ? raw(' aria-current="page"') : ''}>${label}</a>`;
  return html`<header class="site-header">
    <div class="container header-row">
      ${brandLockup('/')}
      <nav class="site-nav" aria-label="Main">
        ${link('/#features', 'Features', 'features')}
        ${link('/#how', 'How it works', 'how')}
        ${link('/#faq', 'FAQ', 'faq')}
        ${link('/demo', 'Live demo', 'demo')}
      </nav>
      <div class="header-actions">
        <a class="btn btn-ghost btn-sm" href="/login">Log in</a>
        <a class="btn btn-primary btn-sm hide-xs" href="/register">Register shop</a>
      </div>
    </div>
  </header>`;
}

function siteFooter() {
  return html`<footer class="site-footer">
    <div class="container footer-row">
      <div class="footer-brand">${logoMark(22)}<span>PrintDesk by Brighton Solution · <a href="${config.companyUrl}" target="_blank" rel="noopener">brightonsolution.com</a></span></div>
      <nav class="footer-nav" aria-label="Footer">
        <a href="/demo">Live demo</a>
        <a href="/register">Register your shop</a>
        <a href="/login">Shop login</a>
      </nav>
    </div>
  </footer>`;
}

function shopHeader(res, active) {
  const shop = res.locals.shop;
  const nav = (href, label, key, ic) =>
    html`<a href="${href}" class="nav-item${active === key ? ' is-active' : ''}"${active === key ? raw(' aria-current="page"') : ''}>${icon(ic)}<span>${label}</span>${key === 'orders' ? html`<span class="badge" data-new-badge hidden></span>` : ''}</a>`;
  const items = [nav('/shop', 'Orders', 'orders', 'orders'), nav('/shop/link', 'Link & QR', 'link', 'qr'), nav('/shop/settings', 'Settings', 'settings', 'settings')];
  return html`<header class="app-header">
      <div class="container header-row">
        <a class="brand" href="/shop" aria-label="PrintDesk orders">${logoMark(30)}<span class="brand-name brand-shop"><span class="brand-shop-name">${shop?.name || 'PrintDesk'}</span><small>PrintDesk</small></span></a>
        <nav class="app-nav" aria-label="Shop">${items}</nav>
        <div class="header-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-install hidden>${icon('install')}<span class="hide-xs">Install app</span></button>
          <form method="post" action="/logout" class="inline-form">${csrfField(res)}<button class="btn btn-ghost btn-sm" type="submit" aria-label="Log out">${icon('logout')}<span class="hide-xs">Log out</span></button></form>
        </div>
      </div>
    </header>`;
}

function shopTabbar(active) {
  const tab = (href, label, key, ic) =>
    html`<a href="${href}" class="tab${active === key ? ' is-active' : ''}"${active === key ? raw(' aria-current="page"') : ''}>${icon(ic)}<span>${label}</span>${key === 'orders' ? html`<span class="badge" data-new-badge hidden></span>` : ''}</a>`;
  return html`<nav class="tabbar" aria-label="Shop sections">
    ${tab('/shop', 'Orders', 'orders', 'orders')}${tab('/shop/link', 'Link / QR', 'link', 'qr')}${tab('/shop/settings', 'Settings', 'settings', 'settings')}
  </nav>`;
}

function shopStateBanner(shop) {
  if (!shop || shop.is_demo) return '';
  const state = shopState(shop);
  if (state === 'expired')
    return html`<div class="renew-banner" role="alert">${icon('alert')}<span><b>Your plan has expired.</b> Your order link is not taking new orders. Renew to switch it back on – WhatsApp/DM <a href="${DM_URL}" target="_blank" rel="noopener">@${config.instagram}</a>.</span></div>`;
  if (state === 'paused')
    return html`<div class="renew-banner" role="alert">${icon('alert')}<span><b>Your account is paused.</b> Your order link is not taking new orders. Contact <a href="${DM_URL}" target="_blank" rel="noopener">@${config.instagram}</a> to renew or reactivate.</span></div>`;
  return '';
}

function adminHeader(res) {
  return html`<header class="app-header app-header-admin">
    <div class="container header-row">
      <a class="brand" href="/admin">${logoMark(30)}<span class="brand-name">Print<b>Desk</b> <span class="admin-tag">Admin</span></span></a>
      ${res.locals.isAdmin
        ? html`<form method="post" action="/admin/logout" class="inline-form">${csrfField(res)}<button class="btn btn-ghost btn-sm" type="submit">${icon('logout')}<span>Log out</span></button></form>`
        : ''}
    </div>
  </header>`;
}

function customerHeader(shop) {
  return html`<header class="shop-brand-header">
    <div class="container-narrow header-row">
      <a class="shop-brand" href="/${shop.slug}">
        ${shop.logo_file
          ? html`<img class="shop-logo" src="/logo/${shop.slug}?v=${shop.logo_file.slice(0, 8)}" alt="" width="44" height="44">`
          : html`<span class="shop-initial" aria-hidden="true">${(shop.name || '?').trim().charAt(0).toUpperCase()}</span>`}
        <span class="shop-brand-text"><b>${shop.name}</b>${shop.address ? html`<small>${shop.address.split('\n')[0]}</small>` : ''}</span>
      </a>
      ${shop.phone ? html`<a class="btn btn-ghost btn-sm" href="tel:${shop.phone.replace(/[^\d+]/g, '')}">${icon('phone')}<span class="hide-xs">Call shop</span></a>` : ''}
    </div>
  </header>`;
}

const customerFooter = () =>
  html`<footer class="powered-by"><a href="/" target="_blank" rel="noopener">${logoMark(18)}<span>Powered by <b>PrintDesk</b></span></a></footer>`;

/**
 * Renders a full HTML page.
 * @param res      Express response (uses res.locals: csrf, shop, isAdmin, isDemo, flash)
 * @param opts.title        page title (suffix " · PrintDesk" added)
 * @param opts.body         html`` main content
 * @param opts.variant      'public' | 'auth' | 'shop' | 'admin' | 'customer' | 'bare'
 * @param opts.active       active nav key ('orders'|'link'|'settings' for shop; 'demo' etc. for public)
 * @param opts.brandShop    shop row for 'customer' variant (logo, name, brand colour)
 * @param opts.scripts      extra script URLs (e.g. ['/js/shop.js'])
 * @param opts.description  meta description
 * @param opts.bodyClass    extra class on <body>
 * @param opts.noindex      add robots noindex
 * @param opts.wide         use wide container for main (shop/admin)
 */
export function page(res, opts) {
  const { title = 'PrintDesk', body = '', variant = 'public', active = '', brandShop = null, scripts = [], description, bodyClass = '', noindex = false } = opts;
  const locals = res.locals;
  const isDemo = Boolean(locals.isDemo || brandShop?.is_demo);
  const desc = description || 'PrintDesk – one link, one order number, one final file. Online order intake for print shops.';
  const fullTitle = title === 'PrintDesk' ? 'PrintDesk – order intake for print shops' : `${title} · PrintDesk`;
  const robots = noindex || variant === 'shop' || variant === 'admin' || variant === 'customer' || variant === 'auth';

  let header = '';
  let footer = '';
  let after = '';
  if (variant === 'public') {
    header = publicHeader(active);
    footer = siteFooter();
  } else if (variant === 'auth') {
    header = html`<header class="site-header site-header-min"><div class="container header-row">${brandLockup('/')}<a class="btn btn-ghost btn-sm" href="/">${icon('arrowLeft')}<span>Home</span></a></div></header>`;
    footer = siteFooter();
  } else if (variant === 'shop') {
    header = html`${shopHeader(res, active)}${shopStateBanner(locals.shop)}`;
    after = shopTabbar(active);
  } else if (variant === 'admin') {
    header = adminHeader(res);
  } else if (variant === 'customer' && brandShop) {
    header = customerHeader(brandShop);
    footer = customerFooter();
  }

  const doc = html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
${robots ? raw('<meta name="robots" content="noindex, nofollow">') : ''}
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a0f1a" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
${variant === 'customer'
  ? ''
  : raw(`<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="PrintDesk">`)}
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/icons/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta property="og:title" content="${fullTitle}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${config.baseUrl}/icons/icon-512.png">
<link rel="preload" href="/fonts/jakarta/plus-jakarta-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/jakarta/plus-jakarta-sans-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset('/css/app.css')}">
${brandShop ? html`<link rel="stylesheet" href="/brand/${brandShop.slug}.css?v=${String(brandShop.brand_color || '').slice(1)}">` : ''}
<script src="${asset('/js/app.js')}" defer></script>
${scripts.map((s) => html`<script src="${asset(s)}" defer></script>`)}
</head>
<body class="v-${variant}${bodyClass ? ' ' + bodyClass : ''}${isDemo ? ' is-demo' : ''}" data-csrf="${locals.csrf || ''}">
<a class="skip-link" href="#main">Skip to content</a>
${isDemo ? demoBanner() : ''}
${header}
<main id="main" class="main main-${variant}">
${flashList(locals.flash)}
${body}
</main>
${footer}
${after}
<div class="toasts" aria-live="polite" aria-atomic="false"></div>
</body>
</html>`;
  return doc.toString();
}

export function render(res, opts, status = 200) {
  res.status(status).type('html').send(page(res, opts));
}

/** Simple message page (errors, 404, closed shop …). */
export function messagePage(res, { status = 200, title, text, variant = 'auth', action = '', iconName = 'info', brandShop = null }) {
  render(
    res,
    {
      title,
      variant: brandShop ? 'customer' : variant,
      brandShop,
      noindex: true,
      body: html`<section class="container-narrow message-page">
        <div class="card card-pad message-card">
          <div class="message-icon">${icon(iconName)}</div>
          <h1>${title}</h1>
          ${text ? html`<p class="lead">${text}</p>` : ''}
          ${action}
        </div>
      </section>`,
    },
    status
  );
}
