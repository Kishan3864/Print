import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { TABS } from '../../lib/status.js';
import { formatDateTime, timeAgo } from '../../lib/util.js';
import { icon, statusPill } from '../components.js';
import { shopIcon } from '../chrome/shop.js';
import { shareTexts } from '../shop-settings/link.js';
import { jobLine, plural, orderPath } from './common.js';

const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: config.timeZone, hour: 'numeric', hourCycle: 'h23' });

function greeting() {
  const h = Number(hourFmt.format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// One short line per status: what the shop does next (shown on the order rows that wait on the shop).
const ROW_HINT = {
  new: ['bell', 'Check the files, then print'],
  changes_requested: ['refresh', 'Customer wants changes'],
  approved: ['check', 'Customer said OK – print it'],
};

// The "needs you" tiles at the top; each one filters the list.
const TODO_TILES = [
  { key: 'new', label: 'New orders', sub: 'Check & start', ic: 'bell', tone: 'new' },
  { key: 'changes_requested', label: 'Needs changes', sub: 'Customer asked', ic: 'refresh', tone: 'changes' },
  { key: 'approved', label: 'Customer OK', sub: 'Ready to print', ic: 'check', tone: 'ok' },
  { key: 'ready', label: 'Ready', sub: 'Waiting for pickup', ic: 'store', tone: 'ready' },
];

const TAB_EMPTY = {
  active: ['Nothing in progress', 'New orders from your link show up here. Delivered and cancelled orders move to their own lists.'],
  new: ['No new orders', 'Fresh orders from customers show up here first.'],
  proof_sent: ['Nobody to wait for', 'Orders where you sent a design preview show here until the customer taps OK.'],
  changes_requested: ['No change requests', 'When a customer asks for changes to a design preview, the order shows here.'],
  approved: ['Nothing to print yet', 'When a customer taps OK on a design preview, the order shows here.'],
  printing: ['Nothing printing', 'Orders you start printing show here until you mark them ready.'],
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

const shortUrl = (url) => url.replace(/^https?:\/\//, '');
const initialOf = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';

function orderRow(o) {
  const hint = ROW_HINT[o.status];
  return html`<li class="sh-row sh-st-${o.status}${hint ? ' is-todo' : ''}">
    <a class="sh-row-link" href="${orderPath(o)}">
      <span class="sh-row-avatar" aria-hidden="true">${initialOf(o.customer_name)}</span>
      <span class="sh-row-main">
        <span class="sh-row-top"><b class="sh-row-name">${o.customer_name}</b><span class="sh-row-no">P-${o.order_no}</span>${o.is_sample ? html`<span class="sh-row-sample">Sample</span>` : ''}</span>
        <span class="sh-row-meta">${jobLine(o)} · ${plural(o.file_count, 'file')}</span>
        ${hint ? html`<span class="sh-row-hint">${icon(hint[0])}<span>${hint[1]}</span></span>` : ''}
      </span>
      <span class="sh-row-side">
        ${statusPill(o.status)}
        <time class="sh-row-time" datetime="${o.created_at}" title="${formatDateTime(o.created_at)}" data-ago>${timeAgo(o.created_at)}</time>
      </span>
    </a>
  </li>`;
}

/**
 * "Your order link" card. Big with the how-it-works steps for a shop without orders,
 * one compact strip once orders come in.
 */
function linkCard(shop, formUrl, { big, isSample }) {
  const share = shareTexts(shop);
  const waHref = `https://wa.me/?text=${encodeURIComponent(share.whatsapp)}`;
  const path = formUrl.slice(config.baseUrl.length) || '/';
  const actions = html`<div class="sh-link-actions">
    <a class="btn btn-wa${big ? '' : ' btn-sm'}" href="${waHref}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Share on WhatsApp</span></a>
    <button type="button" class="btn btn-secondary${big ? '' : ' btn-sm'}" data-copy="${formUrl}" data-copy-msg="Order link copied">${icon('copy')}<span>Copy link</span></button>
    <a class="btn btn-secondary${big ? '' : ' btn-sm'}" href="/shop/link">${icon('qr')}<span>QR code</span></a>
  </div>`;
  if (!big) {
    return html`<section class="card sh-link" aria-labelledby="sh-link-h">
      <span class="sh-link-ic" aria-hidden="true">${icon('link')}</span>
      <div class="sh-link-text">
        <h2 id="sh-link-h">Your order link</h2>
        <a class="sh-link-url" href="${formUrl}" target="_blank" rel="noopener"><span>${shortUrl(config.baseUrl)}</span><b>${path}</b></a>
      </div>
      ${actions}
    </section>`;
  }
  return html`<section class="card sh-link is-big" aria-labelledby="sh-link-h">
    <div class="sh-link-head">
      <span class="sh-link-ic" aria-hidden="true">${icon('link')}</span>
      <div>
        <h2 id="sh-link-h">Get your first order</h2>
        <p>This is your shop's own order link. Send it to customers – they upload files from their phone and the order lands right here.</p>
      </div>
    </div>
    <a class="sh-link-url is-big" href="${formUrl}" target="_blank" rel="noopener"><span>${shortUrl(config.baseUrl)}</span><b>${path}</b></a>
    ${actions}
    <ol class="sh-how" aria-label="How it works">
      <li><span class="sh-how-n">1</span><span><b>Customer opens your link</b> or scans your QR code</span></li>
      <li><span class="sh-how-n">2</span><span><b>Uploads files</b>, picks size and copies</span></li>
      <li><span class="sh-how-n">3</span><span><b>You get order P-${shop.next_order_no}</b> here, with a sound</span></li>
    </ol>
    ${isSample
      ? ''
      : html`<p class="sh-link-try">${icon('eye')}<span>Try it yourself: <a href="${formUrl}" target="_blank" rel="noopener">place a test order</a>${shop.logo_file ? '' : html` · <a href="/shop/settings">add your logo</a>`}</span></p>`}
  </section>`;
}

function todoTiles(counts, tab) {
  const waiting = TODO_TILES.reduce((a, t) => a + (t.key === 'ready' ? 0 : counts[t.key] || 0), 0);
  return html`<nav class="sh-todo" aria-label="Orders that need you${waiting ? ` (${waiting})` : ''}">
    ${TODO_TILES.map((t) => {
      const n = counts[t.key] || 0;
      const on = tab === t.key;
      return html`<a class="sh-tile sh-tile-${t.tone}${n ? ' has-items' : ''}${on ? ' is-current' : ''}" href="${listUrl({ tab: t.key })}"${on ? raw(' aria-current="true"') : ''}>
        <span class="sh-tile-ic">${icon(t.ic)}</span>
        <span class="sh-tile-n" data-stat="${t.key}">${n}</span>
        <span class="sh-tile-label">${t.label}</span>
        <span class="sh-tile-sub">${t.sub}</span>
      </a>`;
    })}
  </nav>`;
}

/**
 * Dashboard body.
 * @param d.shop, d.counts (shopCounts), d.tabCounts, d.list ({rows,total}), d.tab, d.q, d.page, d.pageSize,
 *        d.latestId, d.formUrl, d.monthCount, d.isSample
 */
export function dashboardView(d) {
  const { shop, counts, list, tab, q, page, pageSize, latestId, formUrl } = d;
  const tabDef = TABS.find((t) => t.key === tab) || TABS[0];
  const firstName = String(shop.owner_name || '').trim().split(/\s+/)[0];
  const offset = (page - 1) * pageSize;
  const todo = (counts.new || 0) + (counts.changes_requested || 0) + (counts.approved || 0);

  // Filter chips: the main lists always, status lists only when they have orders.
  const ALWAYS = new Set(['active', 'delivered', 'all']);
  const chips = TABS.filter((t) => ALWAYS.has(t.key) || d.tabCounts[t.key] || t.key === tabDef.key).map((t) => {
    const on = t.key === tabDef.key;
    const n = d.tabCounts[t.key] || 0;
    return html`<a class="sh-chip sh-chip-${t.key}" href="${listUrl({ tab: t.key, q })}"${on ? raw(' aria-current="page"') : ''}>${t.label}<span class="count">${n}</span></a>`;
  });

  let listBody;
  if (list.rows.length) {
    listBody = html`<ul class="sh-list">${list.rows.map(orderRow)}</ul>`;
  } else if (q) {
    listBody = html`<div class="sh-empty">
      <span class="sh-empty-icon">${icon('search')}</span>
      <h3>No orders match “${q}”</h3>
      <p>Try a customer name, the last digits of a mobile number or an order number like ${shop.next_order_no > 1001 ? shop.next_order_no - 1 : 1001}.</p>
      <div class="btn-row sh-empty-actions">
        <a class="btn btn-secondary btn-sm" href="${listUrl({ tab: tabDef.key })}">Clear search</a>
        ${tabDef.key !== 'all' ? html`<a class="btn btn-ghost btn-sm" href="${listUrl({ tab: 'all', q })}">Search all orders</a>` : ''}
      </div>
    </div>`;
  } else if (!counts.total) {
    listBody = html`<div class="sh-empty">
      <span class="sh-empty-icon">${shopIcon('inbox')}</span>
      <h3>Your orders will appear here</h3>
      <p>Share your link above. When a customer sends files, you hear a sound and the order shows up here.</p>
    </div>`;
  } else {
    const [title, text] = TAB_EMPTY[tabDef.key] || TAB_EMPTY.all;
    listBody = html`<div class="sh-empty">
      <span class="sh-empty-icon is-ok">${icon('check')}</span>
      <h3>${title}</h3>
      <p>${text}</p>
      ${tabDef.key !== 'active' ? html`<a class="btn btn-secondary btn-sm" href="${listUrl()}">Back to orders in progress</a>` : ''}
    </div>`;
  }

  const to = offset + list.rows.length;
  const pager =
    list.total > pageSize || page > 1
      ? html`<nav class="sh-pager" aria-label="Pages">
          <span>${list.rows.length ? `${offset + 1}–${to} of ${list.total}` : `${list.total} orders`}</span>
          <div class="btn-row">
            ${page > 1 ? html`<a class="btn btn-secondary btn-sm" href="${listUrl({ tab: tabDef.key, q, page: page - 1 })}" rel="prev">${icon('arrowLeft')}<span>Newer</span></a>` : ''}
            ${to < list.total ? html`<a class="btn btn-secondary btn-sm" href="${listUrl({ tab: tabDef.key, q, page: page + 1 })}" rel="next"><span>Older</span>${icon('arrowRight')}</a>` : ''}
          </div>
        </nav>`
      : '';

  let sub;
  if (!counts.total) sub = 'Welcome to Brighton Print. Share your link to get your first order.';
  else if (todo) sub = html`<b class="sh-hello-todo">${plural(todo, 'order')} ${todo === 1 ? 'needs' : 'need'} you</b>${counts.newToday ? html` · ${counts.newToday} new today` : ''}`;
  else sub = html`<span class="sh-hello-ok">${icon('check')}All caught up</span>${d.monthCount ? html` · ${plural(d.monthCount, 'order')} this month` : ''}`;

  return html`<section class="container sh-dash" data-orders-live data-shop-id="${shop.id}" data-latest-order-id="${latestId}">
    <header class="sh-hello">
      <h1>${greeting()}${firstName ? `, ${firstName}` : ''}</h1>
      <p class="sh-hello-sub">${sub}</p>
    </header>

    ${linkCard(shop, formUrl, { big: !counts.total, isSample: d.isSample })}

    ${counts.total ? todoTiles(counts, tabDef.key) : ''}

    <section class="card sh-orders" aria-labelledby="orders-h">
      <a class="sh-newbar" href="/shop" data-new-bar hidden>
        <span class="sh-newbar-dot" aria-hidden="true"></span>
        <span data-new-bar-text>New orders</span>
        <span class="sh-newbar-cta">Show ${icon('refresh')}</span>
      </a>
      <div class="sh-orders-head">
        <h2 id="orders-h">${q ? 'Search results' : tabDef.key === 'active' ? 'Orders in progress' : tabDef.label}</h2>
        ${counts.total || q
          ? html`<form class="search-form sh-search" method="get" action="/shop" role="search">
              ${tabDef.key !== 'active' ? html`<input type="hidden" name="tab" value="${tabDef.key}">` : ''}
              <div class="search-input">
                ${icon('search')}
                <label class="sr-only" for="order-q">Search orders</label>
                <input type="search" id="order-q" name="q" value="${q}" placeholder="Name, mobile or P-number" maxlength="60" autocomplete="off" enterkeyhint="search">
              </div>
            </form>`
          : ''}
      </div>
      ${counts.total || q ? html`<nav class="sh-chips" aria-label="Show orders">${chips}</nav>` : ''}
      ${q
        ? html`<p class="sh-results">${plural(list.total, 'result')} for “<b>${q}</b>” · <a href="${listUrl({ tab: tabDef.key })}">Clear</a>${tabDef.key !== 'all'
            ? html` · <a href="${listUrl({ tab: 'all', q })}">Search all</a>`
            : ''}</p>`
        : ''}
      ${listBody}
      ${pager}
    </section>
  </section>`;
}
