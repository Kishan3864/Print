import { Router } from 'express';
import { html } from '../lib/html.js';
import { clampInt, clean, cleanLine, flash } from '../lib/util.js';
import { recordManualPayment } from '../services/billing.js';
import { getShopById } from '../services/shops.js';
import { audit, ipOf, listAudit } from '../services/audit.js';
import { DOC_KEYS, consentStats, legal, saveLegal } from '../services/legal.js';
import { REQUEST_STATUS, getRequest, listRequests, requestPayments, setQuote, setRequestStatus } from '../services/services.js';
import { messagePage, render } from '../views/layout.js';
import { auditView, legalAdminView, requestAdminView, requestsView } from '../views/admin/manage.js';

// Super admin: service requests (quote, status, record UPI payments), audit log, Terms & privacy.
// Mounted at /admin behind requireAdmin.

const router = Router();
const ID = ':id(\\d{1,9})';

function loadRequest(req, res, next) {
  const r = getRequest(req.params.id);
  if (!r) {
    return messagePage(res, { status: 404, title: 'Request not found', text: 'This service request does not exist.', variant: 'admin', iconName: 'search', action: html`<a class="btn btn-primary" href="/admin/services">All requests</a>` });
  }
  req.request = r;
  req.requestShop = getShopById(r.shop_id);
  next();
}

// ---------- service requests ----------
router.get('/services', (req, res) => {
  const status = Object.hasOwn(REQUEST_STATUS, req.query.status) ? req.query.status : '';
  const all = listRequests();
  render(res, { title: 'Service requests · Admin', variant: 'admin', active: 'services', body: requestsView({ rows: status ? all.filter((r) => r.status === status) : all, all, status }) });
});

router.get(`/services/${ID}`, loadRequest, (req, res) => {
  render(res, { title: `Request #${req.request.id} · Admin`, variant: 'admin', active: 'services', body: requestAdminView(res, { request: req.request, shop: req.requestShop, payments: requestPayments(req.request) }) });
});

router.post(`/services/${ID}/quote`, loadRequest, (req, res) => {
  const amount = Number(cleanLine(req.body.amount, 12).replace(/[,\s₹]/g, ''));
  if (!Number.isFinite(amount) || amount < 1 || amount > 10000000) {
    flash(req, 'error', 'Enter the quote in rupees.');
    return res.redirect(303, `/admin/services/${req.request.id}`);
  }
  setQuote(req.request, { amountPaise: Math.round(amount * 100), note: clean(req.body.note, 1000) }, { ip: ipOf(req) });
  flash(req, 'success', `Quote of ₹${amount.toLocaleString('en-IN')} sent to ${req.requestShop?.name || 'the shop'}.`);
  res.redirect(303, `/admin/services/${req.request.id}`);
});

router.post(`/services/${ID}/status`, loadRequest, (req, res) => {
  const status = cleanLine(req.body.status, 30);
  try {
    setRequestStatus(req.request, status, { actor: 'admin', note: clean(req.body.note, 1000), ip: ipOf(req) });
    flash(req, 'success', `Request marked “${REQUEST_STATUS[status]}”.`);
  } catch (err) {
    flash(req, 'error', err.message);
  }
  res.redirect(303, `/admin/services/${req.request.id}`);
});

// Money received outside PayU for the fee or the quote.
router.post(`/services/${ID}/paid`, loadRequest, (req, res) => {
  const r = req.request;
  const shop = req.requestShop;
  const which = r.status === 'quoted' ? 'quote' : r.status === 'awaiting_payment' ? 'fee' : '';
  if (!which || !shop) {
    flash(req, 'error', 'Nothing to pay on this request right now.');
    return res.redirect(303, `/admin/services/${r.id}`);
  }
  const due = which === 'fee' ? r.fee_paise : Math.max(100, r.quote_paise - (r.service === 'review' ? r.fee_paise : 0));
  try {
    const p = recordManualPayment(shop, { product: 'service', item: `${r.service}:${which}`, amountRupees: due / 100, note: cleanLine(req.body.note, 200), refId: r.id, title: `${which === 'fee' ? 'Service' : 'Custom work'} – ${r.title}` });
    audit({ actor: 'admin', shopId: shop.id, action: 'payment.manual', detail: `${p.title} · ₹${p.amount_paise / 100}`, ip: ipOf(req) });
    flash(req, 'success', `₹${(due / 100).toLocaleString('en-IN')} recorded – request moved on.`);
  } catch (err) {
    flash(req, 'error', err.message);
  }
  res.redirect(303, `/admin/services/${r.id}`);
});

// ---------- audit log ----------
router.get('/audit', (req, res) => {
  const q = cleanLine(typeof req.query.q === 'string' ? req.query.q : '', 80);
  const actor = ['admin', 'shop', 'system', 'payu', 'customer'].includes(req.query.actor) ? req.query.actor : '';
  const shopId = clampInt(req.query.shop, 1, 1e9, null);
  const page = clampInt(req.query.page, 1, 100000, 1);
  const size = 100;
  const list = listAudit({ q, actor, shopId, limit: size, offset: (page - 1) * size });
  render(res, { title: 'Audit log · Admin', variant: 'admin', active: 'audit', body: auditView({ list, q, actor, shop: shopId ? getShopById(shopId) : null, page, size }) });
});

// ---------- Terms, Privacy, Refund policy ----------
router.get('/legal', (req, res) => {
  render(res, { title: 'Terms & privacy · Admin', variant: 'admin', active: 'legal', body: legalAdminView(res, { legal: legal(), stats: consentStats() }) });
});

router.post('/legal', (req, res) => {
  const docs = {};
  for (const k of DOC_KEYS) {
    const title = cleanLine(req.body[`title_${k}`], 80);
    const body = clean(req.body[`body_${k}`], 40000).replace(/\r\n?/g, '\n');
    if (title.length < 3 || body.length < 50) {
      flash(req, 'error', 'Every document needs a title and some text.');
      return res.redirect(303, '/admin/legal');
    }
    docs[k] = { title, body };
  }
  const publish = req.body.publish === '1';
  const version = saveLegal(docs, { publish });
  flash(req, 'success', publish ? `Published version ${version}. Every shop owner will be asked to accept it on their next visit.` : 'Texts saved (same version – nobody is asked again).');
  res.redirect(303, '/admin/legal');
});

export default router;
