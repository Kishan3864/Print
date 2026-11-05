import { Router } from 'express';
import { html } from '../lib/html.js';
import { actionLimiter } from '../lib/security.js';
import { flash, formatDate } from '../lib/util.js';
import {
  CYCLES,
  activePlans,
  getShopPayment,
  isSampleShop,
  paymentTitle,
  paymentsOpenFor,
  quoteAddon,
  quoteCare,
  quotePlanChange,
  payuForm,
  shopPayments,
  startCheckout,
} from '../services/billing.js';
import { getShopById } from '../services/shops.js';
import { audit, ipOf } from '../services/audit.js';
import { messagePage, render } from '../views/layout.js';
import { billingView } from '../views/shop-billing/billing.js';
import { csrfField, icon } from '../views/components.js';
import { receiptView } from '../views/shop-billing/receipt.js';

// Shop area: "Plan & billing" – plans (monthly / yearly / lifetime), add-ons, Updates & Support,
// the calculation page, PayU checkout, the waiting screen and receipts.
// Mounted under the /shop gate (always open, also for pending/expired shops).
// Nothing is switched on here: billing.js does that only after PayU confirms the payment.

const router = Router();
const BILLING = '/shop/billing';
const PRODUCTS = new Set(['plan', 'addon', 'care']);
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');

/** { product, item, cycle } from a form or query (plan forms send the plan key as "plan"). */
function readWhat(src) {
  const product = PRODUCTS.has(src.product) ? src.product : 'plan';
  const item = typeof src.item === 'string' && src.item ? src.item : typeof src.plan === 'string' ? src.plan : '';
  const cycle = typeof src.cycle === 'string' && Object.hasOwn(CYCLES, src.cycle) ? src.cycle : product === 'care' ? 'yearly' : '';
  return { product, item: item.slice(0, 30), cycle };
}
const whatQuery = (w) => `product=${encodeURIComponent(w.product)}&item=${encodeURIComponent(w.item)}&cycle=${encodeURIComponent(w.cycle)}`;

router.get('/billing', (req, res) => {
  const shop = req.shop;
  const choice = {
    plan: typeof req.query.plan === 'string' ? req.query.plan : '',
    cycle: typeof req.query.cycle === 'string' && Object.hasOwn(CYCLES, req.query.cycle) ? req.query.cycle : '',
  };
  render(
    res,
    billingView(res, {
      shop,
      state: req.shopState,
      sample: isSampleShop(shop),
      plans: activePlans(),
      payments: shopPayments(shop.id).filter((p) => p.status === 'paid'),
      canPay: !shop.is_demo,
      choice,
    })
  );
});

router.post('/billing/pay', actionLimiter, (req, res) => {
  const shop = req.shop;
  const what = readWhat(req.body);
  if (shop.is_demo) {
    flash(req, 'info', 'This is a demo shop – it cannot be paid for. Register your real shop to go live.');
    return res.redirect(303, BILLING);
  }
  if (req.shopState === 'paused') {
    flash(req, 'error', 'Your account is paused. Please contact support to switch it back on.');
    return res.redirect(303, BILLING);
  }
  if (!what.item || !what.cycle) {
    flash(req, 'error', 'Please choose what to pay for.');
    return res.redirect(303, BILLING);
  }
  if (req.body.confirm !== '1') return res.redirect(303, `${BILLING}/review?${whatQuery(what)}`);
  if (!paymentsOpenFor(shop)) return res.redirect(303, `${BILLING}/soon?${whatQuery(what)}`);
  try {
    const payment = startCheckout(shop, what);
    audit({ actor: 'shop', shopId: shop.id, action: 'payment.start', detail: `${paymentTitle(payment)} · ₹${payment.amount_paise / 100} · ${payment.reference}`, ip: ipOf(req) });
    res.redirect(303, `${BILLING}/checkout/${payment.id}`);
  } catch (err) {
    flash(req, 'error', err.message || 'Could not start the payment. Please try again in a minute.');
    res.redirect(303, BILLING);
  }
});

