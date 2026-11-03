import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatDate } from '../../lib/util.js';
import { CYCLES, daysLeft, featureList, formatINR, getPlan } from '../../services/billing.js';
import { formatDateTime } from '../../lib/util.js';
import { orderFormUrl } from '../../services/notify.js';
import { csrfField, icon } from '../components.js';
import { METHOD_SHORT, cell, cycleLabel, paise, periodText, plural, savingLabel, yearlySaving } from './common.js';

// /shop/billing – "Plan & billing": status card, plan picker, payment history.

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

function statusCard(shop, mode, current = null) {
  const plan = getPlan(shop.plan);
  const left = daysLeft(shop);
  const liveLink = `${config.baseUrl}/${shop.slug}`;

  if (mode === 'sample') {
    return html`<section class="card bl-status bl-tone-info" aria-labelledby="bl-status-title">
      <div class="bl-status-main">
        <span class="bl-status-ic">${icon('sparkle')}</span>
        <div class="bl-status-copy">
          <p class="bl-kicker">Sample shop</p>
          <h2 class="bl-status-title" id="bl-status-title">This is the shared demo shop</h2>
          <p class="bl-status-text">Everyone trying Brighton Print uses this shop, so payments are switched off here and the sample data resets every ${config.demo.resetHours} hours. Want to try it with your own shop name and link?</p>
          <div class="btn-row bl-status-actions">
            <a class="btn btn-primary" href="/register">${icon('sparkle')}<span>Register your shop</span></a>
            <a class="btn btn-secondary" href="/register">${icon('store')}<span>Register my shop</span></a>
          </div>
          <p class="hint">Your own demo is free for ${config.demo.trialDays} days – no payment needed.</p>
        </div>
      </div>
    </section>`;
  }

  if (mode === 'paused') {
    return html`<section class="card bl-status bl-tone-danger" aria-labelledby="bl-status-title">
      <div class="bl-status-main">
        <span class="bl-status-ic">${icon('alert')}</span>
        <div class="bl-status-copy">
          <p class="bl-kicker">Account paused</p>
          <h2 class="bl-status-title" id="bl-status-title">Your account is paused</h2>
          <p class="bl-status-text">Your order link is not taking new orders right now. Please contact support and we will help you switch it back on.</p>
          <div class="btn-row bl-status-actions"><a class="btn btn-primary" href="${SUPPORT_BILLING}">${icon('mail')}<span>Contact support</span></a></div>
        </div>
      </div>
    </section>`;
  }

  if (mode === 'demo') {
    const ended = left == null || left < 0;
    const daysTotal = left == null ? 0 : left + 1;
    return html`<section class="card bl-status ${ended ? 'bl-tone-danger' : 'bl-tone-info'}" aria-labelledby="bl-status-title">
      <div class="bl-status-main${ended ? '' : ' has-days'}">
        <span class="bl-status-ic">${icon(ended ? 'alert' : 'sparkle')}</span>
        <div class="bl-status-copy">
          <p class="bl-kicker">Demo shop</p>
          <h2 class="bl-status-title" id="bl-status-title">${ended ? 'Your demo has ended' : `Demo – ${daysTotal === 1 ? 'last day today' : `${daysTotal} days left`}`}</h2>
          <p class="bl-status-text">${ended ? 'Your test order link is closed.' : 'Your order link works for testing.'} Go live to keep your shop and start taking real orders at:</p>
          <p class="bl-golive-link"><span class="mono">${liveLink}</span></p>
          <p class="hint">Demo orders are cleared when you go live, so you start fresh.</p>
        </div>
        ${ended ? '' : daysBlock(daysTotal, daysTotal === 1 ? 'day left' : 'days left')}
      </div>
      ${ended ? '' : periodBar(left, config.demo.trialDays)}
    </section>`;
  }

  if (mode === 'pending') {
    return html`<section class="card bl-status bl-tone-info" aria-labelledby="bl-status-title">
      <div class="bl-status-main">
        <span class="bl-status-ic">${icon('store')}</span>
        <div class="bl-status-copy">
          <p class="bl-kicker">Welcome to Brighton Print</p>
          <h2 class="bl-status-title" id="bl-status-title">Choose a plan to start taking orders</h2>
          <p class="bl-status-text">Your order link opens the moment your payment is done:</p>
          <p class="bl-golive-link"><span class="mono">${orderFormUrl(shop)}</span></p>
        </div>
      </div>
      <ol class="bl-steps" aria-label="How it works">
        <li><span>1</span>Pick a plan below</li>
        <li><span>2</span>Pay on PayU's secure page</li>
        <li><span>3</span>Your link is live – share it</li>
      </ol>
    </section>`;
  }

  const name = plan ? plan.name : 'Your';
  const cycle = shop.billing_cycle ? ` · ${cycleLabel(shop.billing_cycle)}` : '';
  if (mode === 'expired') {
    return html`<section class="card bl-status bl-tone-danger" aria-labelledby="bl-status-title">
      <div class="bl-status-main">
        <span class="bl-status-ic">${icon('alert')}</span>
        <div class="bl-status-copy">
          <p class="bl-kicker">${name} plan${cycle}</p>
          <h2 class="bl-status-title" id="bl-status-title">Your plan ended on ${formatDate(shop.paid_until)}</h2>
          <p class="bl-status-text">Your order link is closed. Renew below to reopen it straight away – your orders and settings are safe.</p>
        </div>
      </div>
    </section>`;
  }

  // active
  const soon = left != null && left <= 7;
  const total = shop.billing_cycle === 'yearly' ? 365 : 30;
  return html`<section class="card bl-status ${soon ? 'bl-tone-warn' : 'bl-tone-ok'}" aria-labelledby="bl-status-title">
    <div class="bl-status-main has-days">
      <span class="bl-status-ic">${icon(soon ? 'clock' : 'check')}</span>
      <div class="bl-status-copy">
        <p class="bl-kicker">Current plan</p>
        <h2 class="bl-status-title" id="bl-status-title">${name} plan${cycle}</h2>
        <p class="bl-status-text">Active till <b>${formatDate(shop.paid_until)}</b>${left === 0 ? ' – ends today' : ''}${soon ? '. Renew now to avoid a break.' : ''}</p>
        ${current
          ? html`<dl class="bl-facts">
              <div><dt>Status</dt><dd><span class="pill pill-shop-active">Active</span></dd></div>
              <div><dt>Started</dt><dd>${formatDate(current.period_start)}</dd></div>
              <div><dt>Ends</dt><dd>${formatDate(current.period_end)}, 11:59 pm</dd></div>
              <div><dt>Paid</dt><dd>${formatINR(current.amount_paise / 100)} on ${formatDateTime(current.paid_at)}</dd></div>
            </dl>`
          : ''}
        <ul class="bl-feats">${featureList(shop.plan).map((f) => html`<li>${icon('check')}<span>${f}</span></li>`)}</ul>
      </div>
      ${left === 0 ? daysBlock('0', 'ends today') : daysBlock(left, left === 1 ? 'day left' : 'days left')}
    </div>
    ${periodBar(left, total)}
  </section>`;
}

