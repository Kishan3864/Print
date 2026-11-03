import { html, raw } from '../../lib/html.js';
import { formatINR } from '../../services/billing.js';
import { alert, csrfField, icon } from '../components.js';
import { savingLabel, yearlySaving } from '../shop-billing/common.js';

// /admin/plans – edit plan names, prices, storage, visibility and the "Most popular" badge.

const describedBy = (id, error) => (error ? raw(` aria-describedby="${id}-error" aria-invalid="true"`) : '');

function numberField({ id, name, label, value, error, prefix = '', suffix = '' }) {
  return html`<div class="field${error ? ' has-error' : ''}">
    <label for="${id}">${label}</label>
    <div class="input-group">
      ${prefix ? html`<span class="input-addon">${prefix}</span>` : ''}
      <input id="${id}" name="${name}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="7" autocomplete="off" required value="${value}"${describedBy(id, error)}>
      ${suffix ? html`<span class="input-addon bl-addon-end">${suffix}</span>` : ''}
    </div>
    ${error ? html`<p class="field-error" id="${id}-error">${error}</p>` : ''}
  </div>`;
}

function planEditor(p, errors) {
  const e = errors[p.key] || {};
  const saving = Number.isFinite(Number(p.monthly)) && Number.isFinite(Number(p.yearly)) ? yearlySaving({ monthly: Number(p.monthly), yearly: Number(p.yearly) }) : null;
  const id = (f) => `bl-plan-${p.key}-${f}`;
  return html`<fieldset class="card bl-plan-edit${p.active ? '' : ' is-off'}">
    <legend class="sr-only">${p.name || p.key} plan</legend>
    <div class="bl-plan-edit-head">
      <span class="bl-plan-key mono">${p.key}</span>
      <label class="bl-switch"><input type="checkbox" name="active_${p.key}" value="1"${p.active ? raw(' checked') : ''}><span>Shown to shops</span></label>
    </div>
    <div class="field${e.name ? ' has-error' : ''}">
      <label for="${id('name')}">Plan name</label>
      <input id="${id('name')}" name="name_${p.key}" type="text" maxlength="30" required autocomplete="off" value="${p.name}"${describedBy(id('name'), e.name)}>
      ${e.name ? html`<p class="field-error" id="${id('name')}-error">${e.name}</p>` : ''}
    </div>
    <div class="form-row">
      ${numberField({ id: id('monthly'), name: `monthly_${p.key}`, label: 'Monthly price', value: p.monthly, error: e.monthly, prefix: '₹' })}
      ${numberField({ id: id('yearly'), name: `yearly_${p.key}`, label: 'Yearly price', value: p.yearly, error: e.yearly, prefix: '₹' })}
    </div>
    <p class="bl-plan-edit-save">${saving ? html`${icon('check')}<span>Yearly saves ${formatINR(saving.save)} · shown as “${savingLabel(saving)}”</span>` : html`${icon('info')}<span>Yearly is not cheaper than 12 × monthly – no saving is shown.</span>`}</p>
    ${numberField({ id: id('storage'), name: `storage_${p.key}`, label: 'File storage', value: p.storageGb, error: e.storageGb, suffix: 'GB' })}
    <label class="bl-radio"><input type="radio" name="popular" value="${p.key}"${p.popular ? raw(' checked') : ''}><span>Mark as “Most popular”</span></label>
  </fieldset>`;
}

export function plansView(res, { plans, errors = {}, formError = '' }) {
  const nonePopular = !plans.some((p) => p.popular);
  return html`<div class="container bl-admin">
    <header class="page-head">
      <div>
        <p class="eyebrow">Billing</p>
        <h1>Plans &amp; prices</h1>
        <p>Prices are in whole rupees. Changes apply to new payments – shops that already paid keep their period.</p>
      </div>
      <div class="btn-row"><a class="btn btn-secondary" href="/admin/payments">${icon('shield')}<span>Payments</span></a></div>
    </header>
    ${formError ? alert('danger', formError) : ''}
    <form method="post" action="/admin/plans" class="bl-plans-form" novalidate>
      ${csrfField(res)}
      <div class="bl-plan-edits">${plans.map((p) => planEditor(p, errors))}</div>
      <div class="card card-pad bl-plans-foot">
        <label class="bl-radio"><input type="radio" name="popular" value=""${nonePopular ? raw(' checked') : ''}><span>No “Most popular” badge</span></label>
        <button class="btn btn-primary btn-lg" type="submit">${icon('check')}<span>Save plans</span></button>
      </div>
    </form>
  </div>`;
}
