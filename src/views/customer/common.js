import { html } from '../../lib/html.js';
import { prettyPhone, waLink } from '../../lib/util.js';
import { icon } from '../components.js';

// Small building blocks shared by the customer order form and tracking page.

export const COLOR_LABEL = { color: 'Colour', bw: 'Black & white' };
export const SIDES_LABEL = { single: 'Single side', both: 'Both sides' };

export const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;

/** Call + WhatsApp buttons for the shop's public phone ('' when the shop has none). */
export function contactActions(shop, waText) {
  if (!shop.phone) return '';
  return html`<div class="cust-contact-actions">
    <a class="btn btn-wa btn-lg" href="${waLink(shop.phone, waText)}" target="_blank" rel="noopener">${icon('whatsapp')}<span>WhatsApp</span></a>
    <a class="btn btn-secondary btn-lg" href="${telHref(shop.phone)}">${icon('phone')}<span>Call ${prettyPhone(shop.phone)}</span></a>
  </div>`;
}

export const shopAddress = (shop) =>
  shop.address ? html`<p class="cust-address">${icon('store')}<span>${shop.address}</span></p>` : '';

/** Shown when the logged-in shop owner looks at their own customer page. */
export const ownerNote = (text, href, linkText) =>
  html`<div class="cust-owner" role="note">${icon('eye')}<span>${text}</span><a href="${href}">${linkText}</a></div>`;

// Decorative glyphs for the colour / sides choices (static SVG, no user data).
export const GLYPH = {
  color: html`<span class="cust-swatch cust-swatch-color" aria-hidden="true"><i></i><i></i><i></i></span>`,
  bw: html`<span class="cust-swatch cust-swatch-bw" aria-hidden="true"><i></i><i></i></span>`,
  single: html`<svg class="cust-glyph" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false"><rect class="pg-front" x="8.5" y="4.5" width="15" height="22" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M12.5 11h7M12.5 15h7M12.5 19h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  both: html`<svg class="cust-glyph" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false"><rect class="pg-back" x="12.5" y="2.5" width="15" height="21" rx="2.5" stroke="currentColor" stroke-width="2"/><rect class="pg-front" x="5.5" y="8.5" width="15" height="21" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M9.5 15h7M9.5 19h7M9.5 23h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
};
