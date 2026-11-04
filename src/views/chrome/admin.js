import { html, raw } from '../../lib/html.js';
import { csrfField, icon, logoMark } from '../components.js';
import { adminIcon, countBadge, pendingShopCount } from '../admin/common.js';

// Super-admin chrome. Nav keys for render({active}): overview | shops | payments | tickets | demos | plans | notifications.
// Badges are rendered on the server (live.js swaps <header> and .tabbar, so they stay fresh):
//   res.locals.adminUnread = unread notifications, res.locals.openTickets = open tickets,
//   pendingShopCount(res)  = live shops that registered but have not paid yet.

export const ADMIN_NAV = [
  { key: 'overview', href: '/admin', label: 'Overview', short: 'Home', icon: 'home', tab: true },
  { key: 'shops', href: '/admin/shops', label: 'Shops', icon: 'store', tab: true },
  { key: 'payments', href: '/admin/payments', label: 'Payments', icon: 'rupee', admin: true, tab: true },
  { key: 'tickets', href: '/admin/tickets', label: 'Support', icon: 'chat', admin: true, tab: true },
  { key: 'demos', href: '/admin/demo-links', label: 'Demo links', icon: 'link' },
  { key: 'plans', href: '/admin/plans', label: 'Plans', icon: 'tag', admin: true },
];

const navIcon = (n) => (n.admin ? adminIcon(n.icon) : icon(n.icon));
const current = (active, key) => (active === key ? raw(' aria-current="page"') : '');

function badgeFor(res, key) {
  if (key === 'tickets') return countBadge(res.locals.openTickets || 0, 'Open tickets');
  if (key === 'shops') return countBadge(pendingShopCount(res), 'Shops awaiting payment');
  if (key === 'notifications') return countBadge(res.locals.adminUnread || 0, 'New notifications');
  return '';
}

export function adminHeader(res, active) {
  const loggedIn = res.locals.isAdmin;
  const unread = res.locals.adminUnread || 0;
  return html`<header class="app-header app-header-admin">
    <div class="container header-row">
      <a class="brand" href="/admin" aria-label="Brighton Print admin overview">${logoMark(32)}<span class="brand-name">Brighton <b>Print</b></span><span class="admin-tag">Admin</span></a>
      ${loggedIn
        ? html`<nav class="app-nav adm-nav" aria-label="Admin">
            ${ADMIN_NAV.map((n) => html`<a href="${n.href}" class="nav-item${active === n.key ? ' is-active' : ''}"${current(active, n.key)}>${navIcon(n)}<span>${n.label}</span>${badgeFor(res, n.key)}</a>`)}
          </nav>
          <div class="header-actions">
            <a class="btn btn-ghost btn-icon adm-bell hide-mobile${active === 'notifications' ? ' is-active' : ''}" href="/admin/notifications" aria-label="Notifications${unread ? ` (${unread} new)` : ''}"${current(active, 'notifications')}>${icon('bell')}${badgeFor(res, 'notifications')}</a>
            <form method="post" action="/admin/logout" class="inline-form">${csrfField(res)}<button class="btn btn-ghost btn-sm" type="submit" aria-label="Log out">${icon('logout')}<span class="hide-xs">Log out</span></button></form>
          </div>`
        : ''}
    </div>
  </header>`;
}

/** Mobile bottom bar: the four main sections + alerts. Demo links and Plans open from Overview / Payments. */
export function adminTabbar(res, active) {
  if (!res.locals.isAdmin) return '';
  const tabs = [...ADMIN_NAV.filter((n) => n.tab), { key: 'notifications', href: '/admin/notifications', label: 'Alerts', icon: 'bell' }];
  return html`<nav class="tabbar tabbar-admin" aria-label="Admin sections">
    ${tabs.map((n) => html`<a href="${n.href}" class="tab${active === n.key ? ' is-active' : ''}"${current(active, n.key)}>${navIcon(n)}<span>${n.short || n.label}</span>${badgeFor(res, n.key)}</a>`)}
  </nav>`;
}
