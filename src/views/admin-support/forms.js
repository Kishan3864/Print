import crypto from 'node:crypto';
import { html, raw } from '../../lib/html.js';
import { csrfField } from '../components.js';
import { sicon } from '../shop-support/common.js';

// "Send a message" form for one shop (POST /admin/notify, on the admin shop page) and the shared
// limits/links used by the announcement composer (views/admin-support/announcements.js).

/** Where a notification may point (all inside the shop area; the server also checks /shop…). */
export const NOTIFY_LINKS = [
  ['', 'No link'],
  ['/shop', 'Orders'],
  ['/shop/billing', 'Plan & billing'],
  ['/shop/link', 'Share link (link & QR)'],
  ['/shop/settings', 'Account / settings'],
  ['/shop/support', 'Help'],
];

export const NOTIFY_LIMITS = { titleMin: 3, titleMax: 120, bodyMax: 1000 };

/** One-time token per form: a double-click or a resubmitted page sends the announcement once. */
export const newNonce = () => crypto.randomBytes(16).toString('hex');

function notifyForm(res, { target, idp, submit, hint, confirm = '', disabled = false }) {
  return html`<form class="adm-notify" method="post" action="/admin/notify"${confirm ? html` data-confirm="${confirm}"` : ''}>
    ${csrfField(res)}
    <input type="hidden" name="shop_id" value="${target}">
    <input type="hidden" name="nonce" value="${newNonce()}">
    <div class="field">
      <label for="${idp}-title">Title</label>
      <input type="text" id="${idp}-title" name="title" minlength="${NOTIFY_LIMITS.titleMin}" maxlength="${NOTIFY_LIMITS.titleMax}" required autocomplete="off" placeholder="e.g. New: GST receipts">
    </div>
    <div class="field">
      <label for="${idp}-body">Message <span class="optional">optional</span></label>
      <textarea id="${idp}-body" name="body" rows="3" maxlength="${NOTIFY_LIMITS.bodyMax}" data-autogrow data-counter="${NOTIFY_LIMITS.bodyMax}"></textarea>
    </div>
    <div class="adm-notify-row">
      <div class="field">
        <label for="${idp}-link">Button opens <span class="optional">optional</span></label>
        <select id="${idp}-link" name="link">${NOTIFY_LINKS.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select>
      </div>
      <label class="adm-check" for="${idp}-important"><input type="checkbox" id="${idp}-important" name="important" value="1"><span>Important – also show a banner</span></label>
    </div>
    <div class="adm-notify-foot">
      <button type="submit" class="btn btn-primary"${disabled ? raw(' disabled') : ''} data-loading="Sending…">${sicon('send')}<span>${submit}</span></button>
      ${hint ? html`<span class="hint">${hint}</span>` : ''}
    </div>
  </form>`;
}

/** Embedded on the admin shop page: a message to this one shop (its Alerts + red badge; banner if important). */
export function notifyShopForm(res, shop) {
  return notifyForm(res, {
    target: String(shop.id),
    idp: `ntf-${shop.id}`,
    submit: 'Send to this shop',
    hint: html`Saved under <a href="/admin/announcements">Announcements</a> with its read status.`,
  });
}
