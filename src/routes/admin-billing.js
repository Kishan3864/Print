import { Router } from 'express';
import { html } from '../lib/html.js';
import { db } from '../db.js';
import { clean, cleanLine, flash, formatDate } from '../lib/util.js';
import { CYCLES, getPlan, getPlans, isSampleShop, listPayments, paymentTitle, recordManualPayment, revenueStats, savePlans } from '../services/billing.js';
import { FEATURES, LIMITS, getAddon, getAddons, planMatrix, saveAddons, savePlanMatrix } from '../services/entitlements.js';
import { customRates, getServices, saveServices } from '../services/services.js';
import { audit, ipOf } from '../services/audit.js';
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
    scripts: ['/js/admin.js'],
    body: paymentsView({ stats: revenueStats(), payments: listPayments({ status: filter === 'all' ? '' : filter }), filter, counts }),
  });
});

// ---------- plans & features ----------
const plansPage = (res, extra = {}, status = 200) =>
  render(
    res,
    {
      title: 'Plans & features · Admin',
      variant: 'admin',
      active: 'plans',
      body: plansView(res, { plans: getPlans(), matrix: planMatrix(), addons: getAddons(), services: getServices(), custom: customRates(), ...extra }),
    },
    status
  );

router.get('/plans', (req, res) => plansPage(res));

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
    const nums = {};
    for (const k of ['monthly', 'yearly', 'lifetime', 'care']) {
      nums[k] = wholeNumber(body[`${k}_${p.key}`], 0, MAX_PRICE);
      if (nums[k] == null) e[k] = `Enter whole rupees from 0 to ${MAX_PRICE.toLocaleString('en-IN')}.`;
    }
    const storageGb = wholeNumber(body[`storage_${p.key}`], 1, MAX_STORAGE_GB);
    if (!name) e.name = 'Enter a plan name.';
    else if (name.length > 30) e.name = 'Keep the name to 30 characters or fewer.';
    if (storageGb == null) e.storageGb = `Enter a whole number of GB from 1 to ${MAX_STORAGE_GB.toLocaleString('en-IN')}.`;
    if (Object.keys(e).length) errors[p.key] = e;
    return {
      key: p.key,
      name: name || '',
      monthly: nums.monthly ?? cleanLine(body[`monthly_${p.key}`], 20),
      yearly: nums.yearly ?? cleanLine(body[`yearly_${p.key}`], 20),
      lifetime: nums.lifetime ?? cleanLine(body[`lifetime_${p.key}`], 20),
      care: nums.care ?? cleanLine(body[`care_${p.key}`], 20),
      storageGb: storageGb ?? cleanLine(body[`storage_${p.key}`], 20),
      active: body[`active_${p.key}`] === '1',
      popular: popular === p.key,
    };
  });
  let formError = Object.keys(errors).length ? 'Please fix the highlighted fields.' : '';
  if (!formError && !typed.some((p) => p.active)) formError = 'Keep at least one plan shown to shops – otherwise nobody can pay.';
  const free = typed.find((p) => p.active && (p.monthly < 1 || p.yearly < 1));
  if (!formError && free) formError = `${free.name || free.key} is shown to shops, so it needs a Monthly and a Yearly price of at least ₹1 – or untick “Shown to shops”.`;
  if (formError) return plansPage(res, { plans: typed, errors, formError }, 422);
  savePlans(typed);
  audit({ actor: 'admin', action: 'plans.prices', detail: typed.map((p) => `${p.key}: ${p.monthly}/${p.yearly}/${p.lifetime} care ${p.care}${p.active ? '' : ' (hidden)'}`).join(' · '), ip: ipOf(req) });
  flash(req, 'success', 'Prices saved. They apply to the next payment.');
  res.redirect(303, '/admin/plans#prices');
});

router.post('/plans/features', (req, res) => {
  const out = {};
  for (const p of getPlans()) {
    const row = {};
    for (const f of FEATURES) if (!f.core) row[f.key] = req.body[`m_${p.key}_${f.key}`] === '1';
    for (const l of LIMITS) {
      const n = wholeNumber(req.body[`m_${p.key}_${l.key}`], l.min, l.max);
      if (n == null) {
        flash(req, 'error', `${l.label} for ${p.name} must be a whole number from ${l.min} to ${l.max}.`);
        return res.redirect(303, '/admin/plans#features');
      }
      row[l.key] = n;
    }
    out[p.key] = row;
  }
  savePlanMatrix(out);
  audit({ actor: 'admin', action: 'plans.features', detail: Object.entries(out).map(([k, r]) => `${k}: ${Object.entries(r).filter(([, v]) => v === true).map(([f]) => f).join('+') || 'core only'}`).join(' · '), ip: ipOf(req) });
  flash(req, 'success', 'Plan features saved – every shop on those plans follows them now.');
  res.redirect(303, '/admin/plans#features');
});

