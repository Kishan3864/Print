import { html, raw } from '../../lib/html.js';
import { STATUS_CUSTOMER_TEXT, timelineSteps } from '../../lib/status.js';
import { VERSION_ALLOWED } from '../../services/orders.js';
import { extOf, isPreviewableImage } from '../../lib/uploads.js';
import { formatBytes, formatDateTime, maskPhone, timeAgo, waLink } from '../../lib/util.js';
import { acceptsOrders } from '../../services/shops.js';
import { mailEnabled, shopPath, trackPath, trackUrl } from '../../services/notify.js';
import { render } from '../layout.js';
import { csrfField, icon, withCsrf } from '../components.js';
import { COLOR_LABEL, SIDES_LABEL, contactActions, ownerNote, shopAddress } from './common.js';

// Private order tracking page: /<slug>/o/<token> (or /demo/<slug>/o/<token>). Only ever shows this one order.
// Top to bottom: status (what is happening now) · design preview to OK (when waiting) · pickup ·
// details, files and the saved link folded away.

const HEADLINE = {
  new: 'Order received',
  proof_sent: 'Please check your design',
  approved: 'You said OK',
  changes_requested: 'Changes sent to the shop',
  printing: 'Printing now',
  ready: 'Ready for pickup',
  delivered: 'Delivered',
  cancelled: 'Order cancelled',
};
// One line under the headline (falls back to STATUS_CUSTOMER_TEXT).
const SUBTEXT = {
  new: (shop) => `${shop.name} will check your files shortly.`,
  proof_sent: () => 'Look at the preview below and tap OK – or ask for changes. Nothing is printed before your OK.',
  approved: () => 'Thank you! It goes to print next.',
  changes_requested: () => 'The shop is making your changes. The new preview will show on this page.',
  printing: () => 'This page shows “Ready” as soon as you can pick it up.',
  ready: (shop, order) => `Collect it from ${shop.name}. Say order P-${order.order_no} at the counter.`,
  delivered: (shop) => `Thank you for ordering from ${shop.name}.`,
};
const STATUS_ICON = {
  new: 'file',
  proof_sent: 'eye',
  approved: 'check',
  changes_requested: 'refresh',
  printing: 'printer',
  ready: 'store',
  delivered: 'check',
  cancelled: 'x',
};

const saveText = (shop, order, url) => `My print order P-${order.order_no} at ${shop.name}: ${url}`;

/** "A4 · 100 copies · Colour · Both sides" */
const jobLine = (order) =>
  [order.size, `${order.quantity} ${Number(order.quantity) === 1 ? 'copy' : 'copies'}`, COLOR_LABEL[order.color_mode], SIDES_LABEL[order.sides]].filter(Boolean).join(' · ');

/** Collapsible card: <details> with an icon, a title and a short line. */
const fold = ({ id = '', ic, title, sub = '', open = false, body }) =>
  html`<details class="cust-card cust-fold"${id ? raw(` id="${id}"`) : ''}${open ? raw(' open') : ''}>
    <summary class="cust-fold-sum">
      <span class="cust-fold-ic">${icon(ic)}</span>
      <span class="cust-fold-title"><b>${title}</b>${sub ? html`<small>${sub}</small>` : ''}</span>
    </summary>
    <div class="cust-fold-body">${body}</div>
  </details>`;

function fileItem(file, href, days) {
  const gone = Boolean(file.deleted_at);
  const name = file.original_name;
  const ver = file.replaced_at ? `Replaced (v${file.version}) · ` : file.version > 1 ? `New version ${file.version} · ` : '';
  return html`<li class="cust-file${gone || file.replaced_at ? ' is-deleted' : ''}">
    <span class="cust-file-ext">${extOf(name) || 'file'}</span>
    <span class="cust-file-main">
      <span class="cust-file-name" title="${name}">${name}</span>
      <span class="cust-file-meta">${ver}${gone ? `Deleted after ${days} days` : formatBytes(file.size_bytes)}</span>
    </span>
    ${gone
      ? ''
      : html`<a class="btn btn-ghost btn-icon cust-file-btn" href="${href}" download aria-label="Download ${name}">${icon('download')}</a>`}
  </li>`;
}

