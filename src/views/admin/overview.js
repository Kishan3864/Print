import { html } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatBytes, formatDate, timeAgo } from '../../lib/util.js';
import { categoryLabel } from '../../services/support.js';
import { CYCLES, formatINR } from '../../services/billing.js';
import { icon, shopStatePill } from '../components.js';
import { adminIcon, demoTag, listHref, num, paidInfo, planName, plural, shopAvatar, toneClass } from './common.js';

// /admin – the super-admin dashboard: money, subscriptions, attention lists.

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hourCycle: 'h23', timeZone: config.timeZone }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** One KPI tile. A link when `href` is given (the whole tile is the tap target). */
function kpi({ label, value, sub = '', ic, tone = '', href = '', big = false }) {
  const inner = html`<span class="adm-kpi-top"><span class="adm-kpi-label">${label}</span><span class="adm-kpi-ic">${ic}</span></span>
    <span class="adm-kpi-value">${value}</span>
    ${sub ? html`<span class="adm-kpi-sub">${sub}</span>` : ''}`;
  const cls = `adm-kpi${tone ? ' is-' + tone : ''}${big ? ' adm-kpi-big' : ''}`;
  return href ? html`<a class="${cls} is-link" href="${href}">${inner}</a>` : html`<div class="${cls}">${inner}</div>`;
}

function revenueTile(rev) {
  return html`<a class="adm-kpi adm-kpi-revenue is-link" href="/admin/payments">
    <span class="adm-kpi-top"><span class="adm-kpi-label">Revenue this month</span><span class="adm-kpi-ic">${adminIcon('rupee')}</span></span>
    <span class="adm-rev">
      <span class="adm-rev-main"><span class="adm-kpi-value">${formatINR(rev.monthRupees)}</span><span class="adm-kpi-sub">${plural(rev.monthCount, 'payment')} this month</span></span>
      <span class="adm-rev-total"><span class="adm-rev-label">All time</span><b>${formatINR(rev.totalRupees)}</b><span class="adm-kpi-sub">${plural(rev.totalCount, 'payment')}</span></span>
    </span>
  </a>`;
}

function kpiGrid({ rev, overview, demoActive, openTickets }) {
  return html`<section class="adm-kpis" aria-label="Key numbers">
    ${revenueTile(rev)}
    ${kpi({ label: 'Active subscriptions', value: num(rev.activeSubscriptions), sub: 'Paying shops taking orders', ic: icon('check'), tone: 'ok', href: listHref({ status: 'active' }) })}
    ${kpi({
      label: 'Open tickets',
      value: num(openTickets),
      sub: openTickets ? 'Waiting for your reply' : 'All answered',
      ic: adminIcon('chat'),
      tone: openTickets ? 'primary' : '',
      href: '/admin/tickets',
    })}
    ${kpi({
      label: 'Expiring in 7 days',
      value: num(rev.expiringSoon),
      sub: rev.expiringSoon ? 'Remind them to renew' : 'Nothing due this week',
      ic: adminIcon('hourglass'),
      tone: rev.expiringSoon ? 'warn' : '',
      href: listHref({ status: 'expiring' }),
    })}
    ${kpi({
      label: 'Expired',
      value: num(rev.expired),
      sub: rev.expired ? 'Order link closed – follow up' : 'None right now',
      ic: icon('alert'),
      tone: rev.expired ? 'danger' : '',
      href: listHref({ status: 'expired' }),
    })}
    ${kpi({
      label: 'Awaiting payment',
      value: num(overview.pending),
      sub: overview.pending ? 'Registered, not paid yet' : 'No one waiting',
      ic: icon('clock'),
      href: listHref({ status: 'pending' }),
    })}
    ${kpi({ label: 'Demo shops active', value: num(demoActive), sub: 'Leads trying PrintDesk', ic: icon('sparkle'), href: listHref({ status: 'demo' }) })}
  </section>`;
}

function usageStrip(o) {
  const item = (label, value, ic) => html`<div class="adm-strip-item"><span class="adm-strip-ic">${ic}</span><span><span class="adm-strip-label">${label}</span><b>${value}</b></span></div>`;
  return html`<section class="adm-strip" aria-label="Platform usage (demo shops not counted)">
    ${item('Orders today', num(o.ordersToday), icon('orders'))}
    ${item('Orders total', num(o.ordersTotal), icon('printer'))}
    ${item('Storage used', formatBytes(o.storage), adminIcon('database'))}
    ${item('Registered shops', num(o.totalShops), icon('store'))}
  </section>`;
}

