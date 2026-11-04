import { Router } from 'express';
import { html } from '../lib/html.js';
import { actionLimiter } from '../lib/security.js';
import { flash, formatDate } from '../lib/util.js';
import {
  CYCLES,
  activePlans,
  getPlan,
  getShopPayment,
  isSampleShop,
  priceRupees,
  payuEnabled,
  paymentsOpenFor,
  quotePlanChange,
  payuForm,
  shopPayments,
  startPayuPayment,
} from '../services/billing.js';
import { getShopById } from '../services/shops.js';
import { messagePage, render } from '../views/layout.js';
import { billingView } from '../views/shop-billing/billing.js';
import { csrfField, icon } from '../views/components.js';
import { receiptView } from '../views/shop-billing/receipt.js';

// Shop area: "Plan & payments" (inside Account) – plan picker, PayU checkout, waiting screen, receipts.
// Mounted under the /shop gate (always open, also for pending/expired shops).

const router = Router();

const BILLING = '/shop/billing';


router.get('/billing', (req, res) => {
  const shop = req.shop;
  // ?plan=&cycle= preselects the choice made on the sign-up page.
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
      razorpayOn: true,
      choice,
    })
  );
});

router.post('/billing/pay', actionLimiter, (req, res) => {
  const shop = req.shop;
  const planKey = typeof req.body.plan === 'string' ? req.body.plan : '';
  const cycle = typeof req.body.cycle === 'string' && Object.hasOwn(CYCLES, req.body.cycle) ? req.body.cycle : '';
  const plan = activePlans().find((p) => p.key === planKey);

  if (shop.is_demo) {
    flash(req, 'info', 'This is a demo shop – it cannot be paid for. Register your real shop to go live.');
    return res.redirect(303, BILLING);
  }
  if (req.shopState === 'paused') {
    flash(req, 'error', 'Your account is paused. Please contact support to switch it back on.');
    return res.redirect(303, BILLING);
  }
  if (!plan || !cycle || priceRupees(plan, cycle) < 1) {
    flash(req, 'error', 'Please choose a plan and Monthly or Yearly.');
    return res.redirect(303, BILLING);
  }
  if (req.body.confirm !== '1') return res.redirect(303, `${BILLING}/review?plan=${plan.key}&cycle=${cycle}`);
  if (!paymentsOpenFor(shop)) return res.redirect(303, `${BILLING}/soon?plan=${plan.key}&cycle=${cycle}`);
  try {
    const payment = startPayuPayment(shop, plan.key, cycle);
    res.redirect(303, `${BILLING}/checkout/${payment.id}`);
  } catch (err) {
    flash(req, 'error', err.message || 'Could not start the payment. Please try again in a minute.');
    res.redirect(303, BILLING);
  }
});

// Calculation first: what this choice costs today, then the button to PayU.
router.get('/billing/review', (req, res) => {
  const shop = req.shop;
  const cycle = Object.hasOwn(CYCLES, req.query.cycle) ? req.query.cycle : 'monthly';
  let q;
  try {
    q = quotePlanChange(shop, String(req.query.plan || ''), cycle);
  } catch {
    return res.redirect(303, BILLING);
  }
  const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');
  const TITLE = { new: 'Start your plan', renew: 'Renew your plan', upgrade: 'Upgrade your plan', downgrade: 'Switch plan at renewal' };
  const row = (label, value, cls = '') => html`<div class="rv-row${cls}"><dt>${label}</dt><dd>${value}</dd></div>`;
  render(res, {
    title: TITLE[q.kind],
    variant: 'shop',
    active: 'billing',
    body: html`<section class="container-narrow wait-page">
      <div class="card card-pad rv-card">
        <p class="bl-kicker">${q.plan.name} plan · ${CYCLES[cycle]}</p>
        <h1>${TITLE[q.kind]}</h1>
        ${q.kind === 'downgrade'
          ? html`<p class="lead">You are on <b>${q.currentName}</b> till <b>${formatDate(shop.paid_until)}</b>. A smaller plan cannot start in the middle of a paid period – you would lose days you already paid for.</p>
              <p class="lead">Choose <b>${q.plan.name}</b> when you renew after ${formatDate(shop.paid_until)}. Until then everything keeps working as it is.</p>
              <div class="btn-row soon-actions"><a class="btn btn-primary btn-lg" href="${BILLING}">Back to my plan</a></div>`
          : html`<dl class="rv-list">
                ${q.kind === 'upgrade'
                  ? html`${row('Current plan', `${q.currentName} · ${CYCLES[q.current.cycle]} · paid ${inr(q.current.amount_paise / 100)}`)}
                      ${row('Days used', `${q.used} of ${q.total} days`)}
                      ${row(`Credit for ${q.left} unused days`, `− ${inr(q.credit)}`, ' is-credit')}`
                  : ''}
                ${row(`${q.plan.name} · ${CYCLES[cycle]}`, inr(q.price))}
                ${row('New period', `${formatDate(q.start)} – ${formatDate(q.end)}`)}
                ${row('To pay now', inr(q.due), ' is-total')}
              </dl>
              ${q.kind === 'renew' ? html`<p class="hint">Renewing early adds the new period after your current end date – you lose nothing.</p>` : ''}
              ${q.kind === 'upgrade' ? html`<p class="hint">Your ${q.currentName} plan ends now and ${q.plan.name} starts today. The unused part is taken off the price.</p>` : ''}
              <form method="post" action="${BILLING}/pay" class="btn-row soon-actions">
                ${csrfField(res)}
                <input type="hidden" name="plan" value="${q.plan.key}"><input type="hidden" name="cycle" value="${cycle}"><input type="hidden" name="confirm" value="1">
                <button class="btn btn-primary btn-lg" type="submit">${icon('shield')}<span>Pay ${inr(q.due)} securely</span></button>
                <a class="btn btn-secondary btn-lg" href="${BILLING}">Back</a>
              </form>
              <p class="hint">Secure payment by PayU · UPI, cards, net banking</p>`}
      </div>
    </section>`,
  });
});