/** The calculation (what this costs today) for any product, then the button to PayU. */
router.get('/billing/review', (req, res) => {
  const shop = req.shop;
  const what = readWhat(req.query);
  let q;
  try {
    q = what.product === 'addon' ? quoteAddon(shop, what.item, what.cycle) : what.product === 'care' ? quoteCare(shop) : quotePlanChange(shop, what.item, what.cycle || 'monthly');
  } catch (err) {
    flash(req, 'error', err.message);
    return res.redirect(303, BILLING);
  }
  const row = (label, value, cls = '') => html`<div class="rv-row${cls}"><dt>${label}</dt><dd>${value}</dd></div>`;
  let kicker;
  let title;
  let lines;
  let note = '';
  let stop = '';
  if (what.product === 'plan') {
    kicker = `${q.plan.name} plan · ${CYCLES[what.cycle]}`;
    title = { new: 'Start your plan', renew: 'Renew your plan', upgrade: what.cycle === 'lifetime' ? 'Get your plan for life' : 'Upgrade your plan', downgrade: 'Not possible right now', owned: 'You own this plan' }[q.kind];
    if (q.kind === 'downgrade') {
      stop = q.lifetimeNow
        ? html`<p class="lead">You own <b>${q.currentName}</b> for life. You can only move up to a bigger lifetime plan.</p>`
        : html`<p class="lead">You are on <b>${q.currentName}</b> till <b>${formatDate(shop.paid_until)}</b>. A smaller plan cannot start in the middle of a paid period. Choose <b>${q.plan.name}</b> when you renew after ${formatDate(shop.paid_until)}.</p>`;
    } else if (q.kind === 'owned') stop = html`<p class="lead">You already own <b>${q.plan.name}</b> for life – nothing to pay.</p>`;
    lines = html`${q.kind === 'upgrade' && q.lifetimeUpgrade ? row(`Your ${q.currentName} lifetime licence`, `− ${inr(q.credit)}`, ' is-credit') : ''}
      ${q.kind === 'upgrade' && q.futureOnly ? row('Already paid for later periods', `− ${inr(q.credit)}`, ' is-credit') : ''}
      ${q.kind === 'upgrade' && !q.lifetimeUpgrade && !q.futureOnly
        ? html`${row('Current plan', `${q.currentName} · ${CYCLES[q.current.cycle]} · paid ${inr(q.current.amount_paise / 100)}`)}${row('Days used', `${q.used} of ${q.total} days`)}${row(`Credit for ${q.left} unused days`, `− ${inr(q.credit)}`, ' is-credit')}`
        : ''}
      ${row(`${q.plan.name} · ${CYCLES[what.cycle]}`, inr(q.price))}
      ${row(what.cycle === 'lifetime' ? 'Valid' : 'New period', what.cycle === 'lifetime' ? 'For life · 1 year Updates & Support included' : `${formatDate(q.start)} – ${formatDate(q.end)}`)}`;
    if (q.kind === 'renew') note = 'Renewing early adds the new period after your current end date – you lose nothing.';
    if (q.kind === 'upgrade') note = `Your new plan starts today. ${q.lifetimeUpgrade ? 'You pay only the difference.' : 'The unused part of your current plan is taken off the price.'}`;
  } else if (what.product === 'addon') {
    kicker = `${q.addon.name} add-on · ${CYCLES[what.cycle]}`;
    title = q.kind === 'renew' ? `Renew ${q.addon.name}` : `Add ${q.addon.name}`;
    if (q.kind === 'included') stop = html`<p class="lead"><b>${q.addon.name}</b> is already included in your plan – nothing to pay.</p>`;
    if (q.kind === 'owned') stop = html`<p class="lead">You already have <b>${q.addon.name}</b> for life.</p>`;
    lines = html`${row(`${q.addon.name} · ${CYCLES[what.cycle]}`, inr(q.price))}${row('Valid', what.cycle === 'lifetime' ? 'For life' : `${formatDate(q.start)} – ${formatDate(q.end)}`)}`;
    note = q.addon.blurb;
  } else {
    kicker = `${q.plan.name} lifetime · Updates & Support`;
    title = q.kind === 'renew' ? 'Add one more year of Updates & Support' : 'Renew Updates & Support';
    lines = html`${row('Updates & Support · 1 year', inr(q.price))}${row('Valid', `${formatDate(q.start)} – ${formatDate(q.end)}`)}`;
    note = 'New features, improvements and priority help for your lifetime plan.';
  }
  render(res, {
    title,
    variant: 'shop',
    active: 'billing',
    body: html`<section class="container-narrow wait-page">
      <div class="card card-pad rv-card">
        <p class="bl-kicker">${kicker}</p>
        <h1>${title}</h1>
        ${stop
          ? html`${stop}<div class="btn-row soon-actions"><a class="btn btn-primary btn-lg" href="${BILLING}">Back to my plan</a></div>`
          : html`<dl class="rv-list">${lines}${row('To pay now', inr(q.due), ' is-total')}</dl>
              ${note ? html`<p class="hint">${note}</p>` : ''}
              <form method="post" action="${BILLING}/pay" class="btn-row soon-actions">
                ${csrfField(res)}
                <input type="hidden" name="product" value="${what.product}"><input type="hidden" name="item" value="${what.item}"><input type="hidden" name="cycle" value="${what.cycle}"><input type="hidden" name="confirm" value="1">
                <button class="btn btn-primary btn-lg" type="submit">${icon('shield')}<span>Pay ${inr(q.due)} securely</span></button>
                <a class="btn btn-secondary btn-lg" href="${BILLING}">Back</a>
              </form>
              <p class="hint">Secure payment by PayU · UPI, cards, net banking. Switched on as soon as PayU confirms the payment.</p>`}
      </div>
    </section>`,
  });
});

