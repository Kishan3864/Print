import { Router } from 'express';
import QRCode from 'qrcode';
import { html } from '../lib/html.js';
import { config } from '../config.js';
import { clampInt, clean, cleanLine, flash, inkFor, isHexColor, isIsoDate, isMobile, addDays, waLink, ymd } from '../lib/util.js';
import { isSampleShop } from '../services/billing.js';
import { getOrderByNo } from '../services/orders.js';
import { shopPath } from '../services/notify.js';
import {
  GSTIN_RE,
  GST_RATES,
  MAX_LINES,
  MAX_QTY,
  MAX_RATE_PAISE,
  PAY_FILTERS,
  PAY_MODES,
  PERIODS,
  SORTS,
  UPI_RE,
  addItem,
  addStarterItems,
  billDue,
  billForOrder,
  billLines,
  billSettings,
  billStats,
  billsOn,
  deleteBill,
  billsForExport,
  computeTotals,
  createBill,
  deleteItem,
  getBillByNo,
  getItem,
  itemCount,
  itemUse,
  listBills,
  listItems,
  moneyInput,
  parseMoney,
  parseQty,
  payState,
  recordPayment,
  rs,
  saveBillSettings,
  setBillCancelled,
  updateBill,
  updateItem,
  upiPayUrl,
} from '../services/bills.js';
import { sendBillPdf as sendPdf } from '../services/bill-pdf.js';
import { render, messagePage } from '../views/layout.js';
import { lockedView } from '../views/locked.js';
import { billsListView } from '../views/shop-bills/list.js';
import { billFormView } from '../views/shop-bills/form.js';
import { billView } from '../views/shop-bills/bill.js';
import { itemsView } from '../views/shop-bills/items.js';
import { setupView } from '../views/shop-bills/setup.js';
import { COLOR_SHORT, SIDES_LABEL } from '../views/shop-orders/common.js';

// /shop/bills – the shop's own bills (manual entry), rate list and bill setup.
// Mounted under the /shop gate: req.shop is set and the plan is active. Every lookup is scoped by req.shop.id.

const router = Router();
const NO = ':no(\\d{1,9})';
const SCRIPTS = ['/js/shop.js', '/js/bills.js'];
const PAGE_SIZE = 50;

const page = (res, view, status = 200) => render(res, { variant: 'shop', active: 'bills', scripts: SCRIPTS, ...view }, status);

function billNotFound(req, res) {
  messagePage(res, {
    status: 404,
    title: 'Bill not found',
    text: `There is no bill B-${req.params.no} in ${req.shop.name}.`,
    variant: 'shop',
    iconName: 'search',
    action: html`<a class="btn btn-primary" href="/shop/bills">Back to bills</a>`,
  });
}

function loadBill(req, res, next) {
  const bill = getBillByNo(req.shop.id, req.params.no);
  if (!bill) return billNotFound(req, res);
  req.bill = bill;
  next();
}

