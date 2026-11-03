import { html, raw } from '../../lib/html.js';
import { csrfField, icon, logoMark } from '../components.js';
import { adminIcon } from '../admin/common.js';

// Super-admin chrome. Nav keys for render({active}): overview | shops | payments | tickets | notifications | plans.
// res.locals.adminUnread = unread admin notifications, res.locals.openTickets = open tickets.

export const ADMIN_NAV = [
  { key: 'overview', href: '/admin', label: 'Overview', icon: 'home' },
  { key: 'shops', href: '/admin/shops', label: 'Shops', icon: 'store' },
  { key: 'payments', href: '/admin/payments', label: 'Payments', icon: 'rupee', admin: true },
  { key: 'tickets', href: '/admin/tickets', label: 'Support', icon: 'chat', admin: true },
  { key: 'demos', href: '/admin/demo-links', label: 'Demo links', icon: 'link' },
  { key: 'plans', href: '/admin/plans', label: 'Plans', icon: 'tag', admin: true },
];

const navIcon = (n) => (n.admin ? adminIcon(n.icon) : icon(n.icon));
const current = (active, key) => (active === key ? raw(' aria-current="page"') : '');
const ticketBadge = (res, n) => (n.key === 'tickets' && res.locals.openTickets ? html`<span class="badge">${res.locals.openTickets}</span>` : '');

export function adminHeader(res, active) {
  const loggedIn = res.locals.isAdmin;
  const unread = res.locals.adminUnread || 0;
  return html`<header class="app-header app-header-admin">
    <div class="container header-row">
      <a class="brand" href="/admin" aria-label="Brighton Print admin overview">${logoMark(30)}<span class="brand-name">Brighton <b>Print</b></span><span class="admin-tag">Admin</span></a>
      ${loggedIn
        ? html`<nav class="app-nav adm-nav" aria-label="Admin">
            ${ADMIN_NAV.map((n) => html`<a href="${n.href}" class="nav-item${active === n.key ? ' is-active' : ''}"${current(active, n.key)}>${navIcon(n)}<span>${n.label}</span>${ticketBadge(res, n)}</a>`)}
          </nav>
          <div class="header-actions">
            <a class="btn btn-ghost btn-icon adm-bell${active === 'notifications' ? ' is-active' : ''}" href="/admin/notifications" aria-label="Notifications${unread ? ` (${unread} new)` : ''}"${current(active, 'notifications')}>${icon('bell')}${unread ? html`<span class="badge">${unread > 99 ? '99+' : unread}</span>` : ''}</a>
            <form method="post" action="/admin/logout" class="inline-form">${csrfField(res)}<button class="btn btn-ghost btn-sm" type="submit" aria-label="Log out">${icon('logout')}<span class="hide-xs">Log out</span></button></form>
          </div>`
        : ''}
    </div>
  </header>`;
}

/** Mobile bottom bar for the admin (same items). */
export function adminTabbar(res, active) {
  if (!res.locals.isAdmin) return '';
  return html`<nav class="tabbar tabbar-admin" aria-label="Admin sections">
    ${ADMIN_NAV.map((n) => html`<a href="${n.href}" class="tab${active === n.key ? ' is-active' : ''}"${current(active, n.key)}>${navIcon(n)}<span>${n.label}</span>${ticketBadge(res, n)}</a>`)}
  </nav>`;
}
