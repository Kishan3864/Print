import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatDate } from '../../lib/util.js';
import { shopState } from '../../services/shops.js';
import { daysLeft } from '../../services/billing.js';
import { csrfField, icon, logoMark } from '../components.js';

// Shop owner app chrome: top bar (desktop nav), bottom tab bar (mobile), status banners.
// Nav keys for render({active}): orders | link | support | billing | settings | notifications.
// res.locals.shopUnread = unread notifications, res.locals.ticketsUnread = tickets with a new reply.

export const SHOP_NAV = [
  { key: 'orders', href: '/shop', label: 'Orders', icon: 'orders' },
  { key: 'link', href: '/shop/link', label: 'Link & QR', short: 'Link', icon: 'qr' },
  { key: 'support', href: '/shop/support', label: 'Support', icon: 'info' },
  { key: 'billing', href: '/shop/billing', label: 'Plan & billing', short: 'Plan', icon: 'shield' },
  { key: 'settings', href: '/shop/settings', label: 'Settings', icon: 'settings' },
];

const current = (active, key) => (active === key ? raw(' aria-current="page"') : '');

function badgeFor(res, key) {
  if (key === 'orders') return html`<span class="badge" data-new-badge hidden></span>`;
  if (key === 'support' && res.locals.ticketsUnread) return html`<span class="badge">${res.locals.ticketsUnread}</span>`;
  return '';
}

export function shopHeader(res, active) {
  const shop = res.locals.shop;
  const unread = res.locals.shopUnread || 0;
  return html`<header class="app-header">
    <div class="container header-row">
      <a class="brand" href="/shop" aria-label="PrintDesk orders">${logoMark(30)}<span class="brand-name brand-shop"><span class="brand-shop-name">${shop?.name || 'PrintDesk'}</span><small>PrintDesk</small></span></a>
      <nav class="app-nav" aria-label="Shop">
        ${SHOP_NAV.map((n) => html`<a href="${n.href}" class="nav-item${active === n.key ? ' is-active' : ''}"${current(active, n.key)}>${icon(n.icon)}<span>${n.label}</span>${badgeFor(res, n.key)}</a>`)}
      </nav>
      <div class="header-actions">
        <a class="btn btn-ghost btn-sm btn-bell${active === 'notifications' ? ' is-active' : ''}" href="/shop/notifications" aria-label="Notifications${unread ? ` (${unread} new)` : ''}">${icon('bell')}${unread ? html`<span class="badge">${unread}</span>` : ''}</a>
        <button type="button" class="btn btn-ghost btn-sm" data-install hidden>${icon('install')}<span class="hide-xs">Install app</span></button>
        <form method="post" action="/logout" class="inline-form">${csrfField(res)}<button class="btn btn-ghost btn-sm" type="submit" aria-label="Log out">${icon('logout')}<span class="hide-xs">Log out</span></button></form>
      </div>
    </div>
  </header>`;
}

export function shopTabbar(res, active) {
  return html`<nav class="tabbar" aria-label="Shop sections">
    ${SHOP_NAV.map((n) => html`<a href="${n.href}" class="tab${active === n.key ? ' is-active' : ''}"${current(active, n.key)}>${icon(n.icon)}<span>${n.short || n.label}</span>${badgeFor(res, n.key)}</a>`)}
  </nav>`;
}

/** Plan / demo status banner shown on every shop page. */
export function shopStateBanner(res) {
  const shop = res.locals.shop;
  if (!shop || (shop.is_demo && shop.slug === config.demo.slug)) return '';
  const state = shopState(shop);
  const left = daysLeft(shop);
  const banner = (tone, text, cta = 'Choose a plan') =>
    html`<div class="renew-banner renew-${tone}" role="${tone === 'danger' ? 'alert' : 'status'}">${icon(tone === 'info' ? 'info' : 'alert')}<span>${text}</span><a class="btn btn-sm btn-primary" href="/shop/billing">${cta}</a></div>`;
  if (shop.is_demo) {
    if (state === 'expired') return banner('danger', html`<b>Your demo has ended.</b> Go live to keep your link and start taking real orders.`, 'Go live');
    return banner('info', html`<b>Demo shop</b> · ${left > 0 ? `${left + 1} days left` : 'last day today'}. Your customer link works for testing. Go live any time.`, 'Go live');
  }
  if (state === 'pending') return banner('info', html`<b>Choose a plan to start.</b> Your order link opens as soon as the payment is done.`);
  if (state === 'expired') return banner('danger', html`<b>Your plan ended on ${formatDate(shop.paid_until)}.</b> Your order link is closed. Renew to switch it back on.`, 'Renew now');
  if (state === 'paused') return banner('danger', html`<b>Your account is paused.</b> Your order link is not taking orders. Please contact support.`, 'Plan & billing');
  if (left != null && left <= 7) return banner('warn', html`<b>Your plan ends ${left === 0 ? 'today' : `in ${left} day${left === 1 ? '' : 's'}`}</b> (${formatDate(shop.paid_until)}). Renew to avoid a break.`, 'Renew');
  return '';
}
