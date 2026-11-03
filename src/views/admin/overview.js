import { html, raw } from '../../lib/html.js';
import { addDays, formatBytes, formatDate, prettyPhone, timeAgo } from '../../lib/util.js';
import { PLAN_LABEL, SHOP_STATE_LABEL } from '../../lib/status.js';
import { csrfField, emptyState, icon, shopStatePill } from '../components.js';
import { demoTag, listHref, num, paidInfo, planOptions, shopAvatar, telHref, toneClass } from './common.js';

// /admin – platform totals + every shop, pending sign-ups first with inline approve.

export const FILTERS = ['', 'pending', 'active', 'expired', 'paused', 'rejected'];

const stat = ({ tone, ic, label, value, sub = '', href = '', attention = false }) =>
  html`<div class="card stat-card stat-${tone} adm-stat${href ? ' is-link' : ''}${attention ? ' is-attention' : ''}">
    <div class="stat-label"><span class="adm-stat-ic">${icon(ic)}</span>${href ? html`<a class="stretched adm-stat-link" href="${href}">${label}</a>` : html`<span>${label}</span>`}</div>
    <div class="stat-value">${value}</div>
    ${sub ? html`<div class="stat-sub">${sub}</div>` : ''}
  </div>`;

function statsGrid(o) {
  return html`<section class="adm-stats" aria-label="Platform totals">
    ${stat({ tone: 'key', ic: 'store', label: 'Total shops', value: num(o.totalShops), sub: 'Demo shop not counted' })}
    ${stat({
      tone: 'yellow',
      ic: 'clock',
      label: 'Pending approval',
      value: num(o.pending),
      sub: o.pending ? 'Waiting for you' : 'All caught up',
      href: `${listHref({ status: 'pending' })}#shops`,
      attention: o.pending > 0,
    })}
    ${stat({ tone: 'green', ic: 'check', label: 'Active', value: num(o.active), sub: 'Taking orders now', href: `${listHref({ status: 'active' })}#shops` })}
    ${stat({
      tone: 'orange',
      ic: 'alert',
      label: 'Expired',
      value: num(o.expired),
      sub: o.expired ? 'Plan ended – follow up' : 'None right now',
      href: `${listHref({ status: 'expired' })}#shops`,
    })}
    ${stat({ tone: 'cyan', ic: 'orders', label: 'Orders today', value: num(o.ordersToday), sub: 'Since midnight' })}
    ${stat({ tone: 'magenta', ic: 'printer', label: 'Orders total', value: num(o.ordersTotal), sub: 'All shops, all time' })}
    ${stat({ tone: 'gray', ic: 'file', label: 'Storage used', value: formatBytes(o.storage), sub: 'Customer files and proofs' })}
    <div class="card stat-card stat-gray adm-stat adm-pair">
      <a class="adm-pair-item" href="${listHref({ status: 'paused' })}#shops"><span class="stat-label">Paused</span><span class="stat-value">${num(o.paused)}</span></a>
      <a class="adm-pair-item" href="${listHref({ status: 'rejected' })}#shops"><span class="stat-label">Rejected</span><span class="stat-value">${num(o.rejected)}</span></a>
    </div>
  </section>`;
}

function shopCell(s) {
  return html`<div class="adm-shop">
    ${shopAvatar(s)}
    <div class="adm-shop-text">
      <span class="adm-shop-title"><a class="adm-shop-name" href="/admin/shops/${s.id}">${s.name}</a>${s.is_demo ? demoTag() : ''}</span>
      <a class="adm-slug" href="/${s.slug}" target="_blank" rel="noopener">${icon('link')}<span>/${s.slug}</span><span class="sr-only"> (opens the order form in a new tab)</span></a>
      ${s.city ? html`<span class="adm-sub">${s.city}</span>` : ''}
    </div>
  </div>`;
}

function planCell(s, today) {
  if (s.state === 'pending') return html`<div class="adm-lines"><b>—</b><span class="adm-sub">Not approved yet</span></div>`;
  const info = paidInfo(s, today);
  return html`<div class="adm-lines">
    <b>${PLAN_LABEL[s.plan] || 'No plan'}</b>
    ${s.is_demo ? html`<span class="adm-sub">${info.text}</span>` : s.paid_until ? html`<span class="adm-sub">until ${formatDate(s.paid_until)}</span>` : ''}
    ${!s.is_demo && (info.tone === 'warn' || info.tone === 'danger' || !s.paid_until) ? html`<span class="${toneClass(info.tone)}">${info.text}</span>` : ''}
  </div>`;
}

function approveRow(res, s, { today, back }) {
  const id = `qa-${s.id}`;
  return html`<tr class="adm-approve-row">
    <td colspan="8">
      <div class="adm-quick">
        <p class="adm-quick-title">${icon('sparkle')}<span>New sign-up · approve to switch on their order link</span></p>
        <form class="adm-quick-form" method="post" action="/admin/shops/${s.id}/approve">
          ${csrfField(res)}<input type="hidden" name="next" value="${back}">
          <div class="adm-qf"><label for="${id}-plan">Plan</label><select id="${id}-plan" name="plan" required>${planOptions('starter')}</select></div>
          <div class="adm-qf"><label for="${id}-paid">Paid until</label><input type="date" id="${id}-paid" name="paid_until" value="${addDays(today, 30)}" min="${today}" required></div>
          <button class="btn btn-success btn-sm" type="submit">${icon('check')}<span>Approve</span></button>
        </form>
        <form class="adm-quick-reject" method="post" action="/admin/shops/${s.id}/reject" data-confirm="Reject ${s.name}? They will see a “not approved” screen and cannot take orders.">
          ${csrfField(res)}<input type="hidden" name="next" value="${back}">
          <button class="btn btn-danger btn-sm" type="submit">${icon('x')}<span>Reject</span></button>
        </form>
        <a class="btn btn-ghost btn-sm adm-only-cards" href="/admin/shops/${s.id}">Review details${icon('arrowRight')}</a>
      </div>
    </td>
  </tr>`;
}

function shopRow(res, s, ctx) {
  const pending = s.state === 'pending';
  const tel = telHref(s.mobile);
  return html`<tr class="adm-row${pending ? ' is-pending' : ''}">
    <td class="adm-td-shop" data-label="Shop">${shopCell(s)}</td>
    <td data-label="Owner"><div class="adm-lines adm-owner">
      <b>${s.owner_name || '—'}</b>
      ${s.mobile ? (tel ? html`<a href="${tel}">${prettyPhone(s.mobile)}</a>` : html`<span>${s.mobile}</span>`) : ''}
      <a href="mailto:${s.email}" title="${s.email}">${s.email}</a>
    </div></td>
    <td data-label="State"><div>${shopStatePill(s.state)}</div></td>
    <td data-label="Plan" class="adm-plan-cell">${planCell(s, ctx.today)}</td>
    <td data-label="Orders" class="num"><div class="adm-lines adm-num"><b>${num(s.orders_count)}</b><span class="adm-sub">${num(s.orders_today)} today</span></div></td>
    <td data-label="Storage" class="num adm-col-storage"><span class="nowrap">${formatBytes(s.storage_bytes)}</span></td>
    <td data-label="Activity" class="adm-col-activity"><div class="adm-lines adm-activity">
      <span>Joined ${timeAgo(s.created_at)}</span>
      <span class="adm-sub">${s.last_order_at ? `Last order ${timeAgo(s.last_order_at)}` : 'No orders yet'}</span>
    </div></td>
    <td class="adm-td-actions${pending ? ' adm-hide-cards' : ''}"><a class="btn btn-secondary btn-sm" href="/admin/shops/${s.id}">${pending ? 'Review' : 'Manage'}<span class="sr-only"> ${s.name}</span></a></td>
  </tr>${pending ? approveRow(res, s, ctx) : ''}`;
}

function emptyShops({ q, status, total }) {
  if (!total && !q && !status) {
    return emptyState({ title: 'No shops yet', text: 'When a print shop registers, it shows up here for approval.' });
  }
  if (status === 'pending' && !q) {
    return emptyState({ title: 'Nothing waiting for approval', text: 'You are all caught up. New sign-ups will appear here.' });
  }
  return emptyState({
    title: 'No matching shops',
    text: q ? `Nothing found for “${q}”. Try a shop name, link, city, mobile or email.` : 'No shop is in this state right now.',
    action: html`<a class="btn btn-secondary btn-sm" href="/admin#shops">Show all shops</a>`,
  });
}

export function overviewView(res, { overview, shops, counts, q, status, today }) {
  const back = `${listHref({ q, status })}#shops`;
  const heading = status ? `${SHOP_STATE_LABEL[status]} shops` : 'All shops';
  return html`<div class="container adm">
    <div class="page-head adm-page-head">
      <div>
        <span class="eyebrow">Super admin</span>
        <h1>Shops overview</h1>
        <p>Approve new print shops, manage plans and keep an eye on usage.</p>
      </div>
      ${overview.pending
        ? html`<a class="btn btn-primary" href="${listHref({ status: 'pending' })}#shops">${icon('clock')}<span>Review ${num(overview.pending)} pending</span></a>`
        : ''}
    </div>

    ${statsGrid(overview)}

    <section class="card adm-shops" id="shops" aria-labelledby="shops-h">
      <div class="adm-shops-head">
        <h2 id="shops-h">${heading} <span class="count">${num(shops.length)}</span></h2>
        <form class="search-form adm-search" method="get" action="/admin#shops" role="search">
          ${status ? html`<input type="hidden" name="status" value="${status}">` : ''}
          <div class="search-input">
            ${icon('search')}
            <label class="sr-only" for="adm-q">Search shops</label>
            <input type="search" id="adm-q" name="q" value="${q}" placeholder="Name, link, city, mobile or email" maxlength="80" autocomplete="off" enterkeyhint="search">
          </div>
          <button class="btn btn-secondary" type="submit">Search</button>
          ${q ? html`<a class="btn btn-ghost" href="${listHref({ status })}#shops">Clear</a>` : ''}
        </form>
      </div>
      <nav class="tabs adm-filters" aria-label="Filter shops by state">
        ${FILTERS.map(
          (key) =>
            html`<a href="${listHref({ q, status: key })}#shops"${key === status ? raw(' aria-current="page"') : ''}>${key ? SHOP_STATE_LABEL[key] : 'All'} <span class="count">${num(counts[key] || 0)}</span></a>`
        )}
      </nav>
      ${shops.length
        ? html`<div class="table-wrap adm-table-wrap">
            <table class="table table-cards adm-table">
              <thead>
                <tr>
                  <th scope="col">Shop</th>
                  <th scope="col">Owner</th>
                  <th scope="col">State</th>
                  <th scope="col">Plan</th>
                  <th scope="col" class="num">Orders</th>
                  <th scope="col" class="num adm-col-storage">Storage</th>
                  <th scope="col" class="adm-col-activity">Activity</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>${shops.map((s) => shopRow(res, s, { today, back }))}</tbody>
            </table>
          </div>`
        : emptyShops({ q, status, total: counts[''] || 0 })}
    </section>
  </div>`;
}
