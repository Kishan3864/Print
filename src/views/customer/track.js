import { html } from '../../lib/html.js';
import { STATUS_CUSTOMER_TEXT, timelineSteps } from '../../lib/status.js';
import { extOf, isPreviewableImage } from '../../lib/uploads.js';
import { formatBytes, formatDateTime, maskPhone, timeAgo } from '../../lib/util.js';
import { acceptsOrders } from '../../services/shops.js';
import { mailEnabled, trackPath, trackUrl } from '../../services/notify.js';
import { render } from '../layout.js';
import { alert, csrfField, field, icon, statusPill } from '../components.js';
import { COLOR_LABEL, SIDES_LABEL, contactActions, ownerNote, shopAddress } from './common.js';

// Private order tracking page: /<slug>/o/<token>. Only ever shows this one order.

function fileItem(file, href, days) {
  const gone = Boolean(file.deleted_at);
  const name = file.original_name;
  return html`<li class="file-row cust-file${gone ? ' is-deleted' : ''}">
    <span class="file-ext">${extOf(name) || 'file'}</span>
    <span class="cust-file-main">
      <span class="file-name" title="${name}">${name}</span>
      <span class="file-meta">${gone ? `Deleted after ${days} days` : formatBytes(file.size_bytes)}</span>
    </span>
    ${gone
      ? ''
      : html`<a class="btn btn-ghost btn-icon btn-sm cust-file-dl" href="${href}" download aria-label="Download ${name}">${icon('download')}</a>`}
  </li>`;
}

function stepsList(status, hadProof = true) {
  return html`<ol class="steps cust-steps" aria-label="Order progress">
    ${timelineSteps(status, { hadProof }).map(
      (s) => html`<li class="${s.state === 'done' ? 'is-done' : s.state === 'current' ? 'is-current' : s.state === 'skipped' ? 'is-skipped' : ''}"${s.state === 'current' ? html` aria-current="step"` : ''}>
        <span class="dot">${s.state === 'done' ? icon('check') : ''}</span>
        <span>${s.state === 'done' ? html`<span class="sr-only">Done: </span>` : s.state === 'skipped' ? html`<span class="sr-only">Skipped: </span>` : ''}${s.label}</span>
      </li>`
    )}
  </ol>`;
}

function placedCard(shop, order) {
  const url = trackUrl(shop, order);
  const emailed = order.customer_email && mailEnabled() && !shop.is_demo;
  return html`<section class="cust-placed" role="status" aria-labelledby="cust-placed-title">
    <span class="cust-placed-icon">${icon('check')}</span>
    <div class="cust-placed-body">
      <h2 id="cust-placed-title">Order placed!</h2>
      <p>Your order number is <b class="order-no">#${order.order_no}</b> – save this page (bookmark it or copy the link) to check status and approve your proof.${emailed ? ' We have also emailed this link to you.' : ''}</p>
      <div class="btn-row">
        <button type="button" class="btn btn-success btn-sm" data-copy="${url}" data-copy-msg="Link copied – keep it safe">${icon('copy')}<span>Copy link</span></button>
        <button type="button" class="btn btn-secondary btn-sm" data-share data-share-url="${url}" data-share-title="Order #${order.order_no} – ${shop.name}" data-share-text="My print order #${order.order_no} at ${shop.name}">${icon('share')}<span>Share</span></button>
      </div>
    </div>
  </section>`;
}