function timeline(status, hadProof) {
  return html`<ol class="cust-tl" aria-label="Order progress">
    ${timelineSteps(status, { hadProof }).map(
      (s) => html`<li class="cust-tl-step is-${s.state}"${s.state === 'current' ? html` aria-current="step"` : ''}>
        <span class="cust-tl-dot" aria-hidden="true">${s.state === 'done' ? icon('check') : ''}</span>
        <span class="cust-tl-label">
          ${s.state === 'done' ? html`<span class="sr-only">Done: </span>` : ''}${s.label}
          ${s.state === 'current' ? html`<small class="cust-tl-now">Now</small>` : s.state === 'skipped' ? html`<small>Not needed</small>` : ''}
        </span>
      </li>`
    )}
  </ol>`;
}

function placedCard(shop, order) {
  const url = trackUrl(shop, order);
  const emailed = order.customer_email && mailEnabled() && !shop.is_demo;
  return html`<section class="cust-placed" role="status" aria-labelledby="cust-placed-title">
    <span class="cust-placed-ic">${icon('check')}</span>
    <h2 id="cust-placed-title">Order sent!</h2>
    <p class="cust-placed-text">${shop.name} has your files.</p>
    <p class="cust-placed-no"><small>Your order number</small><b class="order-no">P-${order.order_no}</b></p>
    <p class="cust-placed-save">Save this page to see progress${emailed ? ' – we also emailed you the link' : ''}.</p>
    <div class="cust-placed-actions">
      <a class="btn btn-wa btn-lg" href="${waLink('', saveText(shop, order, url))}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Save on WhatsApp</span></a>
      <button type="button" class="btn btn-secondary btn-lg" data-copy="${url}" data-copy-msg="Link copied – keep it safe">${icon('copy')}<span>Copy link</span></button>
    </div>
  </section>`;
}

function statusCard(shop, order, proof) {
  const st = order.status;
  return html`<section class="cust-card cust-status cust-st-${st}" aria-labelledby="cust-order-title">
    <div class="cust-status-top">
      <h1 class="cust-order-no" id="cust-order-title"><small>Order</small> P-${order.order_no}</h1>
      <span class="cust-updated">Updated ${timeAgo(order.updated_at)}</span>
    </div>
    <div class="cust-status-msg">
      <span class="cust-st-ic">${icon(STATUS_ICON[st] || 'info')}</span>
      <div class="cust-status-copy">
        <p class="cust-st-head">${HEADLINE[st] || st}</p>
        <p class="cust-st-text">${SUBTEXT[st] ? SUBTEXT[st](shop, order) : STATUS_CUSTOMER_TEXT[st] || ''}</p>
      </div>
    </div>
    ${st === 'cancelled' ? '' : timeline(st, Boolean(proof))}
    <p class="cust-job">${icon('printer')}<span>${jobLine(order)}</span></p>
  </section>`;
}

/** Image preview (tap to zoom) or a download row for PDFs and design files. */
function previewMedia(shop, order, proof, href) {
  const gone = Boolean(proof.deleted_at);
  if (!gone && isPreviewableImage(proof.original_name))
    return html`<a class="cust-proof-img" href="${href}?inline=1" target="_blank" rel="noopener" aria-label="Open the design preview full size">
        <img src="${href}?inline=1" alt="Design preview for order P-${order.order_no}" decoding="async">
        <span class="cust-proof-zoom">${icon('search')}<span>Tap to zoom</span></span>
      </a>`;
  return html`<ul class="cust-file-list">${fileItem(proof, href, shop.retention_days)}</ul>
    ${gone ? '' : html`<a class="btn btn-secondary btn-lg btn-block" href="${href}" download>${icon('download')}<span>Open the preview</span></a>`}`;
}

/** The design preview waiting for the customer's OK – the most important thing on the page. */
function checkCard(res, shop, order, proof, olderProofs, base) {
  const href = `${base}/f/${proof.id}`;
  return html`<section class="cust-card cust-proof is-waiting" id="proof" aria-labelledby="cust-proof-title">
    <div class="cust-proof-head">
      <h2 id="cust-proof-title">Check your design</h2>
      <p>Check spelling, phone numbers, colours and size.</p>
    </div>
    ${previewMedia(shop, order, proof, href)}
    ${order.proof_note
      ? html`<div class="cust-note"><span class="cust-note-label">Note from ${shop.name}</span><p>${order.proof_note}</p></div>`
      : ''}
    <div class="cust-decide">
      <form method="post" action="${base}/approve" class="cust-approve">
        ${csrfField(res)}<input type="hidden" name="proof_id" value="${proof.id}">
        <button type="submit" class="btn btn-success btn-xl btn-block" data-confirm="Everything correct? The shop will print it now.">${icon('check')}<span>OK, print it</span></button>
      </form>
      <details class="cust-changes">
        <summary class="btn btn-secondary btn-xl btn-block">${icon('refresh')}<span>Need changes</span></summary>
        <form method="post" action="${base}/changes" class="cust-changes-form">
          ${csrfField(res)}<input type="hidden" name="proof_id" value="${proof.id}">
          <label class="cust-opt-label" for="cust-change-note">What should change?</label>
          <textarea id="cust-change-note" name="note" rows="4" required maxlength="1000" placeholder="e.g. Change the phone number to 98765 43210, make the logo bigger"></textarea>
          <button type="submit" class="btn btn-dark btn-lg btn-block">${icon('arrowRight')}<span>Send to shop</span></button>
        </form>
      </details>
    </div>
    <p class="cust-decide-foot">${icon('info')}<span>Nothing is printed before your OK.</span></p>
    ${olderProofs.length
      ? html`<details class="cust-older">
          <summary>${icon('clock')}<span>Earlier previews (${olderProofs.length})</span></summary>
          <ul class="cust-file-list">${olderProofs.map((p) => fileItem(p, `${base}/f/${p.id}`, shop.retention_days))}</ul>
        </details>`
      : ''}
  </section>`;
}

