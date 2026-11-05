import { html, raw } from '../../lib/html.js';
import { billDue, payState, rs } from '../../services/bills.js';
import { shopIcon } from '../chrome/shop.js';

// Pieces shared by the Bills pages (list, form, bill, rate list, setup). CSS prefix: .bi-

export const billPath = (bill) => `/shop/bills/${bill.bill_no}`;
export const billNo = (bill) => `B-${bill.bill_no}`;

const SUBNAV = [
  { key: 'bills', href: '/shop/bills', label: 'Bills', icon: 'receipt' },
  { key: 'items', href: '/shop/bills/items', label: 'Rate list', icon: 'tag' },
  { key: 'setup', href: '/shop/bills/setup', label: 'Bill setup', icon: 'sliders' },
];

/** Bills · Rate list · Bill setup (wraps, never cut off). */
export function billsSubnav(active, { items = null } = {}) {
  return html`<nav class="tabs bi-subnav" aria-label="Bills section">
    ${SUBNAV.map(
      (s) => html`<a href="${s.href}"${s.key === active ? raw(' aria-current="page"') : ''}>${shopIcon(s.icon)}<span>${s.label}</span>${s.key === 'items' && items != null ? html`<span class="count">${items}</span>` : ''}</a>`
    )}
  </nav>`;
}

/** Paid · Part paid (₹x due) · Not paid (₹x due) · Cancelled */
export function payPill(bill, { long = false } = {}) {
  const state = payState(bill);
  const due = billDue(bill);
  const text =
    state === 'paid' ? 'Paid' : state === 'cancelled' ? 'Cancelled' : state === 'part' ? (long ? `Part paid · ${rs(due)} due` : `${rs(due)} due`) : long ? `Not paid · ${rs(due)} due` : `${rs(due)} due`;
  return html`<span class="pill bi-pill-${state}">${text}</span>`;
}

/** Labelled page header used across the Bills pages. */
export const pageHead = ({ title, text, action = '' }) => html`<header class="page-head bi-head">
  <div>
    <h1>${title}</h1>
    ${text ? html`<p>${text}</p>` : ''}
  </div>
  ${action}
</header>`;

export const newBillButton = (label = 'New bill') => html`<a class="btn btn-primary" href="/shop/bills/new">${shopIcon('receipt')}<span>${label}</span></a>`;
