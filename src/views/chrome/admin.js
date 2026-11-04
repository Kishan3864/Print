import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { csrfField, icon, logoMark } from '../components.js';
import { adminIcon, countBadge, pendingShopCount } from '../admin/common.js';

// Super-admin chrome. Nav keys for render({active}): overview | shops | payments | tickets | demos | plans | notifications.
// Badges are rendered on the server (live.js swaps <header> and .tabbar, so they stay fresh):
//   res.locals.adminUnread = unread notifications, res.locals.openTickets = open tickets,
//   pendingShopCount(res)  = live shops that registered but have not paid yet.
// Narrow desktops drop the nav icons, then the "Brighton Print" words, so nothing ever overlaps.

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

/** Account menu: who is signed in, shortcuts, log out (a <details> – works without JS). */
function accountMenu(res, active) {
  const email = config.adminEmail || 'Admin';
  const letter = (Array.from(email.trim())[0] || 'A').toUpperCase();
  return html`<details class="adm-acct">
    <summary class="adm-acct-btn" aria-label="Account menu"><span class="adm-acct-av" aria-hidden="true">${letter}</span>${adminIcon('caret')}</summary>
    <div class="adm-acct-menu">
      <p class="adm-acct-who"><span class="adm-acct-av" aria-hidden="true">${letter}</span><span><b>Brighton Solution</b><small>${email}</small></span></p>
      <a class="adm-acct-item${active === 'notifications' ? ' is-active' : ''}" href="/admin/notifications">${icon('bell')}<span>Notifications</span>${badgeFor(res, 'notifications')}</a>
      <a class="adm-acct-item" href="/admin/notifications#announce">${adminIcon('megaphone')}<span>Send announcement</span></a>
      <a class="adm-acct-item" href="/admin/demo-links">${icon('link')}<span>Demo links</span></a>
      <a class="adm-acct-item" href="/admin/plans">${adminIcon('tag')}<span>Plans &amp; prices</span></a>
      <a class="adm-acct-item" href="${config.baseUrl}/" target="_blank" rel="noopener">${adminIcon('globe')}<span>Open the public site</span></a>
      <form method="post" action="/admin/logout" class="adm-acct-out">${csrfField(res)}<button class="adm-acct-item" type="submit">${adminIcon('logout')}<span>Log out</span></button></form>
    </div>
  </details>`;
}

export function adminHeader(res, active) {
  const loggedIn = res.locals.isAdmin;
  const unread = res.locals.adminUnread || 0;
  return html`<header class="app-header app-header-admin">
    <div class="container header-row adm-hrow">
      <a class="brand adm-brand" href="/admin" aria-label="Brighton Print admin – overview">${logoMark(30)}<span class="brand-name adm-brand-name">Brighton <b>Print</b></span><span class="admin-tag">Admin</span></a>
      ${loggedIn
        ? html`<nav class="app-nav adm-nav" aria-label="Admin">
            ${ADMIN_NAV.map((n) => html`<a href="${n.href}" class="nav-item${active === n.key ? ' is-active' : ''}"${current(active, n.key)}>${navIcon(n)}<span>${n.label}</span>${badgeFor(res, n.key)}</a>`)}
          </nav>
          <div class="header-actions adm-hactions">
            <a class="adm-hbtn adm-bell${active === 'notifications' ? ' is-active' : ''}" href="/admin/notifications" aria-label="Notifications${unread ? ` (${unread} new)` : ''}" title="Notifications"${current(active, 'notifications')}>${icon('bell')}${badgeFor(res, 'notifications')}</a>
            ${accountMenu(res, active)}
          </div>`
        : ''}
    </div>
  </header>`;
}

/** Mobile bottom bar: the four main sections + alerts. Demo links and Plans sit in the account menu. */
export function adminTabbar(res, active) {
  if (!res.locals.isAdmin) return '';
  const tabs = [...ADMIN_NAV.filter((n) => n.tab), { key: 'notifications', href: '/admin/notifications', label: 'Alerts', icon: 'bell' }];
  return html`<nav class="tabbar tabbar-admin" aria-label="Admin sections">
    ${tabs.map((n) => html`<a href="${n.href}" class="tab${active === n.key ? ' is-active' : ''}"${current(active, n.key)}>${navIcon(n)}<span>${n.short || n.label}</span>${badgeFor(res, n.key)}</a>`)}
  </nav>`;
}