/** Card with a header, a list of rows and an optional "view all" link. */
function panel({ id, title, count = null, href = '', hrefLabel = 'View all', rows, empty }) {
  return html`<section class="card adm-panel" aria-labelledby="${id}">
    <div class="adm-panel-head">
      <h2 id="${id}">${title}${count != null ? html` <span class="count">${num(count)}</span>` : ''}</h2>
      ${href ? html`<a class="adm-panel-link" href="${href}">${hrefLabel}${adminIcon('chevron')}</a>` : ''}
    </div>
    ${rows.length ? html`<ul class="adm-list">${rows}</ul>` : html`<p class="adm-panel-empty">${icon('check')}<span>${empty}</span></p>`}
  </section>`;
}

const row = ({ href, lead, title, sub, side }) =>
  html`<li><a class="adm-item" href="${href}">${lead}<span class="adm-item-main"><span class="adm-item-title">${title}</span><span class="adm-item-sub">${sub}</span></span><span class="adm-item-side">${side}</span></a></li>`;

function expiringPanel(shops, today) {
  return panel({
    id: 'p-expiring',
    title: 'Expiring soon',
    count: shops.length,
    href: listHref({ status: 'expiring' }),
    rows: shops.slice(0, 6).map((s) => {
      const info = paidInfo(s, today);
      return row({
        href: `/admin/shops/${s.id}`,
        lead: shopAvatar(s, 34),
        title: s.name,
        sub: `${planName(s.plan) || 'Plan'} · ends ${formatDate(s.paid_until)}`,
        side: html`<span class="${toneClass(info.tone)}">${info.text}</span>`,
      });
    }),
    empty: 'No plans end in the next 7 days.',
  });
}

function paymentsPanel(payments) {
  return panel({
    id: 'p-payments',
    title: 'Recent payments',
    href: '/admin/payments',
    rows: payments.map((p) =>
      row({
        href: `/admin/shops/${p.shop_id}`,
        lead: html`<span class="adm-item-ic is-ok">${adminIcon('rupee')}</span>`,
        title: p.shop_name,
        sub: `${planName(p.plan) || p.plan} · ${CYCLES[p.cycle] || p.cycle} · ${p.method === 'manual' ? 'Manual' : 'Razorpay'}`,
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
        lead: shopAvatar(s, 34),
        title: html`<span class="adm-item-text">${s.name}</span>${s.is_demo ? demoTag(s) : ''}`,
        sub: `${s.city || 'No city'} · ${timeAgo(s.created_at)}`,
        side: shopStatePill(s.state),
      })
    ),
    empty: 'No sign-ups yet.',
  });
}

function ticketsPanel(tickets, total) {
  return panel({
    id: 'p-tickets',
    title: 'Open tickets',
    count: total,
    href: '/admin/tickets',
    rows: tickets.map((t) =>
      row({
        href: `/admin/tickets/${t.id}`,
        lead: html`<span class="adm-item-ic${t.admin_unread ? ' is-new' : ''}">${adminIcon('chat')}</span>`,
        title: html`${t.admin_unread ? html`<span class="adm-dot" title="New message"></span><span class="sr-only">New message: </span>` : ''}<span class="adm-item-text">${t.subject}</span>`,
        sub: `${t.shop_name} · ${categoryLabel(t.category)}`,
        side: html`<span class="adm-sub">${timeAgo(t.updated_at)}</span>`,
      })
    ),
    empty: 'No open tickets. Everyone has an answer.',
  });
}

export function overviewView(res, { rev, overview, demoActive, openTickets, expiring, payments, signups, tickets, today }) {
  return html`<div class="container adm">
    <div class="adm-pagehead">
      <div>
        <p class="adm-kicker">${greeting()} · ${formatDate(today)}</p>
        <h1>Overview</h1>
      </div>
      <div class="adm-pagehead-actions">
        <a class="btn btn-secondary" href="/admin/notify">${adminIcon('megaphone')}<span>Announcement</span></a>
        <a class="btn btn-primary" href="/admin/shops">${icon('store')}<span>All shops</span></a>
      </div>
    </div>

    ${kpiGrid({ rev, overview, demoActive, openTickets })}
    ${usageStrip(overview)}

    <div class="adm-panels">
      <div class="adm-panels-col">
        ${expiringPanel(expiring, today)}
        ${paymentsPanel(payments)}
      </div>
      <div class="adm-panels-col">
        ${ticketsPanel(tickets, openTickets)}
        ${signupsPanel(signups)}
      </div>
    </div>
  </div>`;
}
