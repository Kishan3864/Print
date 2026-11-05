import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatDate, formatDateTime, ymd } from '../../lib/util.js';
import { CYCLES, daysLeft, formatINR, getPlan, paymentTitle } from '../../services/billing.js';
import { FEATURES, LIMITS, entitlements, getAddons, isLifetime, planFeatureList, planMatrix } from '../../services/entitlements.js';
import { orderFormUrl } from '../../services/notify.js';
import { csrfField, icon } from '../components.js';
import { shopIcon } from '../chrome/shop.js';
import { METHOD_SHORT, cell, paise, periodText, plural, savingLabel, yearlySaving } from './common.js';

// /shop/billing – "Plan & billing":
//   status card (plan, validity, lifetime + Updates & Support)
//   plans with a Monthly / Yearly / Lifetime switch      (#plans)
//   add-ons such as Bills, with their own validity        (#addons)
//   Updates & Support for lifetime plans                  (#care)
//   what each plan includes (comparison)                  (#compare)
//   payments & receipts                                   (#payments)

const SUPPORT_BILLING = '/shop/support?new=billing';
const RANK = { starter: 0, pro: 1, business: 2 };

/** sample | paused | demo | pending | active | expired */
export function billingMode(shop, state, sample) {
  if (sample) return 'sample';
  if (state === 'paused') return 'paused';
  if (shop.is_demo) return 'demo';
  return state === 'active' || state === 'expired' ? state : 'pending';
}
const isLive = (mode) => mode === 'active' || mode === 'expired';

// ---------- status card ----------
function daysBlock(n, label) {
  return html`<div class="bl-days" aria-hidden="true"><b>${n}</b><small>${label}</small></div>`;
}
function periodBar(left, total) {
  if (left == null || left < 0) return '';
  return html`<progress class="bl-meter" max="${Math.max(total, left + 1)}" value="${left + 1}" aria-hidden="true"></progress>`;
}
function statusShell({ tone, ic, kicker, title, text = '', days = '', extra = '' }) {
  return html`<section class="card bl-status bl-tone-${tone}" aria-labelledby="bl-status-title">
    <div class="bl-status-main${days ? ' has-days' : ''}">
      <span class="bl-status-ic">${ic}</span>
      <div class="bl-status-copy">
        <p class="bl-kicker">${kicker}</p>
        <h2 class="bl-status-title" id="bl-status-title">${title}</h2>
        ${text ? html`<p class="bl-status-text">${text}</p>` : ''}
      </div>
      ${days}
    </div>
    ${extra}
  </section>`;
}

