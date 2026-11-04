import { html, raw } from '../../lib/html.js';
import { formatDate, formatTime } from '../../lib/util.js';
import { getPlan } from '../../services/billing.js';
import { emptyState, icon } from '../components.js';
import { adminIcon } from '../admin/common.js';
import { METHOD_SHORT, cycleLabel, money, paise, PAYMENT_STATUS_LABEL, periodText } from '../shop-billing/common.js';

// /admin/payments – revenue at a glance + every payment.

export const PAYMENT_FILTERS = [
  { key: 'paid', label: 'Paid' },
  { key: 'created', label: 'Not completed' },
  { key: 'all', label: 'All' },
];

const num = (n) => Number(n || 0).toLocaleString('en-IN');

/** Main line + muted second line in one cell (keeps phone card rows tidy). */
const cell = (main, sub = '') => html`<span class="adm-cell"><span class="adm-cell-main">${main}</span>${sub ? html`<span class="adm-cell-sub">${sub}</span>` : ''}</span>`;

const payPill = (status) => html`<span class="pill adm-pay-${status}">${PAYMENT_STATUS_LABEL[status] || status}</span>`;

function stats(s) {
  return html`<section class="adm-stats adm-stats-3" aria-label="Revenue">
    <div class="adm-stat is-hero">
      <span class="adm-stat-ic">${adminIcon('rupee')}</span>
      <span class="adm-stat-text"><span class="adm-stat-label">This month</span><b class="adm-stat-value">${money(s.monthRupees)}</b><span class="adm-stat-sub">${num(s.monthCount)} payment${s.monthCount === 1 ? '' : 's'}</span></span>
    </div>
    <div class="adm-stat">
      <span class="adm-stat-ic">${adminIcon('trend')}</span>
      <span class="adm-stat-text"><span class="adm-stat-label">All time</span><b class="adm-stat-value">${money(s.totalRupees)}</b><span class="adm-stat-sub">${num(s.totalCount)} payment${s.totalCount === 1 ? '' : 's'}</span></span>
    </div>
    <div class="adm-stat">
      <span class="adm-stat-ic">${icon('store')}</span>
      <span class="adm-stat-text"><span class="adm-stat-label">Paying shops</span><b class="adm-stat-value">${num(s.activeSubscriptions)}</b><span class="adm-stat-sub">${s.expiringSoon ? `${num(s.expiringSoon)} end this week` : 'None end this week'}</span></span>
    </div>
  </section>`;
}

/** Header cell that sorts the table in place (public/js/admin.js); plain text without JS. */
const sortHead = (key, label, dir, cls = '') =>
  html`<th scope="col"${cls ? raw(` class="${cls}"`) : ''} aria-sort="none"><button type="button" class="adm-sort" data-sort="${key}" data-sort-dir="${dir}">${label}<span class="adm-sort-ic" aria-hidden="true">${adminIcon('sort')}</span></button></th>`;

function rows(payments, showStatus) {
  return payments.map((p) => {
    const plan = getPlan(p.plan);
    const when = p.paid_at || p.created_at || '';
    const search = [p.shop_name, p.shop_slug, plan ? plan.name : p.plan, METHOD_SHORT[p.method] || p.method, p.provider_payment_id, p.note].filter(Boolean).join(' ').toLowerCase();
    return html`<tr data-row data-search="${search}" data-s-shop="${String(p.shop_name || '').toLowerCase()}" data-s-amount="${p.amount_paise}" data-s-plan="${plan ? plan.name.toLowerCase() : p.plan}" data-s-date="${when}" data-s-status="${p.status}">
      <td class="adm-pc-shop">${cell(html`<a class="adm-shop-name" href="/admin/shops/${p.shop_id}">${p.shop_name}</a>`, `/${p.shop_slug}`)}</td>
      <td class="num adm-pc-amount"><b class="adm-amount">${paise(p.amount_paise)}</b></td>
      <td class="adm-pc-plan">${cell(plan ? plan.name : p.plan, cycleLabel(p.cycle))}</td>
      <td class="adm-pc-method">${cell(METHOD_SHORT[p.method] || p.method, p.provider_payment_id || p.note)}</td>
      <td class="adm-pc-period">${periodText(p)}</td>
      <td class="adm-pc-date">${cell(formatDate(when), formatTime(when))}</td>
      ${showStatus ? html`<td class="adm-pc-status">${payPill(p.status)}</td>` : ''}
    </tr>`;
  });
}

