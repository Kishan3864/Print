import { html } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatBytes, formatDate, timeAgo } from '../../lib/util.js';
import { CYCLES, formatINR, paymentTitle } from '../../services/billing.js';
import { icon, shopStatePill } from '../components.js';
import { adminIcon, demoTag, listHref, num, paidInfo, planName, plural, shopAvatar, toneClass } from './common.js';

// /admin – the super-admin home: what needs you now, a few numbers, what happened lately.

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hourCycle: 'h23', timeZone: config.timeZone }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

// ---------- needs your action ----------
/** One big tile: the count, what it is, and what to do about it. The whole tile is the link. */
function actionTile({ n, label, todo, done, href, tone, ic }) {
  return html`<a class="adm-act${n ? ` is-${tone}` : ' is-clear'}" href="${href}">
    <span class="adm-act-ic">${n ? ic : icon('check')}</span>
    <span class="adm-act-n">${num(n)}</span>
    <span class="adm-act-label">${label}</span>
    <span class="adm-act-todo">${n ? todo : done}${n ? adminIcon('chevron') : ''}</span>
  </a>`;
}

function actionSection({ openTickets, unreadTickets, pending, expiring, expired }) {
  const total = openTickets + pending + expiring + expired;
  return html`<section class="adm-section" aria-labelledby="adm-act-h">
    <div class="adm-section-head">
      <h2 id="adm-act-h">Needs your action ${total ? html`<span class="badge">${num(total)}</span>` : ''}</h2>
      <p>${total ? 'Tap a tile to see who is waiting.' : 'All clear – nothing is waiting on you right now.'}</p>
    </div>
    <div class="adm-acts">
      ${actionTile({
        n: openTickets,
        label: 'Support tickets',
        todo: unreadTickets ? `${num(unreadTickets)} with a new message – reply` : 'Open – reply to the shop',
        done: 'Every ticket answered',
        href: '/admin/tickets',
        tone: 'danger',
        ic: adminIcon('chat'),
      })}
      ${actionTile({
        n: pending,
        label: 'Awaiting payment',
        todo: 'Registered, not paid – follow up',
        done: 'No one waiting to pay',
        href: listHref({ status: 'pending' }),
        tone: 'orange',
        ic: icon('clock'),
      })}
      ${actionTile({
        n: expiring,
        label: 'Plan ends in 7 days',
        todo: 'Remind them to renew',
        done: 'Nothing ends this week',
        href: listHref({ status: 'expiring' }),
        tone: 'warn',
        ic: adminIcon('hourglass'),
      })}
      ${actionTile({
        n: expired,
        label: 'Plan ended',
        todo: 'Order link closed – call them',
        done: 'No expired plans',
        href: listHref({ status: 'expired' }),
        tone: 'danger',
        ic: icon('alert'),
      })}
    </div>
  </section>`;
}

// ---------- at a glance ----------
function stat({ label, value, sub, href, ic }) {
  return html`<a class="adm-stat" href="${href}">
    <span class="adm-stat-ic">${ic}</span>
    <span class="adm-stat-text"><span class="adm-stat-label">${label}</span><b class="adm-stat-value">${value}</b>${sub ? html`<span class="adm-stat-sub">${sub}</span>` : ''}</span>
  </a>`;
}

function glance({ rev, overview, demoActive }) {
  return html`<section class="adm-section" aria-labelledby="adm-glance-h">
    <div class="adm-section-head"><h2 id="adm-glance-h">At a glance</h2></div>
    <div class="adm-stats">
      ${stat({ label: 'Revenue this month', value: formatINR(rev.monthRupees), sub: `${formatINR(rev.totalRupees)} all time`, href: '/admin/payments', ic: adminIcon('rupee') })}
      ${stat({ label: 'Paying shops', value: num(rev.activeSubscriptions), sub: `${num(overview.totalShops)} registered`, href: listHref({ status: 'active' }), ic: icon('store') })}
      ${stat({ label: 'Orders today', value: num(overview.ordersToday), sub: `${num(overview.ordersTotal)} total · ${formatBytes(overview.storage)} stored`, href: listHref(), ic: icon('orders') })}
      ${stat({ label: 'Demo shops running', value: num(demoActive), sub: 'Leads trying it out', href: listHref({ status: 'demo' }), ic: icon('sparkle') })}
    </div>
  </section>`;
}

// ---------- recent activity ----------
function panel({ id, title, href, hrefLabel = 'See all', rows, empty }) {
  return html`<section class="card adm-panel" aria-labelledby="${id}">
    <div class="adm-panel-head">
      <h3 id="${id}">${title}</h3>
      ${href ? html`<a class="adm-panel-link" href="${href}">${hrefLabel}${adminIcon('chevron')}</a>` : ''}
    </div>
    ${rows.length ? html`<ul class="adm-list">${rows}</ul>` : html`<p class="adm-panel-empty">${icon('check')}<span>${empty}</span></p>`}
  </section>`;
}