function proofCard(res, shop, order, proof, olderProofs, base) {
  const href = `${base}/f/${proof.id}`;
  const gone = Boolean(proof.deleted_at);
  const waiting = order.status === 'proof_sent';
  const preview =
    !gone && isPreviewableImage(proof.original_name)
      ? html`<a class="cust-proof-preview" href="${href}?inline=1" target="_blank" rel="noopener" aria-label="Open the proof full size">
            <img src="${href}?inline=1" alt="Proof for order #${order.order_no}" loading="lazy" decoding="async">
          </a>
          <div class="btn-row">
            <a class="btn btn-secondary btn-sm" href="${href}" download>${icon('download')}<span>Download proof</span></a>
            <a class="btn btn-ghost btn-sm" href="${href}?inline=1" target="_blank" rel="noopener">${icon('eye')}<span>Full size</span></a>
          </div>`
      : html`<ul class="file-list">${fileItem(proof, href, shop.retention_days)}</ul>
          ${gone ? '' : html`<a class="btn btn-secondary btn-block" href="${href}" download>${icon('download')}<span>Download proof to check it</span></a>`}`;

  let after = '';
  if (waiting) {
    after = html`<div class="cust-decide">
      <p class="cust-decide-q"><b>Is everything correct?</b> Check spelling, numbers, colours and size before you approve. Printing starts after approval.</p>
      <form method="post" action="${base}/approve">
        ${csrfField(res)}<input type="hidden" name="proof_id" value="${proof.id}">
        <button type="submit" class="btn btn-brand btn-lg btn-block" data-confirm="Approve this proof for printing?">${icon('check')}<span>Approve proof</span></button>
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
          <button type="submit" class="btn btn-dark btn-block">${icon('arrowRight')}<span>Send change request</span></button>
        </form>
      </details>
    </div>`;
  } else if (order.status === 'approved') {
    after = alert('success', 'You approved this proof. What happens next: the shop prints your order and this page shows “Ready” when you can pick it up.');
  } else if (order.status === 'changes_requested') {
    after = html`${order.customer_note
      ? html`<div class="cust-note cust-note-you"><span class="cust-note-label">Your change request</span><p>${order.customer_note}</p></div>`
      : ''}
      ${alert('info', 'What happens next: the shop makes the changes and sends a new proof. It will appear here for you to check again.')}`;
  }

  return html`<section class="card cust-proof${waiting ? ' is-waiting' : ''}" id="proof" aria-labelledby="cust-proof-title">
    <div class="card-head">
      <h2 class="cust-card-title" id="cust-proof-title">${icon('eye')}${waiting ? 'Please check your proof' : 'Your proof'}</h2>
      <span class="cust-head-meta">Sent ${timeAgo(proof.created_at)}</span>
    </div>
    <div class="card-body cust-proof-body">
      ${preview}
      ${order.proof_note
        ? html`<div class="cust-note"><span class="cust-note-label">Note from ${shop.name}</span><p>${order.proof_note}</p></div>`
        : ''}
      ${after}
      ${olderProofs.length
        ? html`<details class="cust-older">
            <summary>${icon('clock')}<span>Earlier proofs (${olderProofs.length})</span></summary>
            <ul class="file-list">${olderProofs.map((p) => fileItem(p, `${base}/f/${p.id}`, shop.retention_days))}</ul>
          </details>`
        : ''}
    </div>
  </section>`;
}

