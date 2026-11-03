import { html } from '../../lib/html.js';
import { STATUS_CUSTOMER_TEXT, timelineSteps } from '../../lib/status.js';
import { VERSION_ALLOWED } from '../../services/orders.js';
import { extOf, isPreviewableImage } from '../../lib/uploads.js';
import { formatBytes, formatDateTime, maskPhone, timeAgo, waLink } from '../../lib/util.js';
import { acceptsOrders } from '../../services/shops.js';
import { mailEnabled, shopPath, trackPath, trackUrl } from '../../services/notify.js';
import { render } from '../layout.js';
import { alert, csrfField, field, icon, statusPill , withCsrf } from '../components.js';
import { COLOR_LABEL, SIDES_LABEL, cardTitle, contactActions, ownerNote, shopAddress } from './common.js';

// Private order tracking page: /<slug>/o/<token> (or /demo/<slug>/o/<token>). Only ever shows this one order.

const HEADLINE = {
  new: 'Order received',
  proof_sent: 'Your proof is ready to check',
  approved: 'Proof approved',
  changes_requested: 'Changes requested',
  printing: 'Printing now',
  ready: 'Ready for pickup',
  delivered: 'Delivered',
  cancelled: 'Order cancelled',
};
// One line under the headline (falls back to STATUS_CUSTOMER_TEXT).
const SUBTEXT = {
  proof_sent: () => 'Please check it, then approve it or ask for changes. Printing starts only after you approve.',
  approved: () => 'Thank you! Your order goes to print next.',
  changes_requested: () => 'The shop is making your changes and will send a new proof to this page.',
  printing: () => 'This page shows “Ready” as soon as you can pick it up.',
  ready: (shop, order) => `Collect it from ${shop.name} and mention order P-${order.order_no} at the counter.`,
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

function fileItem(file, href, days) {
  const gone = Boolean(file.deleted_at);
  const name = file.original_name;
  const ver = file.replaced_at ? `Replaced (v${file.version}) · ` : file.version > 1 ? `Version ${file.version} · latest · ` : '';
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
    <div class="cust-placed-body">
      <h2 id="cust-placed-title">Order placed</h2>
      <p class="cust-placed-text">${shop.name} has received your files. Your order number is <b class="order-no">P-${order.order_no}</b>.</p>
      <p class="cust-placed-save">Save this page – it is where you check progress and approve your proof.${emailed ? ' We have also emailed the link to you.' : ''}</p>
      <div class="cust-placed-actions">
        <button type="button" class="btn btn-brand" data-copy="${url}" data-copy-msg="Link copied – keep it safe">${icon('copy')}<span>Copy link</span></button>
        <a class="btn btn-secondary" href="${waLink('', saveText(shop, order, url))}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Save on WhatsApp</span></a>
      </div>
    </div>
  </section>`;
}

function statusCard(shop, order, proof) {
  const st = order.status;
  return html`<section class="cust-card cust-status cust-st-${st}" aria-labelledby="cust-order-title">
    <div class="cust-status-top">
      <p class="cust-kicker">${icon('store')}<span>Order at ${shop.name}</span></p>
      ${statusPill(st)}
    </div>
    <h1 class="cust-order-no" id="cust-order-title"><span class="sr-only">Order </span>P-${order.order_no}</h1>
    <div class="cust-status-msg">
      <span class="cust-st-ic">${icon(STATUS_ICON[st] || 'info')}</span>
      <div class="cust-status-copy">
        <p class="cust-st-head">${HEADLINE[st] || st}</p>
        <p class="cust-st-text">${SUBTEXT[st] ? SUBTEXT[st](shop, order) : STATUS_CUSTOMER_TEXT[st] || ''}</p>
        ${st === 'proof_sent' ? html`<a class="btn btn-brand cust-st-jump" href="#proof">${icon('eye')}<span>Check your proof</span></a>` : ''}
      </div>
    </div>
    ${st === 'cancelled' ? '' : timeline(st, Boolean(proof))}
    <p class="cust-status-meta">
      <span>${icon('clock')}Placed ${formatDateTime(order.created_at)}</span>
      <span>${icon('refresh')}Updated ${timeAgo(order.updated_at)}</span>
    </p>
  </section>`;
}

function proofCard(res, shop, order, proof, olderProofs, base) {
  const href = `${base}/f/${proof.id}`;
  const gone = Boolean(proof.deleted_at);
  const waiting = order.status === 'proof_sent';
  const preview =
    !gone && isPreviewableImage(proof.original_name)
      ? html`<a class="cust-proof-img" href="${href}?inline=1" target="_blank" rel="noopener" aria-label="Open the proof full size">
            <img src="${href}?inline=1" alt="Proof for order P-${order.order_no}" decoding="async">
            <span class="cust-proof-zoom">${icon('search')}<span>Tap to zoom</span></span>
          </a>
          <div class="cust-proof-tools">
            <a class="btn btn-secondary btn-sm" href="${href}?inline=1" target="_blank" rel="noopener">${icon('eye')}<span>Full size</span></a>
            <a class="btn btn-secondary btn-sm" href="${href}" download>${icon('download')}<span>Download</span></a>
          </div>`
      : html`<ul class="cust-file-list">${fileItem(proof, href, shop.retention_days)}</ul>
          ${gone ? '' : html`<a class="btn btn-secondary btn-lg btn-block" href="${href}" download>${icon('download')}<span>Download proof to check it</span></a>`}`;

  let after = '';
  if (waiting) {
    after = html`<div class="cust-decide">
      <p class="cust-decide-q">Is everything correct?</p>
      <ul class="cust-checks">
        <li>${icon('check')}<span>Names and spelling</span></li>
        <li>${icon('check')}<span>Phone numbers, dates and prices</span></li>
        <li>${icon('check')}<span>Colours, size and layout</span></li>
      </ul>
      <form method="post" action="${base}/approve" class="cust-approve">
        ${csrfField(res)}<input type="hidden" name="proof_id" value="${proof.id}">
        <button type="submit" class="btn btn-success btn-lg btn-block" data-confirm="Approve this proof? The shop will start printing.">${icon('check')}<span>Approve &amp; print</span></button>
      </form>
      <details class="cust-changes">
        <summary class="btn btn-secondary btn-lg btn-block">${icon('refresh')}<span>Request changes</span></summary>
        <form method="post" action="${base}/changes" class="cust-changes-form">
          ${csrfField(res)}<input type="hidden" name="proof_id" value="${proof.id}">
          ${field({
            label: 'What should change?',
            id: 'cust-change-note',
            hint: 'Be specific, e.g. “Change the phone number to 98765 43210 and make the logo bigger.”',
            control: html`<textarea id="cust-change-note" name="note" rows="4" required maxlength="1000" aria-describedby="cust-change-note-hint"></textarea>`,
          })}
          <button type="submit" class="btn btn-dark btn-lg btn-block">${icon('arrowRight')}<span>Send change request</span></button>
        </form>
      </details>
      <p class="cust-decide-foot">${icon('info')}<span>Printing starts only after you approve.</span></p>
    </div>`;
  } else if (order.status === 'approved') {
    after = alert('success', 'You approved this proof.');
  } else if (order.status === 'changes_requested') {
    after = order.customer_note
      ? html`<div class="cust-note cust-note-you"><span class="cust-note-label">Your change request</span><p>${order.customer_note}</p></div>`
      : alert('info', 'You asked for changes. The new proof will appear here.');
  }

  return html`<section class="cust-card cust-proof${waiting ? ' is-waiting' : ''}" id="proof" aria-labelledby="cust-proof-title">
    <div class="cust-card-head">
      ${cardTitle('cust-proof-title', 'eye', waiting ? 'Check your proof' : 'Your proof')}
      <span class="cust-head-meta">Sent ${timeAgo(proof.created_at)}</span>
    </div>
    <div class="cust-proof-body">
      ${preview}
      ${order.proof_note
        ? html`<div class="cust-note"><span class="cust-note-label">Note from ${shop.name}</span><p>${order.proof_note}</p></div>`
        : ''}
      ${after}
      ${olderProofs.length
        ? html`<details class="cust-older">
            <summary>${icon('clock')}<span>Earlier proofs (${olderProofs.length})</span></summary>
            <ul class="cust-file-list">${olderProofs.map((p) => fileItem(p, `${base}/f/${p.id}`, shop.retention_days))}</ul>
          </details>`
        : ''}
    </div>
  </section>`;
}

function contactCard(shop, order) {
  const ready = order.status === 'ready';
  if (!shop.phone && !shop.address) return '';
  return html`<section class="cust-card cust-contact${ready ? ' is-ready' : ''}" aria-labelledby="cust-contact-title">
    ${cardTitle('cust-contact-title', ready ? 'store' : 'phone', ready ? 'Pick up your order' : 'Questions about this order?')}
    <p class="cust-muted">${ready ? `Your order is ready at ${shop.name}. Mention order P-${order.order_no} at the counter.` : `Contact ${shop.name} and mention order P-${order.order_no}.`}</p>
    ${contactActions(shop, `Hi ${shop.name}, about my order P-${order.order_no}`)}
    ${shopAddress(shop)}
  </section>`;
}

function keepCard(shop, order) {
  const url = trackUrl(shop, order);
  const no = order.order_no;
  return html`<section class="cust-card cust-keep" aria-labelledby="cust-keep-title">
    ${cardTitle('cust-keep-title', 'link', 'Save this link')}
    <p class="cust-muted">This private link is the only way to see this order. Anyone with it can view the order, so share it carefully.</p>
    <div class="cust-copy">
      <input type="text" id="cust-track-url" value="${url}" readonly aria-label="Your order link">
      <button type="button" class="btn btn-secondary" data-copy-target="#cust-track-url" data-copy-msg="Link copied">${icon('copy')}<span>Copy</span></button>
    </div>
    <div class="cust-keep-actions">
      <a class="btn btn-secondary btn-sm" href="${waLink('', saveText(shop, order, url))}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Save on WhatsApp</span></a>
      <button type="button" class="btn btn-ghost btn-sm" data-share data-share-url="${url}" data-share-title="Order P-${no} – ${shop.name}" data-share-text="My print order P-${no} at ${shop.name}">${icon('share')}<span>Share</span></button>
    </div>
    ${acceptsOrders(shop) ? html`<a class="cust-again" href="${shopPath(shop)}">${icon('plus')}<span>Place another order</span>${icon('arrowRight')}</a>` : ''}
  </section>`;
}

/**
 * @param shop   shop row (from the slug)
 * @param order  order row (from slug + token)
 * @param files  orderFiles(order)
 * @param proof  latestProof(order) or undefined
 * @param isNew  show the "Order placed" card
 * @param owner  the logged-in shop is looking at its own order
 */
export function trackPage(res, { shop, order, files, proof, isNew = false, owner = false }) {
  const base = trackPath(shop, order);
  const no = order.order_no;
  const days = shop.retention_days;
  const customerFiles = files.filter((f) => f.kind === 'customer');
  const olderProofs = proof ? files.filter((f) => f.kind === 'proof' && f.id !== proof.id).reverse() : [];
  const ready = order.status === 'ready';

  const body = html`<div class="cust-wrap cust-page cust-track">
    ${owner ? ownerNote('You are viewing the customer’s tracking page.', `/shop/orders/${no}`, 'Open in dashboard') : ''}
    ${isNew ? placedCard(shop, order) : ''}

    <div class="cust-cols">
      <div class="cust-col-main">
        ${statusCard(shop, order, proof)}
        ${proof ? proofCard(res, shop, order, proof, olderProofs, base) : ''}
        ${ready ? contactCard(shop, order) : ''}

        <section class="cust-card" aria-labelledby="cust-job-title">
          ${cardTitle('cust-job-title', 'printer', 'Order details')}
          <dl class="cust-specs">
            <div><dt>Size</dt><dd>${order.size || '—'}</dd></div>
            <div><dt>Quantity</dt><dd>${order.quantity}</dd></div>
            <div><dt>Print</dt><dd>${COLOR_LABEL[order.color_mode] || order.color_mode}</dd></div>
            <div><dt>Sides</dt><dd>${SIDES_LABEL[order.sides] || order.sides}</dd></div>
            ${order.paper ? html`<div><dt>Paper</dt><dd>${order.paper}</dd></div>` : ''}
            <div><dt>Handover</dt><dd>${order.delivery === 'delivery' ? 'Delivery' : 'Pickup'}</dd></div>
          </dl>
          ${order.notes ? html`<div class="cust-note cust-note-you"><span class="cust-note-label">Your notes</span><p>${order.notes}</p></div>` : ''}
          <p class="cust-by">${icon('user')}<span>${order.customer_name} · ${/x/i.test(order.customer_mobile) ? order.customer_mobile : maskPhone(order.customer_mobile)}</span></p>
        </section>

        <section class="cust-card" id="files" aria-labelledby="cust-files-title">
          ${cardTitle('cust-files-title', 'file', 'Your files', html`<span class="count">${customerFiles.length}</span>`)}
          ${customerFiles.length
            ? html`<ul class="cust-file-list">${customerFiles.map((f) => fileItem(f, `${base}/f/${f.id}`, days))}</ul>`
            : html`<p class="cust-muted">No files on this order.</p>`}
          ${VERSION_ALLOWED.has(order.status)
            ? html`<form method="post" action="${withCsrf(`${base}/version`, res)}" enctype="multipart/form-data" class="cust-version">
                <p class="cust-version-title"><b>Need to change your file?</b> Send the corrected file here – the old one is marked replaced and only the new one is printed.</p>
                <input type="file" name="files" required aria-label="Corrected file">
                <input type="text" name="note" maxlength="500" placeholder="What changed? (optional)" aria-label="What changed">
                <button class="btn btn-brand btn-sm" type="submit" data-loading="Uploading…">${icon('upload')}<span>Send new version</span></button>
              </form>`
            : ''}
          <p class="cust-privacy">${icon('shield')}<span>Only you and ${shop.name} can open these files. They are deleted automatically ${days} days after upload.</span></p>
        </section>
      </div>

      <div class="cust-col-side">
        ${ready ? '' : contactCard(shop, order)}
        ${keepCard(shop, order)}
      </div>
    </div>
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
