import { Router } from 'express';
import { html } from '../lib/html.js';
import { clean, cleanLine, clampInt, flash } from '../lib/util.js';
import { STATUSES, STATUS_LABEL, TABS } from '../lib/status.js';
import { actionLimiter } from '../lib/security.js';
import { proofUpload, discardUploads, sendStoredFile, fileLimits } from '../lib/uploads.js';
import { storageCapBytes } from '../services/billing.js';
import { shopCounts, storageUsed } from '../services/shops.js';
import {
  getOrderByNo,
  getOrderFile,
  orderFiles,
  orderEvents,
  latestProof,
  setStatus,
  addProof,
  listOrders,
  tabCounts,
  ordersSince,
  latestOrderId,
  addEvent,
} from '../services/orders.js';
import { orderFormUrl, trackUrl, waProofLink, waReadyLink, mailEnabled, emailCustomer } from '../services/notify.js';
import { render, messagePage } from '../views/layout.js';
import { dashboardView } from '../views/shop-orders/dashboard.js';
import { orderView } from '../views/shop-orders/order.js';

// Shop order dashboard, order page and the live-alert poll. Mounted under the
// /shop gate: req.shop is set and the account is active, paused or expired.
// Every lookup is scoped by req.shop.id.

const router = Router();
const PAGE_SIZE = 50;
const NO = ':no(\\d{1,9})';
const SCRIPTS = ['/js/shop.js'];

const back = (order, hash = '') => `/shop/orders/${order.order_no}${hash}`;

function orderNotFound(req, res) {
  messagePage(res, {
    status: 404,
    title: 'Order not found',
    text: `There is no order #${req.params.no} in ${req.shop.name}.`,
    variant: 'shop',
    iconName: 'search',
    action: html`<a class="btn btn-primary" href="/shop">Back to orders</a>`,
  });
}

/** Loads req.order for :no, scoped to the logged-in shop. */
function loadOrder(req, res, next) {
  const order = getOrderByNo(req.shop.id, req.params.no);
  if (!order) return orderNotFound(req, res);
  req.order = order;
  next();
}

