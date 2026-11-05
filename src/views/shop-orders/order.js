import { html, raw } from '../../lib/html.js';
import { STATUS_LABEL, TRANSITIONS, ACTION_LABEL, PROOF_ALLOWED } from '../../lib/status.js';
import { formatDateTime, formatBytes, timeAgo, prettyPhone, waNumber, waLink } from '../../lib/util.js';
import { ACCEPT_ATTR, extOf, isPreviewableImage } from '../../lib/uploads.js';
import { icon, statusPill, csrfField, withCsrf } from '../components.js';
import { shopIcon } from '../chrome/shop.js';
import { COLOR_LABEL, SIDES_LABEL, qtyText, plural, orderPath, filePath } from './common.js';

const PREVIEW_MAX_BYTES = 15 * 1024 * 1024;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// What the shop does next, per status. "Proof" is called a design preview the customer OKs.
//   primary  the main status button   preview  'main' | 'option' | 'again' (upload form shown how)
//   wa       WhatsApp message to lead with
const NEXT = {
  new: {
    title: 'New order – check the files',
    text: 'Download the files below. Simple job? Start printing. Want the customer to check the design first? Send them a preview.',
    ic: 'bell',
    primary: 'printing',
    preview: 'option',
  },
  proof_sent: {
    title: 'Waiting for the customer’s OK',
    text: 'The customer sees your design preview on their order page and taps OK or asks for changes. Send it on WhatsApp so they see it quickly.',
    ic: 'clock',
    wa: 'proof',
    preview: 'again',
  },
  approved: { title: 'Customer said OK – print it', text: 'The customer approved the design preview. You can print now.', ic: 'check', primary: 'printing', preview: 'again' },
  changes_requested: {
    title: 'Customer wants changes',
    text: 'Read what they asked for, fix the design and send a new preview. Or start printing if you sorted it on the phone.',
    ic: 'refresh',
    preview: 'main',
  },
  printing: { title: 'Printing now', text: 'When the job is done, mark it ready – the customer sees it on their page at once.', ic: 'printer', primary: 'ready' },
  ready: { title: 'Ready – tell the customer', text: 'Send the ready message on WhatsApp. Mark it handed over when they collect it.', ic: 'store', wa: 'ready', primary: 'delivered' },
  delivered: { title: 'Done', text: 'This order is complete. Nothing more to do.', ic: 'check' },
  cancelled: { title: 'Cancelled', text: 'This order was cancelled. Reopen it if that was a mistake.', ic: 'x' },
};

const ACTION_ICON = { approved: 'check', changes_requested: 'refresh', printing: 'printer', ready: 'check', delivered: 'store', cancelled: 'x', new: 'refresh' };

function actionLabel(from, to) {
  if (from === 'ready' && to === 'printing') return 'Back to printing';
  if (from === 'delivered' && to === 'ready') return 'Undo handed over';
  if (from === 'proof_sent' && to === 'printing') return 'Print without waiting';
  return ACTION_LABEL[to] || STATUS_LABEL[to] || to;
}

function actionButton(order, to, cls) {
  const cancel = to === 'cancelled';
  return html`<button class="btn ${cancel ? 'btn-ghost sh-cancel' : cls}" type="submit" name="to" value="${to}"${cancel ? html` data-confirm="Cancel order P-${order.order_no}? You can reopen it later."` : ''}>${icon(ACTION_ICON[to] || 'arrowRight')}<span>${actionLabel(order.status, to)}</span></button>`;
}

