import { html, raw } from '../../lib/html.js';
import { csrfField } from '../components.js';
import { sicon } from '../shop-support/common.js';

// "Send a notification" forms (POST /admin/notify): one shop, or every live shop.

/** Where a notification may point (all inside the shop area; the server also checks /shop…). */
export const NOTIFY_LINKS = [
  ['', 'No link'],
  ['/shop', 'Orders'],
  ['/shop/billing', 'Plan & billing'],
  ['/shop/link', 'Link & QR'],
  ['/shop/settings', 'Settings'],
  ['/shop/support', 'Help & support'],
];

export const NOTIFY_LIMITS = { titleMin: 3, titleMax: 120, bodyMax: 1000 };

function notifyForm(res, { target, idp, submit, hint, confirm = '', disabled = false }) {
  return html`<form class="sup-notify" method="post" action="/admin/notify"${confirm ? html` data-confirm="${confirm}"` : ''}>
    ${csrfField(res)}
    <input type="hidden" name="shop_id" value="${target}">
    <div class="field">
      <label for="${idp}-title">Title</label>
      <input type="text" id="${idp}-title" name="title" minlength="${NOTIFY_LIMITS.titleMin}" maxlength="${NOTIFY_LIMITS.titleMax}" required autocomplete="off" placeholder="e.g. New: GST receipts">
    </div>
    <div class="field">
      <label for="${idp}-body">Message <span class="optional">optional</span></label>
      <textarea id="${idp}-body" name="body" rows="3" maxlength="${NOTIFY_LIMITS.bodyMax}" data-autogrow data-counter="${NOTIFY_LIMITS.bodyMax}"></textarea>
    </div>
    <div class="sup-notify-row">
      <div class="field">
        <label for="${idp}-link">Button opens <span class="optional">optional</span></label>
        <select id="${idp}-link" name="link">${NOTIFY_LINKS.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select>
      </div>
      <label class="sup-check" for="${idp}-important"><input type="checkbox" id="${idp}-important" name="important" value="1"><span>Mark as important</span></label>
    </div>
    <div class="sup-notify-foot">
      <button type="submit" class="btn btn-primary"${disabled ? raw(' disabled') : ''} data-loading="Sending…">${sicon('send')}<span>${submit}</span></button>
      ${hint ? html`<span class="hint">${hint}</span>` : ''}
    </div>
  </form>`;
}

/** Embedded on the admin shop page: a message to this one shop (shows in its bell + dashboard). */
export function notifyShopForm(res, shop) {
  return notifyForm(res, {
    target: String(shop.id),
    idp: `ntf-${shop.id}`,
    submit: 'Send to this shop',
  });
}

/** /admin/notifications: one announcement to every live (paid, non-demo) shop. */
export function announcementForm(res, recipients) {
  return notifyForm(res, {
    target: 'all',
    idp: 'ntf-all',
    submit: recipients ? `Send to ${recipients} live shop${recipients === 1 ? '' : 's'}` : 'No live shops yet',
    hint: 'Demo shops do not get announcements.',
    confirm: `Send this announcement to all ${recipients} live shop${recipients === 1 ? '' : 's'}?`,
    disabled: recipients === 0,
  });
}
