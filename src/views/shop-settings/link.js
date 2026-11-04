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

export function shareTexts(shop) {
  const url = orderFormUrl(shop);
  return {
    whatsapp: `Hi! You can now send your print files to ${shop.name} online.\nUpload your files, choose size and copies, and get an order number instantly:\n${url}`,
    bio: `Send your print files online: ${shortUrl(url)}`,
    status: `Now taking print orders online! Upload your files, choose size and copies, and get your order number instantly – no app needed.\n${url}`,
  };
}

function copyBlock({ id, label, text, rows, hint }) {
  return html`<div class="lk-copy">
    <div class="lk-copy-head">
      <label for="${id}">${label}</label>
      <button type="button" class="btn btn-soft btn-sm" data-copy-target="#${id}" data-copy-msg="Message copied">${icon('copy')}<span>Copy</span></button>
    </div>
    <textarea id="${id}" class="lk-copy-text" rows="${rows}" readonly${hint ? raw(` aria-describedby="${id}-hint"`) : ''}>${text}</textarea>
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
    : html`<div class="alert alert-warn lk-closed" role="alert">
        ${icon('alert')}
        <span><b>Your link is closed right now.</b> ${state === 'paused'
          ? html`Customers who open it see that you are not taking online orders. <a href="/shop/support">Contact us</a>.`
          : html`Customers who open it see that you are not taking online orders. <a href="/shop/billing">Renew your plan</a> to open it again.`}</span>
      </div>`;

  const hero = html`<section class="card lk-hero" aria-labelledby="lk-title">
    <div class="lk-hero-top">
      <span class="pill ${open ? 'pill-shop-active' : 'pill-shop-expired'}">${open ? 'Taking orders' : 'Closed'}</span>
    </div>
    <h2 id="lk-title" class="lk-hero-title">This link is your online counter</h2>
    <p class="lk-hero-text">Customers open it on their phone, send their files and get an order number. The order comes straight to your <a href="/shop">Orders</a> – with a sound.</p>
    <a class="lk-url" href="${url}" target="_blank" rel="noopener" title="Open your order page">
      <span class="lk-url-host">${shortUrl(config.baseUrl)}</span><span class="lk-url-path">${shopPath(shop)}</span>
    </a>
    <div class="lk-actions">
      <a class="btn btn-wa btn-lg" href="${waHref}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Share on WhatsApp</span></a>
      <button type="button" class="btn btn-secondary btn-lg" data-copy="${url}" data-copy-msg="Link copied">${icon('copy')}<span>Copy link</span></button>
      <button type="button" class="btn btn-secondary btn-lg" data-share data-share-url="${url}" data-share-title="${shop.name} – send your print files" data-share-text="Send your print files to ${shop.name}">${icon('share')}<span>More apps</span></button>
    </div>
    ${closedNote}
    <ol class="lk-how" aria-label="How customers order">
      <li><span class="lk-how-n">1</span><span><b>Customer opens the link</b><small>or scans your QR code</small></span></li>
      <li><span class="lk-how-n">2</span><span><b>Sends the files</b><small>picks size and copies</small></span></li>
      <li><span class="lk-how-n">3</span><span><b>You get the order</b><small>with its own P-number</small></span></li>
    </ol>
  </section>`;

  const qrCard = html`<section class="card lk-qr" aria-labelledby="lk-qr-title">
    <h2 id="lk-qr-title">QR code for your counter</h2>
    <p class="muted">Print it and keep it where customers wait. They scan it with the phone camera – no app needed.</p>
    <figure class="lk-qr-figure">
      <div class="lk-qr-tile">
        <img src="/shop/qr.svg" alt="QR code that opens ${shortUrl(url)}" width="240" height="240">
      </div>
      <figcaption><b>${shop.name}</b></figcaption>
    </figure>
    <div class="btn-row-stack">
      <a class="btn btn-primary btn-lg btn-block" href="/shop/poster">${icon('printer')}<span>Print counter poster</span></a>
      <a class="btn btn-secondary btn-block" href="/shop/qr.png" download="${shop.slug}-qr.png">${icon('download')}<span>Download QR image</span></a>
    </div>
  </section>`;

  const messages = html`<details class="card fold lk-fold">
    <summary><span class="fold-ic">${shopIcon('megaphone')}</span><span class="fold-title"><b>Ready-made messages</b><small>Copy for WhatsApp status and Instagram bio</small></span></summary>
    <div class="fold-body stack">
      ${copyBlock({ id: 'lk-msg-status', label: 'WhatsApp / Instagram status', text: texts.status, rows: 4, hint: 'Post it as a status or send it to regular customers.' })}
      ${copyBlock({ id: 'lk-msg-bio', label: 'Instagram bio line', text: texts.bio, rows: 2, hint: 'Also add the link itself in the "Links" field of your Instagram profile.' })}
    </div>
  </details>`;

  const tips = [
    ['whatsapp', 'WhatsApp Business', 'Add the link to your business profile and a quick reply like /order.', 'wa'],
    ['sparkle', 'Instagram', 'Put it in your bio and pin a story about it.', 'ig'],
    ['store', 'Google Maps', 'Add it as your website in your Google Business Profile.', 'gb'],
    ['printer', 'At the counter', 'Print the QR poster and keep it at the billing desk.', 'ct'],
  ];
  const tipsCard = html`<details class="card fold lk-fold">
    <summary><span class="fold-ic">${icon('sparkle')}</span><span class="fold-title"><b>Where to put your link</b><small>4 places that bring the most orders</small></span></summary>
    <div class="fold-body">
      <ul class="lk-tips">
        ${tips.map(([ic, title, text, cls]) => html`<li><span class="lk-tip-ic lk-tip-${cls}">${icon(ic)}</span><span><b>${title}</b><span class="muted">${text}</span></span></li>`)}
      </ul>
    </div>
  </details>`;

  const install = html`<details class="card fold lk-fold">
    <summary><span class="fold-ic">${icon('install')}</span><span class="fold-title"><b>Put Brighton Print on your phone</b><small>Open orders in one tap and hear new-order sounds</small></span></summary>
    <div class="fold-body stack-sm">
      <button type="button" class="btn btn-primary btn-block" data-install hidden>${icon('install')}<span>Install app</span></button>
      <p class="lk-install-hint" data-ios-hint hidden><b>iPhone / iPad:</b> in Safari tap Share ${icon('share')} → <b>Add to Home Screen</b>.</p>
      <p class="lk-install-hint"><b>Android:</b> in Chrome tap <b>⋮</b> → <b>Install app</b> or <b>Add to Home screen</b>.</p>
    </div>
  </details>`;

  return {
    title: 'Share your link',
    variant: 'shop',
    active: 'link',
    brandShop: shop,
    scripts: SCRIPTS,
    body: html`<div class="container lk-page">
      <div class="page-head">
        <div>
          <h1>Share your order link</h1>
          <p>More people with your link = more orders in your phone.</p>
        </div>
      </div>
      <div class="lk-grid">
        <div class="lk-col">${hero}${messages}${tipsCard}${install}</div>
        <div class="lk-col">${qrCard}</div>
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
          <footer class="set-poster-foot">${logoMark(18)}<span>Powered by <b>Brighton Solution</b></span></footer>
        </article>
      </div>`,
  };
}
