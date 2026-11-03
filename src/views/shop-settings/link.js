import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { orderFormUrl, shopPath } from '../../services/notify.js';
import { icon, logoMark } from '../components.js';
import { shopIcon } from '../chrome/shop.js';

const SCRIPTS = ['/js/shop.js', '/js/settings.js'];

const shortUrl = (url) => url.replace(/^https?:\/\//, '');
const initialOf = (shop) => (shop.name || '?').trim().charAt(0).toUpperCase() || '?';

/** Shop logo (or brand-coloured initial) for the poster. */
const shopMark = (shop, cls) =>
  shop.logo_file
    ? html`<img class="${cls}-logo" src="/logo/${shop.slug}?v=${shop.logo_file.slice(0, 8)}" alt="" width="96" height="96">`
    : html`<span class="${cls}-initial" aria-hidden="true">${initialOf(shop)}</span>`;

/** The link split into host + path so the shop's own part stands out. */
const prettyLink = (shop) => html`<span class="set-link-host">${shortUrl(config.baseUrl)}</span><span class="set-link-slug">${shopPath(shop)}</span>`;

export function shareTexts(shop) {
  const url = orderFormUrl(shop);
  return {
    whatsapp: `Hi! You can now send your print files to ${shop.name} online.\nUpload your files, choose size and copies, and get an order number instantly:\n${url}`,
    bio: `Send your print files online: ${shortUrl(url)}`,
    status: `Now taking print orders online! Upload your files, choose size and copies, and get your order number instantly – no app needed.\n${url}`,
  };
}

function copyBlock({ id, label, text, rows, hint }) {
  return html`<div class="set-copy">
    <div class="set-copy-head">
      <label for="${id}">${label}</label>
      <button type="button" class="btn btn-soft btn-sm" data-copy-target="#${id}" data-copy-msg="Message copied">${icon('copy')}<span>Copy</span></button>
    </div>
    <textarea id="${id}" class="set-copy-text" rows="${rows}" readonly${hint ? raw(` aria-describedby="${id}-hint"`) : ''}>${text}</textarea>
    ${hint ? html`<p class="hint" id="${id}-hint">${hint}</p>` : ''}
  </div>`;
}

export function linkView(res, { shop, state }) {
  const url = orderFormUrl(shop);
  const open = state === 'active';
  const texts = shareTexts(shop);
  const waHref = `https://wa.me/?text=${encodeURIComponent(texts.whatsapp)}`;

  const closedNote = open
    ? ''
    : html`<div class="alert alert-warn set-closed" role="alert">
        ${icon('alert')}
        <span><b>Your link is closed right now.</b> ${state === 'paused'
          ? html`Your account is paused, so customers who open it see that the shop is not taking online orders. <a href="/shop/support">Contact support</a>.`
          : html`Your plan is not active, so customers who open it see that the shop is not taking online orders. <a href="/shop/billing">Renew your plan</a> to switch it back on.`}</span>
      </div>`;

  const hero = html`<section class="card set-hero" aria-labelledby="set-link-title">
    <div class="set-hero-top">
      <h2 id="set-link-title" class="set-hero-label">${icon('link')}<span>Customer order link</span></h2>
      <span class="pill ${open ? 'pill-shop-active' : 'pill-shop-expired'}">${open ? 'Taking orders' : 'Closed'}</span>
    </div>
    <p class="set-link" id="set-link-text">${prettyLink(shop)}</p>
    <p class="set-hero-note">Customers open this link, upload files, pick size and copies, and get an order number – no app or login.</p>
    <div class="set-hero-actions">
      <button type="button" class="btn btn-primary btn-lg" data-copy="${url}" data-copy-msg="Link copied">${icon('copy')}<span>Copy link</span></button>
      <button type="button" class="btn btn-secondary btn-lg" data-share data-share-url="${url}" data-share-title="${shop.name} – send your print files" data-share-text="Send your print files to ${shop.name}">${icon('share')}<span>Share</span></button>
      <a class="btn btn-ghost btn-lg" href="${url}" target="_blank" rel="noopener">${icon('eye')}<span>Open</span></a>
    </div>
    ${closedNote}
  </section>`;

  const qrCard = html`<section class="card set-qr" aria-labelledby="set-qr-title">
    <div class="set-qr-body">
      <h2 id="set-qr-title">QR code</h2>
      <p class="muted">Customers scan it with their phone camera to open your order page.</p>
      <figure class="set-qr-figure">
        <div class="set-qr-tile">
          <img src="/shop/qr.svg" alt="QR code that opens ${shortUrl(url)}" width="280" height="280">
        </div>
        <figcaption>
          <b>${shop.name}</b>
          <span class="mono">${shortUrl(url)}</span>
        </figcaption>
      </figure>
      <div class="btn-row-stack">
        <a class="btn btn-primary btn-block" href="/shop/poster">${icon('printer')}<span>Print counter poster</span></a>
        <a class="btn btn-secondary btn-block" href="/shop/qr.png" download="${shop.slug}-qr.png">${icon('download')}<span>Download QR (PNG)</span></a>
      </div>
    </div>
  </section>`;

  const share = html`<section class="card set-share" aria-labelledby="set-share-title">
    <div class="sh-card-head"><h2 id="set-share-title">Share with customers</h2></div>
    <div class="sh-card-body stack">
      <a class="btn btn-wa btn-lg btn-block" href="${waHref}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Share on WhatsApp</span></a>
      ${copyBlock({ id: 'set-msg-status', label: 'WhatsApp / Instagram status', text: texts.status, rows: 4, hint: 'Paste it as a status or send it to regular customers.' })}
      ${copyBlock({ id: 'set-msg-bio', label: 'Instagram bio line', text: texts.bio, rows: 2, hint: 'Also add the link itself in the "Links" field of your Instagram profile.' })}
    </div>
  </section>`;

  const tips = [
    ['whatsapp', 'WhatsApp Business', 'Add the link to your business profile and to a quick reply like /order.', 'wa'],
    ['sparkle', 'Instagram', 'Put it in your bio link and pin a post or story about it.', 'ig'],
    ['store', 'Google Business Profile', 'Add it as your website or order link, so people find it on Maps.', 'gb'],
    ['printer', 'At the counter', 'Print the QR poster and keep it at the billing desk.', 'ct'],
  ];
  const tipsCard = html`<section class="card set-tips" aria-labelledby="set-tips-title">
    <div class="sh-card-head"><h2 id="set-tips-title">Where to put your link</h2></div>
    <ul class="set-tip-list">
      ${tips.map(([ic, title, text, cls]) => html`<li><span class="set-tip-icon set-tip-${cls}">${icon(ic)}</span><span><b>${title}</b><span class="muted">${text}</span></span></li>`)}
    </ul>
  </section>`;

  const install = html`<section class="card set-install" aria-labelledby="set-install-title">
    <div class="set-install-head">
      <span class="set-install-icon">${icon('install')}</span>
      <div>
        <h2 id="set-install-title">Install PrintDesk on your phone</h2>
        <p class="muted">Open your orders in one tap from the home screen, like an app – and hear new-order alerts.</p>
      </div>
    </div>
    <button type="button" class="btn btn-primary btn-block" data-install hidden>${icon('install')}<span>Install app</span></button>
    <div class="set-install-hint" data-ios-hint hidden>
      <b>iPhone / iPad</b>
      <span>In Safari, tap the Share button ${icon('share')} and choose <b>Add to Home Screen</b>.</span>
    </div>
    <div class="set-install-hint">
      <b>Android</b>
      <span>In Chrome, tap the <b>⋮</b> menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</span>
    </div>
  </section>`;

  return {
    title: 'Your order link',
    variant: 'shop',
    active: 'link',
    brandShop: shop,
    scripts: SCRIPTS,
    body: html`<div class="container">
      <div class="page-head">
        <div>
          <span class="eyebrow">${shopIcon('qr')} Link &amp; QR</span>
          <h1>Your order link</h1>
          <p>Share it anywhere. Every order lands in your dashboard with its own order number.</p>
        </div>
      </div>
      <div class="set-link-grid">
        <div class="set-col">${hero}${share}${tipsCard}</div>
        <div class="set-col">${qrCard}${install}</div>
      </div>
    </div>`,
  };
}

export function posterView(res, { shop }) {
  const url = orderFormUrl(shop);
  const firstLine = (shop.address || '').split('\n')[0];
  return {
    title: 'Counter poster',
    variant: 'bare',
    brandShop: shop,
    bodyClass: 'set-poster-page',
    scripts: ['/js/settings.js'],
    body: html`<div class="set-poster-tools no-print">
        <a class="btn btn-ghost btn-sm" href="/shop/link">${icon('arrowLeft')}<span>Back</span></a>
        <div class="set-paper" role="group" aria-label="Paper size">
          <button type="button" class="set-paper-btn" data-paper="a4" aria-pressed="true">A4</button>
          <button type="button" class="set-paper-btn" data-paper="a5" aria-pressed="false">A5</button>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-print>${icon('printer')}<span>Print</span></button>
      </div>
      <p class="set-poster-help no-print">Tip: print in colour on thick paper, and keep it where customers wait.</p>
      <div class="set-poster-stage">
        <article class="set-poster" data-poster aria-label="Counter poster preview">
          <div class="set-poster-bar" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          <header class="set-poster-shop">
            ${shopMark(shop, 'set-poster')}
            <div class="set-poster-shop-text">
              <b>${shop.name}</b>
              ${firstLine ? html`<span>${firstLine}</span>` : ''}
            </div>
          </header>
          <h1 class="set-poster-title">Send your print files here</h1>
          <p class="set-poster-sub">Scan with your phone camera – no app needed</p>
          <div class="set-poster-qr">
            <img src="/shop/qr.svg" alt="QR code that opens ${shortUrl(url)}" width="400" height="400">
          </div>
          <p class="set-poster-link">${shortUrl(url)}</p>
          <ol class="set-poster-steps">
            <li><span class="set-step-no">1</span><span>Scan the QR code</span></li>
            <li><span class="set-step-no">2</span><span>Upload files &amp; choose size</span></li>
            <li><span class="set-step-no">3</span><span>Get your order number</span></li>
          </ol>
          <footer class="set-poster-foot">${logoMark(18)}<span>Powered by <b>PrintDesk</b></span></footer>
        </article>
      </div>`,
  };
}
