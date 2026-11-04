import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatBytes, formatDate, prettyPhone, timeAgo } from '../../lib/util.js';
import { isSampleShop } from '../../services/billing.js';
import { emptyState, icon, shopStatePill } from '../components.js';
import { SHOP_FILTERS, adminIcon, customerLink, cycleName, demoTag, listHref, num, paidInfo, planName, shopAvatar, telHref, toneClass } from './common.js';

// /admin/shops – every shop (live and demo) with filters and search.

// Filter chips that mean "someone should follow up" get a red count.
const ATTENTION = new Set(['expiring', 'expired', 'pending']);

function shopCell(s) {
  const link = customerLink(s);
  return html`<div class="adm-shop">
    ${shopAvatar(s)}
    <div class="adm-shop-text">
      <span class="adm-shop-title"><a class="adm-shop-name" href="/admin/shops/${s.id}">${s.name}</a>${s.is_demo ? demoTag(s) : ''}</span>
      <a class="adm-slug" href="${link.href}" target="_blank" rel="noopener">${link.label}${adminIcon('external')}<span class="sr-only"> (opens the customer page in a new tab)</span></a>
      ${s.city ? html`<span class="adm-sub">${s.city}</span>` : ''}
    </div>
  </div>`;
}

function ownerCell(s) {
  const tel = telHref(s.mobile);
  return html`<div class="adm-lines adm-owner">
    <b>${s.owner_name || '—'}</b>
    ${s.mobile ? (tel ? html`<a href="${tel}">${prettyPhone(s.mobile)}</a>` : html`<span>${s.mobile}</span>`) : ''}
    <a href="mailto:${s.email}" title="${s.email}">${s.email}</a>
  </div>`;
}

function planCell(s, today) {
  if (isSampleShop(s)) return html`<div class="adm-lines"><b>Sample</b><span class="adm-sub">Resets every ${config.demo.resetHours} h</span></div>`;
  const info = paidInfo(s, today);
  if (s.is_demo) {
    return html`<div class="adm-lines"><b>Demo</b>${s.paid_until ? html`<span class="adm-sub">ends ${formatDate(s.paid_until)}</span>` : ''}<span class="${toneClass(info.tone)}">${info.text}</span></div>`;
  }
  if (!s.plan) return html`<div class="adm-lines"><b>No plan</b><span class="adm-sub">${info.text}</span></div>`;
  return html`<div class="adm-lines">
    <b>${planName(s.plan)}${s.billing_cycle ? html` <span class="adm-cycle">${cycleName(s.billing_cycle)}</span>` : ''}</b>
    ${s.paid_until ? html`<span class="adm-sub">until ${formatDate(s.paid_until)}</span>` : ''}
    <span class="${toneClass(info.tone)}">${info.text}</span>
  </div>`;
}

function shopRow(s, today) {
  return html`<tr>
    <td class="adm-td-shop" data-label="Shop">${shopCell(s)}</td>
    <td class="adm-td-state" data-label="Status">${shopStatePill(s.state)}</td>
    <td class="adm-td-owner" data-label="Owner">${ownerCell(s)}</td>
    <td class="adm-td-plan" data-label="Plan">${planCell(s, today)}</td>
    <td class="num adm-td-orders" data-label="Orders"><div class="adm-lines adm-num"><b>${num(s.orders_count)}</b><span class="adm-sub">${num(s.orders_today)} today</span></div></td>
    <td class="num adm-col-storage" data-label="Storage"><span class="nowrap">${formatBytes(s.storage_bytes)}</span></td>
    <td class="adm-col-activity" data-label="Activity"><div class="adm-lines">
      <span>${s.last_order_at ? `Order ${timeAgo(s.last_order_at)}` : 'No orders yet'}</span>
      <span class="adm-sub">Joined ${formatDate(s.created_at)}</span>
    </div></td>
    <td class="adm-td-actions"><a class="btn btn-soft btn-sm adm-manage" href="/admin/shops/${s.id}" title="Manage ${s.name}"><span class="adm-manage-label">Manage</span><span class="sr-only"> ${s.name}</span>${adminIcon('chevron')}</a></td>
  </tr>`;
}

function emptyShops({ q, status, total }) {
  if (!total && !q) return emptyState({ title: 'No shops yet', text: 'When a print shop registers or starts a demo, it shows up here.' });
  return emptyState({
    title: 'No matching shops',
    text: q ? `Nothing found for “${q}”. Try a shop name, link, city, mobile or email.` : 'No shop is in this group right now.',
    action: html`<a class="btn btn-secondary btn-sm" href="/admin/shops">Show all shops</a>`,
  });
}

export function shopsView(res, { shops, counts, q, status, today }) {
  const current = SHOP_FILTERS.find((f) => f.key === status) || SHOP_FILTERS[0];
  return html`<div class="container adm">
    <div class="adm-pagehead">
      <div>
        <p class="adm-kicker">${num(counts[''] || 0)} shops · ${num(counts.active || 0)} active · ${num(counts.demo || 0)} demo</p>
        <h1>Shops</h1>
      </div>
      <form class="search-form adm-search" method="get" action="/admin/shops" role="search">
        ${status ? html`<input type="hidden" name="status" value="${status}">` : ''}
        <div class="search-input">
          ${icon('search')}
          <label class="sr-only" for="adm-q">Search shops</label>
          <input type="search" id="adm-q" name="q" value="${q}" placeholder="Name, link, city, mobile or email" maxlength="80" autocomplete="off" enterkeyhint="search">
        </div>
        <button class="btn btn-primary" type="submit">Search</button>
      </form>
    </div>

    <nav class="adm-chips" aria-label="Filter shops">
      ${SHOP_FILTERS.map((f) => {
        const n = counts[f.key] || 0;
        const attn = ATTENTION.has(f.key) && n > 0;
        return html`<a href="${listHref({ q, status: f.key })}" class="adm-chip${f.key === status ? ' is-on' : ''}${attn ? ' is-attn' : ''}"${f.key === status ? raw(' aria-current="page"') : ''}>${f.label}<span class="adm-chip-n">${num(n)}</span>${attn ? html`<span class="sr-only"> – needs follow-up</span>` : ''}</a>`;
      })}
    </nav>
    ${q
      ? html`<p class="adm-searchnote">Showing results for <b>“${q}”</b> in ${current.label.toLowerCase()} shops · <a href="${listHref({ status })}">Clear search</a></p>`
      : ''}

    <section class="card adm-tablecard" aria-label="${current.label} shops">
      ${shops.length
        ? html`<div class="table-wrap adm-table-wrap">
            <table class="table table-cards adm-table">
              <thead>
                <tr>
                  <th scope="col">Shop</th>
                  <th scope="col">Status</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Plan</th>
                  <th scope="col" class="num">Orders</th>
                  <th scope="col" class="num adm-col-storage">Storage</th>
                  <th scope="col" class="adm-col-activity">Activity</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>${shops.map((s) => shopRow(s, today))}</tbody>
            </table>
          </div>`
        : emptyShops({ q, status, total: counts[''] || 0 })}
    </section>
  </div>`;
}