/** A preview that is no longer waiting: folded away, with what the customer decided. */
function previewFold(shop, order, proof, olderProofs, base) {
  const href = `${base}/f/${proof.id}`;
  const st = order.status;
  const decided =
    st === 'changes_requested'
      ? order.customer_note
        ? html`<div class="cust-note cust-note-you"><span class="cust-note-label">You asked for</span><p>${order.customer_note}</p></div>`
        : ''
      : st === 'approved'
        ? html`<p class="cust-said-ok">${icon('check')}<span>You said OK to this design.</span></p>`
        : '';
  const sub = st === 'changes_requested' ? 'You asked for changes' : st === 'cancelled' ? `Sent ${timeAgo(proof.created_at)}` : 'You said OK';
  return fold({
    id: 'proof',
    ic: 'eye',
    title: 'Design preview',
    sub,
    open: st === 'changes_requested' || st === 'approved',
    body: html`${previewMedia(shop, order, proof, href)}
      ${order.proof_note ? html`<div class="cust-note"><span class="cust-note-label">Note from ${shop.name}</span><p>${order.proof_note}</p></div>` : ''}
      ${decided}
      ${olderProofs.length
        ? html`<details class="cust-older">
            <summary>${icon('clock')}<span>Earlier previews (${olderProofs.length})</span></summary>
            <ul class="cust-file-list">${olderProofs.map((p) => fileItem(p, `${base}/f/${p.id}`, shop.retention_days))}</ul>
          </details>`
        : ''}`,
  });
}

function pickupCard(shop, order) {
  return html`<section class="cust-card cust-contact is-ready" aria-labelledby="cust-contact-title">
    <h2 class="cust-h2" id="cust-contact-title"><span class="cust-h2-ic">${icon('store')}</span><span>Pick up your order</span></h2>
    <p class="cust-muted">Say order <b class="order-no">P-${order.order_no}</b> at the counter.</p>
    ${contactActions(shop, `Hi ${shop.name}, about my order P-${order.order_no}`)}
    ${shopAddress(shop)}
  </section>`;
}

/** Call / WhatsApp the shop – a small row, not a big card. */
function contactRow(shop, order) {
  if (!shop.phone && !shop.address) return '';
  return html`<section class="cust-card cust-help" aria-labelledby="cust-help-title">
    <h2 class="cust-help-title" id="cust-help-title">Questions? Ask ${shop.name}</h2>
    ${contactActions(shop, `Hi ${shop.name}, about my order P-${order.order_no}`)}
    ${shopAddress(shop)}
  </section>`;
}

/**
 * @param shop   shop row (from the slug)
 * @param order  order row (from slug + token)
 * @param files  orderFiles(order)
 * @param proof  latestProof(order) or undefined
 * @param isNew  show the "Order sent" card
 * @param owner  the logged-in shop is looking at its own order
 */
