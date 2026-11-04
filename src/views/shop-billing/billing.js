import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatDate, formatDateTime } from '../../lib/util.js';
import { CYCLES, daysLeft, featureList, formatINR, getPlan } from '../../services/billing.js';
import { orderFormUrl } from '../../services/notify.js';
import { csrfField, icon } from '../components.js';
import { METHOD_SHORT, cell, cycleLabel, paise, periodText, plural, savingLabel, yearlySaving } from './common.js';

// /shop/billing – "Plan & payments": one calm status card; when the plan is active,
// renew/change and the payment history stay folded away.

const SUPPORT_BILLING = '/shop/support?new=billing';

/**
 * What the page is for this shop:
 *   sample   the shared sample demo shop (no payments)
 *   demo     a personal demo shop (pay = go live)
 *   pending  registered, never paid
 *   active   live and paid
 *   expired  live, plan ended
 *   paused   paused by Brighton Solution (no self-service payment)
 */
export function billingMode(shop, state, sample) {
  if (sample) return 'sample';
  if (state === 'paused') return 'paused';
  if (shop.is_demo) return 'demo';
  return state === 'active' || state === 'expired' ? state : 'pending';
}

// ---------- status card ----------
function daysBlock(n, label) {
  return html`<div class="bl-days" aria-hidden="true"><b>${n}</b><small>${label}</small></div>`;
}

/** Remaining time of the current period as a native <progress> (no inline styles). */
function periodBar(left, total) {
  if (left == null || left < 0) return '';
  const max = Math.max(total, left + 1);
  return html`<progress class="bl-meter" max="${max}" value="${left + 1}" aria-hidden="true"></progress>`;
}

/** Card shell: icon, kicker, title, text, optional days block, extra content below. */
function statusShell({ tone, ic, kicker, title, text = '', days = '', extra = '' }) {
  return html`<section class="card bl-status bl-tone-${tone}" aria-labelledby="bl-status-title">
    <div class="bl-status-main${days ? ' has-days' : ''}">
      <span class="bl-status-ic">${icon(ic)}</span>
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
      ic: 'sparkle',
      kicker: 'Sample shop',
      title: 'This is the shared demo shop',
      text: `Payments are off here and the sample data resets every ${config.demo.resetHours} hours. Try it with your own shop name and link – free for ${config.demo.trialDays} days.`,
      extra: html`<div class="btn-row bl-status-actions"><a class="btn btn-primary" href="/register">${icon('store')}<span>Register your shop</span></a></div>`,
    });
  }

  if (mode === 'paused') {
    return statusShell({
      tone: 'danger',
      ic: 'alert',
      kicker: 'Account paused',
      title: 'Your account is paused',
      text: 'Your order link is not taking new orders. Message us and we will help you switch it back on.',
      extra: html`<div class="btn-row bl-status-actions"><a class="btn btn-primary" href="${SUPPORT_BILLING}">${icon('mail')}<span>Message us</span></a></div>`,
    });
  }

  if (mode === 'demo') {
    const ended = left == null || left < 0;
    const daysTotal = left == null ? 0 : left + 1;
    return statusShell({
      tone: ended ? 'danger' : 'info',
      ic: ended ? 'alert' : 'sparkle',
      kicker: 'Demo shop',
      title: ended ? 'Your demo has ended' : daysTotal === 1 ? 'Demo – last day today' : `Demo – ${daysTotal} days left`,
      text: html`${ended ? 'Your test link is closed.' : 'Your link works for testing.'} Go live to take real orders at <span class="bl-golive-link mono">${config.baseUrl.replace(/^https?:\/\//, '')}/${shop.slug}</span>`,
      days: ended ? '' : daysBlock(daysTotal, daysTotal === 1 ? 'day left' : 'days left'),
      extra: html`${ended ? '' : periodBar(left, config.demo.trialDays)}<p class="hint bl-status-hint">Demo orders are cleared when you go live, so you start fresh.</p>`,
    });
  }

  if (mode === 'pending') {
    return statusShell({
      tone: 'info',
      ic: 'store',
      kicker: 'Welcome to Brighton Print',
      title: 'Choose a plan to start',
      text: html`Your order link opens the moment you pay: <span class="bl-golive-link mono">${orderFormUrl(shop).replace(/^https?:\/\//, '')}</span>`,
      extra: html`<ol class="bl-steps" aria-label="How it works">
        <li><span>1</span>Pick a plan</li>
        <li><span>2</span>Pay by UPI, card or net banking</li>
        <li><span>3</span>Your link is live</li>
      </ol>`,
    });
  }

  const name = plan ? plan.name : 'Your';
  const cycle = shop.billing_cycle ? html` <span class="bl-status-cycle">· ${cycleLabel(shop.billing_cycle)}</span>` : '';
  if (mode === 'expired') {
    return statusShell({
      tone: 'danger',
      ic: 'alert',
      kicker: 'Plan ended',
      title: html`${name} plan${cycle}`,
      text: html`Ended on <b>${formatDate(shop.paid_until)}</b> – your order link is closed. Renew below to open it again. Your orders and settings are safe.`,
    });
  }

  // active: compact
  const soon = left != null && left <= 7;
  const total = shop.billing_cycle === 'yearly' ? 365 : 30;
  return statusShell({
    tone: soon ? 'warn' : 'ok',
    ic: soon ? 'clock' : 'check',
    kicker: soon ? 'Renew soon' : 'Active',
    title: html`${name} plan${cycle}`,
    text: html`Active till <b>${formatDate(shop.paid_until)}</b>${left === 0 ? ' – ends today' : ''}.${soon ? ' Renew now so your link never stops.' : ''}`,
    days: left === 0 ? daysBlock('0', 'ends today') : daysBlock(left, left === 1 ? 'day left' : 'days left'),
    extra: periodBar(left, total),
  });
}

