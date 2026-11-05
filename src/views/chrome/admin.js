import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { csrfField, icon, logoMark } from '../components.js';
import { adminIcon, countBadge, pendingShopCount } from '../admin/common.js';
import { openRequestCount } from '../../services/services.js';

// Super-admin chrome: a fixed dark sidebar on desktop (≥1100px); on phones a slim top bar whose menu
// button opens the same sidebar as a drawer, plus a bottom tab bar for the daily sections.
// Nav keys for render({active}): overview | shops | payments | services | tickets | notifications |
//   plans | legal | demos | audit.
// Badges are rendered on the server (live.js swaps the sidebar, top bar and tab bar):
//   res.locals.adminUnread, res.locals.openTickets, pendingShopCount(res), open service requests.

const SECTIONS = [
  {
    label: 'Run',
    items: [
      { key: 'overview', href: '/admin', label: 'Overview', icon: 'home' },
      { key: 'shops', href: '/admin/shops', label: 'Shops', icon: 'store' },
      { key: 'payments', href: '/admin/payments', label: 'Payments', icon: 'rupee', admin: true },
      { key: 'services', href: '/admin/services', label: 'Service requests', icon: 'note', admin: true },
      { key: 'tickets', href: '/admin/tickets', label: 'Support', icon: 'chat', admin: true },
      { key: 'notifications', href: '/admin/notifications', label: 'Notifications', icon: 'bell' },
    ],
  },
  {
    label: 'Set up',
    items: [
      { key: 'plans', href: '/admin/plans', label: 'Plans & features', icon: 'tag', admin: true },
      { key: 'legal', href: '/admin/legal', label: 'Terms & privacy', icon: 'shield' },
      { key: 'demos', href: '/admin/demo-links', label: 'Demo links', icon: 'link' },
      { key: 'announce', href: '/admin/notifications#announce', label: 'Announcements', icon: 'megaphone', admin: true },
      { key: 'audit', href: '/admin/audit', label: 'Audit log', icon: 'database', admin: true },
    ],
  },
];
export const ADMIN_NAV = SECTIONS.flatMap((s) => s.items);

const navIcon = (n) => (n.admin ? adminIcon(n.icon) : icon(n.icon));
const current = (active, key) => (active === key ? raw(' aria-current="page"') : '');

function badgeFor(res, key) {
  if (key === 'tickets') return countBadge(res.locals.openTickets || 0, 'Open tickets');
  if (key === 'shops') return countBadge(pendingShopCount(res), 'Shops awaiting payment');
  if (key === 'notifications') return countBadge(res.locals.adminUnread || 0, 'New notifications');
  if (key === 'services') return countBadge(res.locals.openRequests ?? openRequestCount(), 'Requests to handle');
  return '';
}

export function adminSidebar(res, active) {
  if (!res.locals.isAdmin) return '';
  const email = config.adminEmail || 'Admin';
  const letter = (Array.from(email.trim())[0] || 'A').toUpperCase();
  return html`<aside class="app-side adm-side" id="app-side" aria-label="Admin menu" data-side>
    <div class="side-head">
      <a class="side-brand adm-side-brand" href="/admin" aria-label="Brighton Print admin – overview">${logoMark(32)}<span class="side-brand-text"><b>Brighton Print</b><small><span class="admin-tag">Admin</span></small></span></a>
      <button type="button" class="side-close" data-side-close aria-label="Close menu">${icon('x')}</button>
    </div>
    <nav class="side-nav" aria-label="Admin">
      ${SECTIONS.map(
        (s) => html`<p class="side-label">${s.label}</p>${s.items.map(
          (n) => html`<a href="${n.href}" class="side-link${active === n.key ? ' is-active' : ''}"${current(active, n.key)}>${navIcon(n)}<span class="side-link-text">${n.label}</span>${badgeFor(res, n.key)}</a>`
        )}`
      )}
    </nav>
    <div class="side-foot">
      <p class="side-who"><span class="side-who-av" aria-hidden="true">${letter}</span><span><b>Brighton Solution</b><small>${email}</small></span></p>
      <a class="side-link" href="${config.baseUrl}/" target="_blank" rel="noopener">${adminIcon('globe')}<span class="side-link-text">Open the public site</span></a>
      <form method="post" action="/admin/logout" class="side-logout">${csrfField(res)}<button class="side-link" type="submit">${adminIcon('logout')}<span class="side-link-text">Log out</span></button></form>
    </div>
  </aside>`;
}

/** Slim top bar for phones / tablets (menu, brand, bell). On the login page: brand only. */
export function adminHeader(res, active) {
  const loggedIn = res.locals.isAdmin;
  const unread = res.locals.adminUnread || 0;
  return html`<header class="app-header app-top adm-top${loggedIn ? '' : ' is-out'}">
    <div class="app-top-row">
      ${loggedIn ? html`<button type="button" class="top-menu" data-side-open aria-controls="app-side" aria-expanded="false" aria-label="Open menu">${icon('menu')}</button>` : ''}
      <a class="top-brand" href="/admin">${logoMark(28)}<span class="top-brand-text">Brighton Print</span><span class="admin-tag">Admin</span></a>
      ${loggedIn
        ? html`<a class="top-bell${active === 'notifications' ? ' is-active' : ''}" href="/admin/notifications" aria-label="Notifications${unread ? ` (${unread} new)` : ''}">${icon('bell')}${badgeFor(res, 'notifications')}</a>`
        : ''}
    </div>
  </header>`;
}

/** Mobile bottom bar: the daily sections + Menu (drawer with everything else). */
export function adminTabbar(res, active) {
  if (!res.locals.isAdmin) return '';
  const tabs = ADMIN_NAV.filter((n) => ['overview', 'shops', 'payments', 'tickets'].includes(n.key));
  const inMenu = !tabs.some((t) => t.key === active);
  const short = { overview: 'Home', tickets: 'Support' };
  return html`<nav class="tabbar tabbar-admin" aria-label="Admin sections">
    ${tabs.map((n) => html`<a href="${n.href}" class="tab${active === n.key ? ' is-active' : ''}"${current(active, n.key)}>${navIcon(n)}<span>${short[n.key] || n.label}</span>${badgeFor(res, n.key)}</a>`)}
    <button type="button" class="tab${inMenu ? ' is-active' : ''}" data-side-open aria-controls="app-side" aria-expanded="false">${icon('menu')}<span>Menu</span></button>
  </nav>`;
}