/** Rate list, most used items first (the one-tap buttons on the bill form). */
function itemsByUse(shopId) {
  const use = itemUse(shopId);
  return listItems(shopId).sort((a, b) => (use[b.id] || 0) - (use[a.id] || 0) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

// Bills comes with the plan or the Bills add-on (entitlements.js). Without it: the "pay first" screen.
// Exporting your own bills (CSV) always works, so data is never held back.
router.use('/bills', (req, res, next) => {
  if (billsOn(req.shop) || (req.method === 'GET' && req.path === '/export.csv')) return next();
  if (req.method !== 'GET') return res.redirect(303, '/shop/bills');
  render(res, lockedView(res, req.shop, 'bills'), 402);
});

// The bill "paper" uses the shop's colour (CSP: no inline styles, so a tiny per-shop stylesheet).
router.get('/bills/doc.css', (req, res) => {
  const c = isHexColor(req.shop.brand_color) ? req.shop.brand_color : '#0a7a50';
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.type('text/css').send(`.bi-doc,.bi-from{--doc-brand:${c};--doc-brand-ink:${inkFor(c)}}`);
});
const docCss = (shop) => `/shop/bills/doc.css?v=${String(shop.brand_color || '').slice(1)}`;

// ---------- list ----------
function readFilters(query) {
  const str = (v) => (typeof v === 'string' ? v : '');
  return {
    q: cleanLine(str(query.q), 60),
    pay: Object.hasOwn(PAY_FILTERS, str(query.pay)) ? str(query.pay) : '',
    period: Object.hasOwn(PERIODS, str(query.period)) ? str(query.period) : 'all',
    sort: Object.hasOwn(SORTS, str(query.sort)) ? str(query.sort) : 'date',
    dir: query.dir === 'asc' ? 'asc' : 'desc',
  };
}

router.get('/bills', (req, res) => {
  const filters = readFilters(req.query);
  const p = clampInt(req.query.page, 1, 100000, 1);
  page(res, {
    title: 'Bills',
    body: billsListView({
      res,
      shop: req.shop,
      stats: billStats(req.shop.id),
      list: listBills(req.shop.id, { ...filters, limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE }),
      filters,
      page: p,
      pageSize: PAGE_SIZE,
      itemsCount: itemCount(req.shop.id),
    }),
  });
});

// ---------- CSV (Excel / accountant) ----------
const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // no formulas from customer names
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const plainAmount = (paise) => ((Number(paise) || 0) / 100).toFixed(2);

router.get('/bills/export.csv', (req, res) => {
  const rows = billsForExport(req.shop.id, readFilters(req.query));
  const head = ['Bill no', 'Date', 'Customer', 'Mobile', 'Items', 'Subtotal', 'Discount', 'GST %', 'GST', 'Round off', 'Total', 'Received', 'Due', 'Paid by', 'Status', 'Online order', 'Note'];
  const lines = rows.map((b) =>
    [
      `B-${b.bill_no}`,
      b.bill_date,
      b.customer_name || 'Cash customer',
      b.customer_mobile,
      b.lines_text || '',
      plainAmount(b.subtotal_paise),
      plainAmount(b.discount_paise),
      b.tax_bp / 100,
      plainAmount(b.tax_paise),
      plainAmount(b.round_paise),
      plainAmount(b.total_paise),
      plainAmount(Math.min(b.paid_paise, b.total_paise)),
      plainAmount(billDue(b)),
      PAY_MODES[b.pay_mode] || b.pay_mode,
      { paid: 'Paid', part: 'Part paid', due: 'Not paid', cancelled: 'Cancelled' }[payState(b)],
      b.order_no ? `P-${b.order_no}` : '',
      b.notes,
    ]
      .map(csvCell)
      .join(',')
  );
  res.setHeader('Cache-Control', 'no-store');
  res.attachment(`bills-${req.shop.slug}-${ymd()}.csv`);
  res.type('text/csv; charset=utf-8').send('﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n');
});

// ---------- new / edit form ----------
const emptyValues = (settings) => ({
  bill_date: ymd(),
  customer_name: '',
  customer_mobile: '',
  customer_address: '',
  customer_gstin: '',
  order_no: '',
  lines: [],
  discount: '',
  tax: String(settings.gstRate || 0),
  pay: 'full',
  paid: '',
  pay_mode: 'cash',
  notes: '',
  save_items: '1',
});

/** Form values from a saved bill (edit, duplicate). */
function valuesFromBill(bill, lines, settings) {
  const state = payState(bill);
  return {
    ...emptyValues(settings),
    bill_date: bill.bill_date,
    customer_name: bill.customer_name,
    customer_mobile: bill.customer_mobile,
    customer_address: bill.customer_address,
    customer_gstin: bill.customer_gstin,
    order_no: bill.order_no ? String(bill.order_no) : '',
    lines: lines.map((l) => ({ name: l.name, qty: String(Number(l.qty)), unit: l.unit, rate: moneyInput(l.rate_paise) })),
    discount: bill.discount_paise ? moneyInput(bill.discount_paise) : '',
    tax: settings.gstin ? String(bill.tax_bp / 100) : '0',
    pay: state === 'paid' ? 'full' : state === 'part' ? 'part' : 'none',
    paid: state === 'part' ? moneyInput(bill.paid_paise) : '',
    pay_mode: bill.pay_mode,
    notes: bill.notes,
    save_items: '',
  };
}

function showForm(req, res, { values, errors, bill = null, status = 200 }) {
  const settings = billSettings(req.shop);
  page(
    res,
    {
      title: bill ? `Edit bill B-${bill.bill_no}` : 'New bill',
      body: billFormView({ res, shop: req.shop, settings, items: itemsByUse(req.shop.id), values, errors, bill }),
    },
    status
  );
}

router.get('/bills/new', (req, res) => {
  const shop = req.shop;
  const settings = billSettings(shop);
  let values = emptyValues(settings);
  const copy = req.query.copy ? getBillByNo(shop.id, req.query.copy) : null;
  const order = req.query.order ? getOrderByNo(shop.id, req.query.order) : null;
  if (copy) {
    values = { ...valuesFromBill(copy, billLines(copy), settings), bill_date: ymd(), order_no: '', pay: 'full', paid: '', tax: String(settings.gstRate || 0) };
  } else if (order) {
    const existing = billForOrder(shop.id, order.order_no);
    if (existing && req.query.again !== '1') {
      flash(req, 'info', `Order P-${order.order_no} already has bill B-${existing.bill_no}.`);
      return res.redirect(303, `/shop/bills/${existing.bill_no}`);
    }
    const what = [order.size || 'Print', order.paper, COLOR_SHORT[order.color_mode], SIDES_LABEL[order.sides]].filter(Boolean).join(', ');
    values = {
      ...values,
      customer_name: order.customer_name,
      customer_mobile: order.customer_mobile,
      order_no: String(order.order_no),
      lines: [{ name: `Printing – ${what}`, qty: String(order.quantity), unit: 'copy', rate: '' }],
    };
  }
  showForm(req, res, { values, errors: { list: [], lines: {}, fields: {} } });
});

/** Reads + validates the bill form. Returns { values (as typed), errors, data (ready for createBill/updateBill), ok }. */
function readBillForm(req) {
  const body = req.body || {};
  const settings = billSettings(req.shop);
  const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
  const names = arr(body.line_name);
  const qtys = arr(body.line_qty);
  const units = arr(body.line_unit);
  const rates = arr(body.line_rate);
  const pay = ['full', 'part', 'none'].includes(body.pay) ? body.pay : 'full';
  const values = {
    bill_date: cleanLine(body.bill_date, 10),
    customer_name: cleanLine(body.customer_name, 80),
    customer_mobile: cleanLine(body.customer_mobile, 20),
    customer_address: clean(body.customer_address, 300).replace(/\r\n?/g, '\n'),
    customer_gstin: cleanLine(body.customer_gstin, 15).toUpperCase().replace(/\s/g, ''),
    order_no: cleanLine(body.order_no, 9),
    lines: [],
    discount: cleanLine(body.discount, 12),
    tax: cleanLine(body.tax, 4),
    pay,
    paid: cleanLine(body.paid, 14),
    pay_mode: PAY_MODES[body.pay_mode] ? body.pay_mode : 'cash',
    notes: clean(body.notes, 500).replace(/\r\n?/g, '\n'),
    save_items: body.save_items === '1' ? '1' : '',
  };
  const errors = { list: [], lines: {}, fields: {} };

  const lines = [];
  const n = Math.min(Math.max(names.length, qtys.length, units.length, rates.length), MAX_LINES + 10);
  for (let i = 0; i < n; i++) {
    const v = { name: cleanLine(names[i], 120), qty: cleanLine(qtys[i], 12), unit: cleanLine(units[i], 20), rate: cleanLine(rates[i], 14) };
    if (!v.name && !v.qty && !v.rate) continue;
    const idx = values.lines.length;
    values.lines.push(v);
    const q = parseQty(v.qty);
    const qty = q === null ? 1 : q;
    const rate = parseMoney(v.rate);
    let err = '';
    if (!v.name) err = 'Type the item name.';
    else if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) err = 'Quantity must be a number like 1, 25 or 2.5.';
    else if (rate === null) err = 'Enter the rate (0 if it is free).';
    else if (!Number.isFinite(rate) || rate > MAX_RATE_PAISE) err = 'Rate must be an amount like 10 or 12.50.';
    if (err) errors.lines[idx] = err;
    else lines.push({ name: v.name, unit: v.unit, qty, rate_paise: rate });
  }
  if (!values.lines.length) errors.list.push('Add at least one item to the bill.');
  if (values.lines.length > MAX_LINES) errors.list.push(`A bill can have up to ${MAX_LINES} lines – make a second bill for the rest.`);

  if (!isIsoDate(values.bill_date) || values.bill_date < '2000-01-01' || values.bill_date > addDays(ymd(), 31)) errors.fields.bill_date = 'Pick the bill date.';
  if (values.customer_mobile && !isMobile(values.customer_mobile)) errors.fields.customer_mobile = 'Enter a 10-digit mobile number, or leave it empty.';
  if (values.customer_gstin && !GSTIN_RE.test(values.customer_gstin)) errors.fields.customer_gstin = 'A GSTIN has 15 characters, like 23ABCDE1234F1Z5.';

  const subtotal = computeTotals(lines).subtotal;
  let discount = 0;
  const pct = /^(\d{1,3}(?:\.\d{1,2})?)\s*%$/.exec(values.discount);
  if (pct) {
    if (Number(pct[1]) > 100) errors.fields.discount = 'A discount can be at most 100%.';
    else discount = Math.round((subtotal * Number(pct[1])) / 100);
  } else if (values.discount) {
    const d = parseMoney(values.discount);
    if (!Number.isFinite(d)) errors.fields.discount = 'Type an amount like 50, or a percentage like 10%.';
    else if (d > subtotal) errors.fields.discount = `The discount is more than the items (${rs(subtotal)}).`;
    else discount = d;
  }

  const taxPct = Number(values.tax);
  const taxBp = settings.gstin && GST_RATES.includes(taxPct) ? taxPct * 100 : 0;
  const total = computeTotals(lines, { discount, taxBp }).total;

  let paid = 0;
  let payKind = pay;
  if (pay === 'part') {
    const p = parseMoney(values.paid);
    if (p === null || !Number.isFinite(p) || p <= 0) errors.fields.paid = 'Type how much the customer paid, like 200.';
    else if (p >= total) payKind = 'full';
    else paid = p;
  }

  let orderNo = null;
  if (values.order_no) {
    const order = getOrderByNo(req.shop.id, values.order_no);
    orderNo = order ? order.order_no : null;
    if (!order) values.order_no = '';
  }

  const ok = !errors.list.length && !Object.keys(errors.lines).length && !Object.keys(errors.fields).length;
  const data = {
    bill_date: values.bill_date,
    customer_name: values.customer_name,
    customer_mobile: values.customer_mobile,
    customer_address: values.customer_address,
    customer_gstin: settings.gstin ? values.customer_gstin : '',
    order_no: orderNo,
    lines,
    discount,
    taxBp,
    pay: payKind,
    paid,
    pay_mode: values.pay_mode,
    notes: values.notes,
  };
  return { values, errors, data, ok, saveNew: values.save_items === '1' };
}

router.post('/bills', (req, res) => {
  const form = readBillForm(req);
  if (!form.ok) return showForm(req, res, { values: form.values, errors: form.errors, status: 422 });
  try {
    const bill = createBill(req.shop, form.data, { saveNew: form.saveNew, isSample: Boolean(req.shop.is_demo) });
    flash(req, 'success', `Bill B-${bill.bill_no} saved · ${rs(bill.total_paise)}. Download the PDF or send it on WhatsApp.`);
    res.redirect(303, `/shop/bills/${bill.bill_no}`);
  } catch (err) {
    console.error('[bills] create failed:', err);
    form.errors.list.push('The bill could not be saved. Please try again.');
    showForm(req, res, { values: form.values, errors: form.errors, status: 500 });
  }
});

router.get(`/bills/${NO}/edit`, loadBill, (req, res) => {
  if (req.bill.status === 'cancelled') {
    flash(req, 'info', 'Restore this bill before editing it.');
    return res.redirect(303, `/shop/bills/${req.bill.bill_no}`);
  }
  showForm(req, res, { values: valuesFromBill(req.bill, billLines(req.bill), billSettings(req.shop)), errors: { list: [], lines: {}, fields: {} }, bill: req.bill });
});

router.post(`/bills/${NO}`, loadBill, (req, res) => {
  const bill = req.bill;
  if (bill.status === 'cancelled') {
    flash(req, 'error', 'This bill is cancelled. Restore it before editing.');
    return res.redirect(303, `/shop/bills/${bill.bill_no}`);
  }
  const form = readBillForm(req);
  if (!form.ok) return showForm(req, res, { values: form.values, errors: form.errors, bill, status: 422 });
  updateBill(req.shop, bill, form.data, { saveNew: form.saveNew });
  flash(req, 'success', `Bill B-${bill.bill_no} updated.`);
  res.redirect(303, `/shop/bills/${bill.bill_no}`);
});

// ---------- one bill ----------
function waText(shop, bill, url) {
  const due = billDue(bill);
  const state = payState(bill);
  return [
    `Namaste${bill.customer_name ? ' ' + bill.customer_name : ''},`,
    `Your bill B-${bill.bill_no} from ${shop.name}:`,
    `Total: ${rs(bill.total_paise)}`,
    state === 'paid' ? 'Paid in full – thank you!' : `${bill.paid_paise ? `Paid: ${rs(bill.paid_paise)} · ` : ''}Balance due: ${rs(due)}`,
    `Bill (PDF): ${url}`,
  ].join('\n');
}

export const publicBillUrl = (shop, bill) => `${config.baseUrl}${shopPath(shop)}/bill/${bill.token}.pdf`;

router.get(`/bills/${NO}`, loadBill, async (req, res, next) => {
  try {
    const shop = req.shop;
    const bill = req.bill;
    const settings = billSettings(shop);
    const upi = upiPayUrl(shop, bill, settings);
    const qrSvg = upi ? await QRCode.toString(upi, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0b1220', light: '#ffffff' } }) : '';
    const url = publicBillUrl(shop, bill);
    page(res, {
      title: `Bill B-${bill.bill_no}`,
      bodyClass: 'bi-print-page',
      styles: [docCss(shop)],
      body: billView({ res, shop, bill, lines: billLines(bill), settings, qrSvg, publicUrl: url, waLink: waLink(bill.customer_mobile, waText(shop, bill, url)), canShare: Boolean(bill.customer_mobile) }),
    });
  } catch (err) {
    next(err);
  }
});

router.get(`/bills/${NO}/pdf`, loadBill, async (req, res, next) => {
  try {
    await sendPdf(res, req.shop, req.bill, billLines(req.bill), { download: req.query.dl === '1' });
  } catch (err) {
    next(err);
  }
});

router.post(`/bills/${NO}/payment`, loadBill, (req, res) => {
  const bill = req.bill;
  const back = `/shop/bills/${bill.bill_no}`;
  const amount = parseMoney(req.body.amount);
  if (bill.status === 'cancelled') flash(req, 'error', 'This bill is cancelled.');
  else if (amount === null || !Number.isFinite(amount) || amount <= 0) flash(req, 'error', 'Type the amount the customer paid, like 200.');
  else {
    const due = billDue(bill);
    recordPayment(bill, amount, String(req.body.mode || ''));
    flash(req, 'success', amount >= due ? `B-${bill.bill_no} is fully paid.` : `${rs(amount)} recorded. ${rs(due - amount)} still due.`);
  }
  res.redirect(303, back);
});

router.post(`/bills/${NO}/cancel`, loadBill, (req, res) => {
  setBillCancelled(req.bill, true);
  flash(req, 'success', `Bill B-${req.bill.bill_no} cancelled. It no longer counts in your totals.`);
  res.redirect(303, `/shop/bills/${req.bill.bill_no}`);
});

router.post(`/bills/${NO}/delete`, loadBill, (req, res) => {
  deleteBill(req.bill);
  flash(req, 'success', `Bill B-${req.bill.bill_no} deleted.`);
  res.redirect(303, '/shop/bills');
});

router.post(`/bills/${NO}/restore`, loadBill, (req, res) => {
  setBillCancelled(req.bill, false);
  flash(req, 'success', `Bill B-${req.bill.bill_no} restored.`);
  res.redirect(303, `/shop/bills/${req.bill.bill_no}`);
});

// A sample bill with the current setup (nothing is saved).
router.get('/bills/sample.pdf', async (req, res, next) => {
  try {
    const settings = billSettings(req.shop);
    const lines = [
      { name: 'Colour print (A4)', unit: 'page', qty: 20, rate_paise: 1000 },
      { name: 'Spiral binding', unit: 'pcs', qty: 2, rate_paise: 4000 },
      { name: 'Visiting cards (100)', unit: 'box', qty: 1, rate_paise: 25000 },
    ];
    const taxBp = settings.gstin ? (settings.gstRate || 18) * 100 : 0;
    const t = computeTotals(lines, { discount: 2000, taxBp });
    lines.forEach((l, i) => (l.amount_paise = t.amounts[i]));
    const bill = {
      bill_no: req.shop.next_bill_no,
      bill_date: ymd(),
      customer_name: 'Sample Customer',
      customer_mobile: '9876543210',
      customer_address: '',
      customer_gstin: '',
      order_no: null,
      subtotal_paise: t.subtotal,
      discount_paise: t.discount,
      tax_bp: taxBp,
      tax_paise: t.tax,
      round_paise: t.round,
      total_paise: t.total,
      paid_paise: 20000,
      pay_mode: 'cash',
      notes: 'This is a sample to preview your bill design.',
      status: 'issued',
      is_sample: 1,
    };
    await sendPdf(res, req.shop, bill, lines);
  } catch (err) {
    next(err);
  }
});

// ---------- rate list ----------
function readItem(body) {
  const values = { name: cleanLine(body.name, 120), unit: cleanLine(body.unit, 20), rate: cleanLine(body.rate, 14) };
  const errors = {};
  if (values.name.length < 2) errors.name = 'Type the item name.';
  const rate = parseMoney(values.rate);
  if (rate === null) errors.rate = 'Type the rate, like 10 or 2.50 (0 if free).';
  else if (!Number.isFinite(rate) || rate > MAX_RATE_PAISE) errors.rate = 'Rate must be an amount like 10 or 2.50.';
  return { values, errors, item: { name: values.name, unit: values.unit, rate_paise: rate } };
}

function showItems(req, res, { values = {}, errors = {}, editErrors = null, status = 200 } = {}) {
  page(res, { title: 'Rate list', body: itemsView({ res, items: listItems(req.shop.id), use: itemUse(req.shop.id), values, errors, editErrors }) }, status);
}

router.get('/bills/items', (req, res) => showItems(req, res));

router.post('/bills/items', (req, res) => {
  const { values, errors, item } = readItem(req.body);
  if (Object.keys(errors).length) return showItems(req, res, { values, errors, status: 422 });
  try {
    addItem(req.shop.id, item);
    flash(req, 'success', `“${item.name}” added at ${rs(item.rate_paise)}${item.unit ? ` per ${item.unit}` : ''}.`);
    res.redirect(303, '/shop/bills/items');
  } catch (err) {
    showItems(req, res, { values, errors: { name: err.message }, status: 422 });
  }
});

router.post('/bills/items/starter', (req, res) => {
  const n = addStarterItems(req.shop.id);
  flash(req, n ? 'success' : 'info', n ? `${n} common items added. Change the rates to yours – tap a rate, type, Save.` : 'Those items are already in your rate list.');
  res.redirect(303, '/shop/bills/items');
});

router.post('/bills/items/:id(\\d{1,12})', (req, res) => {
  const it = getItem(req.shop.id, req.params.id);
  if (!it) return res.redirect(303, '/shop/bills/items');
  const { errors, item } = readItem(req.body);
  if (Object.keys(errors).length) return showItems(req, res, { editErrors: { id: it.id, text: Object.values(errors).join(' ') }, status: 422 });
  try {
    updateItem(req.shop.id, it.id, item);
    flash(req, 'success', `“${item.name}” saved.`);
    res.redirect(303, '/shop/bills/items');
  } catch (err) {
    showItems(req, res, { editErrors: { id: it.id, text: err.message }, status: 422 });
  }
});

router.post('/bills/items/:id(\\d{1,12})/delete', (req, res) => {
  const it = getItem(req.shop.id, req.params.id);
  if (it && deleteItem(req.shop.id, it.id)) flash(req, 'success', `“${it.name}” removed from your rate list.`);
  res.redirect(303, '/shop/bills/items');
});

// ---------- bill setup ----------
function showSetup(req, res, { values, errors = {}, status = 200 } = {}) {
  const s = billSettings(req.shop);
  page(
    res,
    {
      title: 'Bill setup',
      body: setupView({ res, shop: req.shop, values: values || { gstin: s.gstin, gstRate: String(s.gstRate), upi: s.upi, terms: s.terms }, errors, locked: isSampleShop(req.shop) }),
    },
    status
  );
}

router.get('/bills/setup', (req, res) => showSetup(req, res));

router.post('/bills/setup', (req, res) => {
  if (isSampleShop(req.shop)) {
    flash(req, 'info', 'Bill setup is locked in the sample shop.');
    return res.redirect(303, '/shop/bills/setup');
  }
  const values = {
    gstin: cleanLine(req.body.gstin, 20).toUpperCase().replace(/\s/g, ''),
    gstRate: cleanLine(req.body.gstRate, 4),
    upi: cleanLine(req.body.upi, 96).replace(/\s/g, ''),
    terms: clean(req.body.terms, 400).replace(/\r\n?/g, '\n'),
  };
  const errors = {};
  if (values.gstin && !GSTIN_RE.test(values.gstin)) errors.gstin = 'A GSTIN has 15 characters, like 23ABCDE1234F1Z5. Leave it empty if you are not GST registered.';
  if (values.upi && !UPI_RE.test(values.upi)) errors.upi = 'A UPI ID looks like name@bank, e.g. yourshop@okicici.';
  if (Object.keys(errors).length) return showSetup(req, res, { values, errors, status: 422 });
  const rate = Number(values.gstRate);
  saveBillSettings(req.shop.id, { gstin: values.gstin, gstRate: values.gstin && GST_RATES.includes(rate) ? rate : 0, upi: values.upi, terms: values.terms });
  flash(req, 'success', 'Bill setup saved. New and old bills now show it.');
  res.redirect(303, '/shop/bills/setup');
});

export default router;