// ---------- plan picker ----------
function payLabel(mode, plan, isCurrent) {
  if (mode === 'pending') return (p) => `Pay ${p} & start`;
  if (mode === 'demo') return (p) => `Go live · ${p}`;
  if (isCurrent) return (p) => `Renew · ${p}`;
  return (p) => `Switch to ${plan.name} · ${p}`;
}

const BLURB = {
  starter: 'For a small counter.',
  pro: 'For busy shops, orders every day.',
  business: 'For big files and high volume.',
};

// Every plan has the core features – storage and limits differ – so the basics are listed once.
const INCLUDED = ['Unlimited orders', 'Your own order link & QR', 'Customer OK on design previews', 'WhatsApp messages', 'Help from us'];

const isLive = (mode) => mode === 'active' || mode === 'expired';

function planTag(plan, { isCurrent, isChosen }) {
  if (isCurrent) return html`<span class="bl-tag bl-tag-current">Your plan</span>`;
  if (isChosen) return html`<span class="bl-tag">Your choice</span>`;
  if (plan.popular) return html`<span class="bl-tag">Most popular</span>`;
  return '';
}

/** featured = the one highlighted card (chosen at sign-up, else current plan, else most popular). */
function planCard(plan, { mode, shop, canPay, featured, chosen }) {
  const saving = yearlySaving(plan);
  const isCurrent = isLive(mode) && shop.plan === plan.key;
  const isFeatured = featured === plan.key;
  const label = payLabel(mode, plan, isCurrent);
  const monthly = formatINR(plan.monthly);
  const yearly = formatINR(plan.yearly);
  const showButton = mode !== 'sample';
  return html`<article class="bl-plan${isFeatured ? ' is-featured' : ''}${isCurrent ? ' is-current' : ''}" id="plan-${plan.key}" aria-labelledby="bl-plan-${plan.key}">
    <div class="bl-plan-body">
      <div class="bl-plan-head">
        <h3 id="bl-plan-${plan.key}">${plan.name}</h3>
        ${planTag(plan, { isCurrent, isChosen: chosen === plan.key })}
      </div>
      ${BLURB[plan.key] ? html`<p class="bl-blurb">${BLURB[plan.key]}</p>` : ''}
      <p class="bl-price">
        <span class="bl-when-m"><b>${monthly}</b><small>/ month</small></span>
        <span class="bl-when-y"><b>${yearly}</b><small>/ year</small></span>
      </p>
      <p class="bl-price-sub">
        <span class="bl-when-m">${saving ? `or ${yearly} a year – ${savingLabel(saving)}` : `or ${yearly} a year`}</span>
        <span class="bl-when-y">${saving ? html`Just ${formatINR(saving.perMonth)} a month · <b class="bl-save">${savingLabel(saving)}</b>` : `${monthly} a month if paid monthly`}</span>
      </p>
      <p class="bl-storage">${icon('file')}<span><b>${plan.storageGb} GB</b> file storage</span></p>
      <ul class="bl-feats">${featureList(plan.key).map((f) => html`<li>${icon('check')}<span>${f}</span></li>`)}</ul>
    </div>
    ${showButton
      ? html`<button class="btn ${isFeatured ? 'btn-primary' : 'btn-secondary'} btn-lg btn-block bl-pay" type="submit" name="plan" value="${plan.key}" data-loading="Opening secure payment…"${canPay ? '' : raw(' disabled')}>
          <span class="bl-when-m">${label(monthly)}</span><span class="bl-when-y">${label(yearly)}</span>
        </button>`
      : ''}
  </article>`;
}