function statusCard(shop, mode) {
  const plan = getPlan(shop.plan);
  const left = daysLeft(shop);
  if (mode === 'sample') {
    return statusShell({
      tone: 'info',
      ic: icon('sparkle'),
      kicker: 'Sample shop',
      title: 'This is the shared demo shop',
      text: `Payments are off here and the sample data resets every ${config.demo.resetHours} hours.`,
      extra: html`<div class="btn-row bl-status-actions"><a class="btn btn-primary" href="/register">${icon('store')}<span>Register your shop</span></a></div>`,
    });
  }
  if (mode === 'paused') {
    return statusShell({ tone: 'danger', ic: icon('alert'), kicker: 'Account paused', title: 'Your account is paused', text: 'Message us and we will help you switch it back on.', extra: html`<div class="btn-row bl-status-actions"><a class="btn btn-primary" href="${SUPPORT_BILLING}">${icon('mail')}<span>Message us</span></a></div>` });
  }
  if (mode === 'demo') {
    const ended = left == null || left < 0;
    const daysTotal = left == null ? 0 : left + 1;
    return statusShell({
      tone: ended ? 'danger' : 'info',
      ic: icon(ended ? 'alert' : 'sparkle'),
      kicker: 'Demo shop',
      title: ended ? 'Your demo has ended' : `Demo – ${daysTotal} day${daysTotal === 1 ? '' : 's'} left`,
      text: html`To go live with your own link, <a href="/register">register your shop</a> and choose a plan. Demo shops can try every feature.`,
      days: ended ? '' : daysBlock(daysTotal, daysTotal === 1 ? 'day left' : 'days left'),
    });
  }
  if (mode === 'pending') {
    return statusShell({
      tone: 'info',
      ic: icon('store'),
      kicker: 'Welcome to Brighton Print',
      title: 'Choose a plan to start',
      text: html`Your order link opens the moment the payment is confirmed: <span class="bl-golive-link mono">${orderFormUrl(shop).replace(/^https?:\/\//, '')}</span>`,
      extra: html`<ol class="bl-steps" aria-label="How it works"><li><span>1</span>Pick a plan</li><li><span>2</span>Pay by UPI, card or net banking</li><li><span>3</span>Your link is live</li></ol>`,
    });
  }
  const name = plan ? plan.name : 'Your';
  if (mode === 'expired') {
    return statusShell({ tone: 'danger', ic: icon('alert'), kicker: 'Plan ended', title: html`${name} plan`, text: html`Ended on <b>${formatDate(shop.paid_until)}</b> – your order link is closed and paid features are paused. Renew below. Your data is safe.` });
  }
  if (isLifetime(shop)) {
    const today = ymd();
    const careOn = shop.care_until && shop.care_until >= today;
    return statusShell({
      tone: careOn ? 'ok' : 'warn',
      ic: shopIcon('crown'),
      kicker: 'Lifetime licence',
      title: html`${name} plan <span class="bl-status-cycle">· Lifetime</span>`,
      text: careOn
        ? html`Yours for life. Updates &amp; Support active till <b>${formatDate(shop.care_until)}</b>.`
        : html`Yours for life – everything you bought keeps working. Updates &amp; Support ${shop.care_until ? html`ended on <b>${formatDate(shop.care_until)}</b>` : 'is not active'}; renew it below for new features and priority help.`,
      days: daysBlock('∞', 'no end date'),
    });
  }
  const soon = left != null && left <= 7;
  const total = shop.billing_cycle === 'yearly' ? 365 : 30;
  return statusShell({
    tone: soon ? 'warn' : 'ok',
    ic: icon(soon ? 'clock' : 'check'),
    kicker: soon ? 'Renew soon' : 'Active',
    title: html`${name} plan <span class="bl-status-cycle">· ${CYCLES[shop.billing_cycle] || 'Monthly'}</span>`,
    text: html`Active till <b>${formatDate(shop.paid_until)}</b>${left === 0 ? ' – ends today' : ''}.${soon ? ' Renew now so nothing stops.' : ''}`,
    days: left === 0 ? daysBlock('0', 'ends today') : daysBlock(left, left === 1 ? 'day left' : 'days left'),
    extra: periodBar(left, total),
  });
}

// ---------- plan picker (Monthly / Yearly / Lifetime, CSS-only switch) ----------
const BLURB = { starter: 'For a small counter.', pro: 'For busy shops – orders and bills every day.', business: 'For big volume, with priority help.' };

