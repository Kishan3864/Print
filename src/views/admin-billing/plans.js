import { html, raw } from '../../lib/html.js';
import { formatINR } from '../../services/billing.js';
import { FEATURES, LIMITS } from '../../services/entitlements.js';
import { alert, csrfField, icon } from '../components.js';
import { savingLabel, yearlySaving } from '../shop-billing/common.js';
import { adminIcon } from '../admin/common.js';

// /admin/plans – "Plans & features": prices (monthly / yearly / lifetime / Updates & Support),
// what each plan includes (feature matrix + limits), add-on prices, paid service prices.
// Four small forms, each saved on its own (routes/admin-billing.js).

const describedBy = (id, error) => (error ? raw(` aria-describedby="${id}-error" aria-invalid="true"`) : '');

function money({ id, name, label, value, error, hint = '' }) {
  return html`<div class="field${error ? ' has-error' : ''}">
    <label for="${id}">${label}</label>
    <div class="input-group"><span class="input-addon">₹</span><input id="${id}" name="${name}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="7" autocomplete="off" required value="${value}"${describedBy(id, error)}></div>
    ${hint ? html`<p class="hint">${hint}</p>` : ''}
    ${error ? html`<p class="field-error" id="${id}-error">${error}</p>` : ''}
  </div>`;
}

function planEditor(p, errors) {
  const e = errors[p.key] || {};
  const saving = Number.isFinite(Number(p.monthly)) && Number.isFinite(Number(p.yearly)) ? yearlySaving({ monthly: Number(p.monthly), yearly: Number(p.yearly) }) : null;
  const id = (f) => `pl-${p.key}-${f}`;
  return html`<fieldset class="card adm-plan${p.active ? '' : ' is-off'}">
    <legend class="sr-only">${p.name || p.key} plan</legend>
    <div class="adm-plan-head">
      <h2 class="adm-plan-name">${p.name || p.key}<small>${p.key}</small></h2>
      <label class="adm-switch"><input type="checkbox" name="active_${p.key}" value="1"${p.active ? raw(' checked') : ''}><span>Shown to shops</span></label>
    </div>
    <div class="adm-plan-body">
      <div class="field${e.name ? ' has-error' : ''}">
        <label for="${id('name')}">Plan name</label>
        <input id="${id('name')}" name="name_${p.key}" type="text" maxlength="30" required autocomplete="off" value="${p.name}"${describedBy(id('name'), e.name)}>
        ${e.name ? html`<p class="field-error" id="${id('name')}-error">${e.name}</p>` : ''}
      </div>
      <div class="form-row">
        ${money({ id: id('monthly'), name: `monthly_${p.key}`, label: 'Monthly', value: p.monthly, error: e.monthly })}
        ${money({ id: id('yearly'), name: `yearly_${p.key}`, label: 'Yearly', value: p.yearly, error: e.yearly })}
      </div>
      <p class="adm-plan-save">${saving ? html`${icon('check')}<span>Yearly saves ${formatINR(saving.save)} · shown as “${savingLabel(saving)}”</span>` : html`${icon('info')}<span>Yearly is not cheaper than 12 × monthly.</span>`}</p>
      <div class="form-row adm-row-2l">
        ${money({ id: id('lifetime'), name: `lifetime_${p.key}`, label: 'Lifetime (once)', value: p.lifetime, error: e.lifetime, hint: '0 = not sold for life' })}
        ${money({ id: id('care'), name: `care_${p.key}`, label: 'Updates & Support / year', value: p.care, error: e.care, hint: 'For lifetime, after year 1' })}
      </div>
      <div class="field${e.storageGb ? ' has-error' : ''}">
        <label for="${id('storage')}">File storage</label>
        <div class="input-group"><input id="${id('storage')}" name="storage_${p.key}" type="text" inputmode="numeric" maxlength="6" required value="${p.storageGb}"${describedBy(id('storage'), e.storageGb)}><span class="input-addon adm-addon-end">GB</span></div>
        ${e.storageGb ? html`<p class="field-error" id="${id('storage')}-error">${e.storageGb}</p>` : ''}
      </div>
    </div>
    <div class="adm-plan-pop"><label class="adm-radio"><input type="radio" name="popular" value="${p.key}"${p.popular ? raw(' checked') : ''}><span>Mark as “Most popular”</span></label></div>
  </fieldset>`;
}

