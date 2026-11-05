import { html, raw } from '../../lib/html.js';
import { formatDate } from '../../lib/util.js';
import { CYCLES, formatINR, getPlans, isSampleShop, nextPeriodStart, periodEnd } from '../../services/billing.js';
import { getAddons, isLifetime } from '../../services/entitlements.js';
import { csrfField, icon } from '../components.js';

// Admin: "Record a payment" form for the shop detail page (/admin/shops/:id).
// Posts to /admin/shops/:id/payments (routes/admin-billing.js). One "What" select covers
// plans, add-ons and Updates & Support; the amount defaults to the price of that choice.

export function manualPaymentForm(res, shop) {
  if (isSampleShop(shop)) {
    return html`<p class="hint adm-pay-off">${icon('info')} The shared sample demo shop cannot be billed.</p>`;
  }
  const plans = getPlans();
  const addons = getAddons();
  const current = plans.find((p) => p.key === shop.plan) || plans.find((p) => p.popular) || plans[0];
  const cycle = shop.billing_cycle && CYCLES[shop.billing_cycle] ? shop.billing_cycle : 'monthly';
  const start = nextPeriodStart(shop);
  const prices = {};
  for (const p of plans) prices[`plan:${p.key}`] = { monthly: p.monthly, yearly: p.yearly, lifetime: p.lifetime };
  for (const a of addons) prices[`addon:${a.key}`] = { monthly: a.monthly, yearly: a.yearly, lifetime: a.lifetime };
  if (isLifetime(shop)) {
    const p = plans.find((x) => x.key === shop.plan);
    prices.care = { monthly: p?.care || 0, yearly: p?.care || 0, lifetime: p?.care || 0 };
  }
  const id = (name) => `bl-mp-${shop.id}-${name}`;
  const confirm = shop.is_demo ? `This is a demo shop. Recording a plan payment makes it live at /${shop.slug} and deletes its demo orders. Continue?` : '';
  return html`<form method="post" action="/admin/shops/${shop.id}/payments" class="adm-payform" data-bl-manual data-prices="${JSON.stringify(prices)}"${confirm ? html` data-confirm="${confirm}"` : ''}>
    ${csrfField(res)}
    <div class="form-row">
      <div class="field">
        <label for="${id('what')}">Paid for</label>
        <select id="${id('what')}" name="what" data-bl-plan>
          <optgroup label="Plans">
            ${plans.map((p) => html`<option value="plan:${p.key}"${p.key === current.key ? raw(' selected') : ''}>${p.name} plan${p.active ? '' : ' (hidden)'}</option>`)}
          </optgroup>
          <optgroup label="Add-ons">
            ${addons.map((a) => html`<option value="addon:${a.key}">${a.name} add-on</option>`)}
          </optgroup>
          ${isLifetime(shop) ? html`<optgroup label="Lifetime"><option value="care">Updates &amp; Support · 1 year</option></optgroup>` : ''}
        </select>
      </div>
      <div class="field">
        <label for="${id('cycle')}">Billing</label>
        <select id="${id('cycle')}" name="cycle" data-bl-cycle-select>
          ${Object.entries(CYCLES).map(([k, v]) => html`<option value="${k}"${k === cycle ? raw(' selected') : ''}>${v}</option>`)}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="field">
        <label for="${id('amount')}">Amount received (₹) <span class="optional">optional</span></label>
        <input id="${id('amount')}" name="amount" type="text" inputmode="decimal" autocomplete="off" maxlength="10" pattern="[0-9]+([.][0-9]{1,2})?" placeholder="${String(current[cycle] ?? current.monthly)}" data-bl-amount aria-describedby="${id('amount')}-hint">
        <p class="hint" id="${id('amount')}-hint">Leave empty to use the price (${formatINR(current.monthly)}/mo · ${formatINR(current.yearly)}/yr · ${formatINR(current.lifetime)} lifetime).</p>
      </div>
      <div class="field">
        <label for="${id('note')}">Note <span class="optional">optional</span></label>
        <input id="${id('note')}" name="note" type="text" maxlength="200" autocomplete="off" placeholder="e.g. UPI ref 4321 0987 6543">
      </div>
    </div>
    <p class="adm-payform-period">${icon('clock')}<span>A plan payment starts <b>${formatDate(start)}</b> (monthly till ${formatDate(periodEnd(start, 'monthly'))} · yearly till ${formatDate(periodEnd(start, 'yearly'))} · lifetime: no end). Add-ons add a period after their current end.</span></p>
    <div class="form-actions">
      <button class="btn btn-primary" type="submit">${icon('check')}<span>Record payment &amp; switch on</span></button>
    </div>
  </form>`;
}