function eventView(e) {
  let title;
  let ic = 'info';
  let note = e.note;
  if (e.type === 'created') {
    title = `Order received${e.note ? ` – ${e.note}` : ''}`;
    note = '';
    ic = 'upload';
  } else if (e.type === 'proof') {
    title = 'Design preview sent';
    ic = 'eye';
  } else if (e.type === 'version') {
    title = 'Customer sent a new file';
    ic = 'upload';
  } else if (e.type === 'files_deleted') {
    title = 'Files auto-deleted';
    ic = 'clock';
  } else if (e.type === 'email') {
    title = 'Email sent';
    ic = 'mail';
  } else if (e.type === 'status' && e.actor === 'customer') {
    title = e.to_status === 'approved' ? 'Customer said OK' : e.to_status === 'changes_requested' ? 'Customer asked for changes' : `Now: ${STATUS_LABEL[e.to_status] || e.to_status}`;
    ic = e.to_status === 'approved' ? 'check' : 'refresh';
  } else if (e.type === 'status') {
    title = e.from_status === 'cancelled' && e.to_status === 'new' ? 'Order reopened' : `Now: ${STATUS_LABEL[e.to_status] || e.to_status}`;
    ic = ACTION_ICON[e.to_status] || 'arrowRight';
  } else {
    title = String(e.type || 'Update').replace(/_/g, ' ');
  }
  const actor = ['customer', 'shop', 'system'].includes(e.actor) ? e.actor : 'system';
  return html`<li class="h-actor-${actor}">
    <span class="h-dot">${icon(ic)}</span>
    <div class="sh-h-body">
      <div class="h-title">${title}</div>
      <time class="h-time" datetime="${e.at}">${formatDateTime(e.at)}${actor === 'customer' ? ' · by customer' : actor === 'system' ? ' · automatic' : ''}</time>
      ${note ? html`<div class="h-note">${note}</div>` : ''}
    </div>
  </li>`;
}

function fileRow(order, f, { retention, extra = '' } = {}) {
  const gone = Boolean(f.deleted_at);
  const ver = f.kind === 'customer' && (f.replaced_at ? `Old file (v${f.version}) – don't print · ` : f.version > 1 ? `New file v${f.version} · ` : '');
  return html`<li class="sh-file${gone || f.replaced_at ? ' is-deleted' : ''}">
    <span class="file-ext">${extOf(f.original_name) || 'file'}</span>
    <div class="sh-file-info">
      <span class="sh-file-name" title="${f.original_name}">${f.original_name}</span>
      <span class="sh-file-meta">${ver}${extra}${formatBytes(f.size_bytes)}${gone ? ` · Auto-deleted after ${retention} days` : ''}</span>
    </div>
    ${gone
      ? ''
      : html`<a class="btn btn-secondary btn-sm sh-file-dl" href="${filePath(order, f)}" download aria-label="Download ${f.original_name}">${icon('download')}<span class="hide-xs">Download</span></a>`}
  </li>`;
}

/** Upload form for a design preview (multipart, CSRF in the URL). */
function previewForm(res, order, d, { again }) {
  const limitText = d.shop.is_demo ? `Demo: one file up to ${formatBytes(d.limits.bytes)}.` : `One file up to ${formatBytes(d.limits.bytes)}. A JPG or PNG shows as a picture on the customer's phone.`;
  return html`<form class="sh-pv-form" method="post" action="${withCsrf(`${orderPath(order)}/proof`, res)}" enctype="multipart/form-data">
    <div class="field">
      <label for="proof-file" class="sr-only">Design preview file</label>
      <div class="dropzone sh-drop">
        ${icon('upload')}
        <strong data-file-name data-default="Choose the design file">Choose the design file</strong>
        <span class="hint">Photo, PDF or design file</span>
        <input type="file" id="proof-file" name="proof" accept="${ACCEPT_ATTR}" required data-proof-input data-proof-max="${d.limits.bytes}" aria-describedby="proof-file-hint">
      </div>
      <p class="hint" id="proof-file-hint">${limitText}</p>
    </div>
    <div class="field">
      <label for="proof-note">Message for the customer <span class="optional">optional</span></label>
      <textarea id="proof-note" name="note" maxlength="500" rows="2" placeholder="e.g. Please check the spelling and phone number"></textarea>
    </div>
    <button class="btn btn-primary btn-lg btn-block" type="submit" data-loading="Sending…">${shopIcon('send')}<span>${again ? 'Send new preview' : 'Send preview to customer'}</span></button>
  </form>`;
}

/**
 * Order page body.
 * @param d.res, d.shop, d.order, d.customerFiles, d.proofs (newest first), d.events (newest first),
 *        d.waProof, d.waReady, d.trackUrl, d.canEmail, d.limits ({files, bytes})
 */