function planCard(plan, { mode, shop, canPay, featured, cycles }) {
  const saving = yearlySaving(plan);
  const lifetimeNow = isLifetime(shop) && isLive(mode);
  const isCurrent = isLive(mode) && shop.plan === plan.key;
  const label = (cycle) => {
    if (mode === 'pending') return `Choose ${plan.name}`;
    if (isCurrent && cycle === shop.billing_cycle) return cycle === 'lifetime' ? 'You own this' : `Renew ${plan.name}`;
    if (cycle === 'lifetime') return `Get ${plan.name} for life`;
    return `Switch to ${plan.name}`;
  };
  const owned = (cycle) => lifetimeNow && (cycle !== 'lifetime' || RANK[plan.key] <= RANK[shop.plan]);
  const btn = (cycle) => html`<button class="btn ${featured === plan.key ? 'btn-primary' : 'btn-secondary'} btn-lg btn-block bl-pay bl-when-${cycle[0]}" type="submit" name="plan" value="${plan.key}" data-cycle="${cycle}"${!canPay || owned(cycle) || (cycle === 'lifetime' && plan.lifetime < 1) ? raw(' disabled') : ''}>${label(cycle)}</button>`;
  return html`<article class="bl-plan${featured === plan.key ? ' is-featured' : ''}${isCurrent ? ' is-current' : ''}" id="plan-${plan.key}" aria-labelledby="bl-plan-${plan.key}">
    <div class="bl-plan-body">
      <div class="bl-plan-head">
        <h3 id="bl-plan-${plan.key}">${plan.name}</h3>
        ${isCurrent ? html`<span class="bl-tag bl-tag-current">Your plan</span>` : plan.popular ? html`<span class="bl-tag">Most popular</span>` : ''}
      </div>
      <p class="bl-blurb">${BLURB[plan.key] || ''}</p>
      <p class="bl-price">
        <span class="bl-when-m"><b>${formatINR(plan.monthly)}</b><small>/ month</small></span>
        <span class="bl-when-y"><b>${formatINR(plan.yearly)}</b><small>/ year</small></span>
        <span class="bl-when-l">${plan.lifetime ? html`<b>${formatINR(plan.lifetime)}</b><small>once</small>` : html`<b>—</b><small>not offered</small>`}</span>
      </p>
      <p class="bl-price-sub">
        <span class="bl-when-m">or ${formatINR(plan.yearly)} a year${saving ? ` – ${savingLabel(saving)}` : ''}</span>
        <span class="bl-when-y">${saving ? html`Just ${formatINR(saving.perMonth)} a month · <b class="bl-save">${savingLabel(saving)}</b>` : `${formatINR(plan.monthly)} a month if paid monthly`}</span>
        <span class="bl-when-l">${plan.lifetime ? html`Pay once, use for ever · <b class="bl-save">1 year Updates &amp; Support</b>, then ${formatINR(plan.care)}/year (optional)` : 'Choose monthly or yearly'}</span>
      </p>
      <ul class="bl-feats">${planFeatureList(plan.key).map((f) => html`<li>${icon('check')}<span>${f}</span></li>`)}</ul>
    </div>
    ${mode === 'sample' ? '' : cycles.map(btn)}
  </article>`;
}

