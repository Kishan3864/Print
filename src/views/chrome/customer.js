import { html } from '../../lib/html.js';
import { shopPath } from '../../services/notify.js';
import { icon, logoMark } from '../components.js';

// Shop-branded chrome for the customer pages (order form, tracking).

export function customerHeader(res, shop) {
  return html`<header class="shop-brand-header">
    <div class="container-narrow header-row">
      <a class="shop-brand" href="${shopPath(shop)}">
        ${shop.logo_file
          ? html`<img class="shop-logo" src="/logo/${shop.slug}?v=${shop.logo_file.slice(0, 8)}" alt="" width="44" height="44">`
          : html`<span class="shop-initial" aria-hidden="true">${(shop.name || '?').trim().charAt(0).toUpperCase()}</span>`}
        <span class="shop-brand-text"><b>${shop.name}</b>${shop.address ? html`<small>${shop.address.split('\n')[0]}</small>` : ''}</span>
      </a>
      ${shop.phone ? html`<a class="btn btn-ghost btn-sm" href="tel:${shop.phone.replace(/[^\d+]/g, '')}">${icon('phone')}<span class="hide-xs">Call shop</span></a>` : ''}
    </div>
  </header>`;
}

export const customerFooter = () =>
  html`<footer class="powered-by"><a href="/" target="_blank" rel="noopener">${logoMark(18)}<span>Powered by <b>PrintDesk</b></span></a></footer>`;