// ---------- plan picker ----------
function payLabel(mode, plan, isCurrent) {
  if (mode === 'pending') return (p) => `Pay ${p} & activate`;
  if (mode === 'demo') return (p) => `Go live · ${p}`;
  if (isCurrent) return (p) => `Renew · ${p}`;
  return (p) => `Switch to ${plan.name} · ${p}`;
}

const BLURB = {
  starter: 'For a small counter getting started.',
  pro: 'For busy shops with orders every day.',
  business: 'For high volume and big design files.',
};

// Every plan has every feature – only storage differs – so features are listed once.
const INCLUDED = ['Unlimited orders & customers', 'Own order link & QR poster', 'Proofs & one-tap approval', 'WhatsApp ready messages', 'Help & support'];

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
      ? html`<button class="btn ${isFeatured ? 'btn-primary' : 'btn-secondary'} btn-block bl-pay" type="submit" name="plan" value="${plan.key}" data-loading="Opening secure payment…"${canPay ? '' : raw(' disabled')}>
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
    <div class="bl-toggle">
      <label for="bl-cycle-monthly" class="bl-toggle-m">${CYCLES.monthly}</label>
      <label for="bl-cycle-yearly" class="bl-toggle-y">${CYCLES.yearly}${best ? html` <span class="bl-toggle-save">${best}</span>` : ''}</label>
    </div>`;
}

const PICKER_TITLE = {
  pending: ['Choose your plan', 'All plans include everything – they differ only in file storage. Change any time.'],
  demo: ['Go live – choose a plan', 'Keep your link, start taking real orders. All plans include everything; they differ only in file storage.'],
  active: ['Renew or change plan', 'Renewing early adds time after your current end date – you never lose days.'],
  expired: ['Renew your plan', 'Your order link reopens as soon as the payment is done.'],
  sample: ['Plans & pricing', 'Simple pricing for every print shop. All plans include everything; they differ only in file storage.'],
};

