import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatDate } from '../../lib/util.js';
import { shopState } from '../../services/shops.js';
import { daysLeft, getPlan } from '../../services/billing.js';
import { can, isLifetime } from '../../services/entitlements.js';
import { orderFormUrl } from '../../services/notify.js';
import { csrfField, icon } from '../components.js';
import { announcementBanner } from '../announce.js';

// Shop owner app chrome:
//   desktop (≥1100px)  a fixed dark sidebar – shop, plan status, every section with badges
//   phones / tablets   a slim top bar (menu button opens the same sidebar as a drawer) + bottom tab bar
// Nav keys for render({active}): orders | bills | link | billing | services | notifications | support | settings.
// Badges come from res.locals: ordersTodo, shopUnread (alerts), ticketsUnread (support replies).
// live.js re-renders the sidebar, the top bar and the tab bar; shop.js refreshes the counts by poll.

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
  crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/><path d="M5 19h14"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.4-.4-2.6z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
};

/** icon() plus a few shop-only glyphs. */
export function shopIcon(name, cls = '') {
  if (!EXTRA[name]) return icon(name, cls);
  return raw(
    `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${EXTRA[name]}</svg>`
  );
}

const SECTIONS = [
  {
    label: 'Work',
    items: [
      { key: 'orders', href: '/shop', label: 'Orders', icon: 'orders' },
      { key: 'bills', href: '/shop/bills', label: 'Bills', icon: 'receipt', feature: 'bills' },
      { key: 'link', href: '/shop/link', label: 'Share link', icon: 'share' },
    ],
  },
  {
    label: 'Plan & extras',
    items: [
      { key: 'billing', href: '/shop/billing', label: 'Plan & billing', icon: 'crown' },
      { key: 'services', href: '/shop/services', label: 'Services', icon: 'tool' },
    ],
  },
  {
    label: 'Account',
    items: [
      { key: 'notifications', href: '/shop/notifications', label: 'Alerts', icon: 'bell' },
      { key: 'support', href: '/shop/support', label: 'Help', icon: 'support' },
      { key: 'settings', href: '/shop/settings', label: 'Account', icon: 'user' },
    ],
  },
];
/** Flat list (kept for callers that want every section). */
export const SHOP_NAV = SECTIONS.flatMap((s) => s.items);

const visible = (res, n) => !n.feature || can(res.locals.shop, n.feature);
const current = (active, key) => (active === key ? raw(' aria-current="page"') : '');

/** True when the plan needs the owner (not paid yet, ended, ending within 7 days, or a personal demo). */
export function planNeedsAttention(shop) {
  if (!shop || (shop.is_demo && shop.slug === config.demo.slug)) return false;
  if (shop.is_demo) return true;
  if (isLifetime(shop)) return false;
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
  if (key === 'billing' && planNeedsAttention(l.shop)) return html`<span class="badge-dot" title="Plan needs attention"></span>`;
  return '';
}

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

/** Plan status chip in the sidebar: what plan, how long, and a nudge when it needs the owner. */
function planChip(shop) {
  if (!shop) return '';
  const sample = shop.is_demo && shop.slug === config.demo.slug;
  const state = shopState(shop);
  const plan = getPlan(shop.plan);
  let tone = 'ok';
  let main;
  let sub;
  if (sample) [main, sub, tone] = ['Sample shop', 'Resets every few hours', 'info'];
  else if (shop.is_demo) {
    const left = daysLeft(shop);
    [main, sub, tone] = ['Free demo', state === 'expired' ? 'Ended – go live' : `${Math.max(0, (left ?? 0) + 1)} days left · Go live`, state === 'expired' ? 'danger' : 'info'];
  } else if (state === 'pending') [main, sub, tone] = ['No plan yet', 'Choose a plan to start', 'warn'];
  else if (state === 'expired') [main, sub, tone] = [`${plan?.name || 'Plan'} ended`, 'Renew to switch back on', 'danger'];
  else if (state === 'paused') [main, sub, tone] = ['Account paused', 'Contact us', 'danger'];
  else if (isLifetime(shop)) [main, sub] = [`${plan?.name || 'Plan'} · Lifetime`, shop.care_until && shop.care_until >= new Date().toISOString().slice(0, 10) ? `Updates till ${formatDate(shop.care_until)}` : 'Updates & Support ended'];
  else {
    const left = daysLeft(shop);
    [main, sub, tone] = [`${plan?.name || 'Plan'} · ${shop.billing_cycle === 'yearly' ? 'Yearly' : 'Monthly'}`, left <= 0 ? 'Ends today – renew' : `${left} day${left === 1 ? '' : 's'} left`, left <= 7 ? 'warn' : 'ok'];
  }
  return html`<a class="side-plan is-${tone}" href="/shop/billing">${shopIcon('crown')}<span><b>${main}</b><small>${sub}</small></span>${shopIcon('chevronRight', 'side-plan-go')}</a>`;
}

