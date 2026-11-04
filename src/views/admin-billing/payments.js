import { html } from '../../lib/html.js';
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

function rows(payments, showStatus) {
  return payments.map((p) => {
    const plan = getPlan(p.plan);
    return html`<tr>
      <td data-label="Shop" class="adm-pc-shop">${cell(html`<a class="adm-shop-name" href="/admin/shops/${p.shop_id}">${p.shop_name}</a>`, `/${p.shop_slug}`)}</td>
      <td data-label="Amount" class="num adm-pc-amount"><b class="adm-amount">${paise(p.amount_paise)}</b></td>
      <td data-label="Plan" class="adm-pc-plan">${cell(plan ? plan.name : p.plan, cycleLabel(p.cycle))}</td>
      <td data-label="Paid by" class="adm-pc-method">${cell(METHOD_SHORT[p.method] || p.method, p.provider_payment_id || p.note)}</td>
      <td data-label="Period" class="adm-pc-period">${periodText(p)}</td>
      <td data-label="Date" class="adm-pc-date">${cell(formatDate(p.paid_at || p.created_at), formatTime(p.paid_at || p.created_at))}</td>
      ${showStatus ? html`<td data-label="Status" class="adm-pc-status">${payPill(p.status)}</td>` : ''}
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
        ? html`<div class="table-wrap adm-table-wrap">
            <table class="table table-cards adm-paylog">
              <thead><tr><th scope="col">Shop</th><th scope="col" class="num">Amount</th><th scope="col">Plan</th><th scope="col">Paid by</th><th scope="col">Period</th><th scope="col">Date</th>${showStatus ? html`<th scope="col">Status</th>` : ''}</tr></thead>
              <tbody>${rows(payments, showStatus)}</tbody>
            </table>
          </div>`
        : emptyState({
            title: filter === 'created' ? 'No unfinished payments' : 'No payments yet',
            text: filter === 'created' ? 'Payment links that were opened but not paid show up here.' : 'Payments appear here as soon as a shop pays online or you record one.',
          })}
      ${payments.length >= 200 ? html`<p class="adm-panel-more adm-sub">Showing the latest 200.</p>` : ''}
    </section>
  </div>`;
}
