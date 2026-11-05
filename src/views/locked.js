import { html } from '../lib/html.js';
import { formatDate } from '../lib/util.js';
import { activePlans, formatINR, CYCLES } from '../services/billing.js';
import { FEATURE, entitlements, getAddon, planMatrix } from '../services/entitlements.js';
import { csrfField, icon } from './components.js';
import { shopIcon } from './chrome/shop.js';

// "Pay first" screen for a feature the shop cannot use right now. It explains why
// (not in the plan, add-on ended, plan ended, Updates & Support ended, switched off by us)
// and offers exactly the ways to unlock it. Buttons go to the calculation page first.

const WHY = {
  plan: (f) => [`${f.label} is not in your plan`, 'Upgrade your plan to switch it on.'],
  addon: (f) => [`${f.label} is an add-on`, 'Add it to your plan, or move to a plan that includes it.'],
  expired: () => ['Your plan has ended', 'Renew your plan to use this again. Your data is safe.'],
  care: () => ['Updates & Support has ended', 'Your lifetime plan keeps working. Renew Updates & Support to get this feature.'],
  admin: () => ['Switched off for your shop', 'Brighton Solution has switched this off for your account. Message us if you need it.'],
};

function payButton(res, { product, item, cycle, label, primary }) {
  return html`<form method="post" action="/shop/billing/pay" class="lk-pay">
    ${csrfField(res)}
    <input type="hidden" name="product" value="${product}"><input type="hidden" name="item" value="${item}"><input type="hidden" name="cycle" value="${cycle}">
    <button class="btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-block" type="submit">${label}</button>
  </form>`;
}

/** Render options for a locked feature page. `key` = feature key. */
export function lockedView(res, shop, key, { title = '' } = {}) {
  const f = FEATURE[key] || { key, label: title || 'This feature' };
  const ent = entitlements(shop);
  const st = ent.features[key] || { locked: 'plan' };
  const [heading, sub] = (WHY[st.locked] || WHY.plan)(f);
  let options = '';

  if (st.locked === 'addon' && f.addon) {
    const a = getAddon(f.addon);
    const row = ent.addons[f.addon]?.row;
    const ended = row && row.status === 'active' && row.ends_on && row.ends_on < new Date().toISOString().slice(0, 10);
    const cycles = ['monthly', 'yearly', 'lifetime'].filter((c) => a && a[c] > 0);
    const per = { monthly: '/ month', yearly: '/ year', lifetime: 'once' };
    const plansWith = activePlans().filter((p) => planMatrix()[p.key]?.[key]);
    options = html`${ended ? html`<p class="lk-note">${icon('clock')}<span>Your ${a?.name || f.addon} add-on ended on ${formatDate(row.ends_on)}. Renew to switch it back on – nothing was deleted.</span></p>` : ''}
      <div class="lk-options">
        ${a
          ? cycles.map((c, i) => html`<div class="lk-option${c === 'yearly' ? ' is-best' : ''}">
              <p class="lk-option-name">${a.name} · ${CYCLES[c]}</p>
              <p class="lk-option-price"><b>${formatINR(a[c])}</b> <small>${per[c]}</small></p>
              ${payButton(res, { product: 'addon', item: a.key, cycle: c, label: `Get ${a.name} ${CYCLES[c].toLowerCase()}`, primary: c === 'yearly' || (cycles.length === 1 && i === 0) })}
            </div>`)
          : ''}
      </div>
      ${plansWith.length ? html`<p class="lk-or">Or upgrade to ${plansWith.map((p) => p.name).join(' / ')} – ${a?.name || 'it'} is included. <a href="/shop/billing">Compare plans</a></p>` : ''}`;
  } else if (st.locked === 'plan') {
    const plansWith = activePlans().filter((p) => planMatrix()[p.key]?.[key]);
    options = html`<div class="lk-options">
      ${plansWith.map(
        (p) => html`<div class="lk-option">
          <p class="lk-option-name">${p.name} plan</p>
          <p class="lk-option-price"><b>${formatINR(p.monthly)}</b> <small>/ month</small></p>
          ${payButton(res, { product: 'plan', item: p.key, cycle: 'monthly', label: `Upgrade to ${p.name}`, primary: p.popular })}
        </div>`
      )}
    </div>
    <p class="lk-or"><a href="/shop/billing">See all plans, yearly and lifetime prices</a></p>`;
  } else if (st.locked === 'expired') {
    options = html`<div class="btn-row lk-actions"><a class="btn btn-primary btn-lg" href="/shop/billing">${shopIcon('crown')}<span>Renew my plan</span></a></div>`;
  } else if (st.locked === 'care') {
    options = html`<div class="btn-row lk-actions"><a class="btn btn-primary btn-lg" href="/shop/billing#care">${icon('refresh')}<span>Renew Updates &amp; Support</span></a></div>`;
  } else {
    options = html`<div class="btn-row lk-actions"><a class="btn btn-primary btn-lg" href="/shop/support?new=billing">${icon('mail')}<span>Message us</span></a></div>`;
  }

  return {
    title: heading,
    variant: 'shop',
    active: key === 'bills' ? 'bills' : 'billing',
    scripts: ['/js/shop.js'],
    body: html`<section class="container-mid lk-page">
      <div class="card lk-card">
        <span class="lk-ic" aria-hidden="true">${shopIcon('lock')}</span>
        <p class="lk-kicker">${f.label}</p>
        <h1>${heading}</h1>
        <p class="lead">${sub}</p>
        ${options}
        <p class="hint lk-hint">${icon('shield')}<span>Switched on right after a confirmed payment. Questions? <a href="/shop/support?new=billing">Message us</a>.</span></p>
      </div>
    </section>`,
  };
}