export function trackPage(res, { shop, order, files, proof, isNew = false, owner = false }) {
  const base = trackPath(shop, order);
  const no = order.order_no;
  const days = shop.retention_days;
  const url = trackUrl(shop, order);
  const customerFiles = files.filter((f) => f.kind === 'customer');
  const liveFiles = customerFiles.filter((f) => !f.replaced_at).length;
  const olderProofs = proof ? files.filter((f) => f.kind === 'proof' && f.id !== proof.id).reverse() : [];
  const st = order.status;
  const waiting = st === 'proof_sent' && proof;
  const canChangeFile = VERSION_ALLOWED.has(st);

  const details = fold({
    ic: 'printer',
    title: 'Order details',
    sub: `Placed ${formatDateTime(order.created_at)}`,
    body: html`<dl class="cust-specs">
        <div><dt>Size</dt><dd>${order.size || '—'}</dd></div>
        <div><dt>Copies</dt><dd>${order.quantity}</dd></div>
        <div><dt>Print</dt><dd>${COLOR_LABEL[order.color_mode] || order.color_mode}</dd></div>
        <div><dt>Sides</dt><dd>${SIDES_LABEL[order.sides] || order.sides}</dd></div>
        ${order.paper ? html`<div><dt>Paper</dt><dd>${order.paper}</dd></div>` : ''}
        <div><dt>Handover</dt><dd>${order.delivery === 'delivery' ? 'Delivery' : 'Pickup'}</dd></div>
      </dl>
      ${order.notes ? html`<div class="cust-note cust-note-you"><span class="cust-note-label">Your note</span><p>${order.notes}</p></div>` : ''}
      <p class="cust-by">${icon('user')}<span>${order.customer_name} · ${/x/i.test(order.customer_mobile) ? order.customer_mobile : maskPhone(order.customer_mobile)}</span></p>`,
  });

  const filesFold = fold({
    id: 'files',
    ic: 'file',
    title: 'Your files',
    sub: `${liveFiles} file${liveFiles === 1 ? '' : 's'}${canChangeFile ? ' · change file' : ''}`,
    body: html`${customerFiles.length
        ? html`<ul class="cust-file-list">${customerFiles.map((f) => fileItem(f, `${base}/f/${f.id}`, days))}</ul>`
        : html`<p class="cust-muted">No files on this order.</p>`}
      ${canChangeFile
        ? html`<form method="post" action="${withCsrf(`${base}/version`, res)}" enctype="multipart/form-data" class="cust-version">
            <p class="cust-version-title"><b>Wrong file?</b> Send the right one – only the new file is printed.</p>
            <input type="file" name="files" required aria-label="New file">
            <input type="text" name="note" maxlength="500" placeholder="What changed? (optional)" aria-label="What changed">
            <button class="btn btn-brand" type="submit" data-loading="Uploading…">${icon('upload')}<span>Send new file</span></button>
          </form>`
        : ''}
      <p class="cust-privacy">${icon('shield')}<span>Only you and ${shop.name} can open these files. They are deleted after ${days} days.</span></p>`,
  });

  const keep = html`<section class="cust-keep" aria-labelledby="cust-keep-title">
    <h2 class="cust-keep-title" id="cust-keep-title">${icon('link')}<span>Keep this page</span></h2>
    <p class="cust-muted">Only people with this link can see your order.</p>
    <div class="cust-keep-actions">
      <a class="btn btn-secondary" href="${waLink('', saveText(shop, order, url))}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Save on WhatsApp</span></a>
      <button type="button" class="btn btn-secondary" data-copy="${url}" data-copy-msg="Link copied">${icon('copy')}<span>Copy link</span></button>
      <button type="button" class="btn btn-ghost" data-share data-share-url="${url}" data-share-title="Order P-${no} – ${shop.name}" data-share-text="My print order P-${no} at ${shop.name}">${icon('share')}<span>Share</span></button>
    </div>
    ${acceptsOrders(shop) ? html`<a class="cust-again" href="${shopPath(shop)}">${icon('plus')}<span>Place another order</span>${icon('arrowRight')}</a>` : ''}
  </section>`;

  const body = html`<div class="cust-wrap cust-page cust-narrow cust-track">
    ${owner ? ownerNote('You are viewing the customer’s tracking page.', `/shop/orders/${no}`, 'Open in dashboard') : ''}
    ${isNew ? placedCard(shop, order) : ''}
    ${statusCard(shop, order, proof)}
    ${waiting ? checkCard(res, shop, order, proof, olderProofs, base) : proof ? previewFold(shop, order, proof, olderProofs, base) : ''}
    ${st === 'ready' ? pickupCard(shop, order) : ''}
    ${details}
    ${filesFold}
    ${st === 'ready' ? '' : contactRow(shop, order)}
    ${isNew ? '' : keep}
  </div>`;

  render(res, {
    title: `Order P-${no} – ${shop.name}`,
    description: `Track your print order P-${no} at ${shop.name}.`,
    variant: 'customer',
    brandShop: shop,
    bodyClass: 'cust-track-page',
    noindex: true,
    body,
  });
}
