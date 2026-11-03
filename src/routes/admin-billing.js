import { Router } from 'express';
import { html } from '../lib/html.js';
import { db } from '../db.js';
import { clean, cleanLine, flash, formatDate } from '../lib/util.js';
import { CYCLES, getPlan, getPlans, isSampleShop, listPayments, priceRupees, recordManualPayment, revenueStats, savePlans } from '../services/billing.js';
import { getShopById } from '../services/shops.js';
import { messagePage, render } from '../views/layout.js';
import { PAYMENT_FILTERS, paymentsView } from '../views/admin-billing/payments.js';
import { plansView } from '../views/admin-billing/plans.js';

// Super admin: payments, plan prices, manual (UPI / cash) payments.
// Mounted at /admin behind requireAdmin.

const router = Router();

const MAX_PRICE = 1000000;
const MAX_STORAGE_GB = 100000;

const qStatusCounts = db.prepare('SELECT status, COUNT(*) AS n FROM payments GROUP BY status');

// ---------- payments ----------
router.get('/payments', (req, res) => {
  const filter = PAYMENT_FILTERS.some((f) => f.key === req.query.status) ? req.query.status : 'paid';
  const counts = { all: 0 };
  for (const r of qStatusCounts.all()) {
    counts[r.status] = r.n;
    counts.all += r.n;
  }
  render(res, {
    title: 'Payments · Admin',
    variant: 'admin',
    active: 'payments',
    body: paymentsView({ stats: revenueStats(), payments: listPayments({ status: filter === 'all' ? '' : filter }), filter, counts }),
  });
});

// ---------- plans ----------
router.get('/plans', (req, res) => {
  render(res, { title: 'Plans · Admin', variant: 'admin', active: 'plans', body: plansView(res, { plans: getPlans() }) });
});

/** Whole number in [min, max] typed as digits (commas and spaces allowed), else null. */
function wholeNumber(value, min, max) {
  const s = cleanLine(value, 20).replace(/[,\s₹]/g, '');
  if (!/^\d{1,7}$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

router.post('/plans', (req, res) => {
  const body = req.body;
  const popular = typeof body.popular === 'string' ? body.popular : '';
  const errors = {};
  const typed = getPlans().map((p) => {
    const e = {};
    const name = cleanLine(body[`name_${p.key}`], 60);
    const monthly = wholeNumber(body[`monthly_${p.key}`], 0, MAX_PRICE);
    const yearly = wholeNumber(body[`yearly_${p.key}`], 0, MAX_PRICE);
    const storageGb = wholeNumber(body[`storage_${p.key}`], 1, MAX_STORAGE_GB);
    if (!name) e.name = 'Enter a plan name.';
    else if (name.length > 30) e.name = 'Keep the name to 30 characters or fewer.';
    if (monthly == null) e.monthly = `Enter a whole number of rupees from 0 to ${MAX_PRICE.toLocaleString('en-IN')}.`;
    if (yearly == null) e.yearly = `Enter a whole number of rupees from 0 to ${MAX_PRICE.toLocaleString('en-IN')}.`;
    if (storageGb == null) e.storageGb = `Enter a whole number of GB from 1 to ${MAX_STORAGE_GB.toLocaleString('en-IN')}.`;
    if (Object.keys(e).length) errors[p.key] = e;
    return {
      key: p.key,
      name: name || '',
      monthly: monthly ?? cleanLine(body[`monthly_${p.key}`], 20),
      yearly: yearly ?? cleanLine(body[`yearly_${p.key}`], 20),
      storageGb: storageGb ?? cleanLine(body[`storage_${p.key}`], 20),
      active: body[`active_${p.key}`] === '1',
      popular: popular === p.key,
    };
  });
  let formError = Object.keys(errors).length ? 'Please fix the highlighted fields.' : '';
  if (!formError && !typed.some((p) => p.active)) formError = 'Keep at least one plan shown to shops – otherwise nobody can pay.';
  // Online payment needs at least ₹1 (Razorpay minimum).
  const free = typed.find((p) => p.active && (p.monthly < 1 || p.yearly < 1));
  if (!formError && free) formError = `${free.name || free.key} is shown to shops, so it needs a Monthly and a Yearly price of at least ₹1 – or untick “Shown to shops”.`;
  if (formError) {
    return render(res, { title: 'Plans · Admin', variant: 'admin', active: 'plans', body: plansView(res, { plans: typed, errors, formError }) }, 422);
  }
  savePlans(typed);
  flash(req, 'success', 'Plans saved. New prices apply to the next payment.');
  res.redirect(303, '/admin/plans');
});

// ---------- manual payment (UPI / cash / bank) ----------
router.post('/shops/:id(\\d+)/payments', (req, res) => {
  const shop = getShopById(Number(req.params.id));
  if (!shop) {
    return messagePage(res, {
      status: 404,
      title: 'Shop not found',
      text: 'This shop does not exist or was removed.',
      variant: 'admin',
      iconName: 'search',
      action: html`<a class="btn btn-primary" href="/admin/shops">Back to shops</a>`,
    });
  }
  const back = `/admin/shops/${shop.id}`;
  const fail = (text) => {
    flash(req, 'error', text);
    res.redirect(303, back);
  };
  if (isSampleShop(shop)) return fail('The shared sample demo shop cannot be billed.');

  const plan = typeof req.body.plan === 'string' ? getPlan(req.body.plan) : null;
  const cycle = typeof req.body.cycle === 'string' && Object.hasOwn(CYCLES, req.body.cycle) ? req.body.cycle : '';
  if (!plan || !cycle) return fail('Choose a plan and Monthly or Yearly.');

  const typedAmount = cleanLine(req.body.amount, 20).replace(/[,\s₹]/g, '');
  let amountRupees = priceRupees(plan, cycle);
  if (typedAmount) {
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(typedAmount) || Number(typedAmount) > MAX_PRICE) return fail('Enter the amount in rupees, like 499 or 499.50.');
    amountRupees = Number(typedAmount);
  }
  const note = clean(req.body.note, 200).replace(/\s+/g, ' ');
  const wasDemo = Boolean(shop.is_demo);

  let payment;
  try {
    payment = recordManualPayment(shop, { planKey: plan.key, cycle, amountRupees, note });
  } catch (err) {
    return fail(err.message || 'Could not record the payment.');
  }
  const amount = `₹${amountRupees.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  flash(
    req,
    'success',
    `Payment of ${amount} recorded. ${shop.name} is active till ${formatDate(payment.period_end)}.${wasDemo ? ' The demo shop is now live (demo orders cleared).' : ''}`
  );
  res.redirect(303, back);
});

export default router;