function cycleToggle(plans, selected) {
  const months = plans.map(yearlySaving).filter(Boolean).map((s) => s.months);
  const best = months.length === plans.length && Math.min(...months) >= 1 ? `${plural(Math.min(...months), 'month')} free` : months.length ? 'Save more' : '';
  // The radios sit before the toggle and the cards so CSS (~) can switch the prices without JS.
  return html`<input class="bl-cycle-input" type="radio" name="cycle" value="monthly" id="bl-cycle-monthly"${selected === 'monthly' ? raw(' checked') : ''}>
    <input class="bl-cycle-input" type="radio" name="cycle" value="yearly" id="bl-cycle-yearly"${selected === 'yearly' ? raw(' checked') : ''}>
    <div class="bl-toggle" role="group" aria-label="Pay monthly or yearly">
      <label for="bl-cycle-monthly" class="bl-toggle-m">${CYCLES.monthly}</label>
      <label for="bl-cycle-yearly" class="bl-toggle-y">${CYCLES.yearly}${best ? html` <span class="bl-toggle-save">${best}</span>` : ''}</label>
    </div>`;
}

const PICKER_TITLE = {
  pending: ['Choose your plan', 'All plans have the same features – bigger plans store more files. Change any time.'],
  demo: ['Go live – choose a plan', 'Keep your link and start taking real orders.'],
  active: ['', ''],
  expired: ['Renew your plan', 'Your order link opens again as soon as you pay.'],
  sample: ['Plans & prices', 'Simple prices for every print shop.'],
};

/** inFold: the picker sits inside the "Renew or change plan" fold (no own heading). */
function planPicker(res, { shop, mode, plans, razorpayOn, choice, inFold = false }) {
  if (mode === 'paused' || !plans.length) return '';
  const canPay = razorpayOn && mode !== 'sample';
  const [title, sub] = PICKER_TITLE[mode];
  const has = (key) => plans.some((p) => p.key === key);
  const chosen = mode !== 'sample' && has(choice.plan) ? choice.plan : '';
  const featured = chosen || (isLive(mode) && has(shop.plan) ? shop.plan : plans.find((p) => p.popular)?.key || '');
  const selected = choice.cycle || (shop.billing_cycle === 'yearly' ? 'yearly' : 'monthly');
  const body = html`${razorpayOn || mode === 'sample'
      ? ''
      : html`<div class="bl-setup" role="note">
          <span class="bl-setup-ic">${icon('info')}</span>
          <div>
            <b>Online payment is being set up.</b>
            <p>Pay by UPI to Brighton Solution and send us the screenshot – we switch your shop on quickly.</p>
            <a class="btn btn-secondary btn-sm" href="${SUPPORT_BILLING}">${icon('mail')}<span>Message us</span></a>
          </div>
        </div>`}
    <form method="post" action="/shop/billing/pay" class="bl-picker">
      ${csrfField(res)}
      ${cycleToggle(plans, selected)}
      <div class="bl-plans bl-plans-${plans.length}">
        ${plans.map((plan) => planCard(plan, { mode, shop, canPay, featured, chosen }))}
      </div>
    </form>
    <div class="bl-includes">
      <h3>Every plan has</h3>
      <ul>${INCLUDED.map((t) => html`<li>${icon('check')}<span>${t}</span></li>`)}</ul>
    </div>
    ${mode === 'sample'
      ? ''
      : html`<ul class="bl-trust">
          <li>${icon('shield')}<span>Secure payment by PayU</span></li>
          <li>${icon('check')}<span>Shop on right after payment</span></li>
          <li>${icon('file')}<span>Receipt for every payment</span></li>
        </ul>`}`;
  if (inFold) return body;
  return html`<section class="bl-section" aria-labelledby="bl-plans-title">
    <div class="bl-section-head">
      <h2 id="bl-plans-title">${title}</h2>
      <p>${sub}</p>
    </div>
    ${body}
  </section>`;
}