function matrixForm(res, plans, matrix) {
  return html`<form method="post" action="/admin/plans/features" class="card adm-matrix" id="features">
    ${csrfField(res)}
    <div class="card-head"><h2>${adminIcon('tag')}<span>What each plan includes</span></h2></div>
    <p class="hint adm-matrix-hint">Changes apply to every shop on that plan right away (lifetime shops keep what they bought plus anything you add). Per-shop exceptions: open the shop.</p>
    <div class="table-wrap">
      <table class="table adm-matrix-table">
        <thead><tr><th scope="col">Feature</th>${plans.map((p) => html`<th scope="col" class="num">${p.name}</th>`)}</tr></thead>
        <tbody>
          ${FEATURES.filter((f) => f.core).map((f) => html`<tr><th scope="row">${f.label}</th>${plans.map(() => html`<td class="num"><span class="adm-matrix-core">Always</span></td>`)}</tr>`)}
          ${FEATURES.filter((f) => !f.core).map(
            (f) => html`<tr><th scope="row">${f.label}${f.addon ? html` <span class="adm-cycle adm-bills-tag">add-on</span>` : ''}</th>${plans.map(
              (p) => html`<td class="num"><label class="adm-matrix-check"><input type="checkbox" name="m_${p.key}_${f.key}" value="1"${matrix[p.key]?.[f.key] ? raw(' checked') : ''}><span class="sr-only">${f.label} in ${p.name}</span></label></td>`
            )}</tr>`
          )}
          ${LIMITS.map(
            (l) => html`<tr><th scope="row">${l.label}${l.unit ? ` (${l.unit})` : ''}</th>${plans.map(
              (p) => html`<td class="num"><input class="adm-matrix-num" type="number" name="m_${p.key}_${l.key}" min="${l.min}" max="${l.max}" value="${matrix[p.key]?.[l.key]}" aria-label="${l.label} for ${p.name}"></td>`
            )}</tr>`
          )}
        </tbody>
      </table>
    </div>
    <div class="card-foot adm-matrix-foot"><button class="btn btn-primary" type="submit">${icon('check')}<span>Save features</span></button></div>
  </form>`;
}

function addonsForm(res, addons, errors = {}) {
  return html`<form method="post" action="/admin/plans/addons" class="card adm-addons-form" id="addons">
    ${csrfField(res)}
    <div class="card-head"><h2>${adminIcon('database')}<span>Add-ons</span></h2></div>
    <div class="card-body">
      ${errors._ ? alert('danger', errors._) : ''}
      ${addons.map(
        (a) => html`<fieldset class="adm-addon-edit">
          <legend><b>${a.name}</b> <label class="adm-switch"><input type="checkbox" name="active_${a.key}" value="1"${a.active ? raw(' checked') : ''}><span>Sold to shops</span></label></legend>
          <p class="hint">${a.blurb}</p>
          <div class="form-row form-row-3">
            ${money({ id: `ad-${a.key}-m`, name: `monthly_${a.key}`, label: 'Monthly', value: a.monthly })}
            ${money({ id: `ad-${a.key}-y`, name: `yearly_${a.key}`, label: 'Yearly', value: a.yearly })}
            ${money({ id: `ad-${a.key}-l`, name: `lifetime_${a.key}`, label: 'Lifetime', value: a.lifetime })}
          </div>
        </fieldset>`
      )}
      <p class="hint">0 = not sold that way. Shops on a plan that already includes the add-on's features never pay for it.</p>
    </div>
    <div class="card-foot"><button class="btn btn-primary" type="submit">${icon('check')}<span>Save add-ons</span></button></div>
  </form>`;
}

function servicesForm(res, services, custom) {
  return html`<form method="post" action="/admin/plans/services" class="card adm-services-form" id="services">
    ${csrfField(res)}
    <div class="card-head"><h2>${adminIcon('note')}<span>Paid services</span></h2></div>
    <div class="card-body">
      ${services.map(
        (s) => html`<fieldset class="adm-addon-edit">
          <legend><b>${s.name}</b> <label class="adm-switch"><input type="checkbox" name="active_${s.key}" value="1"${s.active ? raw(' checked') : ''}><span>Offered</span></label></legend>
          <p class="hint">${s.blurb}</p>
          ${money({ id: `sv-${s.key}`, name: `price_${s.key}`, label: 'Price', value: s.price })}
        </fieldset>`
      )}
      <fieldset class="adm-addon-edit">
        <legend><b>Custom work (shown to shops)</b></legend>
        <div class="form-row">
          ${money({ id: 'sv-min', name: 'custom_min', label: 'Starts from', value: custom.min })}
          ${money({ id: 'sv-hourly', name: 'custom_hourly', label: 'About per hour', value: custom.hourly })}
        </div>
      </fieldset>
    </div>
    <div class="card-foot"><button class="btn btn-primary" type="submit">${icon('check')}<span>Save services</span></button></div>
  </form>`;
}

export function plansView(res, { plans, errors = {}, formError = '', matrix, addons, services, custom }) {
  const nonePopular = !plans.some((p) => p.popular);
  return html`<div class="container adm">
    <div class="adm-pagehead">
      <div>
        <p class="adm-kicker">Whole rupees · new prices apply to new payments</p>
        <h1>Plans &amp; features</h1>
      </div>
      <nav class="adm-pagehead-actions tabs" aria-label="On this page"><a href="#prices">Prices</a><a href="#features">Features</a><a href="#addons">Add-ons</a><a href="#services">Services</a></nav>
    </div>
    ${formError ? alert('danger', formError) : ''}
    <form method="post" action="/admin/plans" class="adm-plans-form" id="prices" novalidate>
      ${csrfField(res)}
      <div class="adm-plans">${plans.map((p) => planEditor(p, errors))}</div>
      <div class="card adm-plans-foot">
        <label class="adm-radio"><input type="radio" name="popular" value=""${nonePopular ? raw(' checked') : ''}><span>No “Most popular” badge</span></label>
        <button class="btn btn-primary btn-lg" type="submit">${icon('check')}<span>Save prices</span></button>
      </div>
    </form>
    ${matrixForm(res, plans, matrix)}
    <div class="adm-two">
      ${addonsForm(res, addons)}
      ${servicesForm(res, services, custom)}
    </div>
  </div>`;
}
