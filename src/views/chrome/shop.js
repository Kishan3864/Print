import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatDate } from '../../lib/util.js';
import { shopState } from '../../services/shops.js';
import { daysLeft } from '../../services/billing.js';
import { orderFormUrl } from '../../services/notify.js';
import { icon } from '../components.js';
import { announcementBanner } from '../announce.js';

// Shop owner app chrome: top bar (desktop nav), bottom tab bar (mobile), plan banner.
// Nav keys for render({active}): orders | bills | link | notifications | support | settings (billing counts as settings).
// Badges come from res.locals: ordersTodo (orders waiting on the shop), shopUnread (alerts),
// ticketsUnread (support replies). live.js re-renders <header> and .tabbar, shop.js refreshes them by poll.

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
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  sound: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  receipt: '<path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  rupee: '<path d="M6 3h12M6 8h12M14 3c4 0 4 10-2.5 10H6l8.5 8"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
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
  { key: 'bills', href: '/shop/bills', label: 'Bills', icon: 'receipt' },
  { key: 'link', href: '/shop/link', label: 'Share link', short: 'Share', icon: 'share' },
  { key: 'notifications', href: '/shop/notifications', label: 'Alerts', icon: 'bell' },
  { key: 'support', href: '/shop/support', label: 'Help', icon: 'support' },
  { key: 'settings', href: '/shop/settings', label: 'Account', icon: 'user' },
];

// Plan & billing lives inside Account.
const navKey = (active) => (active === 'billing' ? 'settings' : active);
const current = (active, key) => (navKey(active) === key ? raw(' aria-current="page"') : '');

/** True when the plan needs the owner (not paid yet, ended, ending within 7 days, or a personal demo). */
export function planNeedsAttention(shop) {
  if (!shop || (shop.is_demo && shop.slug === config.demo.slug)) return false;
  if (shop.is_demo) return true;
  const state = shopState(shop);
  if (state === 'pending' || state === 'expired') return true;
  const left = daysLeft(shop);
  return state === 'active' && left != null && left <= 7;
}

const countText = (n) => (n > 99 ? '99+' : String(n));

/** Red count bubble; always rendered (hidden at 0) so shop.js can update it. */
function countBadge(key, n, what) {
  return html`<span class="badge" data-badge="${key}"${n ? raw(` title="${n} ${what}"`) : raw(' hidden')}>${n ? countText(n) : ''}</span>`;
}

function badgeFor(res, key) {
  const l = res.locals;
  if (key === 'orders') return countBadge('todo', l.ordersTodo || 0, 'waiting for you');
  if (key === 'notifications') return countBadge('alerts', l.shopUnread || 0, 'new');
  if (key === 'support') return countBadge('support', l.ticketsUnread || 0, 'new reply');
  if (key === 'settings' && planNeedsAttention(l.shop)) return html`<span class="badge-dot" title="Plan needs attention"></span>`;
  return '';
}

/** Screen-reader text for a nav item's badge. */
function srCount(res, key) {
  const l = res.locals;
  const n = key === 'orders' ? l.ordersTodo : key === 'notifications' ? l.shopUnread : key === 'support' ? l.ticketsUnread : 0;
  return n ? html`<span class="sr-only"> (${n} new)</span>` : '';
}

/** Shop logo, or its initial on a soft tile. */
export function shopAvatar(shop, cls = 'sh-avatar') {
  if (shop?.logo_file) return html`<span class="${cls} has-logo"><img src="/logo/${shop.slug}?v=${shop.logo_file.slice(0, 8)}" alt="" width="40" height="40"></span>`;
  const initial = String(shop?.name || 'P').trim().charAt(0).toUpperCase() || 'P';
  return html`<span class="${cls}" aria-hidden="true">${initial}</span>`;
}

export function shopHeader(res, active) {
  const shop = res.locals.shop;
  return html`<header class="app-header sh-header">
    <div class="container header-row">
      <a class="sh-brand" href="/shop" aria-label="${shop?.name || 'Brighton Print'} – orders">
        ${shopAvatar(shop)}
        <span class="sh-brand-text"><b>${shop?.name || 'Brighton Print'}</b><small>Brighton Print</small></span>
      </a>
      <nav class="app-nav sh-nav" aria-label="Shop">
        ${SHOP_NAV.map((n) => html`<a href="${n.href}" class="nav-item${navKey(active) === n.key ? ' is-active' : ''}"${current(active, n.key)}>${shopIcon(n.icon)}<span>${n.label}</span>${srCount(res, n.key)}${badgeFor(res, n.key)}</a>`)}
      </nav>
      <div class="header-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-install hidden aria-label="Install app" title="Install app">${icon('install')}<span class="hide-xs">Install app</span></button>
        ${shop
          ? html`<a class="btn btn-soft btn-sm sh-mypage" href="${orderFormUrl(shop)}" target="_blank" rel="noopener" title="Open the page your customers order from" aria-label="My order page">${icon('eye')}<span class="hide-xs">My order page</span></a>`
          : ''}
      </div>
    </div>
  </header>`;
}

export function shopTabbar(res, active) {
  return html`<nav class="tabbar sh-tabbar" aria-label="Shop sections">
    ${SHOP_NAV.map((n) => html`<a href="${n.href}" class="tab${navKey(active) === n.key ? ' is-active' : ''}"${current(active, n.key)}>${shopIcon(n.icon)}<span>${n.short || n.label}</span>${srCount(res, n.key)}${badgeFor(res, n.key)}</a>`)}
  </nav>`;
}

/** Banners under the header: plan / demo status, then an unread important announcement from us. */
export function shopStateBanner(res) {
  return html`${planBanner(res)}${announcementBanner(res)}`;
}

/** Plan / demo status banner shown on every shop page (only when something needs doing). */
function planBanner(res) {
  const shop = res.locals.shop;
  if (!shop || (shop.is_demo && shop.slug === config.demo.slug)) return '';
  const state = shopState(shop);
  const left = daysLeft(shop);
  const banner = (tone, text, cta = 'Choose a plan', href = '/shop/billing') =>
    html`<div class="sh-banner sh-banner-${tone}" role="${tone === 'danger' ? 'alert' : 'status'}">
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
    if (state === 'expired') return banner('danger', html`<b>Your demo has ended.</b> Register your shop to take real orders.`, 'Register shop', '/register');
    return banner('info', html`<b>Free demo · ${remaining}.</b> Everything works – orders here are for testing.`, 'Go live', '/shop/billing');
  }
  if (state === 'pending') return banner('info', html`<b>One step left:</b> choose a plan and your order link opens right away.`);
  if (state === 'expired') return banner('danger', html`<b>Your plan ended on ${formatDate(shop.paid_until)}.</b> Customers can't order until you renew.`, 'Renew now');
  if (state === 'paused') return banner('danger', html`<b>Your account is paused.</b> Customers can't order right now.`, 'Contact us', '/shop/support');
  if (left != null && left <= 7) return banner('warn', html`<b>Plan ends ${left === 0 ? 'today' : `in ${left} day${left === 1 ? '' : 's'}`}</b> (${formatDate(shop.paid_until)}). Renew to avoid a break.`, 'Renew');
  return '';
}
