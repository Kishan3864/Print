import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatBytes, formatDate, prettyPhone, timeAgo, waLink, waNumber } from '../../lib/util.js';
import { isSampleShop } from '../../services/billing.js';
import { emptyState, icon, shopStatePill } from '../components.js';
import {
  SHOP_FILTERS,
  SHOP_SORTS,
  adminIcon,
  customerLink,
  cycleName,
  daysMeter,
  demoTag,
  listHref,
  num,
  paidInfo,
  planName,
  searchKey,
  shopAvatar,
  telHref,
  toneClass,
} from './common.js';

// /admin/shops – every shop (live and demo): filter chips, search (type-to-filter + server search),
// sortable columns (server side; public/js/admin.js re-sorts in place), quick actions and CSV export.

// Filter chips that mean "someone should follow up" get a red count.
const ATTENTION = new Set(['expiring', 'expired', 'pending']);

const COLS = [
  { key: 'name', label: 'Shop', cls: 'adm-c-shop' },
  { key: 'status', label: 'Status', cls: 'adm-c-status' },
  { key: '', label: 'Owner', cls: 'adm-c-owner' },
  { key: 'plan', label: 'Plan', cls: 'adm-c-plan' },
  { key: 'orders', label: 'Orders', cls: 'adm-c-orders num' },
  { key: 'storage', label: 'Storage', cls: 'adm-c-storage num' },
  { key: 'activity', label: 'Last order', cls: 'adm-c-activity' },
];

function headCell(col, { q, status, sort, dir }) {
  if (!col.key) return html`<th scope="col" class="${col.cls}">${col.label}</th>`;
  const on = sort === col.key;
  const next = on ? (dir === 'asc' ? 'desc' : 'asc') : SHOP_SORTS[col.key].dir;
  const ariaSort = on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return html`<th scope="col" class="${col.cls}" aria-sort="${ariaSort}">
    <a class="adm-sort" href="${listHref({ q, status, sort: col.key, dir: next })}" data-sort="${col.key}" data-sort-dir="${SHOP_SORTS[col.key].dir}">${col.label}<span class="adm-sort-ic" aria-hidden="true">${adminIcon(on ? (dir === 'asc' ? 'sortUp' : 'sortDown') : 'sort')}</span></a>
  </th>`;
}

function shopCell(s) {
  const link = customerLink(s);
  return html`<div class="adm-shop">
    ${shopAvatar(s, 36)}
    <div class="adm-shop-text">
      <span class="adm-shop-title"><a class="adm-shop-name" href="/admin/shops/${s.id}">${s.name}</a>${s.is_demo ? demoTag(s) : ''}</span>
      <span class="adm-shop-sub">
        <a class="adm-slug" href="${link.href}" target="_blank" rel="noopener" title="${link.label}"><span class="adm-slug-t">${link.label}</span>${adminIcon('external')}<span class="sr-only"> (opens the customer page in a new tab)</span></a>
        ${s.city ? html`<span class="adm-shop-city">${s.city}</span>` : ''}
      </span>
      <span class="adm-shop-owner">${s.owner_name || ''}${s.owner_name && s.mobile ? ' · ' : ''}${s.mobile ? prettyPhone(s.mobile) : ''}</span>
    </div>
  </div>`;
}

function ownerCell(s) {
  const tel = telHref(s.mobile);
  return html`<div class="adm-lines adm-owner">
    <b>${s.owner_name || '—'}</b>
    ${s.mobile ? (tel ? html`<a href="${tel}">${prettyPhone(s.mobile)}</a>` : html`<span>${s.mobile}</span>`) : ''}
    <a class="adm-owner-mail" href="mailto:${s.email}" title="${s.email}">${s.email}</a>
  </div>`;
}

function planCell(s, today) {
  if (isSampleShop(s)) return html`<div class="adm-lines"><b>Sample</b><span class="adm-sub">Resets every ${config.demo.resetHours} h</span></div>`;
  const info = paidInfo(s, today);
  const name = s.is_demo ? 'Demo' : s.plan ? planName(s.plan) : 'No plan';
  const cycle = !s.is_demo && s.plan && s.billing_cycle ? html` <span class="adm-cycle">${cycleName(s.billing_cycle)}</span>` : '';
  return html`<div class="adm-lines adm-plan-cell">
    <b>${name}${cycle}</b>
    ${daysMeter(s, info)}
    <span class="adm-plan-when"><span class="${toneClass(info.tone)}">${info.text}</span>${s.paid_until ? html`<span class="adm-sub"> · ${formatDate(s.paid_until)}</span>` : ''}</span>
  </div>`;
}