// ---------- dashboard ----------
router.get('/', (req, res) => {
  const shop = req.shop;
  const tab = TABS.some((t) => t.key === req.query.tab) ? req.query.tab : 'active';
  const q = cleanLine(typeof req.query.q === 'string' ? req.query.q : '', 60);
  const page = clampInt(req.query.page, 1, 100000, 1);
  const list = listOrders(shop.id, { tab, q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  render(res, {
    title: 'Orders',
    variant: 'shop',
    active: 'orders',
    scripts: SCRIPTS,
    body: dashboardView({
      shop,
      counts: shopCounts(shop.id),
      tabCounts: tabCounts(shop.id),
      list,
      tab,
      q,
      page,
      pageSize: PAGE_SIZE,
      latestId: latestOrderId(shop.id),
      formUrl: orderFormUrl(shop),
    }),
  });
});

// ---------- order page ----------
router.get(`/orders/${NO}`, loadOrder, (req, res) => {
  const shop = req.shop;
  const order = req.order;
  const files = orderFiles(order);
  render(res, {
    title: `Order #${order.order_no}`,
    variant: 'shop',
    active: 'orders',
    scripts: SCRIPTS,
    body: orderView({
      res,
      shop,
      order,
      customerFiles: files.filter((f) => f.kind === 'customer'),
      proofs: files.filter((f) => f.kind === 'proof').reverse(),
      events: orderEvents(order).reverse(),
      waProof: waProofLink(shop, order),
      waReady: waReadyLink(shop, order),
      trackUrl: trackUrl(shop, order),
      canEmail: mailEnabled() && Boolean(order.customer_email) && !shop.is_demo,
      limits: fileLimits({ uploadShop: shop }),
    }),
  });
});

// ---------- status change ----------
const DONE_TEXT = {
  approved: 'marked as approved.',
  changes_requested: 'marked as changes requested.',
  printing: 'is now printing.',
  ready: 'is ready.',
  delivered: 'delivered. Nice work!',
  cancelled: 'cancelled.',
  new: 'reopened.',
};

router.post(`/orders/${NO}/status`, loadOrder, (req, res) => {
  const order = req.order;
  const to = String(req.body.to || '');
  const note = clean(req.body.note, 500);
  if (!STATUSES.includes(to)) {
    flash(req, 'error', 'Choose what to change the order to.');
    return res.redirect(303, back(order));
  }
  // The page may be stale (e.g. the customer asked for changes meanwhile).
  const from = clean(req.body.from, 30);
  if (from && from !== order.status) {
    flash(req, 'error', `This order was just updated (now ${STATUS_LABEL[order.status]}). Check it before changing the status.`);
    return res.redirect(303, back(order));
  }
  try {
    setStatus(req.shop, order, to, { note });
    flash(req, 'success', `Order #${order.order_no} ${DONE_TEXT[to] || `is now ${STATUS_LABEL[to]}.`}`);
    if (to === 'ready') flash(req, 'info', 'Now tap “Send ready message” to tell the customer on WhatsApp.');
  } catch (err) {
    flash(req, 'error', err.message || 'Could not update the order. Please try again.');
  }
  res.redirect(303, back(order));
});

// ---------- proof upload (order is looked up before any file is written) ----------
router.post(
  `/orders/${NO}/proof`,
  loadOrder,
  (req, res, next) => {
    const shop = req.shop;
    const cap = storageCapBytes(shop);
    if (cap && storageUsed(shop.id) + (Number(req.get('content-length')) || 0) > cap) {
      req.uploadRefused = shop.is_demo ? 'The demo storage is full – it resets every few hours.' : 'Your storage is full. Please contact Brighton Solution.';
    }
    req.uploadShop = shop;
    next();
  },
  proofUpload,
  (req, res) => {
    const order = req.order;
    if (req.uploadError) {
      flash(req, 'error', req.uploadError);
      return res.redirect(303, back(order, '#proof'));
    }
    const file = req.files[0];
    if (!file) {
      flash(req, 'error', 'Choose a proof file.');
      return res.redirect(303, back(order, '#proof'));
    }
    try {
      addProof(req.shop, order, file, clean(req.body.note, 500));
      flash(req, 'success', 'Proof sent – now tap “Send proof on WhatsApp”.');
    } catch (err) {
      discardUploads(req);
      flash(req, 'error', err.message || 'Could not save the proof. Please try again.');
      return res.redirect(303, back(order, '#proof'));
    }
    res.redirect(303, back(order));
  }
);

// ---------- file download / proof preview ----------
router.get(`/orders/${NO}/files/:fileId(\\d{1,12})`, loadOrder, (req, res) => {
  const row = getOrderFile(req.order, req.params.fileId);
  const gone = () =>
    messagePage(res, {
      status: row ? 410 : 404,
      title: row ? 'File no longer available' : 'File not found',
      text: row
        ? `This file was deleted automatically after ${req.shop.retention_days} days to keep your storage clean.`
        : 'This file does not belong to this order.',
      variant: 'shop',
      iconName: 'file',
      action: html`<a class="btn btn-primary" href="${back(req.order)}">Back to order #${req.order.order_no}</a>`,
    });
  if (!row) return gone();
  if (!sendStoredFile(res, row, { inline: req.query.inline === '1' })) gone();
});

// ---------- email the customer again ----------
router.post(`/orders/${NO}/email`, actionLimiter, loadOrder, async (req, res) => {
  const shop = req.shop;
  const order = req.order;
  const kind = req.body.kind === 'ready' ? 'ready' : 'proof';
  try {
    if (shop.is_demo) flash(req, 'info', 'Emails are switched off in the demo.');
    else if (!mailEnabled()) flash(req, 'error', 'Email is not set up on this server.');
    else if (!order.customer_email) flash(req, 'error', 'This customer did not give an email address.');
    else if (kind === 'proof' && !latestProof(order)) flash(req, 'error', 'Upload a proof first.');
    else if (await emailCustomer(shop, order, kind)) {
      addEvent(order.id, { actor: 'shop', type: 'email', note: `${kind === 'proof' ? 'Proof link' : 'Ready message'} emailed to ${order.customer_email}` });
      flash(req, 'success', `Email sent to ${order.customer_email}.`);
    } else flash(req, 'error', 'The email could not be sent. Please use WhatsApp instead.');
  } catch (err) {
    console.error('[orders] email failed:', err);
    flash(req, 'error', 'The email could not be sent. Please use WhatsApp instead.');
  }
  res.redirect(303, back(order));
});

// ---------- live new-order poll (JSON) ----------
router.get('/api/poll', (req, res) => {
  const shopId = req.shop.id;
  const hasSince = typeof req.query.since === 'string' && /^\d{1,15}$/.test(req.query.since);
  const c = shopCounts(shopId);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    shopId,
    latestId: latestOrderId(shopId),
    newOrders: hasSince
      ? ordersSince(shopId, Number(req.query.since)).map((o) => ({
          id: o.id,
          no: o.order_no,
          name: o.customer_name,
          size: o.size,
          quantity: o.quantity,
          at: o.created_at,
        }))
      : [],
    counts: {
      newToday: c.newToday || 0,
      new: c.new || 0,
      proof_sent: c.proof_sent || 0,
      changes_requested: c.changes_requested || 0,
      printing: c.printing || 0,
      ready: c.ready || 0,
    },
  });
});

export default router;