export function orderView(d) {
  const { res, shop, order, customerFiles, proofs, events } = d;
  const s = order.status;
  const next = NEXT[s] || NEXT.new;
  const latest = proofs[0];
  const transitions = TRANSITIONS[s] || [];
  const proofOpen = PROOF_ALLOWED.has(s);
  const waProofOn = Boolean(latest) && s !== 'cancelled';
  const waReadyOn = s === 'ready' || s === 'delivered';
  const telNo = waNumber(order.customer_mobile);
  const canCall = telNo.length >= 10;
  const no = order.order_no;
  const chatLink = waLink(order.customer_mobile, `Hi ${order.customer_name}, about your order P-${no} at ${shop.name}: `);
  const others = transitions.filter((t) => t !== next.primary && t !== 'cancelled');
  const canCancel = transitions.includes('cancelled');

  // ---------- what to do now ----------
  const lead = [];
  if (next.wa === 'proof' && waProofOn)
    lead.push(html`<a class="btn btn-wa btn-lg" href="${d.waProof}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Send preview on WhatsApp</span></a>`);
  if (next.wa === 'ready') lead.push(html`<a class="btn btn-wa btn-lg" href="${d.waReady}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Send “ready” on WhatsApp</span></a>`);
  if (next.primary) lead.push(actionButton(order, next.primary, next.wa ? 'btn-secondary btn-lg' : 'btn-primary btn-lg'));

  const statusForm =
    lead.length || others.length || canCancel
      ? html`<form method="post" action="${orderPath(order)}/status" class="sh-status-form">
          ${csrfField(res)}<input type="hidden" name="from" value="${s}">
          ${lead.length ? html`<div class="sh-next-actions">${lead}</div>` : ''}
          ${others.length || canCancel
            ? html`<details class="sh-more">
                <summary>${icon('settings')}<span>Other options</span></summary>
                <div class="sh-more-body">
                  ${others.length ? html`<div class="sh-more-btns">${others.map((t) => actionButton(order, t, 'btn-secondary btn-sm'))}</div>` : ''}
                  <label class="sh-more-label" for="status-note">Note for the order history <span class="optional">optional</span></label>
                  <textarea id="status-note" name="note" maxlength="500" rows="2" placeholder="e.g. Customer said OK on the phone"></textarea>
                  ${canCancel ? html`<div class="sh-more-cancel">${actionButton(order, 'cancelled', '')}</div>` : ''}
                </div>
              </details>`
            : ''}
        </form>`
      : '';

  let previewBlock = '';
  if (proofOpen && next.preview === 'main') {
    previewBlock = html`<div class="sh-pv is-open" id="proof">
      <p class="sh-pv-title">${icon('eye')}<span>Send the corrected design</span></p>
      ${previewForm(res, order, d, { again: proofs.length > 0 })}
    </div>`;
  } else if (proofOpen && next.preview) {
    const option = next.preview === 'option';
    previewBlock = html`<details class="sh-pv" id="proof">
      <summary class="sh-pv-sum">
        <span class="sh-pv-ic">${icon('eye')}</span>
        <span class="sh-pv-text"><b>${option ? 'Send design preview for OK' : 'Send a new design preview'}</b><small>${option
          ? 'The customer checks the design on their phone and taps OK before you print.'
          : 'Replaces the one the customer sees now.'}</small></span>
      </summary>
      ${previewForm(res, order, d, { again: !option })}
    </details>`;
  }

  const nextCard = html`<section class="card sh-next sh-next-${s}" aria-labelledby="next-h">
    <div class="sh-next-head">
      <span class="sh-next-icon" aria-hidden="true">${icon(next.ic)}</span>
      <div class="sh-next-copy">
        <p class="sh-next-eyebrow">What to do now</p>
        <h2 id="next-h">${next.title}</h2>
        <p>${next.text}</p>
      </div>
    </div>
    ${s === 'changes_requested' && order.customer_note
      ? html`<div class="sh-callout" role="note">
          <p class="sh-callout-label">${icon('refresh')}<span>The customer wrote</span></p>
          <p class="sh-callout-text">${order.customer_note}</p>
        </div>`
      : ''}
    ${s === 'proof_sent' && latest ? html`<p class="sh-next-sent">${icon('check')}<span>Preview sent ${timeAgo(latest.created_at)}</span></p>` : ''}
    ${statusForm}
    ${previewBlock}
  </section>`;

  // ---------- what to print ----------
  const spec = (label, value, cls = '') => html`<div class="sh-spec${cls}"><dt>${label}</dt><dd>${value}</dd></div>`;
  const liveFiles = customerFiles.filter((f) => !f.deleted_at && !f.replaced_at);
  const jobCard = html`<section class="card sh-job" aria-labelledby="job-h">
    <div class="sh-card-head"><h2 id="job-h">What to print</h2></div>
    <dl class="sh-specs">
      ${spec('Size', order.size || '—')}
      ${spec('Copies', qtyText(order.quantity))}
      ${spec('Print', COLOR_LABEL[order.color_mode] || order.color_mode, order.color_mode === 'color' ? ' is-color' : '')}
      ${spec('Sides', SIDES_LABEL[order.sides] || order.sides)}
      ${order.paper ? spec('Paper', order.paper) : ''}
      ${spec('Handover', order.delivery === 'delivery' ? 'Delivery' : 'Pickup')}
    </dl>
    ${order.notes ? html`<div class="sh-notes"><p class="sh-label">${icon('info')}<span>Customer note</span></p><p class="sh-notes-text">${order.notes}</p></div>` : ''}
    <div class="sh-files">
      <p class="sh-label">${icon('file')}<span>Files from the customer</span> <span class="count">${customerFiles.length}</span></p>
      ${customerFiles.length
        ? html`<ul class="sh-file-list">${customerFiles.map((f) => fileRow(order, f, { retention: shop.retention_days }))}</ul>`
        : html`<p class="muted mb-0">No files were uploaded with this order.</p>`}
      <div class="sh-files-foot">
        <p class="hint">${icon('clock')}<span>Files are deleted automatically ${plural(shop.retention_days, 'day')} after upload.</span></p>
        ${liveFiles.length
          ? html`<form method="post" action="${orderPath(order)}/reprint">${csrfField(res)}<button class="btn btn-ghost btn-sm" type="submit" data-confirm="Make a new order with the same details and file?">${icon('refresh')}<span>Print again as new order</span></button></form>`
          : ''}
      </div>
    </div>
  </section>`;

  // ---------- previews already sent ----------
  const preview = latest && !latest.deleted_at && isPreviewableImage(latest.original_name) && latest.size_bytes <= PREVIEW_MAX_BYTES;
  const sentCard = proofs.length
    ? html`<section class="card sh-sent" aria-labelledby="sent-h">
        <div class="sh-card-head"><h2 id="sent-h">Design preview sent</h2><span class="count">${proofs.length}</span></div>
        <div class="sh-card-body">
          ${preview
            ? html`<a class="sh-proof-preview" href="${filePath(order, latest)}?inline=1" target="_blank" rel="noopener">
                <img src="${filePath(order, latest)}?inline=1" alt="Design preview for order P-${no}" loading="lazy" decoding="async">
                <span class="sh-proof-zoom">${icon('eye')}<span>Full size</span></span>
              </a>`
            : ''}
          ${order.proof_note ? html`<div class="sh-notes"><p class="sh-label">Your message</p><p class="sh-notes-text">${order.proof_note}</p></div>` : ''}
          <ul class="sh-file-list">${proofs.map((f, i) =>
            fileRow(order, f, { retention: shop.retention_days, extra: i === 0 ? `Latest · ${formatDateTime(f.created_at)} · ` : `${formatDateTime(f.created_at)} · ` })
          )}</ul>
        </div>
      </section>`
    : '';

  // ---------- customer ----------
  const customerCard = html`<section class="card sh-cust" aria-labelledby="cust-h">
    <div class="sh-cust-head">
      <span class="sh-cust-avatar" aria-hidden="true">${(order.customer_name || '?').trim().charAt(0).toUpperCase()}</span>
      <div class="sh-cust-id">
        <p class="sh-label">Customer</p>
        <h2 id="cust-h">${order.customer_name}</h2>
      </div>
    </div>
    <ul class="sh-contact">
      <li>${canCall
        ? html`<a href="tel:+${telNo}">${icon('phone')}<span>${prettyPhone(order.customer_mobile)}</span><span class="sh-contact-cta">Call</span></a>`
        : html`<span class="sh-contact-item">${icon('phone')}<span>${order.customer_mobile}</span></span>`}</li>
      ${order.customer_email
        ? html`<li><a href="mailto:${order.customer_email}">${icon('mail')}<span>${order.customer_email}</span><span class="sh-contact-cta">Email</span></a></li>`
        : ''}
    </ul>
    <div class="sh-msg-buttons" id="message">
      ${waProofOn && s !== 'proof_sent'
        ? html`<a class="btn btn-secondary btn-block" href="${d.waProof}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Send preview again</span></a>`
        : ''}
      ${waReadyOn && s !== 'ready'
        ? html`<a class="btn btn-secondary btn-block" href="${d.waReady}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Send “ready” message</span></a>`
        : ''}
      <a class="btn btn-secondary btn-block" href="${chatLink}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Chat on WhatsApp</span></a>
    </div>
    ${d.canEmail && (latest || waReadyOn)
      ? html`<form method="post" action="${orderPath(order)}/email" class="sh-email">
          ${csrfField(res)}
          ${latest && s !== 'cancelled' ? html`<button class="btn btn-ghost btn-sm" type="submit" name="kind" value="proof">${icon('mail')}<span>Email the preview</span></button>` : ''}
          ${waReadyOn ? html`<button class="btn btn-ghost btn-sm" type="submit" name="kind" value="ready">${icon('mail')}<span>Email “ready”</span></button>` : ''}
        </form>`
      : ''}
    <div class="sh-track">
      <p class="sh-label">${icon('link')}<span>Customer's order page</span></p>
      <p class="hint">The customer follows the order and taps OK here. Only people with this link can open it.</p>
      <label class="sr-only" for="track-url">Customer's order page link</label>
      <input id="track-url" type="text" readonly value="${d.trackUrl}">
      <div class="sh-track-btns">
        <button class="btn btn-secondary btn-sm" type="button" data-copy-target="#track-url" data-copy-msg="Link copied">${icon('copy')}<span>Copy link</span></button>
        <a class="btn btn-secondary btn-sm" href="${d.trackUrl}" target="_blank" rel="noopener" title="Open as the customer sees it">${icon('eye')}<span>Open</span></a>
      </div>
    </div>
  </section>`;

  // ---------- history (closed by default) ----------
  const historyCard = html`<details class="card fold sh-history">
    <summary><span class="fold-ic">${icon('clock')}</span><span class="fold-title"><b>Order history</b><small>${plural(events.length, 'update')}</small></span></summary>
    <div class="fold-body">
      ${events.length ? html`<ol class="history">${events.map(eventView)}</ol>` : html`<p class="muted mb-0">No updates yet.</p>`}
    </div>
  </details>`;

  return html`<div class="container sh-order">
    <a class="sh-back" href="/shop">${icon('arrowLeft')}<span>Orders</span></a>
    <header class="sh-ohead">
      <div class="sh-ohead-main">
        <div class="sh-ohead-title">
          <h1><span class="sr-only">Order </span><span class="order-no">P-${no}</span></h1>
          ${statusPill(s)}${order.is_sample ? html`<span class="sh-row-sample">Sample</span>` : ''}
        </div>
        <p class="sh-ohead-cust"><b>${order.customer_name}</b><span class="sh-dot" aria-hidden="true">·</span><span>Received ${Date.now() - Date.parse(order.created_at) < WEEK_MS
          ? html`<time datetime="${order.created_at}" title="${formatDateTime(order.created_at)}" data-ago>${timeAgo(order.created_at)}</time>`
          : html`<time datetime="${order.created_at}">${formatDateTime(order.created_at)}</time>`}</span></p>
      </div>
      <div class="sh-ohead-quick">
        ${d.bill
          ? html`<a class="btn btn-secondary" href="/shop/bills/${d.bill.bill_no}" title="Open the bill for this order">${shopIcon('receipt')}<span>Bill B-${d.bill.bill_no}</span></a>`
          : s !== 'cancelled'
            ? html`<a class="btn btn-secondary" href="/shop/bills/new?order=${no}" title="Make a bill for this order">${shopIcon('receipt')}<span>Make bill</span></a>`
            : ''}
        ${canCall ? html`<a class="btn btn-secondary" href="tel:+${telNo}">${icon('phone')}<span>Call</span></a>` : ''}
        <a class="btn btn-wa" href="${chatLink}" target="_blank" rel="noopener">${icon('whatsapp')}<span>WhatsApp</span></a>
      </div>
    </header>
    <div class="sh-olayout">
      <div class="sh-omain">
        ${nextCard}
        ${jobCard}
        ${sentCard}
      </div>
      <div class="sh-oside">
        ${customerCard}
        ${historyCard}
      </div>
    </div>
  </div>`;
}