function actionsCell(s) {
  const link = customerLink(s);
  const tel = telHref(s.mobile);
  const sample = isSampleShop(s);
  const hi = `Hi ${s.owner_name || s.name}, this is Brighton Solution (Brighton Print).`;
  return html`<div class="adm-rowacts">
    ${!sample && s.mobile ? html`<a class="btn btn-sm btn-icon adm-ia adm-ia-wa" href="${waLink(s.mobile, hi)}" target="_blank" rel="noopener" title="WhatsApp ${s.owner_name || s.name}">${icon('whatsapp')}<span class="sr-only">WhatsApp ${s.name}</span></a>` : ''}
    ${!sample && tel ? html`<a class="btn btn-sm btn-icon adm-ia" href="${tel}" title="Call ${prettyPhone(s.mobile)}">${icon('phone')}<span class="sr-only">Call ${s.name}</span></a>` : ''}
    <a class="btn btn-sm btn-icon adm-ia" href="${link.href}" target="_blank" rel="noopener" title="Open customer page">${adminIcon('external')}<span class="sr-only">Customer page of ${s.name}</span></a>
    <a class="btn btn-sm adm-manage" href="/admin/shops/${s.id}"><span>Manage</span><span class="sr-only"> ${s.name}</span>${adminIcon('chevron')}</a>
  </div>`;
}

function shopRow(s, today) {
  const info = paidInfo(s, today);
  const sv = (key) => {
    const v = SHOP_SORTS[key].value(s, today);
    return v === '' ? '' : String(v);
  };
  return html`<tr data-row data-search="${searchKey(s.name, s.slug, s.city, s.owner_name, s.email, s.mobile, waNumber(s.mobile), planName(s.plan), s.state)}"
    data-s-name="${sv('name')}" data-s-status="${sv('status')}" data-s-plan="${sv('plan')}" data-s-orders="${sv('orders')}" data-s-storage="${sv('storage')}" data-s-activity="${sv('activity')}" data-s-joined="${sv('joined')}"${info.tone === 'danger' && !s.is_demo ? raw(' class="is-alert"') : ''}>
    <td class="adm-c-shop">${shopCell(s)}</td>
    <td class="adm-c-status">${shopStatePill(s.state)}</td>
    <td class="adm-c-owner">${ownerCell(s)}</td>
    <td class="adm-c-plan">${planCell(s, today)}</td>
    <td class="adm-c-orders num"><div class="adm-lines adm-num"><b>${num(s.orders_count)}</b><span class="adm-sub">${num(s.orders_today)} today</span></div></td>
    <td class="adm-c-storage num"><span class="nowrap">${formatBytes(s.storage_bytes)}</span></td>
    <td class="adm-c-activity"><div class="adm-lines">
      <span>${s.last_order_at ? timeAgo(s.last_order_at) : 'No orders yet'}</span>
      <span class="adm-sub">Joined ${formatDate(s.created_at)}</span>
    </div></td>
    <td class="adm-c-actions">${actionsCell(s)}</td>
  </tr>`;
}

function emptyShops({ q, total }) {
  if (!total && !q) return emptyState({ title: 'No shops yet', text: 'When a print shop registers or starts a demo, it shows up here.' });
  return emptyState({
    title: 'No matching shops',
    text: q ? `Nothing found for “${q}”. Try a shop name, link, city, mobile or email.` : 'No shop is in this group right now.',
    action: html`<a class="btn btn-secondary btn-sm" href="/admin/shops">Show all shops</a>`,
  });
}

