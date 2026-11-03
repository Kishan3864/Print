import { html } from '../../lib/html.js';
import { STATUS_LABEL, TRANSITIONS, ACTION_LABEL, PROOF_ALLOWED } from '../../lib/status.js';
import { formatDateTime, formatBytes, timeAgo, prettyPhone, waNumber, waLink } from '../../lib/util.js';
import { ACCEPT_ATTR, extOf, isPreviewableImage } from '../../lib/uploads.js';
import { icon, statusPill, csrfField, withCsrf } from '../components.js';
import { COLOR_LABEL, SIDES_LABEL, qtyText, plural, orderPath, filePath } from './common.js';

const PREVIEW_MAX_BYTES = 15 * 1024 * 1024;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// What the shop should do next, per status.
const NEXT = {
  new: { title: 'Check the files', text: 'Send a proof for the customer to approve, or start printing simple jobs right away.', ic: 'bell', primary: 'printing', proof: 'Send a proof first' },
  proof_sent: { title: 'Waiting for the customer', text: 'They can approve the proof or ask for changes on their tracking page. Send it on WhatsApp so they see it.', ic: 'eye', wa: 'proof' },
  approved: { title: 'Proof approved – print it', text: 'The customer approved the proof. It is ready to print.', ic: 'check', primary: 'printing' },
  changes_requested: { title: 'Customer wants changes', text: 'Make the changes and upload a new proof, or start printing if it is sorted.', ic: 'refresh', proof: 'Upload new proof', proofPrimary: true },
  printing: { title: 'Printing now', text: 'Mark it ready when the job is done, then tell the customer.', ic: 'printer', primary: 'ready' },
  ready: { title: 'Ready for pickup', text: 'Tell the customer on WhatsApp, then mark it delivered when they collect it.', ic: 'store', wa: 'ready', primary: 'delivered' },
  delivered: { title: 'Delivered', text: 'This order is complete. Nothing more to do.', ic: 'check' },
  cancelled: { title: 'Cancelled', text: 'This order was cancelled. Reopen it if that was a mistake.', ic: 'x' },
};

const ACTION_ICON = { approved: 'check', changes_requested: 'refresh', printing: 'printer', ready: 'check', delivered: 'store', cancelled: 'x', new: 'refresh' };

function actionLabel(from, to) {
  if (from === 'ready' && to === 'printing') return 'Back to printing';
  if (from === 'delivered' && to === 'ready') return 'Undo delivered';
  return ACTION_LABEL[to] || STATUS_LABEL[to] || to;
}