const row = ({ href, lead, title, sub, side }) =>
  html`<li><a class="adm-item" href="${href}">${lead}<span class="adm-item-main"><span class="adm-item-title">${title}</span><span class="adm-item-sub">${sub}</span></span><span class="adm-item-side">${side}</span></a></li>`;

function expiringPanel(shops, today) {
  if (!shops.length) return '';
  return panel({
    id: 'p-expiring',
    title: 'Plans ending soon',
    href: listHref({ status: 'expiring' }),
    rows: shops.slice(0, 5).map((s) => {
      const info = paidInfo(s, today);
      return row({
        href: `/admin/shops/${s.id}`,
        lead: shopAvatar(s, 40),
        title: s.name,
        sub: `${planName(s.plan) || 'Plan'} · ends ${formatDate(s.paid_until)}`,
        side: html`<span class="${toneClass(info.tone)}">${info.text}</span>`,
      });
    }),
    empty: '',
  });
}

function ticketsPanel(tickets) {
  if (!tickets.length) return '';
  return panel({
    id: 'p-tickets',
    title: 'Tickets waiting',
    href: '/admin/tickets',
    rows: tickets.map((t) =>
      row({
        href: `/admin/tickets/${t.id}`,
        lead: html`<span class="adm-item-ic${t.admin_unread ? ' is-new' : ''}">${adminIcon('chat')}</span>`,
        title: html`${t.admin_unread ? html`<span class="adm-dot" title="New message"></span><span class="sr-only">New message: </span>` : ''}${t.subject}`,
        sub: t.shop_name,
        side: html`<span class="adm-sub">${timeAgo(t.updated_at)}</span>`,
      })
    ),
    empty: '',
  });
}

function paymentsPanel(payments) {
  return panel({
    id: 'p-payments',
    title: 'Latest payments',
    href: '/admin/payments',
    rows: payments.map((p) =>
      row({
        href: `/admin/shops/${p.shop_id}`,
        lead: html`<span class="adm-item-ic is-ok">${adminIcon('rupee')}</span>`,
        title: p.shop_name,
        sub: `${paymentTitle(p)} · ${p.method === 'manual' ? 'Recorded by you' : 'Online'}`,
        side: html`<b class="adm-amount">${formatINR(p.amount_paise / 100)}</b><span class="adm-sub">${timeAgo(p.paid_at || p.created_at)}</span>`,
      })
    ),
    empty: 'No payments yet. They show up here the moment a shop pays.',
  });
}

function signupsPanel(shops) {
  return panel({
    id: 'p-signups',
    title: 'New sign-ups',
    href: listHref(),
    hrefLabel: 'All shops',
    rows: shops.map((s) =>
      row({
        href: `/admin/shops/${s.id}`,
        lead: shopAvatar(s, 40),
        title: html`${s.name}${s.is_demo ? demoTag(s) : ''}`,
        sub: `${s.city || 'No city'} · ${timeAgo(s.created_at)}`,
        side: shopStatePill(s.state),
      })
    ),
    empty: 'No sign-ups yet.',
  });
}

export function overviewView(res, { rev, overview, demoActive, openTickets, expiring, payments, signups, tickets, today }) {
  const unreadTickets = tickets.filter((t) => t.admin_unread).length;
  const todo = [ticketsPanel(tickets), expiringPanel(expiring, today)].filter(Boolean);
  return html`<div class="container adm">
    <div class="adm-pagehead">
      <div>
        <p class="adm-kicker">${greeting()} · ${formatDate(today)}</p>
        <h1>Overview</h1>
      </div>
      <div class="adm-pagehead-actions">
        <a class="btn btn-secondary" href="/admin/demo-links">${icon('link')}<span>Demo link</span></a>
        <a class="btn btn-secondary" href="/admin/notifications#announce">${adminIcon('megaphone')}<span>Announcement</span></a>
      </div>
    </div>

    ${actionSection({ openTickets, unreadTickets, pending: overview.pending, expiring: rev.expiringSoon, expired: rev.expired })}
    ${todo.length ? html`<div class="adm-panels adm-panels-todo">${todo}</div>` : ''}
    ${glance({ rev, overview, demoActive })}

    <section class="adm-section" aria-labelledby="adm-recent-h">
      <div class="adm-section-head"><h2 id="adm-recent-h">Recent activity</h2></div>
      <div class="adm-panels">
        ${paymentsPanel(payments)}
        ${signupsPanel(signups)}
      </div>
    </section>

    <nav class="adm-quick" aria-label="More admin pages">
      <a href="/admin/demo-links">${icon('link')}<span>Demo links</span>${adminIcon('chevron')}</a>
      <a href="/admin/plans">${adminIcon('tag')}<span>Plans &amp; prices</span>${adminIcon('chevron')}</a>
      <a href="/admin/notifications">${icon('bell')}<span>Notifications</span>${res.locals.adminUnread ? html`<span class="badge">${num(res.locals.adminUnread)}</span>` : ''}${adminIcon('chevron')}</a>
    </nav>
  </div>`;
}