// Shown while online payments are on hold (PayU live approval pending).
router.get('/billing/soon', (req, res) => {
  render(res, {
    title: 'Payments opening soon',
    variant: 'shop',
    active: 'billing',
    body: html`<section class="container-narrow wait-page">
      <div class="card card-pad wait-card soon-card">
        <div class="soon-mark" aria-hidden="true">${icon('sparkle')}</div>
        <h1>You're almost there</h1>
        <p class="lead">Thank you for choosing Brighton Print. We are switching on secure online payments right now – it will be ready very soon.</p>
        <ul class="soon-list">
          <li>${icon('check')}<span>Your account and your shop link are saved – nothing is lost.</span></li>
          <li>${icon('clock')}<span>Please check back in a little while and tap <b>Pay</b> again.</span></li>
          <li>${icon('bell')}<span>Want it today? Pay by UPI, message us the screenshot and we switch it on personally.</span></li>
        </ul>
        <div class="btn-row soon-actions">
          <a class="btn btn-primary btn-lg" href="/shop/support?new=billing">${icon('info')}<span>Message us</span></a>
          <a class="btn btn-secondary btn-lg" href="${BILLING}">Back to plans</a>
        </div>
      </div>
    </section>`,
  });
});

// Signed form that the browser posts to PayU (auto-submitted by /js/payu.js).
router.get('/billing/checkout/:id(\\d+)', (req, res) => {
  const payment = getShopPayment(req.shop.id, req.params.id);
  if (!payment || payment.status !== 'created' || payment.method !== 'payu') return res.redirect(303, BILLING);
  const { action, fields } = payuForm(payment, req.shop);
  res.setHeader('Referrer-Policy', 'no-referrer');
  // PayU's /_payment redirects to its own checkout hosts; the form-action check follows redirects.
  const csp = res.getHeader('Content-Security-Policy');
  if (csp) res.setHeader('Content-Security-Policy', String(csp).replace(/form-action [^;]*/, "form-action 'self' https:"));
  render(res, {
    title: 'Secure payment',
    variant: 'shop',
    active: 'billing',
    scripts: ['/js/payu.js'],
    body: html`<section class="container-narrow wait-page">
      <div class="card card-pad wait-card">
        <div class="spinner wait-spinner" aria-hidden="true"></div>
        <h1>Opening secure payment…</h1>
        <p class="lead">${paymentTitle(payment)} · ${inr(payment.amount_paise / 100)}</p>
        <form method="post" action="${action}" data-payu-autosubmit data-no-lock>
          ${Object.entries(fields).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
          <button class="btn btn-primary btn-lg" type="submit">${icon('shield')}<span>Continue to PayU</span></button>
        </form>
        <p class="hint">UPI, cards and net banking on PayU's secure page.</p>
      </div>
    </section>`,
  });
});

