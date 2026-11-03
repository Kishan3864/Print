import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatDate } from '../../lib/util.js';
import { shopState } from '../../services/shops.js';
import { daysLeft } from '../../services/billing.js';
import { csrfField, icon } from '../components.js';

// Shop owner app chrome: top bar (desktop nav), bottom tab bar (mobile), status banners.
// Nav keys for render({active}): orders | link | support | billing | settings | notifications.
// res.locals.shopUnread = unread notifications, res.locals.ticketsUnread = tickets with a new reply.

// Extra icons for the shop area (same markup as components.js icon()).
const EXTRA = {
  support: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20.5l1.5-4.6A8.4 8.4 0 1 1 21 11.5z"/><path d="M9.7 9.3a2.4 2.4 0 0 1 4.6.8c0 1.6-2.3 2.1-2.3 3.3M12 16.2h.01"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 3v3M16 3v3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  megaphone: '<path d="M3 10.5v3a1 1 0 0 0 1 1h2.5L12 18.5v-13L6.5 9.5H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
};

/** icon() plus a few shop-only glyphs. */
export function shopIcon(name, cls = '') {
  if (!EXTRA[name]) return icon(name, cls);
  return raw(
    `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${EXTRA[name]}</svg>`
  );
}

export const SHOP_NAV = [
  { key: 'orders', href: '/shop', label: 'Orders', icon: 'orders' },
  { key: 'link', href: '/shop/link', label: 'Link & QR', short: 'Link', icon: 'qr' },
  { key: 'support', href: '/shop/support', label: 'Support', icon: 'support' },
  { key: 'billing', href: '/shop/billing', label: 'Plan & billing', short: 'Plan', icon: 'card' },
  { key: 'settings', href: '/shop/settings', label: 'Settings', icon: 'settings' },
];

const current = (active, key) => (active === key ? raw(' aria-current="page"') : '');

function badgeFor(res, key) {
  if (key === 'orders') return html`<span class="badge" data-new-badge hidden></span>`;
  if (key === 'support' && res.locals.ticketsUnread) return html`<span class="badge" title="New reply">${res.locals.ticketsUnread}</span>`;
  return '';
}

/** Shop logo, or its initial on a soft tile. */
export function shopAvatar(shop, cls = 'sh-avatar') {
  if (shop?.logo_file) return html`<span class="${cls} has-logo"><img src="/logo/${shop.slug}?v=${shop.logo_file.slice(0, 8)}" alt="" width="36" height="36"></span>`;
  const initial = String(shop?.name || 'P').trim().charAt(0).toUpperCase() || 'P';
  return html`<span class="${cls}" aria-hidden="true">${initial}</span>`;
}

export function shopHeader(res, active) {
  const shop = res.locals.shop;
  const unread = res.locals.shopUnread || 0;
  return html`<header class="app-header sh-header">
    <div class="container header-row">
      <a class="sh-brand" href="/shop" aria-label="${shop?.name || 'PrintDesk'} – orders">
        ${shopAvatar(shop)}
        <span class="sh-brand-text"><b>${shop?.name || 'PrintDesk'}</b><small>PrintDesk</small></span>
      </a>
      <nav class="app-nav sh-nav" aria-label="Shop">
        ${SHOP_NAV.map((n) => html`<a href="${n.href}" class="nav-item${active === n.key ? ' is-active' : ''}"${current(active, n.key)}>${shopIcon(n.icon)}<span>${n.label}</span>${badgeFor(res, n.key)}</a>`)}
      </nav>
      <div class="header-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-install hidden>${icon('install')}<span class="hide-xs">Install app</span></button>
        <a class="btn btn-ghost btn-sm btn-icon sh-bell${active === 'notifications' ? ' is-active' : ''}" href="/shop/notifications" aria-label="Notifications${unread ? ` (${unread} new)` : ''}"${current(active, 'notifications')}>${icon('bell')}${unread ? html`<span class="badge">${unread > 99 ? '99+' : unread}</span>` : ''}</a>
        <form method="post" action="/logout" class="inline-form hide-mobile">${csrfField(res)}<button class="btn btn-ghost btn-sm" type="submit">${icon('logout')}<span>Log out</span></button></form>
      </div>
    </div>
  </header>`;
}

export function shopTabbar(res, active) {
  return html`<nav class="tabbar sh-tabbar" aria-label="Shop sections">
    ${SHOP_NAV.map((n) => html`<a href="${n.href}" class="tab${active === n.key ? ' is-active' : ''}"${current(active, n.key)}>${shopIcon(n.icon)}<span>${n.short || n.label}</span>${badgeFor(res, n.key)}</a>`)}
  </nav>`;
}

/** Plan / demo status banner shown on every shop page. */
export function shopStateBanner(res) {
  const shop = res.locals.shop;
  if (!shop || (shop.is_demo && shop.slug === config.demo.slug)) return '';
  const state = shopState(shop);
  const left = daysLeft(shop);
  const banner = (tone, text, cta = 'Choose a plan', href = '/shop/billing') =>
    html`<div class="renew-banner renew-${tone} sh-banner sh-banner-${tone}" role="${tone === 'danger' ? 'alert' : 'status'}">
      <div class="container sh-banner-row">
        <span class="sh-banner-icon">${tone === 'info' ? shopIcon('bolt') : icon(tone === 'danger' ? 'alert' : 'clock')}</span>
        <p class="sh-banner-text">${text}</p>
        <a class="btn btn-sm ${tone === 'danger' ? 'btn-dark' : 'btn-primary'} sh-banner-cta" href="${href}">${cta}</a>
      </div>
    </div>`;
  if (shop.is_demo) {
    const ends = shop.demo_expires_at ? Date.parse(shop.demo_expires_at) - Date.now() : (left + 1) * 86400000;
    const h = Math.max(0, Math.floor(ends / 3600000));
    const remaining = h >= 48 ? `${Math.floor(h / 24)} days left` : h >= 1 ? `${h} hours left` : 'ends soon';
    if (state === 'expired') return banner('danger', html`<b>Your demo has ended.</b> Register your shop to start taking real orders.`, 'Register your shop', '/register');
    return banner('info', html`<b>Demo shop · ${remaining}.</b> Sample orders, real features. Like it? Register your own shop.`, 'Register your shop', '/register');
  }
  if (state === 'pending') return banner('info', html`<b>Choose a plan to start.</b> Your order link opens as soon as the payment is done.`);
  if (state === 'expired') return banner('danger', html`<b>Your plan ended on ${formatDate(shop.paid_until)}.</b> Your order link is closed. Renew to switch it back on.`, 'Renew now');
  if (state === 'paused') return banner('danger', html`<b>Your account is paused.</b> Your order link is not taking orders. Please contact support.`, 'Contact support', '/shop/support');
  if (left != null && left <= 7) return banner('warn', html`<b>Your plan ends ${left === 0 ? 'today' : `in ${left} day${left === 1 ? '' : 's'}`}</b> (${formatDate(shop.paid_until)}). Renew to avoid a break.`, 'Renew');
  return '';
}
