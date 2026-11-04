import { html, raw } from '../../lib/html.js';
import { formatDate } from '../../lib/util.js';
import { CYCLES, formatINR, getPlans, isSampleShop, nextPeriodStart, periodEnd } from '../../services/billing.js';
import { csrfField, icon } from '../components.js';

// Admin: "Record a payment" form for the shop detail page (/admin/shops/:id).
// Posts to /admin/shops/:id/payments (routes/admin-billing.js).

/** Record a UPI / cash / bank payment and extend the shop's plan. */
export function manualPaymentForm(res, shop) {
  if (isSampleShop(shop)) {
    return html`<p class="hint adm-pay-off">${icon('info')} The shared sample demo shop cannot be billed.</p>`;
  }
  const plans = getPlans();
  const selected = plans.find((p) => p.key === shop.plan) || plans.find((p) => p.popular) || plans[0];
  const cycle = shop.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
  const start = nextPeriodStart(shop);
  const prices = Object.fromEntries(plans.map((p) => [p.key, { monthly: p.monthly, yearly: p.yearly }]));
  const id = (name) => `bl-mp-${shop.id}-${name}`;
  const confirm = shop.is_demo
    ? `This is a demo shop. Recording a payment makes it live at /${shop.slug} and deletes its demo orders. Continue?`
    : '';
  return html`<form method="post" action="/admin/shops/${shop.id}/payments" class="adm-payform" data-bl-manual data-prices="${JSON.stringify(prices)}"${confirm ? html` data-confirm="${confirm}"` : ''}>
    ${csrfField(res)}
    <div class="form-row">
      <div class="field">
        <label for="${id('plan')}">Plan</label>
        <select id="${id('plan')}" name="plan" data-bl-plan>
          ${plans.map((p) => html`<option value="${p.key}"${p.key === selected.key ? raw(' selected') : ''}>${p.name} – ${formatINR(p.monthly)}/mo · ${formatINR(p.yearly)}/yr${p.active ? '' : ' (hidden)'}</option>`)}
        </select>
      </div>
      <fieldset class="field adm-payform-cycle">
        <legend class="label">Billing cycle</legend>
        <div class="seg">
          ${Object.entries(CYCLES).map(
            ([key, label]) => html`<label><input type="radio" name="cycle" value="${key}" data-bl-cycle${key === cycle ? raw(' checked') : ''}><span>${label}</span></label>`
          )}
        </div>
      </fieldset>
    </div>
    <div class="form-row">
      <div class="field">
        <label for="${id('amount')}">Amount received (₹) <span class="optional">optional</span></label>
        <input id="${id('amount')}" name="amount" type="text" inputmode="decimal" autocomplete="off" maxlength="10" pattern="[0-9]+([.][0-9]{1,2})?" placeholder="${String(selected[cycle])}" data-bl-amount aria-describedby="${id('amount')}-hint">
        <p class="hint" id="${id('amount')}-hint">Leave empty to use the plan price.</p>
      </div>
      <div class="field">
        <label for="${id('note')}">Note <span class="optional">optional</span></label>
        <input id="${id('note')}" name="note" type="text" maxlength="200" autocomplete="off" placeholder="e.g. UPI ref 4321 0987 6543">
      </div>
    </div>
    <p class="adm-payform-period">${icon('clock')}<span>New period starts <b>${formatDate(start)}</b> (monthly: till ${formatDate(periodEnd(start, 'monthly'))} · yearly: till ${formatDate(periodEnd(start, 'yearly'))}).${shop.status === 'paused' || shop.status === 'rejected' ? ' This also switches the shop back on.' : ''}</span></p>
    <div class="form-actions">
      <button class="btn btn-primary" type="submit">${icon('check')}<span>Record payment &amp; extend plan</span></button>
    </div>
  </form>`;
}
