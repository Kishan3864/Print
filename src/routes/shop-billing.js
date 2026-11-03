import { Router } from 'express';
import { html } from '../lib/html.js';
import { actionLimiter } from '../lib/security.js';
import { flash, formatDate } from '../lib/util.js';
import {
  CYCLES,
  activePlans,
  getPlan,
  getShopPayment,
  handleRazorpayCallback,
  isSampleShop,
  priceRupees,
  razorpayEnabled,
  shopPayments,
  startRazorpayPayment,
} from '../services/billing.js';
import { getShopById } from '../services/shops.js';
import { messagePage, render } from '../views/layout.js';
import { billingView, checkoutView } from '../views/shop-billing/billing.js';
import { receiptView } from '../views/shop-billing/receipt.js';

// Shop area: "Plan & billing" – plan picker, Razorpay checkout + callback, receipts.
// Mounted under the /shop gate (always open, also for pending/expired shops).

const router = Router();

const BILLING = '/shop/billing';
// An unpaid payment link is reused for the same plan/cycle/price for this long (no duplicate links).
const REUSE_LINK_MS = 60 * 60 * 1000;

const isHttpsUrl = (v) => typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/.test(v);

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
      razorpayOn: razorpayEnabled(),
      choice,
    })
  );
});

/** A recent unpaid Razorpay link of this shop for the same plan, cycle and current price. */
function reusableLink(shop, plan, cycle) {
  const amount = Math.round(priceRupees(plan, cycle) * 100);
  return shopPayments(shop.id).find(
    (p) =>
      p.status === 'created' &&
      p.method === 'razorpay' &&
      p.plan === plan.key &&
      p.cycle === cycle &&
      p.amount_paise === amount &&
      isHttpsUrl(p.provider_link_url) &&
      Date.now() - Date.parse(p.created_at) < REUSE_LINK_MS
  );
}

router.post('/billing/pay', actionLimiter, async (req, res) => {
  const shop = req.shop;
  const planKey = typeof req.body.plan === 'string' ? req.body.plan : '';
  const cycle = typeof req.body.cycle === 'string' && Object.hasOwn(CYCLES, req.body.cycle) ? req.body.cycle : '';
  const plan = activePlans().find((p) => p.key === planKey);

  if (isSampleShop(shop)) {
    flash(req, 'info', 'Payments are switched off in the shared demo shop. Create your own demo shop or register to go live.');
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
  if (!razorpayEnabled()) {
    flash(req, 'info', 'Online payment is being set up. Please pay by UPI to Brighton Solution and raise a ticket with the screenshot.');
    return res.redirect(303, BILLING);
  }

  try {
    let payment = reusableLink(shop, plan, cycle);
    if (!payment) {
      const url = await startRazorpayPayment(shop, plan.key, cycle);
      payment = shopPayments(shop.id).find((p) => p.status === 'created' && p.provider_link_url === url);
      if (!payment || !isHttpsUrl(url)) throw new Error('Could not open the payment page. Please try again.');
    }
    // Hand off via a same-origin page: CSP form-action blocks a form POST that redirects off-site.
    res.redirect(303, `${BILLING}/checkout/${payment.id}`);
  } catch (err) {
    console.error('[billing] start payment failed:', shop.id, err.message);
    flash(req, 'error', err.message || 'Could not start the payment. Please try again in a minute.');
    res.redirect(303, BILLING);
  }
});

router.get('/billing/checkout/:id(\\d+)', (req, res) => {
  const payment = getShopPayment(req.shop.id, req.params.id);
  if (payment && payment.status === 'paid') {
    flash(req, 'success', `This payment is already done – your plan is active till ${formatDate(payment.period_end)}.`);
    return res.redirect(303, BILLING);
  }
  if (!payment || payment.status !== 'created' || payment.method !== 'razorpay' || !isHttpsUrl(payment.provider_link_url)) {
    flash(req, 'info', 'That payment link is no longer available. Please choose your plan again.');
    return res.redirect(303, BILLING);
  }
  res.setHeader('Referrer-Policy', 'no-referrer');
  render(res, checkoutView(res, { payment, plan: getPlan(payment.plan) }));
});

// Razorpay sends the customer back here (GET with signed query parameters).
router.get('/billing/callback', (req, res) => {
  if (!req.query.razorpay_payment_link_id) return res.redirect(303, BILLING);
  const wasDemo = Boolean(req.shop.is_demo);
  const wasLive = !wasDemo && req.shopState === 'active';
  try {
    const { payment, paid } = handleRazorpayCallback(req.shop, req.query);
    if (!paid) {
      flash(req, 'info', 'Payment not completed. You have not been charged – you can try again any time.');
      return res.redirect(303, BILLING);
    }
    const shop = getShopById(req.shop.id);
    const till = formatDate(shop?.paid_until || payment.period_end);
    if (wasDemo) flash(req, 'success', `Your shop is live! Your plan is active till ${till}. Share your new link with customers.`);
    else flash(req, 'success', `Payment received – your shop is active till ${till}.`);
    res.redirect(303, wasLive ? BILLING : wasDemo ? '/shop/link' : '/shop');
  } catch (err) {
    console.error('[billing] callback failed:', req.shop.id, err.message);
    flash(req, 'error', err.message || 'We could not confirm this payment. If money was taken, contact support – we will fix it.');
    res.redirect(303, BILLING);
  }
});

router.get('/billing/receipt/:id(\\d+)', (req, res) => {
  const payment = getShopPayment(req.shop.id, req.params.id);
  if (!payment || payment.status !== 'paid') {
    return messagePage(res, {
      status: 404,
      title: 'Receipt not found',
      text: 'This receipt does not exist. You can find all your receipts under Plan & billing.',
      variant: 'shop',
      iconName: 'search',
      action: html`<a class="btn btn-primary" href="${BILLING}">Plan &amp; billing</a>`,
    });
  }
  render(res, receiptView({ shop: req.shop, payment }));
});

export default router;
