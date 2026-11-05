import { Router } from 'express';
import { html } from '../lib/html.js';
import { actionLimiter } from '../lib/security.js';
import { clean, cleanLine, flash } from '../lib/util.js';
import { paymentsOpenFor } from '../services/billing.js';
import { ipOf } from '../services/audit.js';
import { createRequest, customRates, getServices, getShopRequest, listShopRequests, requestPayments, setRequestStatus, startServicePayment } from '../services/services.js';
import { messagePage, render } from '../views/layout.js';
import { serviceRequestView, servicesView } from '../views/shop-services/services.js';

// /shop/services – paid help from Brighton Solution: setup, change-request review, quoted custom work.
// Mounted under the /shop gate. Every lookup is scoped by req.shop.id.

const router = Router();

function notFound(req, res) {
  messagePage(res, {
    status: 404,
    title: 'Request not found',
    text: 'This request does not exist in your account.',
    variant: 'shop',
    iconName: 'search',
    action: html`<a class="btn btn-primary" href="/shop/services">Back to services</a>`,
  });
}

router.get('/services', (req, res) => {
  render(res, servicesView(res, { shop: req.shop, services: getServices().filter((s) => s.active), requests: listShopRequests(req.shop.id), custom: customRates(), values: {}, errors: {} }));
});

router.post('/services', actionLimiter, (req, res) => {
  const values = { service: cleanLine(req.body.service, 30), title: cleanLine(req.body.title, 120), details: clean(req.body.details, 3000).replace(/\r\n?/g, '\n') };
  const errors = {};
  const svc = getServices().find((s) => s.key === values.service && s.active);
  if (!svc) errors.service = 'Choose a service.';
  if (values.title.length < 4) errors.title = 'Write a short title (what you need).';
  if (values.service === 'review' && values.details.length < 15) errors.details = 'Describe the change in a few lines so we can review it.';
  if (req.shop.is_demo) errors.service = 'Services are for live shops. Go live first – or message us from Help.';
  if (Object.keys(errors).length) {
    return render(res, servicesView(res, { shop: req.shop, services: getServices().filter((s) => s.active), requests: listShopRequests(req.shop.id), custom: customRates(), values, errors }), 422);
  }
  const request = createRequest(req.shop, values, { ip: ipOf(req) });
  if (request.status === 'awaiting_payment') return payNow(req, res, request, 'fee');
  flash(req, 'success', 'Request sent – we will reply soon.');
  res.redirect(303, `/shop/services/${request.id}`);
});

/** Starts the PayU payment for a request, or explains how to pay while online payments are on hold. */
function payNow(req, res, request, which) {
  if (!paymentsOpenFor(req.shop)) {
    flash(req, 'info', 'Online payment is opening soon. Pay by UPI and message us the screenshot – we will mark it paid for you.');
    return res.redirect(303, `/shop/services/${request.id}`);
  }
  try {
    const payment = startServicePayment(req.shop, request, which);
    res.redirect(303, `/shop/billing/checkout/${payment.id}`);
  } catch (err) {
    flash(req, 'error', err.message);
    res.redirect(303, `/shop/services/${request.id}`);
  }
}

router.get('/services/:id(\\d{1,9})', (req, res) => {
  const request = getShopRequest(req.shop.id, req.params.id);
  if (!request) return notFound(req, res);
  render(res, serviceRequestView(res, { shop: req.shop, request, payments: requestPayments(request).filter((p) => p.status === 'paid'), payOpen: paymentsOpenFor(req.shop) }));
});

router.post('/services/:id(\\d{1,9})/pay', actionLimiter, (req, res) => {
  const request = getShopRequest(req.shop.id, req.params.id);
  if (!request) return notFound(req, res);
  payNow(req, res, request, request.status === 'quoted' ? 'quote' : 'fee');
});

router.post('/services/:id(\\d{1,9})/cancel', (req, res) => {
  const request = getShopRequest(req.shop.id, req.params.id);
  if (!request) return notFound(req, res);
  if (!['awaiting_payment', 'quoted'].includes(request.status)) {
    flash(req, 'error', 'This request is already being worked on. Message us in the conversation instead.');
  } else {
    setRequestStatus(request, 'cancelled', { actor: 'shop', ip: ipOf(req) });
    flash(req, 'success', 'Request cancelled.');
  }
  res.redirect(303, `/shop/services/${request.id}`);
});

export default router;
