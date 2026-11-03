import { html, raw } from '../../lib/html.js';
import { csrfField, icon, logoMark } from '../components.js';

// Super-admin chrome. Nav keys for render({active}): overview | shops | payments | tickets | notifications | plans.
// res.locals.adminUnread = unread admin notifications, res.locals.openTickets = open tickets.

export const ADMIN_NAV = [
  { key: 'overview', href: '/admin', label: 'Overview', icon: 'home' },
  { key: 'shops', href: '/admin/shops', label: 'Shops', icon: 'store' },
  { key: 'payments', href: '/admin/payments', label: 'Payments', icon: 'shield' },
  { key: 'tickets', href: '/admin/tickets', label: 'Support', icon: 'info' },
  { key: 'plans', href: '/admin/plans', label: 'Plans', icon: 'settings' },
];

export function adminHeader(res, active) {
  const loggedIn = res.locals.isAdmin;
  const unread = res.locals.adminUnread || 0;
  return html`<header class="app-header app-header-admin">
    <div class="container header-row">
      <a class="brand" href="/admin">${logoMark(30)}<span class="brand-name">Print<b>Desk</b> <span class="admin-tag">Admin</span></span></a>
      ${loggedIn
        ? html`<nav class="app-nav" aria-label="Admin">
            ${ADMIN_NAV.map(
              (n) =>
                html`<a href="${n.href}" class="nav-item${active === n.key ? ' is-active' : ''}"${active === n.key ? raw(' aria-current="page"') : ''}>${icon(n.icon)}<span>${n.label}</span>${n.key === 'tickets' && res.locals.openTickets ? html`<span class="badge">${res.locals.openTickets}</span>` : ''}</a>`
            )}
          </nav>
          <div class="header-actions">
            <a class="btn btn-ghost btn-sm btn-bell${active === 'notifications' ? ' is-active' : ''}" href="/admin/notifications" aria-label="Notifications${unread ? ` (${unread} new)` : ''}">${icon('bell')}${unread ? html`<span class="badge">${unread}</span>` : ''}</a>
            <form method="post" action="/admin/logout" class="inline-form">${csrfField(res)}<button class="btn btn-ghost btn-sm" type="submit">${icon('logout')}<span class="hide-xs">Log out</span></button></form>
          </div>`
        : ''}
    </div>
  </header>`;
}

/** Mobile bottom bar for the admin (same items). */
export function adminTabbar(res, active) {
  if (!res.locals.isAdmin) return '';
  return html`<nav class="tabbar tabbar-admin" aria-label="Admin sections">
    ${ADMIN_NAV.map((n) => html`<a href="${n.href}" class="tab${active === n.key ? ' is-active' : ''}"${active === n.key ? raw(' aria-current="page"') : ''}>${icon(n.icon)}<span>${n.label}</span></a>`)}
  </nav>`;
}