function planPicker(res, { shop, mode, plans, canPay, choice }) {
  if (mode === 'paused' || mode === 'demo' || !plans.length) return '';
  const lifetimeNow = isLifetime(shop) && isLive(mode);
  const offerLifetime = plans.some((p) => p.lifetime > 0);
  const cycles = ['monthly', 'yearly', ...(offerLifetime ? ['lifetime'] : [])];
  const selected = lifetimeNow ? 'lifetime' : cycles.includes(choice.cycle) ? choice.cycle : shop.billing_cycle && cycles.includes(shop.billing_cycle) ? shop.billing_cycle : 'monthly';
  const shown = lifetimeNow ? plans.filter((p) => RANK[p.key] > RANK[shop.plan] && p.lifetime > 0) : plans;
  if (lifetimeNow && !shown.length) return '';
  const featured = choice.plan && shown.some((p) => p.key === choice.plan) ? choice.plan : isLive(mode) && shown.some((p) => p.key === shop.plan) ? shop.plan : shown.find((p) => p.popular)?.key || shown[0]?.key;
  const best = plans.map(yearlySaving).filter(Boolean);
  const title = lifetimeNow ? 'Move up to a bigger lifetime plan' : mode === 'pending' ? 'Choose your plan' : mode === 'expired' ? 'Renew your plan' : 'Change or renew your plan';
  const sub = lifetimeNow ? 'You pay only the difference to your current lifetime plan.' : 'Monthly, yearly (2 months free) or once for life. Upgrade any time – unused days are credited.';
  return html`<section class="bl-section" id="plans" aria-labelledby="bl-plans-title">
    <div class="bl-section-head"><h2 id="bl-plans-title">${title}</h2><p>${sub}</p></div>
    ${canPay || mode === 'sample'
      ? ''
      : html`<div class="bl-setup" role="note"><span class="bl-setup-ic">${icon('info')}</span><div><b>Online payment opens soon.</b><p>Pay by UPI to Brighton Solution and send us the screenshot – we switch it on for you right away.</p><a class="btn btn-secondary btn-sm" href="${SUPPORT_BILLING}">${icon('mail')}<span>Message us</span></a></div></div>`}
    <form method="post" action="/shop/billing/pay" class="bl-picker">
      ${csrfField(res)}
      <input type="hidden" name="product" value="plan">
      ${cycles.map((c) => html`<input class="bl-cycle-input" type="radio" name="cycle" value="${c}" id="bl-cycle-${c}"${selected === c ? raw(' checked') : ''}${lifetimeNow && c !== 'lifetime' ? raw(' disabled') : ''}>`)}
      <div class="bl-toggle bl-toggle-${cycles.length}" role="group" aria-label="How to pay">
        <label for="bl-cycle-monthly" class="bl-toggle-m">${CYCLES.monthly}</label>
        <label for="bl-cycle-yearly" class="bl-toggle-y">${CYCLES.yearly}${best.length ? html` <span class="bl-toggle-save">${savingLabel(best[0])}</span>` : ''}</label>
        ${offerLifetime ? html`<label for="bl-cycle-lifetime" class="bl-toggle-l">${CYCLES.lifetime} <span class="bl-toggle-save is-life">once</span></label>` : ''}
      </div>
      <div class="bl-plans bl-plans-${shown.length}">${shown.map((p) => planCard(p, { mode, shop, canPay, featured, cycles }))}</div>
    </form>
    ${mode === 'sample'
      ? ''
      : html`<ul class="bl-trust"><li>${icon('shield')}<span>Secure payment by PayU</span></li><li>${icon('check')}<span>Switched on only after the payment is confirmed</span></li><li>${icon('file')}<span>Receipt for every payment</span></li></ul>`}
  </section>`;
}

// ---------- add-ons ----------
function addonsSection(res, { shop, mode, canPay }) {
  if (mode === 'sample' || mode === 'paused' || mode === 'pending') return '';
  const ent = entitlements(shop);
  const list = getAddons().filter((a) => a.active);
  if (!list.length) return '';
  const per = { monthly: '/ month', yearly: '/ year', lifetime: 'once' };
  return html`<section class="bl-section" id="addons" aria-labelledby="bl-addons-title">
    <div class="bl-section-head"><h2 id="bl-addons-title">Add-ons</h2><p>Extras you can add to any plan. Each one has its own validity.</p></div>
    <div class="bl-addons">
      ${list.map((a) => {
        const st = ent.addons[a.key] || {};
        const row = st.row;
        let status;
        if (shop.is_demo) status = html`<span class="pill bl-pill-paid">On in your demo</span>`;
        else if (st.inPlan) status = html`<span class="pill bl-pill-paid">Included in your plan</span>`;
        else if (st.active && row && !row.ends_on) status = html`<span class="pill bl-pill-paid">Yours for life</span>`;
        else if (st.active && row) status = html`<span class="pill bl-pill-paid">Active till ${formatDate(row.ends_on)}</span>`;
        else if (row && row.status === 'active' && row.ends_on) status = html`<span class="pill bl-pill-failed">Ended ${formatDate(row.ends_on)}</span>`;
        else status = html`<span class="pill">Not added</span>`;
        const buyable = !shop.is_demo && !st.inPlan && !(st.active && row && !row.ends_on) && mode === 'active';
        const cycles = ['monthly', 'yearly', 'lifetime'].filter((c) => a[c] > 0);
        return html`<article class="card bl-addon${st.active || st.inPlan ? ' is-on' : ''}">
          <div class="bl-addon-head"><h3>${shopIcon(a.key === 'bills' ? 'receipt' : 'bolt')}<span>${a.name}</span></h3>${status}</div>
          <p class="bl-addon-blurb">${a.blurb}</p>
          ${buyable
            ? html`<div class="bl-addon-buy">${cycles.map(
                (c) => html`<form method="post" action="/shop/billing/pay" class="bl-addon-opt${c === 'yearly' ? ' is-best' : ''}">
                  ${csrfField(res)}
                  <input type="hidden" name="product" value="addon"><input type="hidden" name="item" value="${a.key}"><input type="hidden" name="cycle" value="${c}">
                  <span class="bl-addon-price"><b>${formatINR(a[c])}</b><small>${per[c]}</small></span>
                  <button class="btn ${c === 'yearly' ? 'btn-primary' : 'btn-secondary'} btn-sm btn-block" type="submit"${canPay ? '' : raw(' disabled')}>${st.active && c !== 'lifetime' ? 'Renew' : 'Add'} ${CYCLES[c].toLowerCase()}</button>
                </form>`
              )}</div>`
            : ''}
          ${!st.inPlan && !shop.is_demo ? html`<p class="hint">Included free in ${['pro', 'business'].filter((k) => a.features.every((f) => planMatrix()[k]?.[f])).map((k) => getPlan(k)?.name).join(' and ') || 'bigger plans'}.</p>` : ''}
        </article>`;
      })}
    </div>
  </section>`;
}

