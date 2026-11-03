import { html } from '../../lib/html.js';
import { formatDate } from '../../lib/util.js';
import { CYCLES, formatINR } from '../../services/billing.js';

// Small pieces shared by the shop billing pages and the admin billing pages.

export const METHOD_LABEL = { payu: 'PayU', razorpay: 'Razorpay', manual: 'UPI / cash (recorded by Brighton Solution)' };
export const METHOD_SHORT = { payu: 'Online (PayU)', razorpay: 'Online (Razorpay)', manual: 'UPI / cash' };
export const PAYMENT_STATUS_LABEL = { paid: 'Paid', created: 'Not completed', failed: 'Failed', cancelled: 'Cancelled' };

/** ₹ amount: whole rupees as "₹4,990", otherwise two decimals ("₹4,500.50"). */
export const money = (rupees) => {
  const n = Number(rupees) || 0;
  return Number.isInteger(n) ? formatINR(n) : '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
export const paise = (n) => money((Number(n) || 0) / 100);
export const cycleLabel = (cycle) => CYCLES[cycle] || cycle;
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "3 Nov 2026 – 2 Dec 2026" (or a dash when the payment has no period yet). */
export const periodText = (p) => (p.period_start && p.period_end ? `${formatDate(p.period_start)} – ${formatDate(p.period_end)}` : '—');

/**
 * Yearly saving of a plan compared with 12 monthly payments:
 * { save, months, perMonth } or null when yearly is not cheaper.
 */
export function yearlySaving(plan) {
  const save = plan.monthly * 12 - plan.yearly;
  if (plan.monthly <= 0 || save <= 0) return null;
  return { save, months: Math.floor(save / plan.monthly + 1e-9), perMonth: Math.round(plan.yearly / 12) };
}

/** Short label for the yearly saving: "2 months free" or "Save ₹500". */
export function savingLabel(saving) {
  if (!saving) return '';
  return saving.months >= 1 ? `${plural(saving.months, 'month')} free` : `Save ${formatINR(saving.save)}`;
}

/** Table cell content: a main line and an optional muted line (one wrapper, so phone card rows stay two-column). */
export const cell = (main, sub = '') => html`<span class="bl-cell"><span class="bl-cell-main">${main}</span>${sub ? html`<span class="bl-cell-sub">${sub}</span>` : ''}</span>`;

export const paymentStatusPill =(status) => html`<span class="pill bl-pill-${status}">${PAYMENT_STATUS_LABEL[status] || status}</span>`;
