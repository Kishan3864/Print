import { html, raw } from '../../lib/html.js';
import { formatDate, formatDateTime, timeAgo, ymd, addDays } from '../../lib/util.js';
import { CYCLES, getPlans, isSampleShop } from '../../services/billing.js';
import { FEATURES, LIMITS, entitlements, getAddons, isLifetime } from '../../services/entitlements.js';
import { legalVersion } from '../../services/legal.js';
import { csrfField, icon } from '../components.js';
import { adminIcon } from './common.js';

// Admin › shop page: everything this shop may use, and the controls to change it.
//   Plan & lifetime · Updates & Support · Add-ons (grant / extend / revoke) · feature overrides + limits
//   · consent (Terms) · audit log. Every change is written to the audit log by the routes.

const SOURCE = { core: 'Every plan', demo: 'Demo shop', plan: 'In plan', addon: 'Add-on', admin: 'Set by you' };
const LOCKED = { plan: 'Not in plan', addon: 'Add-on not active', expired: 'Plan not active', care: 'Updates ended', admin: 'Switched off by you' };

function featureRows(shop, ent) {
  const ov = ent.overrides.features;
  return FEATURES.filter((f) => !f.core).map((f) => {
    const st = ent.features[f.key];
    const sel = ov[f.key] === true ? 'on' : ov[f.key] === false ? 'off' : '';
    return html`<tr>
      <th scope="row">${f.label}</th>
      <td>${st.on ? html`<span class="pill pill-shop-active">On · ${SOURCE[st.source] || st.source}</span>` : html`<span class="pill pill-shop-paused">Off · ${LOCKED[st.locked] || st.locked}</span>`}</td>
      <td class="adm-ent-sel">
        <label class="sr-only" for="ov-${f.key}">Override for ${f.label}</label>
        <select id="ov-${f.key}" name="f_${f.key}">
          <option value=""${sel === '' ? raw(' selected') : ''}>Follow plan</option>
          <option value="on"${sel === 'on' ? raw(' selected') : ''}>Force on</option>
          <option value="off"${sel === 'off' ? raw(' selected') : ''}>Force off</option>
        </select>
      </td>
    </tr>`;
  });
}

function addonRows(res, shop, ent) {
  const today = ymd();
  return getAddons().map((a) => {
    const st = ent.addons[a.key] || {};
    const row = st.row;
    let state;
    if (st.inPlan) state = html`<span class="pill pill-shop-active">Included in plan</span>`;
    else if (st.active && row && !row.ends_on) state = html`<span class="pill pill-shop-active">On · no end (${row.cycle})</span>`;
    else if (st.active && row) state = html`<span class="pill pill-shop-active">On till ${formatDate(row.ends_on)} (${row.cycle})</span>`;
    else if (row && row.status === 'revoked') state = html`<span class="pill pill-shop-paused">Revoked</span>`;
    else if (row && row.ends_on && row.ends_on < today) state = html`<span class="pill pill-shop-expired">Ended ${formatDate(row.ends_on)}</span>`;
    else state = html`<span class="pill pill-shop-paused">Off</span>`;
    return html`<div class="adm-addon">
      <div class="adm-addon-head"><b>${a.name}</b>${state}</div>
      ${row?.note ? html`<p class="adm-sub">${row.source === 'payment' ? 'Paid' : 'Granted'} · ${row.note}</p>` : ''}
      <form method="post" action="/admin/shops/${shop.id}/addons" class="adm-addon-form">
        ${csrfField(res)}
        <input type="hidden" name="addon" value="${a.key}">
        <label class="sr-only" for="ad-${a.key}-mode">How</label>
        <select id="ad-${a.key}-mode" name="mode">
          <option value="free_until">Free till date…</option>
          <option value="free">Free, no end date</option>
          <option value="monthly">+1 month (free)</option>
          <option value="yearly">+1 year (free)</option>
        </select>
        <label class="sr-only" for="ad-${a.key}-date">End date</label>
        <input id="ad-${a.key}-date" type="date" name="ends_on" value="${addDays(today, 30)}" min="${today}">
        <input type="text" name="note" maxlength="120" placeholder="Note (why)" aria-label="Note">
        <button class="btn btn-secondary btn-sm" type="submit">${icon('check')}<span>Switch on</span></button>
      </form>
      ${st.active && !st.inPlan
        ? html`<form method="post" action="/admin/shops/${shop.id}/addons" class="inline-form" data-confirm="Switch ${a.name} off for ${shop.name} now? Their data stays saved.">${csrfField(res)}<input type="hidden" name="addon" value="${a.key}"><input type="hidden" name="mode" value="revoke"><button class="btn btn-danger btn-sm" type="submit">${icon('x')}<span>Switch off</span></button></form>`
        : ''}
    </div>`;
  });
}