// Shown while online payments are on hold (PayU live approval pending).
router.get('/billing/soon', (req, res) => {
  const plan = activePlans().find((p) => p.key === req.query.plan);
  const cycle = Object.hasOwn(CYCLES, req.query.cycle) ? req.query.cycle : 'monthly';
  render(res, {
    title: 'Payments opening soon',
    variant: 'shop',
    active: 'billing',
    body: html`<section class="container-narrow wait-page">
      <div class="card card-pad wait-card soon-card">
        <div class="soon-mark" aria-hidden="true">${icon('sparkle')}</div>
        <h1>You're almost there</h1>
        <p class="lead">Thank you for choosing ${plan ? html`the <b>${plan.name}</b> plan (${CYCLES[cycle]})` : 'Brighton Print'}. We are switching on secure online payments right now – it will be ready very soon.</p>
        <ul class="soon-list">
          <li>${icon('check')}<span>Your account and your shop link are saved – nothing is lost.</span></li>
          <li>${icon('clock')}<span>Please check back in a little while and tap <b>Pay</b> again.</span></li>
          <li>${icon('bell')}<span>Want to start today? Message us and we will switch your shop on personally.</span></li>
        </ul>
        <div class="btn-row soon-actions">
          <a class="btn btn-primary btn-lg" href="/shop/support?new=billing">${icon('info')}<span>Message us</span></a>
          <a class="btn btn-secondary btn-lg" href="/shop/billing">Back to plans</a>
        </div>
        <p class="hint">Thank you for your patience – we are happy to have you with us.</p>
      </div>
    </section>`,
  });
});

// Signed form that the browser posts to PayU (auto-submitted by /js/payu.js).
router.get('/billing/checkout/:id(\\d+)', (req, res) => {
  const payment = getShopPayment(req.shop.id, req.params.id);
  if (!payment || payment.status !== 'created' || payment.method !== 'payu') return res.redirect(303, BILLING);
  const plan = getPlan(payment.plan);
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
        <p class="lead">${plan?.name || payment.plan} · ${CYCLES[payment.cycle]} · ₹${(payment.amount_paise / 100).toLocaleString('en-IN')}</p>
        <form method="post" action="${action}" data-payu-autosubmit data-no-lock>
          ${Object.entries(fields).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
          <button class="btn btn-primary btn-lg" type="submit">${icon('shield')}<span>Continue to PayU</span></button>
        </form>
        <p class="hint">UPI, cards and net banking on PayU's secure page.</p>
      </div>
    </section>`,
  });
});

// After PayU: wait here until the payment is confirmed, then go straight to the dashboard.
// live.js re-fetches this page when the shop changes; the redirect then takes over.
router.get('/billing/waiting/:id(\\d+)', (req, res) => {
  const payment = getShopPayment(req.shop.id, req.params.id);
  if (!payment) return res.redirect(303, BILLING);
  if (payment.status === 'paid') {
    const shop = getShopById(req.shop.id);
    flash(req, 'success', `Payment received – your shop is active till ${formatDate(shop?.paid_until || payment.period_end)}.`);
    return res.redirect(303, '/shop');
  }
  if (payment.status === 'failed' || payment.status === 'cancelled') {
    flash(req, 'error', 'The payment did not go through. You have not been charged – please try again.');
    return res.redirect(303, BILLING);
  }
  render(res, {
    title: 'Activating your shop',
    variant: 'shop',
    active: 'billing',
    scripts: ['/js/payu.js'],
    body: html`<section class="container-narrow wait-page" data-wait-refresh>
      <div class="card card-pad wait-card">
        <div class="spinner wait-spinner" aria-hidden="true"></div>
        <h1>Activating your shop…</h1>
        <p class="lead">We are confirming your payment with the bank. This usually takes a few seconds – your dashboard opens by itself.</p>
        <ol class="wait-steps">
          <li class="is-done">${icon('check')}<span>Payment sent</span></li>
          <li class="is-current">${icon('clock')}<span>Confirming with the bank</span></li>
          <li>${icon('store')}<span>Your shop goes live</span></li>
        </ol>
        <p class="hint">Taking long? You can close this page – we will notify you. Questions: <a href="/shop/support?new=billing">contact support</a>.</p>
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
      text: 'This receipt does not exist. All your receipts are in Account → Plan & payments.',
      variant: 'shop',
      iconName: 'search',
      action: html`<a class="btn btn-primary" href="${BILLING}">Plan &amp; payments</a>`,
    });
  }
  render(res, receiptView({ shop: req.shop, payment }));
});

export default router;
