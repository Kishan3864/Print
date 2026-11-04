import { html, raw } from '../lib/html.js';
import { csrfField, icon } from './components.js';
import { safeLocalLink, sicon } from './shop-support/common.js';
import { unreadImportant } from '../services/announcements.js';

// Important announcement banner under the shop header. Shown on every shop page until the shop taps
// "Got it" / "Open" or opens Alerts. The slot is always rendered so live.js can swap it in.

/** First ~120 characters on one paragraph; the full text is in Alerts. */
const short = (text) => {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > 120 ? `${t.slice(0, 117).replace(/\s+\S*$/, '')}…` : t;
};

/** Banner markup for one notification. preview: true renders inert buttons (admin preview). */
export function announcementBannerMarkup(n, { res = null, next = '/shop', more = 0, preview = false } = {}) {
  const link = safeLocalLink(n.link);
  const buttons = html`${link ? html`<button type="${preview ? 'button' : 'submit'}" class="btn btn-sm btn-dark" name="go" value="link"${preview ? raw(' tabindex="-1"') : ''}>Open</button>` : ''}
    <button type="${preview ? 'button' : 'submit'}" class="btn btn-sm btn-secondary"${preview ? raw(' tabindex="-1"') : ''}>${icon('check')}<span>Got it</span></button>`;
  return html`<section class="annc${preview ? ' is-preview' : ''}" role="${preview ? 'presentation' : 'status'}" aria-label="Message from Brighton Print">
    <div class="${preview ? 'annc-row' : 'container annc-row'}">
      <span class="annc-ic" aria-hidden="true">${sicon('megaphone')}</span>
      <div class="annc-text">
        <p class="annc-from">Brighton Print<span aria-hidden="true"> · </span><b>Important</b></p>
        <p class="annc-title">${n.title}</p>
        ${n.body ? html`<p class="annc-body">${short(n.body)}</p>` : ''}
        ${more ? html`<a class="annc-more" href="/shop/notifications">+${more} more message${more === 1 ? '' : 's'} in Alerts</a>` : ''}
      </div>
      ${preview
        ? html`<div class="annc-actions">${buttons}</div>`
        : html`<form class="annc-actions" method="post" action="/shop/notifications/${n.id}/dismiss">
            ${csrfField(res)}<input type="hidden" name="next" value="${next}">${buttons}
          </form>`}
    </div>
  </section>`;
}

/** The slot under the shop header: newest unread important announcement (or empty). */
export function announcementBanner(res) {
  const shop = res.locals.shop;
  if (!shop) return '';
  const rows = unreadImportant(shop.id);
  const path = res.req?.originalUrl || '/shop';
  const next = /^\/shop(?:[/?#]|$)/.test(path) && !path.includes('//') ? path.slice(0, 200) : '/shop';
  return html`<div class="annc-slot" data-annc>${rows.length ? announcementBannerMarkup(rows[0], { res, next, more: rows.length - 1 }) : ''}</div>`;
}
