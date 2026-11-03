import { Router } from 'express';
import { html } from '../lib/html.js';
import { storageCapBytes } from '../services/billing.js';
import { SLUG_ROUTE, clampInt, clean, cleanLine, flash, isEmail, isMobile, maskPhone } from '../lib/util.js';
import { actionLimiter, orderLimiter } from '../lib/security.js';
import { discardUploads, orderFilesUpload, sendStoredFile } from '../lib/uploads.js';
import { acceptsOrders, getShopBySlug, paperOptions, sizeOptions, storageUsed } from '../services/shops.js';
import { addCustomerVersion, createOrder, customerDecision, getOrderByToken, getOrderFile, latestProof, orderFiles } from '../services/orders.js';
import { trackPath } from '../services/notify.js';
import { messagePage } from '../views/layout.js';
import { closedPage, orderFormPage } from '../views/customer/order-form.js';
import { trackPage } from '../views/customer/track.js';

// Public customer pages (no login), mounted last at '/':
//   GET  /:slug                      order form (or "not taking orders")
//   POST /:slug/order                create order (multipart)
//   GET  /:slug/o/:token             private tracking page
//   POST /:slug/o/:token/approve     approve proof
//   POST /:slug/o/:token/changes     request changes
//   GET  /:slug/o/:token/f/:fileId   download / preview a file of that order
// Everything is scoped by the slug's shop and the order's secret token.

const router = Router();

const SHOP = `/:slug(${SLUG_ROUTE})`;
const ORDER = `${SHOP}/o/:token([A-Za-z0-9_-]{20,64})`;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Loads the shop from the slug; unknown, unpaid or rejected shops fall through to the 404 page.
 * This router is mounted twice: at /demo for demo shops and at / for live shops.
 */
function loadShop(req, res, next) {
  const shop = getShopBySlug(req.params.slug);
  const demoPath = req.baseUrl === '/demo';
  if (!shop || shop.status === 'pending' || shop.status === 'rejected') return next('route');
  if (Boolean(shop.is_demo) !== demoPath) {
    // A demo shop that went live (or a live link opened under /demo): send to the right address.
    if (req.method === 'GET') return res.redirect(302, (shop.is_demo ? '/demo' : '') + req.originalUrl.slice(req.baseUrl.length));
    return next('route');
  }
  req.custShop = shop;
  req.isOwner = Boolean(req.shop && req.shop.id === shop.id);
  next();
}

/** Loads the order by token, scoped to the slug's shop (a token from another shop never matches). */
function loadOrder(req, res, next) {
  const order = getOrderByToken(req.custShop.id, req.params.token);
  if (!order) return next('route');
  req.custOrder = order;
  next();
}

// ---------- order form ----------
router.get(SHOP, loadShop, (req, res) => {
  const shop = req.custShop;
  if (!acceptsOrders(shop)) return closedPage(res, shop, { owner: req.isOwner });
  orderFormPage(res, { shop, owner: req.isOwner });
});

/** Reads + validates the order fields. Returns { values, data, errors }. */
function readOrder(req, shop) {
  const b = req.body || {};
  const sizes = sizeOptions(shop);
  // When multer stops early (bad file) the fields after the file input never arrive:
  // fall back to defaults for those instead of reporting them as mistakes.
  const missing = (key) => Boolean(req.uploadError) && b[key] === undefined;
  const values = {
    name: cleanLine(b.name, 200),
    mobile: cleanLine(b.mobile, 40),
    email: cleanLine(b.email, 200),
    size: cleanLine(b.size, 120),
    quantity: clampInt(b.quantity, 1, 100000, 1),
    color_mode: clean(b.color_mode, 10),
    sides: clean(b.sides, 10),
    paper: cleanLine(b.paper, 60),
    delivery: clean(b.delivery, 10) === 'delivery' ? 'delivery' : 'pickup',
    notes: clean(b.notes, 1000),
  };
  const errors = {};

  if (!values.name) errors.name = 'Please enter your name.';
  else if (values.name.length > 80) errors.name = 'Please keep your name under 80 characters.';
  if (!values.mobile) errors.mobile = 'Please enter your mobile number.';
  else if (!isMobile(values.mobile) || values.mobile.length > 20) errors.mobile = 'Enter a valid mobile number, e.g. 98765 43210.';
  if (values.email && !isEmail(values.email)) errors.email = 'Enter a valid email address, or leave it empty.';

  if (!sizes.includes(values.size)) {
    if (!missing('size')) errors.size = 'Please choose a size from the list.';
    values.size = sizes[0];
  }
  if (values.color_mode !== 'color' && values.color_mode !== 'bw') {
    if (!missing('color_mode')) errors.color_mode = 'Please choose colour or black & white.';
    values.color_mode = 'color';
  }
  if (values.paper && !paperOptions(shop).includes(values.paper)) values.paper = '';
  if (values.sides !== 'single' && values.sides !== 'both') {
    if (!missing('sides')) errors.sides = 'Please choose single side or both sides.';
    values.sides = 'single';
  }

  const files = req.files || [];
  if (req.uploadError) errors.files = `${req.uploadError} Please choose your files again.`;
  else if (!files.length) errors.files = 'Please add at least one file to print.';
  else if (Object.keys(errors).length) errors.files = 'Please choose your files again – they are not kept when something needs fixing.';

  const data = {
    customer_name: values.name,
    customer_mobile: values.mobile,
    customer_email: values.email,
    size: values.size,
    quantity: values.quantity,
    color_mode: values.color_mode,
    sides: values.sides,
    paper: values.paper,
    delivery: values.delivery,
    notes: values.notes,
  };
  return { values, data, errors };
}