// ---------- Updates & Support (lifetime) ----------
function careSection(res, { shop, mode, canPay }) {
  if (!isLifetime(shop) || !isLive(mode)) return '';
  const plan = getPlan(shop.plan);
  const today = ymd();
  const on = shop.care_until && shop.care_until >= today;
  return html`<section class="bl-section" id="care" aria-labelledby="bl-care-title">
    <div class="card bl-care${on ? '' : ' is-off'}">
      <div class="bl-care-copy">
        <h2 id="bl-care-title">${icon('refresh')}<span>Updates &amp; Support</span></h2>
        <p>${on ? html`Active till <b>${formatDate(shop.care_until)}</b>. You get every new feature and priority help.` : html`${shop.care_until ? html`Ended on <b>${formatDate(shop.care_until)}</b>.` : 'Not active.'} Your plan keeps working; renew to get new features and priority help.`}</p>
      </div>
      <form method="post" action="/shop/billing/pay" class="bl-care-buy">
        ${csrfField(res)}
        <input type="hidden" name="product" value="care"><input type="hidden" name="item" value="care"><input type="hidden" name="cycle" value="yearly">
        <span class="bl-addon-price"><b>${formatINR(plan?.care || 0)}</b><small>/ year</small></span>
        <button class="btn ${on ? 'btn-secondary' : 'btn-primary'}" type="submit"${canPay && plan?.care ? '' : raw(' disabled')}>${on ? 'Add one more year' : 'Renew for a year'}</button>
      </form>
    </div>
  </section>`;
}

// ---------- comparison ----------
function compareSection(plans) {
  if (!plans.length) return '';
  const m = planMatrix();
  const addonOf = (f) => (f.addon ? getAddons().find((a) => a.key === f.addon && a.active) : null);
  const cellFor = (p, f) => (m[p.key]?.[f.key] ? html`<span class="bl-yes">${icon('check')}<span class="sr-only">Included</span></span>` : addonOf(f) ? html`<span class="bl-addon-tag">Add-on</span>` : html`<span class="bl-no">—</span>`);
  return html`<details class="card fold bl-fold" id="compare">
    <summary><span class="fold-ic">${shopIcon('grid')}</span><span class="fold-title"><b>Compare plans</b><small>Everything each plan includes</small></span></summary>
    <div class="fold-body">
      <div class="table-wrap">
        <table class="table bl-compare">
          <thead><tr><th scope="col">Feature</th>${plans.map((p) => html`<th scope="col" class="num">${p.name}</th>`)}</tr></thead>
          <tbody>
            ${FEATURES.filter((f) => f.core).map((f) => html`<tr><th scope="row">${f.label}</th>${plans.map(() => html`<td class="num"><span class="bl-yes">${icon('check')}</span></td>`)}</tr>`)}
            ${LIMITS.map((l) => html`<tr><th scope="row">${l.label}</th>${plans.map((p) => html`<td class="num">${m[p.key]?.[l.key]}${l.unit ? ` ${l.unit}` : ''}</td>`)}</tr>`)}
            <tr><th scope="row">File storage</th>${plans.map((p) => html`<td class="num">${p.storageGb} GB</td>`)}</tr>
            ${FEATURES.filter((f) => !f.core).map((f) => html`<tr><th scope="row">${f.label}</th>${plans.map((p) => html`<td class="num">${cellFor(p, f)}</td>`)}</tr>`)}
          </tbody>
        </table>
      </div>
    </div>
  </details>`;
}

