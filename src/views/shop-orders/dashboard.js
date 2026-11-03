import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { TABS } from '../../lib/status.js';
import { formatDateTime, timeAgo } from '../../lib/util.js';
import { icon, statusPill } from '../components.js';
import { shopIcon } from '../chrome/shop.js';
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

// Notification kind -> icon + tone.
const UPDATE_ICON = { support: 'support', payment: 'card', warn: 'alert', success: 'check', announcement: 'megaphone', info: 'info' };

/** /shop?tab=…&q=…&page=… with defaults left out. */
function listUrl({ tab = 'active', q = '', page = 1 } = {}) {
  const p = new URLSearchParams();
  if (tab && tab !== 'active') p.set('tab', tab);
  if (q) p.set('q', q);
  if (page > 1) p.set('page', String(page));
  const s = p.toString();
  return s ? `/shop?${s}` : '/shop';
}

const shortUrl = (url) => url.replace(/^https?:\/\//, '');
const initialOf = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';
// Only same-site paths from a notification become links.
const safeLink = (link) => (/^\/(?![/\\])/.test(String(link || '')) ? link : '/shop/notifications');

function kpiTile({ key, label, value, sub, tone, ic, tab, current }) {
  return html`<a class="sh-kpi sh-kpi-${tone}${current ? ' is-current' : ''}" href="${listUrl({ tab })}"${current ? raw(' aria-current="true"') : ''}>
    <span class="sh-kpi-top"><span class="sh-kpi-icon">${shopIcon(ic)}</span><span class="sh-kpi-label">${label}</span></span>
    <span class="sh-kpi-value" data-stat="${key}">${value}</span>
    <span class="sh-kpi-sub">${sub}</span>
  </a>`;
}

function orderRow(o) {
  return html`<li class="sh-row${ATTENTION.has(o.status) ? ` is-attn is-${o.status}` : ''}">
    <a class="sh-row-link" href="${orderPath(o)}">
      <span class="sh-row-avatar" aria-hidden="true">${initialOf(o.customer_name)}</span>
      <span class="sh-row-main">
        <span class="sh-row-line"><span class="sh-row-name">${o.customer_name}</span><span class="order-no sh-row-no">#${o.order_no}</span>${o.is_sample ? html`<span class="sh-row-sample">Sample</span>` : ''}</span>
        <span class="sh-row-meta">${jobLine(o)} · ${plural(o.file_count, 'file')}</span>
      </span>
      <span class="sh-row-side">
        ${statusPill(o.status)}
        <time class="sh-row-time" datetime="${o.created_at}" title="${formatDateTime(o.created_at)}" data-ago>${timeAgo(o.created_at)}</time>
      </span>
      <span class="sh-row-chev" aria-hidden="true">${shopIcon('chevronRight')}</span>
    </a>
  </li>`;
}

/** Empty dashboard (no orders at all yet). */
function firstOrdersEmpty(shop, formUrl) {
  return html`<div class="sh-empty">
    <span class="sh-empty-icon">${shopIcon('inbox')}</span>
    <h3>No orders yet</h3>
    <p>When a customer sends files from your link, the order shows up here with its own number – and you hear an alert.</p>
    <ol class="sh-how">
      <li><span class="sh-how-n">1</span><span>Customer opens your link or scans your QR</span></li>
      <li><span class="sh-how-n">2</span><span>Uploads files, picks size and copies</span></li>
      <li><span class="sh-how-n">3</span><span>You get order <b class="order-no">#${shop.next_order_no}</b> here</span></li>
    </ol>
    <div class="btn-row sh-empty-actions">
      <a class="btn btn-secondary" href="${formUrl}" target="_blank" rel="noopener">${icon('eye')}<span>Try the order form</span></a>
      <a class="btn btn-ghost" href="/shop/link">${icon('qr')}<span>Get your QR code</span></a>
    </div>
  </div>`;
}

/** "Get started" checklist for new shops – state comes from data, nothing to dismiss. */
function startCard(shop, counts, formUrl) {
  const steps = [
    {
      done: Boolean(shop.logo_file),
      title: 'Add your logo and colour',
      text: 'Customers see it on your order page, so they know it is your shop.',
      action: html`<a class="btn btn-sm btn-secondary" href="/shop/settings">${shopIcon('image')}<span>Add logo</span></a>`,
    },
    {
      done: counts.total > 0,
      title: 'Share your order link',
      text: 'Send it on WhatsApp, put it in your Instagram bio and print the QR for your counter.',
      action: html`<button type="button" class="btn btn-sm btn-primary" data-share data-share-url="${formUrl}" data-share-title="${shop.name}" data-share-text="Send your print files to ${shop.name} here:">${icon('share')}<span>Share link</span></button>`,
    },
    {
      done: counts.total > 0,
      title: 'Get your first order',
      text: 'Place a test order yourself to see exactly what your customers see.',
      action: html`<a class="btn btn-sm btn-secondary" href="${formUrl}" target="_blank" rel="noopener">${icon('eye')}<span>Try it</span></a>`,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  return html`<section class="card sh-start" aria-labelledby="sh-start-h">
    <div class="sh-start-head">
      <div>
        <h2 id="sh-start-h">Get started</h2>
        <p>${done} of ${steps.length} done</p>
      </div>
      <span class="sh-meter sh-meter-${done}" aria-hidden="true"><span></span></span>
    </div>
    <ol class="sh-start-list">
      ${steps.map(
        (s, i) => html`<li class="${s.done ? 'is-done' : ''}">
          <span class="sh-start-check" aria-hidden="true">${s.done ? icon('check') : i + 1}</span>
          <div class="sh-start-text"><b>${s.title}</b>${s.done ? html`<span class="sr-only"> (done)</span>` : html`<span>${s.text}</span>`}</div>
          ${s.done ? '' : s.action}
        </li>`
      )}
    </ol>
  </section>`;
}

function updatesCard(updates) {
  return html`<section class="card sh-updates" aria-labelledby="sh-upd-h">
    <div class="sh-side-head"><h2 id="sh-upd-h">${shopIcon('bell')}<span>New for you</span></h2><a href="/shop/notifications">See all</a></div>
    <ul class="sh-upd-list">
      ${updates.map(
        (n) => html`<li>
          <a href="${safeLink(n.link)}" class="sh-upd">
            <span class="sh-upd-icon sh-upd-${UPDATE_ICON[n.kind] ? n.kind : 'info'}">${shopIcon(UPDATE_ICON[n.kind] || 'info')}</span>
            <span class="sh-upd-text"><b>${n.title}</b>${n.body ? html`<span>${n.body}</span>` : ''}</span>
            <time datetime="${n.created_at}" data-ago>${timeAgo(n.created_at)}</time>
          </a>
        </li>`
      )}
    </ul>
  </section>`;
}

function attentionCard(counts) {
  const items = [];
  if (counts.changes_requested)
    items.push(html`<a class="sh-attn-item is-changes" href="${listUrl({ tab: 'changes_requested' })}">
      <span class="sh-attn-n" data-stat="changes_requested">${counts.changes_requested}</span>
      <span class="sh-attn-text"><b>Changes requested</b><span>Customer replied – send a new proof</span></span>
      ${shopIcon('chevronRight')}
    </a>`);
  if (counts.new)
    items.push(html`<a class="sh-attn-item is-new" href="${listUrl({ tab: 'new' })}">
      <span class="sh-attn-n" data-stat="new">${counts.new}</span>
      <span class="sh-attn-text"><b>New, not started</b><span>Check files, then send a proof or print</span></span>
      ${shopIcon('chevronRight')}
    </a>`);
  if (!items.length) {
    if (!counts.total) return '';
    return html`<section class="card sh-calm hide-mobile" aria-label="Needs your attention">
      <span class="sh-calm-icon">${icon('check')}</span>
      <div><b>You are all caught up</b><span>No new orders or change requests waiting.</span></div>
    </section>`;
  }
  return html`<section class="card sh-attn" aria-labelledby="sh-attn-h">
    <div class="sh-side-head"><h2 id="sh-attn-h">${icon('alert')}<span>Needs your attention</span></h2></div>
    <div class="sh-attn-items">${items}</div>
  </section>`;
}

function qrCard(shop, formUrl) {
  return html`<section class="card sh-qr hide-mobile" aria-labelledby="sh-qr-h">
    <div class="sh-qr-body">
      <img src="/shop/qr.svg" alt="QR code for ${shortUrl(formUrl)}" width="96" height="96" loading="lazy">
      <div>
        <h2 id="sh-qr-h">Counter QR</h2>
        <p>Customers scan it to send files – no app needed.</p>
        <a class="btn btn-sm btn-secondary" href="/shop/poster">${icon('printer')}<span>Print poster</span></a>
      </div>
    </div>
  </section>`;
}

/**
 * Dashboard body.
 * @param d.shop, d.counts (shopCounts), d.tabCounts, d.list ({rows,total}), d.tab, d.q, d.page, d.pageSize,
 *        d.latestId, d.formUrl, d.monthCount, d.updates (unread notifications), d.isSample
 */
export function dashboardView(d) {
  const { shop, counts, list, tab, q, page, pageSize, latestId, formUrl } = d;
  const tabDef = TABS.find((t) => t.key === tab) || TABS[0];
  const firstName = String(shop.owner_name || '').trim().split(/\s+/)[0];
  const offset = (page - 1) * pageSize;
  const updates = d.updates || [];
  const showStart = !d.isSample && counts.total < 20 && !(shop.logo_file && counts.total > 0);

  const kpis = [
    { key: 'newToday', label: 'New today', value: counts.newToday || 0, sub: html`<b data-stat="new">${counts.new || 0}</b> not started`, tone: 'new', ic: 'bell', tab: 'new' },
    { key: 'proof_sent', label: 'Waiting approval', value: counts.proof_sent || 0, sub: 'Proof with customer', tone: 'proof', ic: 'eye', tab: 'proof_sent' },
    { key: 'printing', label: 'Printing', value: counts.printing || 0, sub: 'On the machine', tone: 'printing', ic: 'printer', tab: 'printing' },
    { key: 'ready', label: 'Ready', value: counts.ready || 0, sub: 'Waiting for pickup', tone: 'ready', ic: 'store', tab: 'ready' },
  ];

  const tabs = TABS.map((t) => {
    const on = t.key === tabDef.key;
    const n = d.tabCounts[t.key] || 0;
    return html`<a href="${listUrl({ tab: t.key, q })}"${on ? raw(' class="is-active" aria-current="page"') : ''}>${t.label}<span class="count${n ? '' : ' is-zero'}">${n}</span></a>`;
  });

  let listBody;
  if (list.rows.length) {
    listBody = html`<ul class="sh-list">${list.rows.map(orderRow)}</ul>`;
  } else if (!counts.total && !q) {
    listBody = firstOrdersEmpty(shop, formUrl);
  } else if (q) {
    listBody = html`<div class="sh-empty sh-empty-sm">
      <span class="sh-empty-icon">${icon('search')}</span>
      <h3>No orders match “${q}”</h3>
      <p>Try a customer name, the last digits of a mobile number or an order number like ${shop.next_order_no > 1001 ? shop.next_order_no - 1 : 1001}.</p>
      <div class="btn-row sh-empty-actions">
        <a class="btn btn-secondary btn-sm" href="${listUrl({ tab: tabDef.key })}">Clear search</a>
        ${tabDef.key !== 'all' ? html`<a class="btn btn-ghost btn-sm" href="${listUrl({ tab: 'all', q })}">Search all orders</a>` : ''}
      </div>
    </div>`;
  } else {
    const [title, text] = TAB_EMPTY[tabDef.key] || TAB_EMPTY.all;
    listBody = html`<div class="sh-empty sh-empty-sm">
      <span class="sh-empty-icon">${icon('check')}</span>
      <h3>${title}</h3>
      <p>${text}</p>
      ${tabDef.key !== 'all' ? html`<a class="btn btn-secondary btn-sm" href="${listUrl({ tab: 'all' })}">See all orders</a>` : ''}
    </div>`;
  }

  const to = offset + list.rows.length;
  const pager =
    list.total > pageSize || page > 1
      ? html`<nav class="sh-pager" aria-label="Pages">
          <span>${list.rows.length ? `Showing ${offset + 1}–${to} of ${list.total}` : `${list.total} orders`}</span>
          <div class="btn-row">
            ${page > 1 ? html`<a class="btn btn-secondary btn-sm" href="${listUrl({ tab: tabDef.key, q, page: page - 1 })}" rel="prev">${icon('arrowLeft')}<span>Newer</span></a>` : ''}
            ${to < list.total ? html`<a class="btn btn-secondary btn-sm" href="${listUrl({ tab: tabDef.key, q, page: page + 1 })}" rel="next"><span>Older</span>${icon('arrowRight')}</a>` : ''}
          </div>
        </nav>`
      : '';

  const subParts = [];
  if (counts.newToday) subParts.push(html`<b>${plural(counts.newToday, 'new order')}</b> today`);
  else if (counts.total) subParts.push('No new orders yet today');
  if (counts.total && d.monthCount) subParts.push(html`${plural(d.monthCount, 'order')} this month`);

  const side = [
    attentionCard(counts),
    showStart ? startCard(shop, counts, formUrl) : '',
    updates.length ? updatesCard(updates) : '',
    counts.total ? qrCard(shop, formUrl) : '',
  ].filter(Boolean);

  return html`<section class="container sh-dash" data-orders-live data-shop-id="${shop.id}" data-latest-order-id="${latestId}">
    <header class="sh-hello">
      <div class="sh-hello-text">
        <p class="sh-date">${dayFmt.format(new Date())}</p>
        <h1>${greeting()}${firstName ? `, ${firstName}` : ''}</h1>
        <p class="sh-hello-sub">${subParts.length
          ? subParts.map((p, i) => html`${i ? html`<span class="sh-dot" aria-hidden="true">·</span>` : ''}<span>${p}</span>`)
          : html`Welcome to Brighton Print. Share your link to get your first order.`}</p>
      </div>
      <div class="sh-linkchip">
        <span class="sh-linkchip-icon">${icon('link')}</span>
        <a class="sh-linkchip-text" href="${formUrl}" target="_blank" rel="noopener" title="Open ${shortUrl(formUrl)}">
          <small>Your order link · ${shortUrl(config.baseUrl)}</small>
          <span class="sh-linkchip-url">${formUrl.slice(config.baseUrl.length) || '/'}</span>
        </a>
        <span class="sh-linkchip-actions">
          <button type="button" class="btn btn-ghost btn-sm btn-icon" data-copy="${formUrl}" data-copy-msg="Order link copied" aria-label="Copy order link" title="Copy link">${icon('copy')}</button>
          <button type="button" class="btn btn-ghost btn-sm btn-icon" data-share data-share-url="${formUrl}" data-share-title="${shop.name}" data-share-text="Send your print files to ${shop.name} here:" aria-label="Share order link" title="Share">${icon('share')}</button>
          <a class="btn btn-ghost btn-sm btn-icon hide-xs" href="/shop/link" aria-label="QR code and poster" title="QR code">${icon('qr')}</a>
        </span>
      </div>
    </header>

    ${counts.total ? html`<nav class="sh-kpis" aria-label="Order summary">${kpis.map((k) => kpiTile({ ...k, current: k.tab === tabDef.key }))}</nav>` : ''}

    <div class="sh-dash-grid${side.length ? ' has-side' : ''}">
      ${side.length ? html`<div class="sh-dash-side">${side}</div>` : ''}

      <section class="card sh-orders" aria-labelledby="orders-h">
        <a class="sh-newbar" href="/shop" data-new-bar hidden>
          <span class="sh-newbar-dot" aria-hidden="true"></span>
          <span data-new-bar-text>New orders</span>
          <span class="sh-newbar-cta">Refresh ${icon('refresh')}</span>
        </a>
        <div class="sh-orders-head">
          <h2 id="orders-h">Orders</h2>
          <form class="search-form sh-search" method="get" action="/shop" role="search"${counts.total || q ? '' : raw(' hidden')}>
            ${tabDef.key !== 'active' ? html`<input type="hidden" name="tab" value="${tabDef.key}">` : ''}
            <div class="search-input">
              ${icon('search')}
              <label class="sr-only" for="order-q">Search orders</label>
              <input type="search" id="order-q" name="q" value="${q}" placeholder="Name, mobile or order no." maxlength="60" autocomplete="off" enterkeyhint="search">
            </div>
            <button class="btn btn-secondary btn-icon" type="submit" aria-label="Search">${icon('arrowRight')}</button>
          </form>
        </div>
        ${counts.total || q ? html`<nav class="tabs sh-tabs" aria-label="Filter orders by status">${tabs}</nav>` : ''}
        ${q
          ? html`<p class="sh-results">${plural(list.total, 'result')} for “<b>${q}</b>” in ${tabDef.label} · <a href="${listUrl({ tab: tabDef.key })}">Clear</a>${tabDef.key !== 'all'
              ? html` · <a href="${listUrl({ tab: 'all', q })}">Search all</a>`
              : ''}</p>`
          : ''}
        ${listBody}
        ${pager}
      </section>
    </div>
  </section>`;
}