// ---------- history ----------
function historyTable(payments) {
  return html`<div class="table-wrap bl-history">
    <table class="table table-cards bl-table bl-hist">
      <thead><tr><th scope="col">Date</th><th scope="col">Plan</th><th scope="col">Period</th><th scope="col" class="num">Amount</th><th scope="col"><span class="sr-only">Receipt</span></th></tr></thead>
      <tbody>
        ${payments.map((p) => {
          const plan = getPlan(p.plan);
          return html`<tr${p.superseded_at ? raw(' class="is-superseded"') : ''}>
            <td data-label="Date" class="bl-c-date">${formatDateTime(p.paid_at)}${p.superseded_at ? html`<br><small>Replaced by upgrade</small>` : ''}</td>
            <td data-label="Plan" class="bl-c-plan">${cell(`${plan ? plan.name : p.plan} · ${cycleLabel(p.cycle)}`, METHOD_SHORT[p.method] || p.method)}</td>
            <td data-label="Period" class="bl-c-period">${periodText(p)}</td>
            <td data-label="Amount" class="num bl-c-amount"><b>${paise(p.amount_paise)}</b></td>
            <td class="bl-cell-action bl-c-action"><a class="btn btn-secondary btn-sm" href="/shop/billing/receipt/${p.id}">${icon('download')}<span>Receipt</span></a></td>
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;
}

function historyFold(payments) {
  if (!payments.length) return '';
  const last = payments[0];
  return html`<details class="card fold bl-fold" id="payments">
    <summary>
      <span class="fold-ic">${icon('file')}</span>
      <span class="fold-title"><b>Payments &amp; receipts</b><small>${plural(payments.length, 'payment')} · last ${paise(last.amount_paise)} on ${formatDate(last.paid_at)}</small></span>
    </summary>
    <div class="fold-body">${historyTable(payments)}</div>
  </details>`;
}

function helpLine(mode) {
  if (mode === 'sample' || mode === 'paused') return '';
  return html`<aside class="bl-help">
    <span class="bl-help-ic">${icon('info')}</span>
    <div><b>Question about a payment?</b><p>We usually reply within a few hours.</p></div>
    <a class="btn btn-secondary btn-sm" href="${SUPPORT_BILLING}">Ask us</a>
  </aside>`;
}

export function billingView(res, { shop, state, sample, plans, payments, razorpayOn, choice = {} }) {
  const mode = billingMode(shop, state, sample);
  const left = daysLeft(shop);
  const soon = mode === 'active' && left != null && left <= 7;
  let main;
  if (mode === 'active') {
    // Calm: everything beyond the status card stays folded until asked for.
    main = html`<details class="card fold bl-fold" id="renew"${choice.plan || soon ? raw(' open') : ''}>
        <summary>
          <span class="fold-ic">${icon('refresh')}</span>
          <span class="fold-title"><b>Renew or change plan</b><small>Renew early – new days start after ${formatDate(shop.paid_until)}. Upgrade any time.</small></span>
        </summary>
        <div class="fold-body">${planPicker(res, { shop, mode, plans, razorpayOn, choice, inFold: true })}</div>
      </details>
      ${historyFold(payments)}`;
  } else {
    main = html`${planPicker(res, { shop, mode, plans, razorpayOn, choice })}
      ${payments.length ? html`<div class="bl-section">${historyFold(payments)}</div>` : ''}`;
  }
  return {
    title: 'Plan & payments',
    variant: 'shop',
    active: 'billing',
    scripts: ['/js/shop.js', '/js/billing.js'],
    body: html`<div class="container-mid bl-page">
      <a class="bl-back" href="/shop/settings">${icon('arrowLeft')}<span>Account</span></a>
      <header class="page-head bl-head">
        <div>
          <h1>Plan &amp; payments</h1>
          <p>Your Brighton Print plan and receipts.</p>
        </div>
      </header>
      <div class="bl-stack">
        ${statusCard(shop, mode)}
        ${main}
      </div>
      ${helpLine(mode)}
    </div>`,
  };
}

// ---------- checkout hand-off (/shop/billing/checkout/:id) ----------
/** Same-origin page that forwards to Razorpay (a form POST may not redirect off-site under CSP form-action). */
export function checkoutView(res, { payment, plan }) {
  return {
    title: 'Opening secure payment',
    variant: 'shop',
    active: 'billing',
    scripts: ['/js/shop.js', '/js/billing.js'],
    body: html`<div class="container-narrow bl-checkout">
      <div class="card card-pad bl-checkout-card">
        <span class="spinner bl-checkout-spin" aria-hidden="true"></span>
        <h1>Opening secure payment…</h1>
        <p class="lead">${plan ? plan.name : payment.plan} plan · ${cycleLabel(payment.cycle)} · <b>${paise(payment.amount_paise)}</b></p>
        <a class="btn btn-primary btn-lg btn-block" href="${payment.provider_link_url}" data-bl-autogo rel="noreferrer">${icon('shield')}<span>Continue to payment</span></a>
        <p class="hint">You pay on PayU's secure page (UPI, cards, net banking) and come straight back here.</p>
        <a class="btn btn-ghost btn-sm" href="/shop/billing">${icon('arrowLeft')}<span>Back to plans</span></a>
      </div>
    </div>`,
  };
}