// ---------- history ----------
function historyFold(payments) {
  if (!payments.length) return '';
  const last = payments[0];
  return html`<details class="card fold bl-fold" id="payments">
    <summary>
      <span class="fold-ic">${icon('file')}</span>
      <span class="fold-title"><b>Payments &amp; receipts</b><small>${plural(payments.length, 'payment')} · last ${paise(last.amount_paise)} on ${formatDate(last.paid_at)}</small></span>
    </summary>
    <div class="fold-body">
      <div class="table-wrap bl-history">
        <table class="table table-cards bl-table bl-hist">
          <thead><tr><th scope="col">Date</th><th scope="col">For</th><th scope="col">Period</th><th scope="col" class="num">Amount</th><th scope="col"><span class="sr-only">Receipt</span></th></tr></thead>
          <tbody>
            ${payments.map(
              (p) => html`<tr${p.superseded_at ? raw(' class="is-superseded"') : ''}>
                <td data-label="Date" class="bl-c-date">${formatDateTime(p.paid_at)}${p.superseded_at ? html`<br><small>Replaced by upgrade</small>` : ''}</td>
                <td data-label="For" class="bl-c-plan">${cell(paymentTitle(p), METHOD_SHORT[p.method] || p.method)}</td>
                <td data-label="Period" class="bl-c-period">${p.cycle === 'lifetime' ? 'Lifetime' : p.cycle === 'once' ? '—' : periodText(p)}</td>
                <td data-label="Amount" class="num bl-c-amount"><b>${paise(p.amount_paise)}</b></td>
                <td class="bl-cell-action bl-c-action"><a class="btn btn-secondary btn-sm" href="/shop/billing/receipt/${p.id}">${icon('download')}<span>Receipt</span></a></td>
              </tr>`
            )}
          </tbody>
        </table>
      </div>
    </div>
  </details>`;
}

export function billingView(res, { shop, state, sample, plans, payments, canPay, choice = {} }) {
  const mode = billingMode(shop, state, sample);
  const help =
    mode === 'sample' || mode === 'paused'
      ? ''
      : html`<aside class="bl-help"><span class="bl-help-ic">${icon('info')}</span><div><b>Question about a payment?</b><p>We usually reply within a few hours.</p></div><a class="btn btn-secondary btn-sm" href="${SUPPORT_BILLING}">Ask us</a></aside>`;
  return {
    title: 'Plan & billing',
    variant: 'shop',
    active: 'billing',
    scripts: ['/js/shop.js', '/js/billing.js'],
    body: html`<div class="container bl-page">
      <header class="page-head bl-head">
        <div><h1>Plan &amp; billing</h1><p>Your plan, add-ons and receipts. Everything switches on as soon as a payment is confirmed.</p></div>
      </header>
      <div class="bl-stack">
        ${statusCard(shop, mode)}
        ${careSection(res, { shop, mode, canPay })}
      </div>
      ${addonsSection(res, { shop, mode, canPay })}
      ${planPicker(res, { shop, mode, plans, canPay, choice })}
      <div class="bl-stack bl-section">
        ${compareSection(plans)}
        ${historyFold(payments)}
      </div>
      ${help}
    </div>`,
  };
}
