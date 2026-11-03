import { html } from '../../lib/html.js';
import { STATUS_LABEL, TRANSITIONS, ACTION_LABEL, PROOF_ALLOWED } from '../../lib/status.js';
import { formatDateTime, formatBytes, timeAgo, prettyPhone, waNumber, waLink } from '../../lib/util.js';
import { ACCEPT_ATTR, extOf, isPreviewableImage } from '../../lib/uploads.js';
import { icon, statusPill, csrfField, withCsrf } from '../components.js';
import { COLOR_LABEL, SIDES_LABEL, jobLine, qtyText, plural, orderPath, filePath } from './common.js';

const PREVIEW_MAX_BYTES = 15 * 1024 * 1024;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// What the shop should do next, per status.
const NEXT = {
  new: { title: 'New order', text: 'Check the files, then send a proof or start printing.', ic: 'bell', primary: 'printing', proof: 'Send a proof first' },
  proof_sent: { title: 'Waiting for approval', text: 'The customer can approve the proof or ask for changes on their tracking page.', ic: 'eye', wa: 'proof' },
  approved: { title: 'Proof approved', text: 'The customer approved the proof. It is ready to print.', ic: 'check', primary: 'printing' },
  changes_requested: { title: 'Changes requested', text: 'Make the changes and upload a new proof, or start printing if it is sorted.', ic: 'refresh', proof: 'Upload new proof', proofPrimary: true },
  printing: { title: 'Printing', text: 'Mark it ready when the job is done so you can tell the customer.', ic: 'printer', primary: 'ready' },
  ready: { title: 'Ready for pickup', text: 'Let the customer know on WhatsApp, then mark it delivered when they collect it.', ic: 'store', wa: 'ready', primary: 'delivered' },
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
  return html`<button class="btn ${cancel ? 'btn-danger' : cls}" type="submit" name="to" value="${to}"${cancel ? html` data-confirm="Cancel order #${order.order_no}? You can reopen it later."` : ''}>${icon(ACTION_ICON[to] || 'arrowRight')}<span>${actionLabel(order.status, to)}</span></button>`;
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
    <div class="ord-h-body">
      <div class="h-title">${title}</div>
      <time class="h-time" datetime="${e.at}">${formatDateTime(e.at)}${actor === 'customer' ? ' · by customer' : actor === 'system' ? ' · automatic' : ''}</time>
      ${note ? html`<div class="h-note">${note}</div>` : ''}
    </div>
  </li>`;
}

function fileRow(order, f, { retention, extra = '' } = {}) {
  const gone = Boolean(f.deleted_at);
  return html`<li class="file-row ord-file${gone ? ' is-deleted' : ''}">
    <span class="file-ext">${extOf(f.original_name) || 'file'}</span>
    <div class="ord-file-info">
      <span class="file-name" title="${f.original_name}">${f.original_name}</span>
      <span class="file-meta">${extra}${formatBytes(f.size_bytes)}${gone ? ` · Auto-deleted after ${retention} days` : ''}</span>
    </div>
    ${gone
      ? ''
      : html`<a class="btn btn-secondary btn-sm ord-dl" href="${filePath(order, f)}" download aria-label="Download ${f.original_name}">${icon('download')}<span class="hide-xs">Download</span></a>`}
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
  const no = order.order_no;

  // ---------- next step + status actions ----------
  const lead = [];
  if (next.wa === 'proof' && waProofOn)
    lead.push(html`<a class="btn btn-wa btn-lg ord-hl" href="${d.waProof}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Send proof on WhatsApp</span></a>`);
  if (next.wa === 'ready')
    lead.push(html`<a class="btn btn-wa btn-lg ord-hl" href="${d.waReady}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Send ready message</span></a>`);
  if (next.proof && next.proofPrimary) lead.push(html`<a class="btn btn-primary btn-lg" href="#proof">${icon('upload')}<span>${next.proof}</span></a>`);
  if (next.primary) lead.push(actionButton(order, next.primary, 'btn-primary btn-lg'));
  if (next.proof && !next.proofPrimary) lead.push(html`<a class="btn btn-secondary btn-lg" href="#proof">${icon('upload')}<span>${next.proof}</span></a>`);

  const nextCard = html`<section class="card ord-next ord-next-${s}" aria-labelledby="next-h">
    <div class="card-body">
      <div class="ord-next-head">
        <span class="ord-next-icon pill-${s}" aria-hidden="true">${icon(next.ic)}</span>
        <div>
          <p class="ord-next-eyebrow">Next step</p>
          <h2 class="ord-next-title" id="next-h">${next.title}</h2>
          <p class="ord-next-text">${next.text}</p>
        </div>
      </div>
      ${s === 'changes_requested' && order.customer_note
        ? html`<div class="ord-callout" role="note">
            <p class="ord-callout-label">${icon('refresh')}<span>Customer asked for changes</span></p>
            <p class="ord-callout-text">${order.customer_note}</p>
          </div>`
        : ''}
      ${transitions.length || lead.length
        ? html`<form method="post" action="${orderPath(order)}/status" class="ord-status-form">
            ${csrfField(res)}<input type="hidden" name="from" value="${s}">
            ${transitions.length
              ? html`<details class="ord-note">
                  <summary>${icon('plus')}<span>Add a note to this update</span> <span class="optional">optional</span></summary>
                  <label class="sr-only" for="status-note">Note</label>
                  <textarea id="status-note" name="note" maxlength="500" rows="2" placeholder="e.g. Customer approved on the phone"></textarea>
                  <p class="hint">Saved in the order history.</p>
                </details>`
              : ''}
            ${lead.length ? html`<div class="ord-actions">${lead}</div>` : ''}
            ${others.length
              ? html`<div class="ord-more">
                  <span class="ord-more-label">${lead.length ? 'Other updates' : 'Update status'}</span>
                  ${others.map((t) => actionButton(order, t, 'btn-secondary'))}
                </div>`
              : ''}
          </form>`
        : ''}
    </div>
  </section>`;

  // ---------- customer ----------
  const customerCard = html`<section class="card ord-customer" aria-labelledby="cust-h">
    <div class="card-body">
      <div class="ord-cust-head">
        <span class="ord-avatar" aria-hidden="true">${(order.customer_name || '?').trim().charAt(0).toUpperCase()}</span>
        <div class="ord-cust-id">
          <p class="ord-cust-label">Customer</p>
          <h2 class="ord-cust-name" id="cust-h">${order.customer_name}</h2>
        </div>
      </div>
      <ul class="ord-contact">
        <li>${telNo.length >= 10
          ? html`<a href="tel:+${telNo}">${icon('phone')}<span>${prettyPhone(order.customer_mobile)}</span><span class="ord-contact-cta">Call</span></a>`
          : html`<span class="ord-contact-item">${icon('phone')}<span>${order.customer_mobile}</span></span>`}</li>
        ${order.customer_email
          ? html`<li><a href="mailto:${order.customer_email}">${icon('mail')}<span>${order.customer_email}</span></a></li>`
          : ''}
      </ul>
    </div>
  </section>`;

  // ---------- customer files ----------
  const filesCard = html`<section class="card ord-files" aria-labelledby="files-h">
    <div class="card-head"><h2 id="files-h">Customer files</h2><span class="count">${customerFiles.length}</span></div>
    <div class="card-body">
      ${customerFiles.length
        ? html`<ul class="file-list ord-file-list">${customerFiles.map((f) => fileRow(order, f, { retention: shop.retention_days }))}</ul>`
        : html`<p class="muted mb-0">No files were uploaded with this order.</p>`}
      <p class="hint ord-retention">${icon('clock')}<span>Files are deleted automatically ${plural(shop.retention_days, 'day')} after upload.</span></p>
    </div>
  </section>`;

  // ---------- job details ----------
  const detailsCard = html`<section class="card ord-details" aria-labelledby="job-h">
    <div class="card-head"><h2 id="job-h">Job details</h2></div>
    <div class="card-body">
      <dl class="ord-specs">
        <div><dt>Size</dt><dd>${order.size || '—'}</dd></div>
        <div><dt>Quantity</dt><dd>${qtyText(order.quantity)}</dd></div>
        <div><dt>Colour</dt><dd>${COLOR_LABEL[order.color_mode] || order.color_mode}</dd></div>
        <div><dt>Sides</dt><dd>${SIDES_LABEL[order.sides] || order.sides}</dd></div>
      </dl>
      ${order.notes
        ? html`<div class="ord-notes"><p class="ord-notes-label">Customer notes</p><p class="ord-notes-text">${order.notes}</p></div>`
        : html`<p class="hint ord-notes-none">No notes from the customer.</p>`}
    </div>
  </section>`;

  // ---------- proof ----------
  const preview = latest && !latest.deleted_at && isPreviewableImage(latest.original_name) && latest.size_bytes <= PREVIEW_MAX_BYTES;
  const limitText = shop.is_demo
    ? `Demo: one file up to ${formatBytes(d.limits.bytes)}.`
    : `One file up to ${formatBytes(d.limits.bytes)}. JPG or PNG shows as a picture for the customer.`;
  const proofCard = html`<section class="card ord-proof" id="proof" aria-labelledby="proof-h">
    <div class="card-head"><h2 id="proof-h">Proof</h2>${proofs.length ? html`<span class="count">${proofs.length}</span>` : ''}</div>
    <div class="card-body">
      ${preview
        ? html`<a class="ord-proof-preview" href="${filePath(order, latest)}?inline=1" target="_blank" rel="noopener">
            <img src="${filePath(order, latest)}?inline=1" alt="Latest proof for order #${no}" loading="lazy" decoding="async">
          </a>`
        : ''}
      ${order.proof_note && latest
        ? html`<div class="ord-proof-note"><p class="ord-notes-label">Your note to the customer</p><p class="ord-notes-text">${order.proof_note}</p></div>`
        : ''}
      ${proofs.length
        ? html`<ul class="file-list ord-file-list">${proofs.map((f, i) =>
            fileRow(order, f, { retention: shop.retention_days, extra: i === 0 ? `Latest · ${formatDateTime(f.created_at)} · ` : `${formatDateTime(f.created_at)} · ` })
          )}</ul>`
        : html`<p class="muted mb-0">${proofOpen ? 'No proof sent yet. Upload a design or sample for the customer to approve – or skip it for simple jobs.' : 'No proof was sent for this order.'}</p>`}
      ${proofOpen
        ? html`<form class="ord-proof-form" method="post" action="${withCsrf(`${orderPath(order)}/proof`, res)}" enctype="multipart/form-data">
            <h3>${proofs.length ? 'Send a new proof' : 'Send a proof'}</h3>
            <div class="field">
              <label for="proof-file">Proof file</label>
              <div class="dropzone ord-drop">
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
        : html`<p class="hint mt-2">${s === 'cancelled' ? 'Reopen the order to send a proof.' : 'Proofs can be sent until printing starts.'}</p>`}
    </div>
  </section>`;

  // ---------- message customer ----------
  const chatLink = waLink(order.customer_mobile, `Hi ${order.customer_name}, about your order #${no} at ${shop.name}: `);
  const messageCard = html`<section class="card ord-message" id="message" aria-labelledby="msg-h">
    <div class="card-head"><h2 id="msg-h">Message customer</h2></div>
    <div class="card-body">
      <div class="ord-msg-buttons">
        ${waProofOn
          ? html`<a class="btn btn-wa btn-block${s === 'proof_sent' ? ' ord-hl' : ' ord-wa-soft'}" href="${d.waProof}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Send proof on WhatsApp</span></a>`
          : ''}
        ${waReadyOn
          ? html`<a class="btn btn-wa btn-block${s === 'ready' ? ' ord-hl' : ' ord-wa-soft'}" href="${d.waReady}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Send ready message</span></a>`
          : ''}
        <a class="btn btn-secondary btn-block" href="${chatLink}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Open WhatsApp chat</span></a>
      </div>
      <p class="hint mt-1">Opens WhatsApp with the message written for you – just tap send.</p>
      ${d.canEmail
        ? html`<form method="post" action="${orderPath(order)}/email" class="ord-email">
            ${csrfField(res)}
            ${latest && s !== 'cancelled' ? html`<button class="btn btn-ghost btn-block" type="submit" name="kind" value="proof">${icon('mail')}<span>Email proof link</span></button>` : ''}
            ${waReadyOn ? html`<button class="btn btn-ghost btn-block" type="submit" name="kind" value="ready">${icon('mail')}<span>Email ready message</span></button>` : ''}
            ${latest || waReadyOn ? html`<p class="hint">Sends to ${order.customer_email}</p>` : ''}
          </form>`
        : ''}
    </div>
  </section>`;

  // ---------- tracking link ----------
  const trackCard = html`<section class="card ord-track" aria-labelledby="track-h">
    <div class="card-head"><h2 id="track-h">Customer tracking page</h2></div>
    <div class="card-body">
      <p class="hint mb-1">Your customer sees the status, their files and your proof here. Only people with this link can open it.</p>
      <div class="copy-field">
        <label class="sr-only" for="track-url">Tracking link</label>
        <input id="track-url" type="text" readonly value="${d.trackUrl}">
        <button class="btn btn-secondary btn-icon" type="button" data-copy-target="#track-url" data-copy-msg="Tracking link copied" aria-label="Copy tracking link">${icon('copy')}</button>
      </div>
      <a class="btn btn-ghost btn-sm mt-1" href="${d.trackUrl}" target="_blank" rel="noopener">${icon('eye')}<span>Open as customer</span></a>
    </div>
  </section>`;

  // ---------- history ----------
  const historyCard = html`<section class="card ord-history" aria-labelledby="hist-h">
    <div class="card-head"><h2 id="hist-h">History</h2></div>
    <div class="card-body">
      ${events.length ? html`<ol class="history">${events.map(eventView)}</ol>` : html`<p class="muted mb-0">No updates yet.</p>`}
    </div>
  </section>`;

  return html`<div class="container ord-page">
    <header class="ord-top">
      <a class="ord-back" href="/shop">${icon('arrowLeft')}<span>All orders</span></a>
      <div class="ord-title">
        <h1 class="ord-h1"><span class="sr-only">Order </span><span class="order-no">#${no}</span></h1>
        <div class="ord-title-pills">${statusPill(s)}${order.is_sample ? html`<span class="pill pill-sample">Sample</span>` : ''}</div>
      </div>
      <p class="ord-sub"><b>${order.customer_name}</b> · ${jobLine(order)}</p>
      <p class="ord-sub ord-sub-muted">Received <time datetime="${order.created_at}">${formatDateTime(order.created_at)}</time>${Date.now() - Date.parse(order.created_at) < WEEK_MS
        ? html` · <time datetime="${order.created_at}" data-ago>${timeAgo(order.created_at)}</time>`
        : ''}</p>
    </header>
    <div class="ord-layout">
      <div class="ord-main">
        ${nextCard}
        ${filesCard}
        ${detailsCard}
        ${proofCard}
        ${historyCard}
      </div>
      <div class="ord-side">
        ${customerCard}
        ${messageCard}
        ${trackCard}
      </div>
    </div>
  </div>`;
}
