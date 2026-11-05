import { html, raw } from '../../lib/html.js';
import { formatDate, prettyPhone } from '../../lib/util.js';
import { PAY_FILTERS, PERIODS, rs } from '../../services/bills.js';
import { csrfField, icon } from '../components.js';
import { shopIcon } from '../chrome/shop.js';
import { billNo, billPath, billsSubnav, newBillButton, pageHead, payPill } from './common.js';

// /shop/bills – today / this month / to collect, then every bill with search, filters, sorting and CSV.

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** /shop/bills?… with defaults left out. */
export function listUrl({ q = '', pay = '', period = 'all', sort = 'date', dir = 'desc', page = 1 } = {}, base = '/shop/bills') {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (pay) p.set('pay', pay);
  if (period && period !== 'all') p.set('period', period);
  if (sort && sort !== 'date') p.set('sort', sort);
  if (dir && dir !== 'desc') p.set('dir', dir);
  if (page > 1) p.set('page', String(page));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

function statTile({ label, value, sub, tone, ic, href }) {
  const inner = html`<span class="bi-stat-ic">${shopIcon(ic)}</span>
    <span class="bi-stat-copy">
      <span class="bi-stat-label">${label}</span>
      <span class="bi-stat-value">${value}</span>
      <span class="bi-stat-sub">${sub}</span>
    </span>`;
  return href
    ? html`<a class="card bi-stat bi-stat-${tone}" href="${href}">${inner}</a>`
    : html`<div class="card bi-stat bi-stat-${tone}">${inner}</div>`;
}

/** Sortable column header. */
function sortTh(f, key, label, cls = '') {
  const on = f.sort === key;
  const dir = on && f.dir === 'desc' ? 'asc' : key === 'customer' && !on ? 'asc' : 'desc';
  const aria = on ? raw(` aria-sort="${f.dir === 'asc' ? 'ascending' : 'descending'}"`) : '';
  return html`<th scope="col" class="${cls}"${aria}><a class="bi-sort${on ? ' is-on' : ''}" href="${listUrl({ ...f, sort: key, dir, page: 1 })}">${label}<span class="bi-sort-ic" aria-hidden="true">${on ? (f.dir === 'asc' ? '↑' : '↓') : '↕'}</span></a></th>`;
}

function row(b, res) {
  const more = b.line_count > 1 ? ` + ${b.line_count - 1} more` : '';
  return html`<tr class="bi-tr${b.status === 'cancelled' ? ' is-cancelled' : ''}">
    <td class="bi-c-no"><a class="bi-no" href="${billPath(b)}">${billNo(b)}</a><span class="bi-sub">${formatDate(b.bill_date)}</span></td>
    <td class="bi-c-cust"><a class="bi-cust" href="${billPath(b)}">${b.customer_name || 'Cash customer'}</a>${b.customer_mobile ? html`<span class="bi-sub">${prettyPhone(b.customer_mobile)}</span>` : ''}</td>
    <td class="bi-c-items"><span class="bi-items-text">${b.first_line || '—'}<span class="bi-more">${more}</span></span>${b.order_no ? html`<span class="bi-sub">Online order P-${b.order_no}</span>` : ''}${b.is_sample ? html`<span class="bi-sample">Sample</span>` : ''}</td>
    <td class="bi-c-total num"><b>${rs(b.total_paise)}</b></td>
    <td class="bi-c-status">${payPill(b)}</td>
    <td class="bi-c-act"><span class="bi-acts">
      <a class="btn btn-ghost btn-sm btn-icon" href="${billPath(b)}/pdf?dl=1" title="Download PDF" aria-label="Download PDF of ${billNo(b)}">${icon('download')}</a>
      <form method="post" action="${billPath(b)}/delete" class="inline-form">${csrfField(res)}<button class="btn btn-ghost btn-sm btn-icon bi-del" type="submit" title="Delete bill" aria-label="Delete ${billNo(b)}" data-confirm="Delete bill ${billNo(b)} (${b.customer_name || 'Cash customer'}, ${rs(b.total_paise)}) for ever? This cannot be undone.">${shopIcon('trash')}</button></form>
    </span></td>
  </tr>`;
}

/**
 * @param d.res, d.shop, d.stats (billStats), d.list ({rows,total,sums}), d.filters {q,pay,period,sort,dir}, d.page, d.pageSize, d.itemsCount
 */
export function billsListView(d) {
  const { res, stats, list, filters: f, page, pageSize } = d;
  const filtered = Boolean(f.q || f.pay || (f.period && f.period !== 'all'));
  const offset = (page - 1) * pageSize;
  const to = offset + list.rows.length;

  const firstRun = !stats.all;
  const starter =
    firstRun && !d.itemsCount
      ? html`<section class="card bi-start" aria-labelledby="bi-start-h">
          <span class="bi-start-ic">${shopIcon('tag')}</span>
          <div class="bi-start-copy">
            <h2 id="bi-start-h">First, add what you sell</h2>
            <p>Put your items and rates in the rate list once – then a bill takes a few taps. You can also type any item straight into a bill.</p>
            <div class="btn-row">
              <form method="post" action="/shop/bills/items/starter" class="inline-form">${csrfField(res)}<button class="btn btn-primary btn-sm" type="submit">${icon('plus')}<span>Add common print-shop items</span></button></form>
              <a class="btn btn-secondary btn-sm" href="/shop/bills/items">Add my own items</a>
              <a class="btn btn-ghost btn-sm" href="/shop/bills/new">Skip – make a bill</a>
            </div>
          </div>
        </section>`
      : '';

  const tiles = html`<div class="bi-stats">
    ${statTile({ label: 'Today', value: rs(stats.today.total), sub: plural(stats.today.n, 'bill'), tone: 'today', ic: 'receipt', href: listUrl({ period: 'today' }) })}
    ${statTile({ label: 'This month', value: rs(stats.month.total), sub: plural(stats.month.n, 'bill'), tone: 'month', ic: 'rupee', href: listUrl({ period: 'month' }) })}
    ${statTile({ label: 'To collect', value: rs(stats.due.total), sub: stats.due.n ? `${plural(stats.due.n, 'bill')} not fully paid` : 'Nothing pending', tone: stats.due.n ? 'due' : 'ok', ic: stats.due.n ? 'clock' : 'check', href: stats.due.n ? listUrl({ pay: 'due' }) : '' })}
  </div>`;

  const select = (name, options, value, label) => html`<label class="bi-filter">
    <span class="sr-only">${label}</span>
    <select name="${name}" data-autosubmit aria-label="${label}">${Object.entries(options).map(([k, v]) => html`<option value="${k}"${k === value ? raw(' selected') : ''}>${v}</option>`)}</select>
  </label>`;

  const toolbar = html`<form class="bi-toolbar" method="get" action="/shop/bills" role="search">
    ${f.sort !== 'date' ? html`<input type="hidden" name="sort" value="${f.sort}">` : ''}
    ${f.dir !== 'desc' ? html`<input type="hidden" name="dir" value="${f.dir}">` : ''}
    <div class="search-input bi-search">
      ${icon('search')}
      <label class="sr-only" for="bill-q">Search bills</label>
      <input type="search" id="bill-q" name="q" value="${f.q}" placeholder="Name, mobile or B-number" maxlength="60" autocomplete="off" enterkeyhint="search">
    </div>
    ${select('period', PERIODS, f.period || 'all', 'Period')}
    ${select('pay', PAY_FILTERS, f.pay || '', 'Payment')}
    <noscript><button class="btn btn-secondary" type="submit">Show</button></noscript>
    <a class="btn btn-secondary bi-csv" href="${listUrl(f, '/shop/bills/export.csv')}" title="Download these bills for Excel / your accountant" aria-label="Download CSV">${icon('download')}<span>CSV</span></a>
  </form>`;

  let body;
  if (list.rows.length) {
    body = html`<div class="table-wrap">
      <table class="table bi-table">
        <caption class="sr-only">Bills</caption>
        <thead><tr>
          ${sortTh(f, 'date', 'Bill', 'bi-c-no')}
          ${sortTh(f, 'customer', 'Customer', 'bi-c-cust')}
          <th scope="col" class="bi-c-items">Items</th>
          ${sortTh(f, 'total', 'Total', 'bi-c-total num')}
          ${sortTh(f, 'due', 'Status', 'bi-c-status')}
          <th scope="col" class="bi-c-act"><span class="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>${list.rows.map((b) => row(b, res))}</tbody>
      </table>
    </div>`;
  } else if (filtered) {
    body = html`<div class="sh-empty">
      <span class="sh-empty-icon">${icon('search')}</span>
      <h3>No bills match</h3>
      <p>Try another name, the last digits of a mobile number, or a bill number like B-1001.</p>
      <a class="btn btn-secondary btn-sm" href="/shop/bills">Show all bills</a>
    </div>`;
  } else {
    body = html`<div class="sh-empty">
      <span class="sh-empty-icon">${shopIcon('receipt')}</span>
      <h3>No bills yet</h3>
      <p>Make a bill for a walk-in customer or an online order. It gets a number like B-1001, your shop name and logo, and a PDF you can send on WhatsApp.</p>
      ${newBillButton('Make your first bill')}
    </div>`;
  }

  const sums = list.total
    ? html`<div class="bi-sums" aria-label="Totals for these bills">
        <span><b>${plural(list.total, 'bill')}</b>${filtered ? ' match' : ''}</span>
        <span>Billed <b>${rs(list.sums.total)}</b></span>
        <span>Received <b>${rs(list.sums.paid)}</b></span>
        <span class="${list.sums.due ? 'is-due' : ''}">To collect <b>${rs(list.sums.due)}</b></span>
      </div>`
    : '';

  const pager =
    list.total > pageSize || page > 1
      ? html`<nav class="sh-pager" aria-label="Pages">
          <span>${list.rows.length ? `${offset + 1}–${to} of ${list.total}` : `${list.total} bills`}</span>
          <div class="btn-row">
            ${page > 1 ? html`<a class="btn btn-secondary btn-sm" href="${listUrl({ ...f, page: page - 1 })}" rel="prev">${icon('arrowLeft')}<span>Previous</span></a>` : ''}
            ${to < list.total ? html`<a class="btn btn-secondary btn-sm" href="${listUrl({ ...f, page: page + 1 })}" rel="next"><span>Next</span>${icon('arrowRight')}</a>` : ''}
          </div>
        </nav>`
      : '';

  return html`<section class="container bi-page">
    ${pageHead({ title: 'Bills', text: 'Make a proper bill in your shop’s name for any customer – walk-in or online. Download the PDF or send it on WhatsApp.', action: newBillButton() })}
    ${billsSubnav('bills', { items: d.itemsCount })}
    ${starter}
    ${firstRun ? '' : tiles}
    <section class="card bi-list" aria-label="All bills">
      ${firstRun ? '' : toolbar}
      ${f.q ? html`<p class="sh-results">Results for “<b>${f.q}</b>” · <a href="${listUrl({ ...f, q: '', page: 1 })}">Clear</a></p>` : ''}
      ${body}
      ${sums}
      ${pager}
    </section>
  </section>`;
}