/** The big "what can this shop use" card. data: { audit, consents } */
export function entitlementsCard(res, shop, { consents = [] } = {}) {
  if (isSampleShop(shop)) {
    return html`<section class="card adm-ent" id="access"><div class="card-head"><h2>Plan, add-ons &amp; features</h2></div><div class="card-body"><p class="hint">The shared sample shop has every feature, to show visitors.</p></div></section>`;
  }
  const ent = entitlements(shop);
  const ov = ent.overrides;
  const plans = getPlans();
  const lifetime = isLifetime(shop);
  const today = ymd();
  const careOn = shop.care_until && shop.care_until >= today;
  const version = legalVersion();
  return html`<section class="card adm-ent" id="access" aria-labelledby="ent-h">
    <div class="card-head"><h2 id="ent-h">Plan, add-ons &amp; features</h2>${lifetime ? html`<span class="pill pill-shop-active">Lifetime</span>` : ''}</div>
    <div class="card-body adm-ent-body">

      <div class="adm-ent-block">
        <h3>${adminIcon('tag')}<span>Lifetime licence</span></h3>
        ${lifetime
          ? html`<p class="hint">${shop.name} owns <b>${plans.find((p) => p.key === shop.plan)?.name || shop.plan}</b> for life. Use the plan form above to move them back to a subscription.</p>`
          : html`<p class="hint">Gives the shop a plan for life (no end date) with one year of Updates &amp; Support – e.g. after a lifetime payment you received outside PayU, or as a gift.</p>`}
        <form method="post" action="/admin/shops/${shop.id}/lifetime" class="adm-inline-form" data-confirm="Give ${shop.name} this plan for life (no end date)?">
          ${csrfField(res)}
          <label class="sr-only" for="lt-plan">Plan</label>
          <select id="lt-plan" name="plan">${plans.map((p) => html`<option value="${p.key}"${p.key === shop.plan ? raw(' selected') : ''}>${p.name}</option>`)}</select>
          <input type="text" name="note" maxlength="120" placeholder="Note (why)" aria-label="Note">
          <button class="btn btn-secondary btn-sm" type="submit">${lifetime ? 'Change lifetime plan' : 'Make lifetime'}</button>
        </form>
      </div>

      ${lifetime
        ? html`<div class="adm-ent-block">
            <h3>${icon('refresh')}<span>Updates &amp; Support</span> ${careOn ? html`<span class="pill pill-shop-active">Till ${formatDate(shop.care_until)}</span>` : html`<span class="pill pill-shop-expired">${shop.care_until ? `Ended ${formatDate(shop.care_until)}` : 'Not active'}</span>`}</h3>
            <form method="post" action="/admin/shops/${shop.id}/care" class="adm-inline-form">
              ${csrfField(res)}
              <label class="sr-only" for="care-date">Active till</label>
              <input id="care-date" type="date" name="care_until" value="${shop.care_until || addDays(today, 364)}">
              <input type="text" name="note" maxlength="120" placeholder="Note (why)" aria-label="Note">
              <button class="btn btn-secondary btn-sm" type="submit">Save date</button>
            </form>
          </div>`
        : ''}

      <div class="adm-ent-block">
        <h3>${adminIcon('database')}<span>Add-ons</span></h3>
        ${addonRows(res, shop, ent)}
        <p class="hint">Paid add-ons switch on by themselves after payment. Use this for gifts, trials or UPI payments (record the money under Payments too).</p>
      </div>

      <form method="post" action="/admin/shops/${shop.id}/overrides" class="adm-ent-block">
        ${csrfField(res)}
        <h3>${icon('settings')}<span>Features &amp; limits for this shop</span></h3>
        <div class="table-wrap">
          <table class="table adm-ent-table">
            <thead><tr><th scope="col">Feature</th><th scope="col">Now</th><th scope="col">Your setting</th></tr></thead>
            <tbody>${featureRows(shop, ent)}</tbody>
          </table>
        </div>
        <div class="adm-ent-limits">
          ${LIMITS.map((l) => html`<label class="field"><span class="label">${l.label}${l.unit ? ` (${l.unit})` : ''}</span><input type="number" name="l_${l.key}" min="${l.min}" max="${l.max}" value="${ov.limits[l.key] ?? ''}" placeholder="Plan: ${ent.limits[l.key]}"></label>`)}
          <label class="field"><span class="label">Storage (GB)</span><input type="number" name="l_storageGb" min="1" max="100000" value="${ov.limits.storageGb ?? ''}" placeholder="Plan: ${ent.limits.storageGb}"></label>
        </div>
        <p class="hint">Leave a limit empty to follow the plan. “Force on” works only while the shop's plan is active.</p>
        <button class="btn btn-primary btn-sm" type="submit">${icon('check')}<span>Save features &amp; limits</span></button>
      </form>

      <div class="adm-ent-block">
        <h3>${icon('shield')}<span>Terms &amp; privacy</span> ${shop.terms_version === version ? html`<span class="pill pill-shop-active">Accepted current</span>` : html`<span class="pill pill-shop-expired">${shop.terms_version ? 'Old version accepted' : 'Not accepted yet'}</span>`}</h3>
        ${consents.length
          ? html`<ul class="adm-consents">${consents.map((c) => html`<li><b>${formatDateTime(c.at)}</b> · version ${c.version}${c.ip ? ` · IP ${c.ip}` : ''}</li>`)}</ul>`
          : html`<p class="hint">They will be asked to accept on their next visit.</p>`}
      </div>
    </div>
  </section>`;
}