function actionButton(order, to, cls) {
  const cancel = to === 'cancelled';
  return html`<button class="btn ${cancel ? 'btn-ghost sh-cancel' : cls}" type="submit" name="to" value="${to}"${cancel ? html` data-confirm="Cancel order #${order.order_no}? You can reopen it later."` : ''}>${icon(ACTION_ICON[to] || 'arrowRight')}<span>${actionLabel(order.status, to)}</span></button>`;
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
    title = 'Proof sent';
    ic = 'file';
  } else if (e.type === 'files_deleted') {
    title = 'Files auto-deleted';
    ic = 'clock';
  } else if (e.type === 'email') {
    title = 'Email sent';
    ic = 'mail';
  } else if (e.type === 'status' && e.actor === 'customer') {
    title = e.to_status === 'approved' ? 'Customer approved the proof' : e.to_status === 'changes_requested' ? 'Customer requested changes' : `Status: ${STATUS_LABEL[e.to_status] || e.to_status}`;
    ic = e.to_status === 'approved' ? 'check' : 'refresh';
  } else if (e.type === 'status') {
    title = e.from_status === 'cancelled' && e.to_status === 'new' ? 'Order reopened' : `Status: ${STATUS_LABEL[e.to_status] || e.to_status}`;
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
  return html`<li class="sh-file${gone ? ' is-deleted' : ''}">
    <span class="file-ext">${extOf(f.original_name) || 'file'}</span>
    <div class="sh-file-info">
      <span class="sh-file-name" title="${f.original_name}">${f.original_name}</span>
      <span class="sh-file-meta">${extra}${formatBytes(f.size_bytes)}${gone ? ` · Auto-deleted after ${retention} days` : ''}</span>
    </div>
    ${gone
      ? ''
      : html`<a class="btn btn-secondary btn-sm sh-file-dl" href="${filePath(order, f)}" download aria-label="Download ${f.original_name}">${icon('download')}<span class="hide-xs">Download</span></a>`}
  </li>`;
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
  const others = transitions.filter((t) => t !== next.primary);
  const proofOpen = PROOF_ALLOWED.has(s);
  const waProofOn = Boolean(latest) && s !== 'cancelled';
  const waReadyOn = s === 'ready' || s === 'delivered';
  const telNo = waNumber(order.customer_mobile);
  const canCall = telNo.length >= 10;
  const no = order.order_no;
  const chatLink = waLink(order.customer_mobile, `Hi ${order.customer_name}, about your order #${no} at ${shop.name}: `);

  // ---------- next step + status actions ----------
  const lead = [];
  if (next.wa === 'proof' && waProofOn)
    lead.push(html`<a class="btn btn-wa btn-lg" href="${d.waProof}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Send proof on WhatsApp</span></a>`);
  if (next.wa === 'ready') lead.push(html`<a class="btn btn-wa btn-lg" href="${d.waReady}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Send ready message</span></a>`);
  if (next.proof && next.proofPrimary) lead.push(html`<a class="btn btn-primary btn-lg" href="#proof">${icon('upload')}<span>${next.proof}</span></a>`);
  if (next.primary) lead.push(actionButton(order, next.primary, next.wa ? 'btn-secondary btn-lg' : 'btn-primary btn-lg'));
  if (next.proof && !next.proofPrimary) lead.push(html`<a class="btn btn-secondary btn-lg" href="#proof">${icon('upload')}<span>${next.proof}</span></a>`);

  const nextCard = html`<section class="card sh-next sh-next-${s}" aria-labelledby="next-h">
    <div class="sh-next-head">
      <span class="sh-next-icon" aria-hidden="true">${icon(next.ic)}</span>
      <div class="sh-next-copy">
        <p class="sh-next-eyebrow">Next step</p>
        <h2 id="next-h">${next.title}</h2>
        <p>${next.text}</p>
      </div>
    </div>
    ${s === 'changes_requested' && order.customer_note
      ? html`<div class="sh-callout" role="note">
          <p class="sh-callout-label">${icon('refresh')}<span>What the customer asked for</span></p>
          <p class="sh-callout-text">${order.customer_note}</p>
        </div>`
      : ''}
    ${transitions.length || lead.length
      ? html`<form method="post" action="${orderPath(order)}/status" class="sh-status-form">
          ${csrfField(res)}<input type="hidden" name="from" value="${s}">
          ${lead.length ? html`<div class="sh-next-actions">${lead}</div>` : ''}
          ${transitions.length
            ? html`<details class="sh-note">
                <summary>${icon('plus')}<span>Add a note to this update</span> <span class="optional">optional</span></summary>
                <label class="sr-only" for="status-note">Note</label>
                <textarea id="status-note" name="note" maxlength="500" rows="2" placeholder="e.g. Customer approved on the phone"></textarea>
                <p class="hint">Saved in the order history with the next update you tap.</p>
              </details>`
            : ''}
          ${others.length
            ? html`<div class="sh-next-more">
                <span class="sh-next-more-label">${lead.length ? 'Other updates' : 'Update status'}</span>
                <div class="sh-next-more-btns">${others.map((t) => actionButton(order, t, 'btn-secondary btn-sm'))}</div>
              </div>`
            : ''}
        </form>`
      : ''}
  </section>`;

  // ---------- job: specs, notes, files ----------
  const spec = (label, value, cls = '') => html`<div class="sh-spec${cls}"><dt>${label}</dt><dd>${value}</dd></div>`;
  const jobCard = html`<section class="card sh-job" aria-labelledby="job-h">
    <div class="sh-card-head"><h2 id="job-h">What to print</h2></div>
    <dl class="sh-specs">
      ${spec('Size', order.size || '—')}
      ${spec('Quantity', qtyText(order.quantity))}
      ${spec('Colour', COLOR_LABEL[order.color_mode] || order.color_mode, order.color_mode === 'color' ? ' is-color' : '')}
      ${spec('Sides', SIDES_LABEL[order.sides] || order.sides)}
    </dl>
    ${order.notes
      ? html`<div class="sh-notes"><p class="sh-label">Customer notes</p><p class="sh-notes-text">${order.notes}</p></div>`
      : ''}
    <div class="sh-files">
      <p class="sh-label">Customer files <span class="count">${customerFiles.length}</span></p>
      ${customerFiles.length
        ? html`<ul class="sh-file-list">${customerFiles.map((f) => fileRow(order, f, { retention: shop.retention_days }))}</ul>`
        : html`<p class="muted mb-0">No files were uploaded with this order.</p>`}
      <p class="hint sh-retention">${icon('clock')}<span>Files are deleted automatically ${plural(shop.retention_days, 'day')} after upload.</span></p>
    </div>
  </section>`;

  // ---------- proof ----------
  const preview = latest && !latest.deleted_at && isPreviewableImage(latest.original_name) && latest.size_bytes <= PREVIEW_MAX_BYTES;
  const limitText = shop.is_demo
    ? `Demo: one file up to ${formatBytes(d.limits.bytes)}.`
    : `One file up to ${formatBytes(d.limits.bytes)}. JPG or PNG shows as a picture for the customer.`;
  const proofCard = html`<section class="card sh-proof" id="proof" aria-labelledby="proof-h">
    <div class="sh-card-head"><h2 id="proof-h">Proof</h2>${proofs.length ? html`<span class="count">${proofs.length}</span>` : ''}</div>
    <div class="sh-card-body">
      ${preview
        ? html`<a class="sh-proof-preview" href="${filePath(order, latest)}?inline=1" target="_blank" rel="noopener">
            <img src="${filePath(order, latest)}?inline=1" alt="Latest proof for order #${no}" loading="lazy" decoding="async">
            <span class="sh-proof-zoom">${icon('eye')}<span>Open full size</span></span>
          </a>`
        : ''}
      ${order.proof_note && latest
        ? html`<div class="sh-notes"><p class="sh-label">Your note to the customer</p><p class="sh-notes-text">${order.proof_note}</p></div>`
        : ''}
      ${proofs.length
        ? html`<ul class="sh-file-list">${proofs.map((f, i) =>
            fileRow(order, f, { retention: shop.retention_days, extra: i === 0 ? `Latest · ${formatDateTime(f.created_at)} · ` : `${formatDateTime(f.created_at)} · ` })
          )}</ul>`
        : html`<p class="muted sh-proof-none">${proofOpen ? 'No proof sent yet. Upload a design or sample for the customer to approve – or skip it for simple jobs.' : 'No proof was sent for this order.'}</p>`}
      ${proofOpen
        ? html`<form class="sh-proof-form" method="post" action="${withCsrf(`${orderPath(order)}/proof`, res)}" enctype="multipart/form-data">
            <h3>${proofs.length ? 'Send a new proof' : 'Send a proof'}</h3>
            <div class="field">
              <label for="proof-file" class="sr-only">Proof file</label>
              <div class="dropzone sh-drop">
                ${icon('upload')}
                <strong data-file-name data-default="Choose a file or drop it here">Choose a file or drop it here</strong>
                <span class="hint">PDF, JPG, PNG, CDR, AI, PSD and more</span>
                <input type="file" id="proof-file" name="proof" accept="${ACCEPT_ATTR}" required data-proof-input data-proof-max="${d.limits.bytes}" aria-describedby="proof-file-hint">
              </div>
              <p class="hint" id="proof-file-hint">${limitText}</p>
            </div>
            <div class="field">
              <label for="proof-note">Note for the customer <span class="optional">optional</span></label>
              <textarea id="proof-note" name="note" maxlength="500" rows="2" placeholder="e.g. Please check the spelling and phone number"></textarea>
            </div>
            <button class="btn btn-primary btn-lg btn-block" type="submit" data-loading="Uploading…">${icon('upload')}<span>Send proof</span></button>
          </form>`
        : html`<p class="hint sh-proof-closed">${s === 'cancelled' ? 'Reopen the order to send a proof.' : 'Proofs can be sent until printing starts.'}</p>`}
    </div>
  </section>`;

  // ---------- customer: contact, messages, tracking ----------
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
    <div class="sh-cust-section" id="message">
      <p class="sh-label">Message on WhatsApp</p>
      <div class="sh-msg-buttons">
        ${waProofOn
          ? html`<a class="btn btn-block ${s === 'proof_sent' ? 'btn-wa' : 'btn-secondary'}" href="${d.waProof}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Send proof</span></a>`
          : ''}
        ${waReadyOn
          ? html`<a class="btn btn-block ${s === 'ready' ? 'btn-wa' : 'btn-secondary'}" href="${d.waReady}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Send ready message</span></a>`
          : ''}
        <a class="btn btn-secondary btn-block" href="${chatLink}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Open chat</span></a>
      </div>
      <p class="hint">Opens WhatsApp with the message written for you – just tap send.</p>
      ${d.canEmail && (latest || waReadyOn)
        ? html`<form method="post" action="${orderPath(order)}/email" class="sh-email">
            ${csrfField(res)}
            ${latest && s !== 'cancelled' ? html`<button class="btn btn-ghost btn-sm" type="submit" name="kind" value="proof">${icon('mail')}<span>Email proof link</span></button>` : ''}
            ${waReadyOn ? html`<button class="btn btn-ghost btn-sm" type="submit" name="kind" value="ready">${icon('mail')}<span>Email ready message</span></button>` : ''}
            <p class="hint">Sends to ${order.customer_email}</p>
          </form>`
        : ''}
    </div>
    <div class="sh-cust-section">
      <p class="sh-label">Customer tracking page</p>
      <div class="copy-field">
        <label class="sr-only" for="track-url">Tracking link</label>
        <input id="track-url" type="text" readonly value="${d.trackUrl}">
        <button class="btn btn-secondary btn-icon" type="button" data-copy-target="#track-url" data-copy-msg="Tracking link copied" aria-label="Copy tracking link">${icon('copy')}</button>
      </div>
      <p class="hint">Shows the status, their files and your proof. Only people with this link can open it.</p>
      <a class="btn btn-ghost btn-sm sh-track-open" href="${d.trackUrl}" target="_blank" rel="noopener">${icon('eye')}<span>Open as customer</span></a>
    </div>
  </section>`;

  // ---------- history ----------
  const historyCard = html`<section class="card sh-history" aria-labelledby="hist-h">
    <div class="sh-card-head"><h2 id="hist-h">History</h2></div>
    <div class="sh-card-body">
      ${events.length ? html`<ol class="history">${events.map(eventView)}</ol>` : html`<p class="muted mb-0">No updates yet.</p>`}
    </div>
  </section>`;

  return html`<div class="container sh-order">
    <a class="sh-back" href="/shop">${icon('arrowLeft')}<span>All orders</span></a>
    <header class="sh-ohead">
      <div class="sh-ohead-main">
        <div class="sh-ohead-title">
          <h1><span class="sr-only">Order </span><span class="order-no">#${no}</span></h1>
          ${statusPill(s)}${order.is_sample ? html`<span class="sh-row-sample">Sample</span>` : ''}
        </div>
        <p class="sh-ohead-cust"><b>${order.customer_name}</b><span class="sh-dot" aria-hidden="true">·</span><span>${order.size || 'Print'} · ${qtyText(order.quantity)}</span></p>
        <p class="sh-ohead-time">${icon('clock')}<span>Received <time datetime="${order.created_at}">${formatDateTime(order.created_at)}</time>${Date.now() - Date.parse(order.created_at) < WEEK_MS
          ? html` · <time datetime="${order.created_at}" data-ago>${timeAgo(order.created_at)}</time>`
          : ''}</span></p>
      </div>
      <div class="sh-ohead-quick show-mobile">
        ${canCall ? html`<a class="btn btn-secondary btn-sm" href="tel:+${telNo}">${icon('phone')}<span>Call</span></a>` : ''}
        <a class="btn btn-secondary btn-sm" href="${chatLink}" target="_blank" rel="noopener">${icon('whatsapp')}<span>WhatsApp</span></a>
      </div>
    </header>
    <div class="sh-olayout">
      ${nextCard}
      ${jobCard}
      ${proofCard}
      <div class="sh-oside">${customerCard}</div>
      ${historyCard}
    </div>
  </div>`;
}
