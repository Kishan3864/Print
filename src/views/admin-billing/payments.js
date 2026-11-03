import { html } from '../../lib/html.js';
import { formatDate, formatTime } from '../../lib/util.js';
import { getPlan } from '../../services/billing.js';
import { emptyState, icon } from '../components.js';
import { METHOD_SHORT, cell, cycleLabel, money, paise, paymentStatusPill, periodText } from '../shop-billing/common.js';

// /admin/payments – revenue at a glance + every payment.

export const PAYMENT_FILTERS = [
  { key: 'paid', label: 'Paid' },
  { key: 'created', label: 'Not completed' },
  { key: 'all', label: 'All' },
];

const num = (n) => Number(n || 0).toLocaleString('en-IN');

function stat({ tone, ic, label, value, sub }) {
  return html`<div class="card bl-stat bl-stat-${tone}">
    <span class="bl-stat-ic">${icon(ic)}</span>
    <div class="bl-stat-copy">
      <span class="bl-stat-label">${label}</span>
      <span class="bl-stat-value">${value}</span>
      ${sub ? html`<span class="bl-stat-sub">${sub}</span>` : ''}
    </div>
  </div>`;
}

function stats(s) {
  return html`<section class="bl-stats" aria-label="Revenue">
    ${stat({ tone: 'primary', ic: 'sparkle', label: 'This month', value: money(s.monthRupees), sub: `${num(s.monthCount)} payment${s.monthCount === 1 ? '' : 's'}` })}
    ${stat({ tone: 'ink', ic: 'shield', label: 'Total revenue', value: money(s.totalRupees), sub: `${num(s.totalCount)} payment${s.totalCount === 1 ? '' : 's'} all time` })}
    ${stat({ tone: 'ok', ic: 'check', label: 'Active subscriptions', value: num(s.activeSubscriptions), sub: 'Live shops, paid up' })}
    ${stat({ tone: 'warn', ic: 'clock', label: 'Expiring in 7 days', value: num(s.expiringSoon), sub: s.expiringSoon ? 'Reminders are sent automatically' : 'None this week' })}
    ${stat({ tone: 'danger', ic: 'alert', label: 'Expired', value: num(s.expired), sub: s.expired ? 'Order links closed – follow up' : 'All paid up' })}
  </section>`;
}

// Cells carry bl-c-* classes: on phones each row becomes a compact grid (billing.css).
function rows(payments, showStatus) {
  return payments.map((p) => {
    const plan = getPlan(p.plan);
    return html`<tr>
      <td data-label="Date" class="bl-c-date">${cell(formatDate(p.paid_at || p.created_at), formatTime(p.paid_at || p.created_at))}</td>
      <td data-label="Shop" class="bl-c-shop">${cell(html`<a class="bl-shop-link" href="/admin/shops/${p.shop_id}">${p.shop_name}</a>`, `/${p.shop_slug}`)}</td>
      <td data-label="Plan" class="bl-c-plan">${cell(plan ? plan.name : p.plan, cycleLabel(p.cycle))}</td>
      <td data-label="Amount" class="num bl-c-amount"><b>${paise(p.amount_paise)}</b></td>
      <td data-label="Method" class="bl-c-method">${cell(METHOD_SHORT[p.method] || p.method, p.provider_payment_id || p.note)}</td>
      <td data-label="Period" class="bl-c-period${p.period_start ? '' : ' is-empty'}">${periodText(p)}</td>
      ${showStatus ? html`<td data-label="Status" class="bl-c-status">${paymentStatusPill(p.status)}</td>` : ''}
    </tr>`;
  });
}

export function paymentsView({ stats: s, payments, filter, counts }) {
  const showStatus = filter !== 'paid';
  return html`<div class="container bl-admin">
    <header class="page-head">
      <div>
        <p class="eyebrow">Billing</p>
        <h1>Payments</h1>
        <p>Every subscription payment – online (PayU) and recorded by you.</p>
      </div>
      <div class="btn-row">
        <a class="btn btn-secondary" href="/admin/plans">${icon('settings')}<span>Plans &amp; prices</span></a>
      </div>
    </header>
    ${stats(s)}
    <section class="card bl-admin-list" aria-labelledby="bl-payments-title">
      <div class="card-head">
        <h2 id="bl-payments-title">Payment log</h2>
        <span class="hint">To record a UPI / cash payment, open the shop.</span>
      </div>
      <nav class="tabs bl-filters" aria-label="Filter payments">
        ${PAYMENT_FILTERS.map(
          (f) => html`<a href="/admin/payments${f.key === 'paid' ? '' : `?status=${f.key}`}" class="${filter === f.key ? 'is-active' : ''}"${filter === f.key ? html` aria-current="page"` : ''}>${f.label} <span class="count">${num(counts[f.key] || 0)}</span></a>`
        )}
      </nav>
      ${payments.length
        ? html`<div class="table-wrap">
            <table class="table table-cards bl-table bl-log">
              <thead><tr><th scope="col">Date</th><th scope="col">Shop</th><th scope="col">Plan</th><th scope="col" class="num">Amount</th><th scope="col">Method</th><th scope="col">Period</th>${showStatus ? html`<th scope="col">Status</th>` : ''}</tr></thead>
              <tbody>${rows(payments, showStatus)}</tbody>
            </table>
          </div>`
        : html`<div class="card-body">${emptyState({
            title: filter === 'created' ? 'No unfinished payments' : 'No payments yet',
            text: filter === 'created' ? 'Payment links that were opened but not paid show up here.' : 'Payments appear here as soon as a shop pays online or you record one.',
          })}</div>`}
      ${payments.length >= 200 ? html`<p class="card-foot hint">Showing the latest 200.</p>` : ''}
    </section>
  </div>`;
}