/** Recent audit entries for this shop. */
export function auditCard(rows) {
  return html`<details class="card fold adm-fold" id="audit">
    <summary><span class="fold-ic">${adminIcon('database')}</span><span class="fold-title"><b>Audit log</b><small>${rows.length ? `Last change ${timeAgo(rows[0].at)}` : 'No changes yet'}</small></span></summary>
    <div class="fold-body">
      ${rows.length
        ? html`<ol class="adm-audit">${rows.map(
            (r) => html`<li><span class="adm-audit-when">${formatDateTime(r.at)}</span><span class="adm-audit-what"><b>${r.action}</b> · ${r.detail}</span><span class="adm-audit-who">${r.actor}${r.ip ? ` · ${r.ip}` : ''}</span></li>`
          )}</ol>
          <a class="btn btn-ghost btn-sm" href="/admin/audit?shop=${rows[0].shop_id}">Full log</a>`
        : html`<p class="hint">Plan, add-on, feature, payment and consent changes appear here.</p>`}
    </div>
  </details>`;
}

export const cycleOptions = (selected, { lifetime = true } = {}) =>
  Object.entries(CYCLES)
    .filter(([k]) => lifetime || k !== 'lifetime')
    .map(([k, v]) => html`<option value="${k}"${k === selected ? raw(' selected') : ''}>${v}</option>`);