export function paymentsView({ stats: s, payments, filter, counts }) {
  const showStatus = filter !== 'paid';
  return html`<div class="container adm">
    <div class="adm-pagehead">
      <div>
        <p class="adm-kicker">Online (PayU) and recorded by you</p>
        <h1>Payments</h1>
      </div>
      <div class="adm-pagehead-actions">
        <a class="btn btn-secondary" href="/admin/plans">${adminIcon('tag')}<span>Plans &amp; prices</span></a>
      </div>
    </div>
    ${stats(s)}
    <section class="card adm-tablecard" aria-labelledby="adm-pay-h">
      <div class="adm-panel-head">
        <h2 id="adm-pay-h">Payment log</h2>
        <span class="adm-sub">To record UPI / cash, open the shop.</span>
      </div>
      <nav class="tabs adm-tabs" aria-label="Filter payments">
        ${PAYMENT_FILTERS.map(
          (f) => html`<a href="/admin/payments${f.key === 'paid' ? '' : `?status=${f.key}`}" class="${filter === f.key ? 'is-active' : ''}"${filter === f.key ? html` aria-current="page"` : ''}>${f.label} <span class="count">${num(counts[f.key] || 0)}</span></a>`
        )}
      </nav>
      ${payments.length
        ? html`<div class="adm-toolbar">
            <div class="search-input adm-toolbar-search">
              ${icon('search')}
              <label class="sr-only" for="pay-q">Filter payments</label>
              <input type="search" id="pay-q" placeholder="Filter by shop, plan, method or reference" autocomplete="off" data-row-filter="#adm-paylog">
              <kbd class="adm-kbd" aria-hidden="true">/</kbd>
            </div>
            <div class="adm-toolbar-sort">
              <label class="sr-only" for="pay-sort">Sort payments</label>
              <select id="pay-sort" data-sort-select="#adm-paylog">
                <option value="">Sort: newest first</option>
                <option value="amount">Sort: biggest amount</option>
                <option value="shop">Sort: shop A–Z</option>
                <option value="plan">Sort: plan</option>
              </select>
            </div>
            <p class="adm-count" aria-live="polite" data-row-count data-noun="payment"><b>${num(payments.length)}</b> payment${payments.length === 1 ? '' : 's'}</p>
          </div>
          <div class="table-wrap adm-table-wrap">
            <table class="table adm-table adm-paylog" id="adm-paylog" data-sortable>
              <thead><tr>${sortHead('shop', 'Shop', 'asc', 'adm-pc-shop')}${sortHead('amount', 'Amount', 'desc', 'num adm-pc-amount')}${sortHead('plan', 'Plan', 'asc', 'adm-pc-plan')}<th scope="col" class="adm-pc-method">Paid by</th><th scope="col" class="adm-pc-period">Period</th>${sortHead('date', 'Date', 'desc', 'adm-pc-date')}${showStatus ? sortHead('status', 'Status', 'asc', 'adm-pc-status') : ''}</tr></thead>
              <tbody>${rows(payments, showStatus)}</tbody>
            </table>
            <p class="adm-nomatch" data-row-empty hidden>No payment matches this filter.</p>
          </div>`
        : emptyState({
            title: filter === 'created' ? 'No unfinished payments' : 'No payments yet',
            text: filter === 'created' ? 'Payment links that were opened but not paid show up here.' : 'Payments appear here as soon as a shop pays online or you record one.',
          })}
      ${payments.length >= 200 ? html`<p class="adm-panel-more adm-sub">Showing the latest 200.</p>` : ''}
    </section>
  </div>`;
}
