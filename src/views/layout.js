import { html, raw } from '../lib/html.js';
import { config } from '../config.js';
import { ASSET_V } from '../lib/assets.js';
import { flashList, icon } from './components.js';
import { authHeader, publicHeader, siteFooter } from './chrome/public.js';
import { shopHeader, shopStateBanner, shopTabbar } from './chrome/shop.js';
import { adminHeader, adminTabbar } from './chrome/admin.js';
import { customerFooter, customerHeader } from './chrome/customer.js';

export { ASSET_V };
const asset = (p) => `${p}?v=${ASSET_V}`;
const DM_URL = `https://ig.me/m/${config.instagram}`;

/**
 * Demo notice. The shared sample shop (and /demo) says "sample data";
 * a personal demo shop's customer pages say they are for testing.
 */
export function demoBanner(shop) {
  const personal = shop && shop.slug !== config.demo.slug;
  return html`<div class="demo-banner" role="note">
    <span class="demo-banner-tag">Demo</span>
    ${personal
      ? html`<span>This is a demo order page for testing. Orders placed here are not printed.</span>`
      : html`<span>Demo with sample data. Want this for your shop? <a href="/register">Register</a> / DM <b>PRINT</b> to <a href="${DM_URL}" target="_blank" rel="noopener">@${config.instagram}</a></span>`}
  </div>`;
}

/**
 * Renders a full HTML page.
 * @param res      Express response (uses res.locals: csrf, shop, isAdmin, isDemo, flash)
 * @param opts.title        page title (suffix " · Brighton Print" added)
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
  const { title = 'Brighton Print', body = '', variant = 'public', active = '', brandShop = null, scripts = [], description, bodyClass = '', noindex = false } = opts;
  const locals = res.locals;
  const demoShop = brandShop?.is_demo ? brandShop : locals.shop?.is_demo ? locals.shop : null;
  // The shop area of a personal demo shop shows its own banner (days left / go live) instead.
  const isDemo = Boolean(locals.isDemo || brandShop?.is_demo) && !(variant === 'shop' && demoShop && demoShop.slug !== config.demo.slug);
  const desc = description || 'Brighton Print – one link, one order number, one final file. Online order intake for print shops.';
  const fullTitle = title === 'Brighton Print' ? 'Brighton Print – order intake for print shops' : `${title} · Brighton Print`;
  const robots = noindex || variant === 'shop' || variant === 'admin' || variant === 'customer' || variant === 'auth';

  let header = '';
  let footer = '';
  let after = '';
  if (variant === 'public') {
    header = publicHeader(res, active);
    footer = siteFooter();
  } else if (variant === 'auth') {
    header = authHeader();
    footer = siteFooter();
  } else if (variant === 'shop') {
    header = html`${shopHeader(res, active)}${shopStateBanner(res)}`;
    after = shopTabbar(res, active);
  } else if (variant === 'admin') {
    header = adminHeader(res, active);
    after = adminTabbar(res, active);
  } else if (variant === 'customer' && brandShop) {
    header = customerHeader(res, brandShop);
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
<meta name="theme-color" content="${variant === 'shop' || variant === 'admin' ? '#0e1116' : '#ffffff'}">
<meta name="color-scheme" content="only light">
${variant === 'customer'
  ? ''
  : raw(`<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Brighton Print">`)}
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/icons/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta property="og:title" content="${fullTitle}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${config.baseUrl}/icons/icon-512.png">
<link rel="preload" href="/fonts/poppins/poppins-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/comfortaa/comfortaa-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset('/css/app.css')}">
${brandShop ? html`<link rel="stylesheet" href="/brand/${brandShop.slug}.css?v=${String(brandShop.brand_color || '').slice(1)}">` : ''}
<script src="${asset('/js/app.js')}" defer></script>
<script src="${asset('/js/live.js')}" defer></script>
${scripts.map((s) => html`<script src="${asset(s)}" defer></script>`)}
</head>
<body class="v-${variant}${bodyClass ? ' ' + bodyClass : ''}${isDemo ? ' is-demo' : ''}" data-csrf="${locals.csrf || ''}">
<a class="skip-link" href="#main">Skip to content</a>
${isDemo ? demoBanner(demoShop) : ''}
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
