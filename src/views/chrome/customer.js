import { html } from '../../lib/html.js';
import { shopPath } from '../../services/notify.js';
import { icon, logoMark } from '../components.js';

// Shop-branded chrome for the customer pages (order form, tracking, file messages).
// Colours come from /brand/<slug>.css (--brand / --brand-ink), so no inline styles.

const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;

/** Logo image, or the shop's first letter on its brand colour. */
export function shopMark(shop, size = 44) {
  return shop.logo_file
    ? html`<img class="cust-mark cust-mark-logo" src="/logo/${shop.slug}?v=${shop.logo_file.slice(0, 8)}" alt="" width="${size}" height="${size}">`
    : html`<span class="cust-mark cust-mark-initial" aria-hidden="true">${(shop.name || '?').trim().charAt(0).toUpperCase()}</span>`;
}

export function customerHeader(res, shop) {
  const place = shop.address ? shop.address.split('\n')[0] : shop.city || '';
  return html`<header class="cust-header">
    <div class="cust-wrap cust-header-row">
      <a class="cust-brand" href="${shopPath(shop)}" aria-label="${shop.name} – order page">
        ${shopMark(shop)}
        <span class="cust-brand-text">
          <b>${shop.name}</b>
          ${place ? html`<small>${place}</small>` : html`<small>Online print orders</small>`}
        </span>
      </a>
      ${shop.phone
        ? html`<a class="btn btn-secondary cust-call" href="${telHref(shop.phone)}" aria-label="Call ${shop.name}">${icon('phone')}<span class="cust-call-text">Call shop</span></a>`
        : ''}
    </div>
  </header>`;
}

export const customerFooter = () =>
  html`<footer class="cust-footer">
    <a href="/" target="_blank" rel="noopener">${logoMark(18)}<span>Powered by <b>PrintDesk</b></span></a>
  </footer>`;