router.post('/plans/addons', (req, res) => {
  const list = [];
  for (const a of getAddons()) {
    const nums = {};
    for (const k of ['monthly', 'yearly', 'lifetime']) {
      nums[k] = wholeNumber(req.body[`${k}_${a.key}`], 0, MAX_PRICE);
      if (nums[k] == null) {
        flash(req, 'error', `${a.name}: enter whole rupees from 0 to ${MAX_PRICE.toLocaleString('en-IN')}.`);
        return res.redirect(303, '/admin/plans#addons');
      }
    }
    list.push({ key: a.key, ...nums, active: req.body[`active_${a.key}`] === '1' });
  }
  saveAddons(list);
  audit({ actor: 'admin', action: 'plans.addons', detail: list.map((a) => `${a.key}: ${a.monthly}/${a.yearly}/${a.lifetime}${a.active ? '' : ' (not sold)'}`).join(' · '), ip: ipOf(req) });
  flash(req, 'success', 'Add-on prices saved.');
  res.redirect(303, '/admin/plans#addons');
});

router.post('/plans/services', (req, res) => {
  const list = [];
  for (const s of getServices()) {
    const price = wholeNumber(req.body[`price_${s.key}`], 0, MAX_PRICE);
    if (price == null) {
      flash(req, 'error', `${s.name}: enter whole rupees.`);
      return res.redirect(303, '/admin/plans#services');
    }
    list.push({ key: s.key, price, active: req.body[`active_${s.key}`] === '1' });
  }
  const min = wholeNumber(req.body.custom_min, 0, MAX_PRICE);
  const hourly = wholeNumber(req.body.custom_hourly, 0, MAX_PRICE);
  if (min == null || hourly == null) {
    flash(req, 'error', 'Custom work: enter whole rupees.');
    return res.redirect(303, '/admin/plans#services');
  }
  saveServices(list, { min, hourly });
  audit({ actor: 'admin', action: 'plans.services', detail: list.map((s) => `${s.key}: ${s.price}${s.active ? '' : ' (off)'}`).join(' · ') + ` · custom from ${min}, ${hourly}/h`, ip: ipOf(req) });
  flash(req, 'success', 'Service prices saved.');
  res.redirect(303, '/admin/plans#services');
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

  // "what" = plan:<key> | addon:<key> | care   (older forms: plan=<key>)
  const whatRaw = typeof req.body.what === 'string' ? req.body.what : typeof req.body.plan === 'string' ? `plan:${req.body.plan}` : '';
  const [product, item = ''] = whatRaw === 'care' ? ['care', 'care'] : whatRaw.split(':');
  const cycle = typeof req.body.cycle === 'string' && Object.hasOwn(CYCLES, req.body.cycle) ? req.body.cycle : '';
  if (product === 'plan' && !getPlan(item)) return fail('Choose a plan.');
  if (product === 'addon' && !getAddon(item)) return fail('Choose an add-on.');
  if (!['plan', 'addon', 'care'].includes(product)) return fail('Choose what the payment is for.');
  if (product !== 'care' && !cycle) return fail('Choose monthly, yearly or lifetime.');

  const typedAmount = cleanLine(req.body.amount, 20).replace(/[,\s₹]/g, '');
  let amountRupees = null;
  if (typedAmount) {
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(typedAmount) || Number(typedAmount) > MAX_PRICE) return fail('Enter the amount in rupees, like 499 or 499.50.');
    amountRupees = Number(typedAmount);
  }
  const note = clean(req.body.note, 200).replace(/\s+/g, ' ');
  const wasDemo = Boolean(shop.is_demo);

  let payment;
  try {
    payment = recordManualPayment(shop, { product, item, cycle, amountRupees, note });
  } catch (err) {
    return fail(err.message || 'Could not record the payment.');
  }
  audit({ actor: 'admin', shopId: shop.id, action: 'payment.manual', detail: `${paymentTitle(payment)} · ₹${payment.amount_paise / 100}${note ? ` · ${note}` : ''}`, ip: ipOf(req) });
  const fresh = getShopById(shop.id);
  const until =
    product === 'plan'
      ? cycle === 'lifetime'
        ? ' for life'
        : ` till ${formatDate(fresh.paid_until)}`
      : product === 'care'
        ? ` – Updates & Support till ${formatDate(fresh.care_until)}`
        : '';
  flash(req, 'success', `₹${(payment.amount_paise / 100).toLocaleString('en-IN')} recorded for ${paymentTitle(payment)}. ${shop.name} is switched on${until}.${wasDemo && product === 'plan' ? ' The demo shop is now live (demo orders cleared).' : ''}`);
  res.redirect(303, back);
});

export default router;