function navLink(res, n, active) {
  return html`<a href="${n.href}" class="side-link${active === n.key ? ' is-active' : ''}"${current(active, n.key)}>${shopIcon(n.icon)}<span class="side-link-text">${n.label}</span>${srCount(res, n.key)}${badgeFor(res, n.key)}</a>`;
}

/** The sidebar (desktop) / drawer (phones). */
export function shopSidebar(res, active) {
  const shop = res.locals.shop;
  return html`<aside class="app-side sh-side" id="app-side" aria-label="Shop menu" data-side>
    <div class="side-head">
      <a class="side-brand" href="/shop" aria-label="${shop?.name || 'Brighton Print'} – orders">
        ${shopAvatar(shop, 'sh-avatar side-avatar')}
        <span class="side-brand-text"><b>${shop?.name || 'Brighton Print'}</b><small>Brighton Print</small></span>
      </a>
      <button type="button" class="side-close" data-side-close aria-label="Close menu">${icon('x')}</button>
    </div>
    ${planChip(shop)}
    <nav class="side-nav" aria-label="Shop">
      ${SECTIONS.map((s) => {
        const items = s.items.filter((n) => visible(res, n));
        return items.length ? html`<p class="side-label">${s.label}</p>${items.map((n) => navLink(res, n, active))}` : '';
      })}
    </nav>
    <div class="side-foot">
      ${shop ? html`<a class="btn btn-soft btn-sm btn-block side-mypage" href="${orderFormUrl(shop)}" target="_blank" rel="noopener">${icon('eye')}<span>My order page</span></a>` : ''}
      <button type="button" class="btn btn-ghost btn-sm btn-block side-install" data-install hidden>${icon('install')}<span>Install app</span></button>
      <form method="post" action="/logout" class="side-logout">${csrfField(res)}<button type="submit" class="side-link">${icon('logout')}<span class="side-link-text">Log out</span></button></form>
    </div>
  </aside>`;
}

/** Slim top bar for phones and tablets (menu button + shop + my page). Hidden next to the desktop sidebar. */
export function shopHeader(res, active) {
  const shop = res.locals.shop;
  const total = (res.locals.shopUnread || 0) + (res.locals.ticketsUnread || 0);
  return html`<header class="app-header app-top sh-top">
    <div class="app-top-row">
      <button type="button" class="top-menu" data-side-open aria-controls="app-side" aria-expanded="false" aria-label="Open menu">${icon('menu')}${total ? html`<span class="badge-dot" aria-hidden="true"></span>` : ''}</button>
      <a class="top-brand" href="/shop">${shopAvatar(shop, 'sh-avatar top-avatar')}<span class="top-brand-text">${shop?.name || 'Brighton Print'}</span></a>
      ${shop ? html`<a class="btn btn-soft btn-sm btn-icon top-mypage" href="${orderFormUrl(shop)}" target="_blank" rel="noopener" aria-label="My order page" title="Open the page your customers order from">${icon('eye')}</a>` : ''}
    </div>
  </header>`;
}

/** Bottom tab bar (phones): the daily sections + "Menu" (the drawer). */
export function shopTabbar(res, active) {
  const tabs = [
    { key: 'orders', href: '/shop', label: 'Orders', icon: 'orders' },
    can(res.locals.shop, 'bills') ? { key: 'bills', href: '/shop/bills', label: 'Bills', icon: 'receipt' } : { key: 'link', href: '/shop/link', label: 'Share', icon: 'share' },
    { key: 'notifications', href: '/shop/notifications', label: 'Alerts', icon: 'bell' },
    { key: 'support', href: '/shop/support', label: 'Help', icon: 'support' },
  ];
  const inMenu = !tabs.some((t) => t.key === active);
  return html`<nav class="tabbar sh-tabbar" aria-label="Shop sections">
    ${tabs.map((n) => html`<a href="${n.href}" class="tab${active === n.key ? ' is-active' : ''}"${current(active, n.key)}>${shopIcon(n.icon)}<span>${n.label}</span>${srCount(res, n.key)}${badgeFor(res, n.key)}</a>`)}
    <button type="button" class="tab${inMenu ? ' is-active' : ''}" data-side-open aria-controls="app-side" aria-expanded="false">${icon('menu')}<span>Menu</span>${planNeedsAttention(res.locals.shop) ? html`<span class="badge-dot" title="Plan needs attention"></span>` : ''}</button>
  </nav>`;
}

/** Banners under the top: plan / demo status, then an unread important announcement from us. */
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
  if (state === 'expired') return banner('danger', html`<b>Your plan ended on ${formatDate(shop.paid_until)}.</b> Customers can't order and paid features are paused until you renew.`, 'Renew now');
  if (state === 'paused') return banner('danger', html`<b>Your account is paused.</b> Customers can't order right now.`, 'Contact us', '/shop/support');
  if (!isLifetime(shop) && left != null && left <= 7) return banner('warn', html`<b>Plan ends ${left === 0 ? 'today' : `in ${left} day${left === 1 ? '' : 's'}`}</b> (${formatDate(shop.paid_until)}). Renew to avoid a break.`, 'Renew');
  return '';
}