/** Closed shops answer without storing anything (Node discards the unread body). */
function requireOpen(req, res, next) {
  if (!acceptsOrders(req.custShop)) return closedPage(res, req.custShop, { owner: req.isOwner }, 403);
  next();
}

/** Storage caps: small for demo shops, the plan's storage for live shops. */
function checkQuota(req, res, next) {
  const shop = req.custShop;
  const cap = storageCapBytes(shop);
  if (cap && storageUsed(shop.id) + (Number(req.get('content-length')) || 0) > cap) {
    req.uploadRefused = shop.is_demo
      ? 'The demo is full right now – it resets every few hours.'
      : `${shop.name} cannot take more files right now. Please contact the shop.`;
  }
  req.uploadShop = shop;
  next();
}

router.post(`${SHOP}/order`, orderLimiter, loadShop, requireOpen, checkQuota, orderFilesUpload, (req, res, next) => {
  const shop = req.custShop;
  const { values, data, errors } = readOrder(req, shop);
  if (Object.keys(errors).length) {
    discardUploads(req);
    return orderFormPage(res, { shop, values, errors, owner: req.isOwner }, 422);
  }
  // Demo orders are visible to every demo visitor: never keep real contact details.
  if (shop.is_demo) {
    data.customer_mobile = maskPhone(data.customer_mobile);
    data.customer_email = '';
  }
  let order;
  try {
    order = createOrder(shop, data, req.files);
  } catch (err) {
    discardUploads(req);
    return next(err);
  }
  res.redirect(303, `${trackPath(shop, order)}?new=1`);
});

// ---------- tracking page ----------
router.get(ORDER, loadShop, loadOrder, (req, res) => {
  const shop = req.custShop;
  const order = req.custOrder;
  // "Order placed!" only right after ordering (a bookmarked ?new=1 link stops showing it).
  const isNew = req.query.new === '1' && Date.now() - Date.parse(order.created_at) < DAY_MS;
  trackPage(res, { shop, order, files: orderFiles(order), proof: latestProof(order), isNew, owner: req.isOwner });
});

// ---------- proof decision ----------
const decide = (decision) => (req, res) => {
  const shop = req.custShop;
  const order = req.custOrder;
  const back = trackPath(shop, order);
  const note = clean(req.body?.note, 1000);
  if (order.status !== 'proof_sent') {
    flash(req, 'error', 'There is no proof waiting for your approval right now.');
    return res.redirect(303, back);
  }
  // The decision must be about the proof the customer was looking at.
  const proof = latestProof(order);
  if (!proof || String(proof.id) !== clean(req.body?.proof_id, 20)) {
    flash(req, 'error', 'The shop has sent a new proof – please check it before you decide.');
    return res.redirect(303, `${back}#proof`);
  }
  if (decision === 'changes' && !note) {
    flash(req, 'error', 'Please tell the shop what should change.');
    return res.redirect(303, `${back}#proof`);
  }
  try {
    customerDecision(shop, order, decision, note, proof);
  } catch (err) {
    flash(req, 'error', err.message);
    return res.redirect(303, back);
  }
  flash(
    req,
    'success',
    decision === 'approve'
      ? `Thank you! Proof approved – ${shop.name} will start printing your order.`
      : `Your change request was sent to ${shop.name}. The new proof will appear on this page.`
  );
  res.redirect(303, back);
};

router.post(`${ORDER}/approve`, actionLimiter, loadShop, loadOrder, decide('approve'));
router.post(`${ORDER}/changes`, actionLimiter, loadShop, loadOrder, decide('changes'));

// ---------- corrected file (new version, same order) ----------
router.post(`${ORDER}/version`, actionLimiter, loadShop, loadOrder, checkQuota, orderFilesUpload, (req, res) => {
  const shop = req.custShop;
  const order = req.custOrder;
  const back = `${trackPath(shop, order)}#files`;
  if (req.uploadError || !req.files.length) {
    discardUploads(req);
    flash(req, 'error', req.uploadError || 'Please choose the corrected file.');
    return res.redirect(303, back);
  }
  try {
    addCustomerVersion(shop, order, req.files, clean(req.body.note, 500));
    flash(req, 'success', `New version sent to ${shop.name}. The old file is marked replaced – only the new one will be printed.`);
  } catch (err) {
    discardUploads(req);
    flash(req, 'error', err.message);
  }
  res.redirect(303, back);
});

// ---------- files (only files of this token's order) ----------
router.get(`${ORDER}/f/:fileId(\\d+)`, loadShop, loadOrder, (req, res, next) => {
  const shop = req.custShop;
  const order = req.custOrder;
  const row = getOrderFile(order, req.params.fileId);
  if (!row) return next('route');
  if (sendStoredFile(res, row, { inline: req.query.inline === '1' })) return;
  messagePage(res, {
    status: 410,
    title: 'This file is no longer available',
    text: `This file was deleted after ${shop.retention_days} days, as files are only kept for a short time. Please contact ${shop.name} if you need it again.`,
    iconName: 'file',
    brandShop: shop,
    action: html`<a class="btn btn-brand" href="${trackPath(shop, order)}">Back to order P-${order.order_no}</a>`,
  });
});

export default router;