export function shopsView(res, { shops, counts, q, status, sort, dir, today }) {
  const current = SHOP_FILTERS.find((f) => f.key === status) || SHOP_FILTERS[0];
  const total = counts[''] || 0;
  return html`<div class="container adm adm-shops">
    <div class="adm-pagehead">
      <div>
        <p class="adm-kicker">${num(total)} shops · ${num(counts.active || 0)} active · ${num(counts.pending || 0)} awaiting payment · ${num(counts.demo || 0)} demo</p>
        <h1>Shops</h1>
      </div>
      <div class="adm-pagehead-actions">
        <a class="btn btn-secondary" href="${listHref({ q, status, sort, dir }, '/admin/shops.csv')}" download data-sync-query>${adminIcon('download')}<span>Export CSV</span></a>
        <a class="btn btn-primary" href="/admin/demo-links">${icon('plus')}<span>Demo link</span></a>
      </div>
    </div>

    <nav class="adm-chips" aria-label="Filter shops">
      ${SHOP_FILTERS.map((f) => {
        const n = counts[f.key] || 0;
        const attn = ATTENTION.has(f.key) && n > 0;
        return html`<a href="${listHref({ q, status: f.key, sort, dir })}" class="adm-chip${f.key === status ? ' is-on' : ''}${attn ? ' is-attn' : ''}"${f.key === status ? raw(' aria-current="page"') : ''}>${f.label}<span class="adm-chip-n">${num(n)}</span>${attn ? html`<span class="sr-only"> – needs follow-up</span>` : ''}</a>`;
      })}
    </nav>

    <section class="card adm-tablecard" aria-label="${current.label} shops">
      <form class="adm-toolbar" method="get" action="/admin/shops" role="search">
        ${status ? html`<input type="hidden" name="status" value="${status}">` : ''}
        <div class="search-input adm-toolbar-search">
          ${icon('search')}
          <label class="sr-only" for="adm-q">Search shops</label>
          <input type="search" id="adm-q" name="q" value="${q}" placeholder="Search name, link, city, mobile or email" maxlength="80" autocomplete="off" enterkeyhint="search" data-row-filter="#adm-shops-table" aria-describedby="adm-shops-count">
          <kbd class="adm-kbd" aria-hidden="true">/</kbd>
        </div>
        <div class="adm-toolbar-sort">
          <label class="sr-only" for="adm-sort">Sort shops</label>
          <select id="adm-sort" name="sort" data-sort-select="#adm-shops-table">
            <option value=""${sort ? '' : raw(' selected')}>Sort: needs action first</option>
            ${Object.entries(SHOP_SORTS).map(([key, d]) => html`<option value="${key}"${key === sort ? raw(' selected') : ''}>Sort: ${d.label}</option>`)}
          </select>
        </div>
        <button class="btn btn-secondary adm-toolbar-go" type="submit">Search</button>
        <p class="adm-count" id="adm-shops-count" aria-live="polite" data-row-count data-noun="shop">${q ? html`<b>${num(shops.length)}</b> found for “${q}” · <a href="${listHref({ status, sort, dir })}">Clear</a>` : html`<b>${num(shops.length)}</b> ${shops.length === 1 ? 'shop' : 'shops'}`}</p>
      </form>
      ${shops.length
        ? html`<div class="table-wrap adm-table-wrap">
            <table class="table adm-table adm-shops-table" id="adm-shops-table" data-sortable data-sort-url>
              <thead>
                <tr>
                  ${COLS.map((c) => headCell(c, { q, status, sort, dir }))}
                  <th scope="col" class="adm-c-actions"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>${shops.map((s) => shopRow(s, today))}</tbody>
            </table>
            <p class="adm-nomatch" data-row-empty hidden>No shop matches this search. Press Enter to search all shops.</p>
          </div>`
        : emptyShops({ q, total })}
    </section>
  </div>`;
}

/** CSV export of the current list (opens in Excel / Google Sheets). */
export function shopsCsv(shops, today) {
  // A cell starting with = + - @ (or tab / CR) would run as a formula in a spreadsheet: prefix a quote.
  const cell = (v) => {
    let t = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const head = ['Shop', 'Customer link', 'Status', 'Owner', 'Mobile', 'Email', 'City', 'Plan', 'Cycle', 'Paid until', 'Days left', 'Orders', 'Orders today', 'Storage (MB)', 'Last order', 'Joined', 'Type'];
  const rows = shops.map((s) => {
    const info = paidInfo(s, today);
    return [
      s.name,
      customerLink(s).href,
      s.state,
      s.owner_name,
      s.mobile,
      s.email,
      s.city,
      isSampleShop(s) ? 'Sample' : s.is_demo ? 'Demo' : planName(s.plan),
      s.is_demo ? '' : cycleName(s.billing_cycle),
      s.paid_until || '',
      info.days == null ? '' : info.days,
      s.orders_count,
      s.orders_today,
      (Number(s.storage_bytes || 0) / 1048576).toFixed(2),
      s.last_order_at ? String(s.last_order_at).slice(0, 10) : '',
      String(s.created_at || '').slice(0, 10),
      isSampleShop(s) ? 'sample' : s.is_demo ? 'demo' : 'live',
    ];
  });
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