function contactCard(shop, order) {
  const ready = order.status === 'ready';
  if (!shop.phone && !shop.address) return '';
  return html`<section class="card card-pad cust-contact${ready ? ' is-ready' : ''}" aria-labelledby="cust-contact-title">
    <h2 class="cust-card-title" id="cust-contact-title">${icon(ready ? 'store' : 'phone')}${ready ? 'Pick up your order' : 'Questions about this order?'}</h2>
    <p class="cust-muted-line">${ready ? `Your order is ready at ${shop.name}. Mention order #${order.order_no} at the counter.` : `Contact ${shop.name} and mention order #${order.order_no}.`}</p>
    ${contactActions(shop, `Hi, about my order #${order.order_no}`, { size: '' })}
    ${shopAddress(shop)}
  </section>`;
}

/**
 * @param shop   shop row (from the slug)
 * @param order  order row (from slug + token)
 * @param files  orderFiles(order)
 * @param proof  latestProof(order) or undefined
 * @param isNew  show the "Order placed!" card
 * @param owner  the logged-in shop is looking at its own order
 */
export function trackPage(res, { shop, order, files, proof, isNew = false, owner = false }) {
  const base = trackPath(shop, order);
  const url = trackUrl(shop, order);
  const no = order.order_no;
  const days = shop.retention_days;
  const cancelled = order.status === 'cancelled';
  const customerFiles = files.filter((f) => f.kind === 'customer');
  const olderProofs = proof ? files.filter((f) => f.kind === 'proof' && f.id !== proof.id).reverse() : [];
  const ready = order.status === 'ready';

  const body = html`<div class="container-narrow cust-page">
    ${owner ? ownerNote('You are viewing the customer’s tracking page.', `/shop/orders/${no}`, 'Open in dashboard') : ''}
    ${isNew ? placedCard(shop, order) : ''}

    <section class="card cust-status" aria-labelledby="cust-order-title">
      <div class="cust-status-head">
        <div class="cust-status-id">
          <p class="cust-kicker">Your order at ${shop.name}</p>
          <h1 class="cust-order-title" id="cust-order-title">Order <span class="order-no">#${no}</span></h1>
        </div>
        ${statusPill(order.status)}
      </div>
      ${cancelled
        ? html`<div class="cust-status-alert">${alert('danger', STATUS_CUSTOMER_TEXT.cancelled)}</div>`
        : html`<p class="cust-status-text">${STATUS_CUSTOMER_TEXT[order.status] || ''}</p>${stepsList(order.status, Boolean(proof))}`}
      <p class="cust-status-meta">
        <span>${icon('clock')}Placed ${formatDateTime(order.created_at)}</span>
        <span>${icon('refresh')}Updated ${timeAgo(order.updated_at)}</span>
      </p>
    </section>

    ${proof ? proofCard(res, shop, order, proof, olderProofs, base) : ''}
    ${ready ? contactCard(shop, order) : ''}

    <section class="card card-pad" aria-labelledby="cust-job-title">
      <h2 class="cust-card-title" id="cust-job-title">${icon('printer')}Print details</h2>
      <dl class="cust-specs">
        <div><dt>Size</dt><dd>${order.size || '—'}</dd></div>
        <div><dt>Quantity</dt><dd>${order.quantity}</dd></div>
        <div><dt>Print</dt><dd>${COLOR_LABEL[order.color_mode] || order.color_mode}</dd></div>
        <div><dt>Sides</dt><dd>${SIDES_LABEL[order.sides] || order.sides}</dd></div>
      </dl>
      ${order.notes ? html`<div class="cust-note cust-note-you"><span class="cust-note-label">Your notes</span><p>${order.notes}</p></div>` : ''}
      <p class="cust-placed-by">${icon('user')}<span>${order.customer_name} · ${maskPhone(order.customer_mobile)}</span></p>
    </section>

    <section class="card card-pad" aria-labelledby="cust-files-title">
      <h2 class="cust-card-title" id="cust-files-title">${icon('file')}Your files <span class="count">${customerFiles.length}</span></h2>
      ${customerFiles.length
        ? html`<ul class="file-list cust-file-list">${customerFiles.map((f) => fileItem(f, `${base}/f/${f.id}`, days))}</ul>`
        : html`<p class="cust-muted-line">No files on this order.</p>`}
      <p class="hint cust-files-note">${icon('shield')}<span>Only you and ${shop.name} can open these files. They are auto-deleted ${days} days after upload.</span></p>
    </section>

    ${ready ? '' : contactCard(shop, order)}

    <section class="card card-pad cust-keep" aria-labelledby="cust-keep-title">
      <h2 class="cust-card-title" id="cust-keep-title">${icon('link')}Keep this link</h2>
      <p class="cust-muted-line">This private link is the only way to see this order. Anyone with it can view the order, so share it carefully.</p>
      <div class="copy-field cust-link-field">
        <input type="text" id="cust-track-url" value="${url}" readonly aria-label="Your order link">
        <button type="button" class="btn btn-secondary" data-copy-target="#cust-track-url" data-copy-msg="Link copied" aria-label="Copy link">${icon('copy')}<span class="hide-xs">Copy</span></button>
      </div>
      <div class="btn-row cust-keep-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-share data-share-url="${url}" data-share-title="Order #${no} – ${shop.name}" data-share-text="My print order #${no} at ${shop.name}">${icon('share')}<span>Share link</span></button>
        ${acceptsOrders(shop) ? html`<a class="btn btn-ghost btn-sm" href="/${shop.slug}">${icon('plus')}<span>Place another order</span></a>` : ''}
      </div>
    </section>
  </div>`;

  render(res, {
    title: `Order #${no} – ${shop.name}`,
    description: `Track your print order #${no} at ${shop.name}.`,
    variant: 'customer',
    brandShop: shop,
    bodyClass: 'cust-track-page',
    noindex: true,
    body,
  });
}