/** Where to go once a payment is confirmed. */
function afterPaid(payment) {
  if (payment.product === 'service') return `/shop/services/${payment.ref_id}`;
  if (payment.product === 'addon') return payment.item === 'bills' ? '/shop/bills' : `${BILLING}#addons`;
  if (payment.product === 'care') return `${BILLING}#care`;
  return '/shop';
}

// After PayU: wait here until the payment is confirmed (verify API / webhook / recheck job).
// live.js re-fetches this page when the shop changes; the redirect then takes over.
router.get('/billing/waiting/:id(\\d+)', (req, res) => {
  const payment = getShopPayment(req.shop.id, req.params.id);
  if (!payment) return res.redirect(303, BILLING);
  if (payment.status === 'paid') {
    const shop = getShopById(req.shop.id);
    flash(req, 'success', payment.product === 'plan' ? `Payment confirmed – ${paymentTitle(payment)} is active${shop?.billing_cycle === 'lifetime' ? ' for life' : ` till ${formatDate(shop?.paid_until || payment.period_end)}`}.` : `Payment confirmed – ${paymentTitle(payment)} is on.`);
    return res.redirect(303, afterPaid(payment));
  }
  if (payment.status === 'failed' || payment.status === 'cancelled') {
    flash(req, 'error', 'The payment did not go through. You have not been charged – please try again.');
    return res.redirect(303, payment.product === 'service' ? `/shop/services/${payment.ref_id}` : BILLING);
  }
  render(res, {
    title: 'Confirming your payment',
    variant: 'shop',
    active: 'billing',
    scripts: ['/js/payu.js'],
    body: html`<section class="container-narrow wait-page" data-wait-refresh>
      <div class="card card-pad wait-card">
        <div class="spinner wait-spinner" aria-hidden="true"></div>
        <h1>Confirming your payment…</h1>
        <p class="lead">We are checking <b>${paymentTitle(payment)}</b> with the bank through PayU. This usually takes a few seconds – the page moves on by itself.</p>
        <ol class="wait-steps">
          <li class="is-done">${icon('check')}<span>Payment sent</span></li>
          <li class="is-current">${icon('clock')}<span>Confirming with PayU</span></li>
          <li>${icon('store')}<span>Switched on</span></li>
        </ol>
        <p class="hint">Taking long? You can close this page – we keep checking and notify you. Questions: <a href="/shop/support?new=billing">contact support</a> with reference <b>${payment.reference}</b>.</p>
      </div>
    </section>`,
  });
});

router.get('/billing/receipt/:id(\\d+)', (req, res) => {
  const payment = getShopPayment(req.shop.id, req.params.id);
  if (!payment || payment.status !== 'paid') {
    return messagePage(res, {
      status: 404,
      title: 'Receipt not found',
      text: 'This receipt does not exist. All your receipts are in Plan & billing.',
      variant: 'shop',
      iconName: 'search',
      action: html`<a class="btn btn-primary" href="${BILLING}">Plan &amp; billing</a>`,
    });
  }
  render(res, receiptView({ shop: req.shop, payment }));
});

export default router;