function planPicker(res, { shop, mode, plans, razorpayOn, choice }) {
  if (mode === 'paused' || !plans.length) return '';
  const canPay = razorpayOn && mode !== 'sample';
  const [title, sub] = PICKER_TITLE[mode];
  const has = (key) => plans.some((p) => p.key === key);
  const chosen = mode !== 'sample' && has(choice.plan) ? choice.plan : '';
  const featured = chosen || (isLive(mode) && has(shop.plan) ? shop.plan : plans.find((p) => p.popular)?.key || '');
  const selected = choice.cycle || (shop.billing_cycle === 'yearly' ? 'yearly' : 'monthly');
  return html`<section class="bl-section" aria-labelledby="bl-plans-title">
    <div class="bl-section-head">
      <h2 id="bl-plans-title">${title}</h2>
      <p>${sub}</p>
    </div>
    ${razorpayOn || mode === 'sample'
      ? ''
      : html`<div class="bl-setup" role="note">
          <span class="bl-setup-ic">${icon('info')}</span>
          <div>
            <b>Online payment is being set up.</b>
            <p>Meanwhile, pay by UPI to Brighton Solution and raise a ticket with the payment screenshot – we will switch your shop on quickly.</p>
            <a class="btn btn-secondary btn-sm" href="${SUPPORT_BILLING}">${icon('mail')}<span>Raise a ticket</span></a>
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
      <h3>Every plan includes</h3>
      <ul>${INCLUDED.map((t) => html`<li>${icon('check')}<span>${t}</span></li>`)}</ul>
    </div>
    ${mode === 'sample'
      ? ''
      : html`<ul class="bl-trust">
          <li>${icon('shield')}<span>Secure payment by PayU · UPI, cards, net banking</span></li>
          <li>${icon('check')}<span>Shop switched on instantly after payment</span></li>
          <li>${icon('file')}<span>Receipt for every payment</span></li>
        </ul>`}
  </section>`;
}

// ---------- history ----------
function history(payments) {
  if (!payments.length) return '';
  return html`<section class="bl-section" aria-labelledby="bl-history-title">
    <div class="bl-section-head"><h2 id="bl-history-title">Payment history</h2></div>
    <div class="card bl-history">
      <div class="table-wrap">
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
                <td class="bl-cell-action bl-c-action"><a class="btn btn-ghost btn-sm" href="/shop/billing/receipt/${p.id}">${icon('file')}<span>Receipt</span></a></td>
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
    </div>
  </section>`;
}

function helpCard(mode) {
  if (mode === 'sample' || mode === 'paused') return '';
  return html`<aside class="bl-help">
    <span class="bl-help-ic">${icon('info')}</span>
    <div><b>Questions about your plan or a payment?</b><p>We usually reply within a few hours.</p></div>
    <a class="btn btn-secondary btn-sm" href="${SUPPORT_BILLING}">Ask support</a>
  </aside>`;
}

export function billingView(res, { shop, state, sample, plans, payments, razorpayOn, choice = {} }) {
  const mode = billingMode(shop, state, sample);
  const today = new Date().toISOString().slice(0, 10);
  const current = payments.find((p) => !p.superseded_at && p.period_start <= today && p.period_end >= today) || null;
  return {
    title: 'Plan & billing',
    variant: 'shop',
    active: 'billing',
    scripts: ['/js/shop.js', '/js/billing.js'],
    body: html`<div class="container bl-page">
      <header class="page-head bl-head">
        <div>
          <h1>Plan &amp; billing</h1>
          <p>Your Brighton Print plan, payments and receipts.</p>
        </div>
      </header>
      ${statusCard(shop, mode, current)}
      ${mode === 'active'
        ? html`<details class="card bl-change"${choice.plan ? raw(' open') : ''}>
            <summary class="bl-change-sum">${icon('settings')}<span><b>Change or renew plan</b><small>Upgrade any time – unused days are credited. Renew early – time is added after your end date.</small></span></summary>
            ${planPicker(res, { shop, mode, plans, razorpayOn, choice })}
          </details>`
        : planPicker(res, { shop, mode, plans, razorpayOn, choice })}
      ${history(payments)}
      ${helpCard(mode)}
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
        <p class="hint">You will pay on PayU's secure page (UPI, cards, net banking) and come straight back here.</p>
        <a class="btn btn-ghost btn-sm" href="/shop/billing">${icon('arrowLeft')}<span>Back to plans</span></a>
      </div>
    </div>`,
  };
}
