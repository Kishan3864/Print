import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { TABS } from '../../lib/status.js';
import { formatDateTime, timeAgo } from '../../lib/util.js';
import { icon, statusPill, emptyState } from '../components.js';
import { jobLine, plural, orderPath } from './common.js';

const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: config.timeZone, hour: 'numeric', hourCycle: 'h23' });
const dayFmt = new Intl.DateTimeFormat('en-IN', { timeZone: config.timeZone, weekday: 'long', day: 'numeric', month: 'long' });

function greeting() {
  const h = Number(hourFmt.format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// Orders that need the shop's attention get a coloured edge in the list.
const ATTENTION = new Set(['new', 'changes_requested']);

const TAB_EMPTY = {
  active: ['No active orders', 'New orders from your link land here. Delivered and cancelled orders move to their own tabs.'],
  new: ['No new orders waiting', 'Fresh customer orders show here first, until you send a proof or start printing.'],
  proof_sent: ['No proofs waiting', 'Orders where you sent a proof and the customer has not replied yet show here.'],
  changes_requested: ['No change requests', 'When a customer asks for changes to a proof, the order shows here.'],
  approved: ['Nothing approved yet', 'Orders where the customer approved your proof show here, ready to print.'],
  printing: ['Nothing printing right now', 'Orders you start printing show here until you mark them ready.'],
  ready: ['Nothing waiting for pickup', 'Finished orders show here until the customer collects them.'],
  delivered: ['No delivered orders yet', 'Completed orders are kept here for your records.'],
  cancelled: ['No cancelled orders', 'Cancelled orders show here. You can reopen them any time.'],
  all: ['No orders yet', 'Every order from your link shows here.'],
};

/** /shop?tab=…&q=…&page=… with defaults left out. */
function listUrl({ tab = 'active', q = '', page = 1 } = {}) {
  const p = new URLSearchParams();
  if (tab && tab !== 'active') p.set('tab', tab);
  if (q) p.set('q', q);
  if (page > 1) p.set('page', String(page));
  const s = p.toString();
  return s ? `/shop?${s}` : '/shop';
}

function statCard({ key, label, value, sub, cls, ic, tab, current }) {
  return html`<div class="card stat-card ${cls} ord-stat${current ? ' is-current' : ''}">
    <div class="stat-label"><span class="ord-stat-icon">${icon(ic)}</span><a class="stretched" href="${listUrl({ tab })}"${current ? raw(' aria-current="true"') : ''}>${label}</a></div>
    <div class="stat-value" data-stat="${key}">${value}</div>
    <div class="stat-sub">${sub}</div>
  </div>`;
}

function orderRow(o) {
  return html`<li class="order-row ord-row${ATTENTION.has(o.status) ? ` is-attn is-${o.status}` : ''}">
    <a class="stretched ord-row-top" href="${orderPath(o)}"><span class="order-no">#${o.order_no}</span><span class="ord-row-name">${o.customer_name}</span></a>
    <div class="ord-row-meta">${jobLine(o)} · ${plural(o.file_count, 'file')}</div>
    <div class="ord-row-status">${statusPill(o.status)}${o.is_sample ? html`<span class="pill pill-sample">Sample</span>` : ''}</div>
    <time class="ord-row-time" datetime="${o.created_at}" title="${formatDateTime(o.created_at)}" data-ago>${timeAgo(o.created_at)}</time>
  </li>`;
}

function welcome(shop, formUrl) {
  return html`<div class="ord-welcome">
    <div class="empty-art" aria-hidden="true"><span></span><span></span><span></span></div>
    <h3>No orders yet – your link is ready</h3>
    <p>Share it on WhatsApp and Instagram, or print the QR code for your counter. Every order lands here with its own number.</p>
    <div class="copy-field">
      <label class="sr-only" for="welcome-link">Your order link</label>
      <input id="welcome-link" type="text" readonly value="${formUrl}">
      <button class="btn btn-primary" type="button" data-copy-target="#welcome-link" data-copy-msg="Order link copied">${icon('copy')}<span>Copy</span></button>
    </div>
    <div class="btn-row ord-welcome-actions">
      <button type="button" class="btn btn-secondary" data-share data-share-url="${formUrl}" data-share-title="${shop.name}" data-share-text="Send your print files to ${shop.name} here:">${icon('share')}<span>Share link</span></button>
      <a class="btn btn-secondary" href="/shop/link">${icon('qr')}<span>Get QR code</span></a>
      <a class="btn btn-ghost" href="${formUrl}" target="_blank" rel="noopener">${icon('eye')}<span>Try the order form</span></a>
    </div>
    <ol class="ord-howto">
      <li><span class="ord-howto-n">1</span><span>Share your order link with customers</span></li>
      <li><span class="ord-howto-n">2</span><span>They upload files and choose size and copies</span></li>
      <li><span class="ord-howto-n">3</span><span>You get order <b class="order-no">#${shop.next_order_no}</b> here, with an alert</span></li>
    </ol>
  </div>`;
}

/**
 * Dashboard body.
 * @param d.shop, d.counts (shopCounts), d.tabCounts, d.list ({rows,total}), d.tab, d.q, d.page, d.pageSize, d.latestId, d.formUrl
 */
export function dashboardView(d) {
  const { shop, counts, list, tab, q, page, pageSize, latestId, formUrl } = d;
  const tabDef = TABS.find((t) => t.key === tab) || TABS[0];
  const firstName = String(shop.owner_name || '').trim().split(/\s+/)[0];
  const offset = (page - 1) * pageSize;

  const stats = [
    { key: 'newToday', label: 'New today', value: counts.newToday || 0, sub: html`<b data-stat="new">${counts.new || 0}</b> waiting to start`, cls: 'stat-cyan', ic: 'bell', tab: 'new' },
    { key: 'proof_sent', label: 'Waiting for approval', value: counts.proof_sent || 0, sub: 'Proof sent to customer', cls: 'stat-magenta', ic: 'eye', tab: 'proof_sent' },
    { key: 'printing', label: 'Printing', value: counts.printing || 0, sub: 'On the machine', cls: 'stat-yellow', ic: 'printer', tab: 'printing' },
    { key: 'ready', label: 'Ready', value: counts.ready || 0, sub: 'Waiting for pickup', cls: 'stat-green', ic: 'check', tab: 'ready' },
  ];

  const tabs = TABS.map((t) => {
    const on = t.key === tabDef.key;
    return html`<a href="${listUrl({ tab: t.key, q })}"${on ? raw(' class="is-active" aria-current="page"') : ''}>${t.label}<span class="count">${d.tabCounts[t.key] || 0}</span></a>`;
  });

  let listBody;
  if (list.rows.length) {
    listBody = html`<ul class="order-list ord-list">${list.rows.map(orderRow)}</ul>`;
  } else if (!counts.total && !q) {
    listBody = welcome(shop, formUrl);
  } else if (q) {
    listBody = emptyState({
      title: `No orders match “${q}”`,
      text: 'Try a customer name, the last digits of a mobile number or an order number like 1005.',
      action: html`<div class="btn-row ord-empty-actions">
        <a class="btn btn-secondary btn-sm" href="${listUrl({ tab: tabDef.key })}">Clear search</a>
        ${tabDef.key !== 'all' ? html`<a class="btn btn-ghost btn-sm" href="${listUrl({ tab: 'all', q })}">Search all orders</a>` : ''}
      </div>`,
    });
  } else {
    const [title, text] = TAB_EMPTY[tabDef.key] || TAB_EMPTY.all;
    listBody = emptyState({
      title,
      text,
      action: tabDef.key !== 'all' ? html`<a class="btn btn-secondary btn-sm" href="${listUrl({ tab: 'all' })}">See all orders</a>` : '',
    });
  }

  const to = offset + list.rows.length;
  const pager =
    list.total > pageSize || page > 1
      ? html`<nav class="ord-pager" aria-label="Pages">
          <span>${list.rows.length ? `Showing ${offset + 1}–${to} of ${list.total}` : `${list.total} orders`}</span>
          <div class="btn-row">
            ${page > 1 ? html`<a class="btn btn-secondary btn-sm" href="${listUrl({ tab: tabDef.key, q, page: page - 1 })}" rel="prev">${icon('arrowLeft')}<span>Newer</span></a>` : ''}
            ${to < list.total ? html`<a class="btn btn-secondary btn-sm" href="${listUrl({ tab: tabDef.key, q, page: page + 1 })}" rel="next"><span>Older</span>${icon('arrowRight')}</a>` : ''}
          </div>
        </nav>`
      : '';

  return html`<section class="container ord-dash" data-orders-live data-shop-id="${shop.id}" data-latest-order-id="${latestId}">
    <header class="ord-hero">
      <div class="ord-hero-text">
        <p class="eyebrow">${dayFmt.format(new Date())}</p>
        <h1>${greeting()}${firstName ? `, ${firstName}` : ''}</h1>
        <p class="ord-hero-sub">${counts.newToday
          ? html`<b>${plural(counts.newToday, 'new order')}</b> today at ${shop.name}.`
          : counts.total
            ? html`No new orders yet today at ${shop.name}.`
            : html`Welcome to PrintDesk. Share your link to get your first order.`}</p>
      </div>
      <div class="ord-hero-actions">
        <button type="button" class="btn btn-secondary" data-copy="${formUrl}" data-copy-msg="Order link copied">${icon('copy')}<span>Copy <span class="hide-xs">order </span>link</span></button>
        <a class="btn btn-primary" href="${formUrl}" target="_blank" rel="noopener">${icon('link')}<span>Open <span class="hide-xs">order </span>form</span></a>
      </div>
    </header>

    <div class="grid-4 ord-stats">${stats.map((s) => statCard({ ...s, current: s.tab === tabDef.key }))}</div>

    ${counts.changes_requested
      ? html`<a class="ord-attn" href="${listUrl({ tab: 'changes_requested' })}">${icon('refresh')}<span><b>${plural(counts.changes_requested, 'customer')}</b> asked for changes – send a new proof.</span>${icon('arrowRight')}</a>`
      : ''}

    <section class="card ord-list-card" aria-labelledby="orders-h">
      <a class="ord-newbar" href="/shop" data-new-bar hidden>
        <span class="ord-newbar-dot" aria-hidden="true"></span>
        <span data-new-bar-text>New orders</span>
        <span class="ord-newbar-cta">Refresh ${icon('refresh')}</span>
      </a>
      <h2 id="orders-h" class="sr-only">Orders</h2>
      <div class="ord-toolbar"${counts.total || q ? '' : raw(' hidden')}>
        <nav class="tabs ord-tabs" aria-label="Filter orders by status">${tabs}</nav>
        <form class="search-form ord-search" method="get" action="/shop" role="search">
          ${tabDef.key !== 'active' ? html`<input type="hidden" name="tab" value="${tabDef.key}">` : ''}
          <div class="search-input">
            ${icon('search')}
            <label class="sr-only" for="order-q">Search orders</label>
            <input type="search" id="order-q" name="q" value="${q}" placeholder="Name, mobile or order no." maxlength="60" autocomplete="off" enterkeyhint="search">
          </div>
          <button class="btn btn-secondary" type="submit" aria-label="Search">${icon('arrowRight')}<span class="hide-xs">Search</span></button>
        </form>
      </div>
      ${q
        ? html`<p class="ord-results">${plural(list.total, 'result')} for “<b>${q}</b>” in ${tabDef.label} · <a href="${listUrl({ tab: tabDef.key })}">Clear</a>${tabDef.key !== 'all'
            ? html` · <a href="${listUrl({ tab: 'all', q })}">Search all</a>`
            : ''}</p>`
        : ''}
      ${listBody}
      ${pager}
    </section>
  </section>`;
}
