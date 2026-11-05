import { db, now } from '../db.js';
import { addDays, clean, cleanLine, digits, randomToken, ymd } from '../lib/util.js';
import { publishShop } from '../lib/live.js';
import { can } from './entitlements.js';

// The shop's own bills (separate from the plan payments in billing.js):
//   items       – the shop's rate list (what it sells, unit, rate)
//   bills       – one bill per sale, numbered B-1001… per shop, never deleted (cancel instead)
//   bill_lines  – the lines of a bill (name/unit/rate copied, so later rate changes don't touch old bills)
// Money is stored in paise (integers). Every query is scoped by shop_id.

export const MAX_LINES = 40;
export const MAX_ITEMS = 300;
export const MAX_RATE_PAISE = 100000000; // ₹10,00,000 per unit
export const MAX_QTY = 1000000;
export const UNITS = ['pcs', 'page', 'copy', 'sheet', 'set', 'box', 'pack', 'sq.ft', 'metre', 'hour', 'job'];
export const PAY_MODES = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank transfer', other: 'Other' };
export const GST_RATES = [0, 5, 12, 18, 28];

/** Common print-shop items, offered once to an empty rate list (owners change the rates). */
export const STARTER_ITEMS = [
  { name: 'Black & white print (A4)', unit: 'page', rate: 2 },
  { name: 'Colour print (A4)', unit: 'page', rate: 10 },
  { name: 'Colour print (A3)', unit: 'page', rate: 30 },
  { name: 'Photocopy (A4)', unit: 'page', rate: 1 },
  { name: 'Scanning', unit: 'page', rate: 5 },
  { name: 'Lamination (A4)', unit: 'pcs', rate: 20 },
  { name: 'Spiral binding', unit: 'pcs', rate: 40 },
  { name: 'Passport photos (8)', unit: 'set', rate: 60 },
  { name: 'Visiting cards (100)', unit: 'box', rate: 250 },
  { name: 'Flex banner', unit: 'sq.ft', rate: 15 },
  { name: 'Design charges', unit: 'job', rate: 100 },
];

// ---------- access ----------
/** Bills is a feature of the plan or the Bills add-on (see entitlements.js). */
export const billsOn = (shop) => can(shop, 'bills');

/** Numbers for the admin shop page. */
export const billUsage = (shopId) =>
  db
    .prepare(
      `SELECT COUNT(*) AS bills, COALESCE(SUM(CASE WHEN status = 'issued' THEN total_paise END), 0) AS total,
         MAX(created_at) AS last_at, (SELECT COUNT(*) FROM items WHERE shop_id = @id) AS items
       FROM bills WHERE shop_id = @id`
    )
    .get({ id: shopId });

// ---------- numbers ----------
const MONEY_RE = /^(\d{1,9})(?:\.(\d{1,2}))?$/;
const QTY_RE = /^(\d{1,7})(?:\.(\d{1,3}))?$/;
const tidy = (v) => clean(v, 30).replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');

/** "1,250.5" / "₹99" → paise, '' → null (blank), NaN when not a valid amount. */
export function parseMoney(value) {
  const s = tidy(value);
  if (!s) return null;
  const m = MONEY_RE.exec(s);
  if (!m) return NaN;
  return Number(m[1]) * 100 + Number((m[2] || '0').padEnd(2, '0'));
}

/** "2" / "2.5" → number (max 3 decimals), '' → null, NaN when invalid. */
export function parseQty(value) {
  const s = tidy(value);
  if (!s) return null;
  const m = QTY_RE.exec(s);
  if (!m) return NaN;
  return Number(m[1]) + Number('0.' + (m[2] || '0'));
}

/** Paise → "1,250.00" (Indian grouping). */
export const amountText = (paise) =>
  ((Number(paise) || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Paise → "₹1,250" (whole rupees) or "₹1,250.50"; `fixed` always shows two decimals. */
export function rs(paise, { fixed = false } = {}) {
  const n = Number(paise) || 0;
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  if (!fixed && abs % 100 === 0) return `${sign}₹${(abs / 100).toLocaleString('en-IN')}`;
  return `${sign}₹${amountText(abs)}`;
}

/** Paise → plain input value: "250" or "12.50". */
export const moneyInput = (paise) => (paise == null ? '' : paise % 100 ? (paise / 100).toFixed(2) : String(paise / 100));

/** Quantity for display: up to 3 decimals, no trailing zeros, Indian grouping. */
export const qtyText = (q) => Number(q || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const upTo99 = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''));
const upTo999 = (n) => [n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' : '', n % 100 ? upTo99(n % 100) : ''].filter(Boolean).join(' ');
function indianWords(n) {
  if (!n) return 'Zero';
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1000);
  const rest = n % 1000;
  return [crore ? indianWords(crore) + ' Crore' : '', lakh ? upTo99(lakh) + ' Lakh' : '', thousand ? upTo99(thousand) + ' Thousand' : '', rest ? upTo999(rest) : '']
    .filter(Boolean)
    .join(' ');
}

/** 125050 → "Rupees One Thousand Two Hundred Fifty and Fifty Paise Only" (Indian numbering). */
export function amountInWords(paise) {
  const p = Math.max(0, Math.round(Number(paise) || 0));
  const rupees = Math.floor(p / 100);
  const rest = p % 100;
  return `Rupees ${indianWords(rupees)}${rest ? ` and ${upTo99(rest)} Paise` : ''} Only`;
}

/**
 * Bill maths. lines: [{qty, rate_paise}], discount: paise, taxBp: GST in basis points (1800 = 18%).
 * Tax is on (subtotal − discount); the total is rounded to whole rupees (round_paise = the round-off).
 */
export function computeTotals(lines, { discount = 0, taxBp = 0 } = {}) {
  const amounts = lines.map((l) => Math.round(l.qty * l.rate_paise));
  const subtotal = amounts.reduce((a, n) => a + n, 0);
  const disc = Math.min(Math.max(0, discount), subtotal);
  const taxable = subtotal - disc;
  const tax = Math.round((taxable * taxBp) / 10000);
  const exact = taxable + tax;
  const total = Math.round(exact / 100) * 100;
  return { amounts, subtotal, discount: disc, taxable, tax, round: total - exact, total };
}

// ---------- bill settings (GSTIN, UPI, terms) ----------
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const UPI_RE = /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,31}$/;
export const DEFAULT_TERMS = 'Thank you! Please visit again.';

export function billSettings(shop) {
  let s = {};
  try {
    s = JSON.parse(shop?.bill_settings || '{}') || {};
  } catch {
    /* defaults */
  }
  // GST invoices and the UPI pay QR are their own feature (bills_gst).
  const gstOn = !shop || can(shop, 'bills_gst');
  const gstin = gstOn && typeof s.gstin === 'string' && GSTIN_RE.test(s.gstin) ? s.gstin : '';
  return {
    gstin,
    gstRate: gstin && GST_RATES.includes(Number(s.gstRate)) ? Number(s.gstRate) : 0,
    upi: gstOn && typeof s.upi === 'string' && UPI_RE.test(s.upi) ? s.upi : '',
    gstOn,
    terms: typeof s.terms === 'string' ? s.terms.slice(0, 400) : DEFAULT_TERMS,
  };
}

export function saveBillSettings(shopId, { gstin, gstRate, upi, terms }) {
  db.prepare('UPDATE shops SET bill_settings = ? WHERE id = ?').run(JSON.stringify({ gstin, gstRate, upi, terms }), shopId);
  publishShop(shopId);
}

/** upi://pay link for the amount still due (null without a UPI ID or nothing due). */
export function upiPayUrl(shop, bill, settings = billSettings(shop)) {
  const due = billDue(bill);
  if (!settings.upi || due <= 0 || bill.status === 'cancelled') return null;
  const p = new URLSearchParams({ pa: settings.upi, pn: String(shop.name).slice(0, 40), am: (due / 100).toFixed(2), cu: 'INR', tn: `Bill B-${bill.bill_no}` });
  return `upi://pay?${p.toString().replace(/\+/g, '%20')}`;
}

// ---------- rate list ----------
export const listItems = (shopId) => db.prepare('SELECT * FROM items WHERE shop_id = ? ORDER BY name COLLATE NOCASE').all(shopId);
export const itemCount = (shopId) => db.prepare('SELECT COUNT(*) AS n FROM items WHERE shop_id = ?').get(shopId).n;
export const getItem = (shopId, id) => db.prepare('SELECT * FROM items WHERE shop_id = ? AND id = ?').get(shopId, Number(id) || 0);
const findItemByName = (shopId, name) => db.prepare('SELECT * FROM items WHERE shop_id = ? AND name = ? COLLATE NOCASE').get(shopId, name);

export function addItem(shopId, { name, unit, rate_paise }) {
  if (findItemByName(shopId, name)) throw new Error(`“${name}” is already in your rate list.`);
  if (itemCount(shopId) >= MAX_ITEMS) throw new Error(`Your rate list is full (${MAX_ITEMS} items). Remove items you no longer sell.`);
  const at = now();
  const info = db.prepare('INSERT INTO items (shop_id, name, unit, rate_paise, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(shopId, name, unit, rate_paise, at, at);
  return getItem(shopId, info.lastInsertRowid);
}

export function updateItem(shopId, id, { name, unit, rate_paise }) {
  const other = findItemByName(shopId, name);
  if (other && other.id !== Number(id)) throw new Error(`“${name}” is already in your rate list.`);
  db.prepare('UPDATE items SET name = ?, unit = ?, rate_paise = ?, updated_at = ? WHERE shop_id = ? AND id = ?').run(name, unit, rate_paise, now(), shopId, Number(id));
}

export const deleteItem = (shopId, id) => db.prepare('DELETE FROM items WHERE shop_id = ? AND id = ?').run(shopId, Number(id)).changes;

/** Adds the starter items that are not in the list yet. Returns how many were added. */
export function addStarterItems(shopId) {
  let n = 0;
  db.transaction(() => {
    for (const it of STARTER_ITEMS) {
      if (findItemByName(shopId, it.name) || itemCount(shopId) >= MAX_ITEMS) continue;
      const at = now();
      db.prepare('INSERT INTO items (shop_id, name, unit, rate_paise, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(shopId, it.name, it.unit, it.rate * 100, at, at);
      n++;
    }
  })();
  return n;
}

/** How many bills use each item (rate list page). */
export function itemUse(shopId) {
  const rows = db
    .prepare(
      `SELECT l.item_id AS id, COUNT(*) AS n FROM bill_lines l JOIN bills b ON b.id = l.bill_id
       WHERE b.shop_id = ? AND b.status = 'issued' AND l.item_id IS NOT NULL GROUP BY l.item_id`
    )
    .all(shopId);
  return Object.fromEntries(rows.map((r) => [r.id, r.n]));
}

// ---------- bills ----------
export const getBillByNo = (shopId, no) => db.prepare('SELECT * FROM bills WHERE shop_id = ? AND bill_no = ?').get(shopId, Number(no) || 0);
export const getBillByToken = (shopId, token) => db.prepare('SELECT * FROM bills WHERE shop_id = ? AND token = ?').get(shopId, String(token || ''));
export const billLines = (bill) => db.prepare('SELECT * FROM bill_lines WHERE bill_id = ? ORDER BY pos').all(bill.id);
/** Latest bill made for an online order (not cancelled). */
export const billForOrder = (shopId, orderNo) =>
  db.prepare("SELECT * FROM bills WHERE shop_id = ? AND order_no = ? AND status = 'issued' ORDER BY id DESC LIMIT 1").get(shopId, Number(orderNo) || 0);

export const billDue = (bill) => (bill.status === 'cancelled' ? 0 : Math.max(0, bill.total_paise - bill.paid_paise));

/** paid | part | due | cancelled */
export function payState(bill) {
  if (bill.status === 'cancelled') return 'cancelled';
  if (bill.paid_paise >= bill.total_paise) return 'paid';
  return bill.paid_paise > 0 ? 'part' : 'due';
}

/**
 * Validated bill input (from readBillForm in the route) → row values. data:
 *   { bill_date, customer_*, order_no, lines:[{name, unit, qty, rate_paise}], discount, taxBp, pay: 'full'|'part'|'none', paid, pay_mode, notes }
 */
function billRow(data) {
  const t = computeTotals(data.lines, { discount: data.discount, taxBp: data.taxBp });
  const paid = data.pay === 'full' ? t.total : data.pay === 'part' ? Math.min(Math.max(0, data.paid || 0), t.total) : 0;
  return {
    t,
    row: {
      bill_date: data.bill_date,
      customer_name: data.customer_name,
      customer_mobile: data.customer_mobile,
      customer_address: data.customer_address,
      customer_gstin: data.customer_gstin,
      order_no: data.order_no || null,
      subtotal_paise: t.subtotal,
      discount_paise: t.discount,
      tax_bp: data.taxBp,
      tax_paise: t.tax,
      round_paise: t.round,
      total_paise: t.total,
      paid_paise: paid,
      pay_mode: PAY_MODES[data.pay_mode] ? data.pay_mode : 'cash',
      notes: data.notes,
    },
  };
}

function writeLines(shopId, billId, lines, amounts, { saveNew = false } = {}) {
  db.prepare('DELETE FROM bill_lines WHERE bill_id = ?').run(billId);
  const ins = db.prepare('INSERT INTO bill_lines (bill_id, pos, item_id, name, unit, qty, rate_paise, amount_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  lines.forEach((l, i) => {
    let item = findItemByName(shopId, l.name);
    if (!item && saveNew && itemCount(shopId) < MAX_ITEMS) {
      const at = now();
      const info = db.prepare('INSERT INTO items (shop_id, name, unit, rate_paise, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(shopId, l.name, l.unit, l.rate_paise, at, at);
      item = { id: info.lastInsertRowid };
    }
    ins.run(billId, i + 1, item ? item.id : null, l.name, l.unit, l.qty, l.rate_paise, amounts[i]);
  });
}

/** Creates a bill with the next number B-<n>. `saveNew` adds unknown line items to the rate list. */
export function createBill(shop, data, { saveNew = false, isSample = false, at } = {}) {
  const created = at || now();
  const { t, row } = billRow(data);
  const id = db.transaction(() => {
    const { bill_no } = db.prepare('UPDATE shops SET next_bill_no = next_bill_no + 1 WHERE id = ? RETURNING next_bill_no - 1 AS bill_no').get(shop.id);
    const info = db
      .prepare(
        `INSERT INTO bills (shop_id, bill_no, token, bill_date, customer_name, customer_mobile, customer_address, customer_gstin, order_no,
           subtotal_paise, discount_paise, tax_bp, tax_paise, round_paise, total_paise, paid_paise, pay_mode, notes, is_sample, created_at, updated_at)
         VALUES (@shop_id, @bill_no, @token, @bill_date, @customer_name, @customer_mobile, @customer_address, @customer_gstin, @order_no,
           @subtotal_paise, @discount_paise, @tax_bp, @tax_paise, @round_paise, @total_paise, @paid_paise, @pay_mode, @notes, @is_sample, @at, @at)`
      )
      .run({ ...row, shop_id: shop.id, bill_no, token: randomToken(24), is_sample: isSample ? 1 : 0, at: created });
    writeLines(shop.id, info.lastInsertRowid, data.lines, t.amounts, { saveNew });
    return info.lastInsertRowid;
  })();
  publishShop(shop.id);
  return db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
}

export function updateBill(shop, bill, data, { saveNew = false } = {}) {
  const { t, row } = billRow(data);
  db.transaction(() => {
    db.prepare(
      `UPDATE bills SET bill_date = @bill_date, customer_name = @customer_name, customer_mobile = @customer_mobile,
         customer_address = @customer_address, customer_gstin = @customer_gstin, order_no = @order_no,
         subtotal_paise = @subtotal_paise, discount_paise = @discount_paise, tax_bp = @tax_bp, tax_paise = @tax_paise,
         round_paise = @round_paise, total_paise = @total_paise, paid_paise = @paid_paise, pay_mode = @pay_mode, notes = @notes, updated_at = @at
       WHERE id = @id AND shop_id = @shop_id`
    ).run({ ...row, id: bill.id, shop_id: shop.id, at: now() });
    writeLines(shop.id, bill.id, data.lines, t.amounts, { saveNew });
  })();
  publishShop(shop.id);
  return getBillByNo(shop.id, bill.bill_no);
}

/** Adds a payment (capped at the total). */
export function recordPayment(bill, amount, mode) {
  const paid = Math.min(bill.total_paise, bill.paid_paise + Math.max(0, amount));
  db.prepare('UPDATE bills SET paid_paise = ?, pay_mode = ?, updated_at = ? WHERE id = ? AND shop_id = ?').run(paid, PAY_MODES[mode] ? mode : bill.pay_mode, now(), bill.id, bill.shop_id);
  publishShop(bill.shop_id);
}

/**
 * Deletes a bill for good (lines go with it). When it was the newest bill its number is
 * given back, so the next bill reuses it and the numbering has no gap.
 */
export function deleteBill(bill) {
  db.transaction(() => {
    db.prepare('DELETE FROM bills WHERE id = ? AND shop_id = ?').run(bill.id, bill.shop_id);
    db.prepare('UPDATE shops SET next_bill_no = next_bill_no - 1 WHERE id = ? AND next_bill_no = ?').run(bill.shop_id, bill.bill_no + 1);
  })();
  publishShop(bill.shop_id);
}

export function setBillCancelled(bill, cancelled) {
  db.prepare('UPDATE bills SET status = ?, updated_at = ? WHERE id = ? AND shop_id = ?').run(cancelled ? 'cancelled' : 'issued', now(), bill.id, bill.shop_id);
  publishShop(bill.shop_id);
}

// ---------- lists, filters, totals ----------
export const PERIODS = { all: 'All time', today: 'Today', week: 'Last 7 days', month: 'This month', last_month: 'Last month' };
export const PAY_FILTERS = { '': 'All bills', due: 'To collect', paid: 'Paid', cancelled: 'Cancelled' };
export const SORTS = { date: 'b.bill_date', no: 'b.bill_no', total: 'b.total_paise', customer: "COALESCE(NULLIF(b.customer_name, ''), 'zzz') COLLATE NOCASE", due: 'b.total_paise - b.paid_paise' };

/** [from, to] YYYY-MM-DD for a period key (inclusive), or null for all time. */
export function periodRange(period, today = ymd()) {
  const monthStart = today.slice(0, 8) + '01';
  if (period === 'today') return [today, today];
  if (period === 'week') return [addDays(today, -6), today];
  if (period === 'month') return [monthStart, today];
  if (period === 'last_month') {
    const lastEnd = addDays(monthStart, -1);
    return [lastEnd.slice(0, 8) + '01', lastEnd];
  }
  return null;
}

function where(shopId, { q = '', pay = '', period = 'all' } = {}) {
  const parts = ['b.shop_id = @shopId'];
  const params = { shopId };
  const range = periodRange(period);
  if (range) {
    parts.push('b.bill_date BETWEEN @from AND @to');
    params.from = range[0];
    params.to = range[1];
  }
  if (pay === 'due') parts.push("b.status = 'issued' AND b.paid_paise < b.total_paise");
  else if (pay === 'paid') parts.push("b.status = 'issued' AND b.paid_paise >= b.total_paise");
  else if (pay === 'cancelled') parts.push("b.status = 'cancelled'");
  const needle = cleanLine(q, 60);
  if (needle) {
    const no = /^[bp]?-?\s*(\d{1,9})$/i.exec(needle);
    const nd = digits(needle);
    params.like = `%${needle.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
    const ors = ["b.customer_name LIKE @like ESCAPE '\\'", "EXISTS (SELECT 1 FROM bill_lines l WHERE l.bill_id = b.id AND l.name LIKE @like ESCAPE '\\')"];
    if (no) {
      params.no = Number(no[1]);
      ors.push('b.bill_no = @no', 'b.order_no = @no');
    }
    if (nd.length >= 3) {
      params.mob = `%${nd.length > 10 ? nd.slice(-10) : nd}%`;
      ors.push("REPLACE(REPLACE(REPLACE(b.customer_mobile, ' ', ''), '-', ''), '+', '') LIKE @mob");
    }
    parts.push(`(${ors.join(' OR ')})`);
  }
  return { sql: parts.join(' AND '), params };
}

/** One page of bills with line counts + totals of everything that matches (cancelled bills excluded from sums). */
export function listBills(shopId, { q, pay, period, sort = 'date', dir = 'desc', limit = 50, offset = 0 } = {}) {
  const w = where(shopId, { q, pay, period });
  const order = `${SORTS[sort] || SORTS.date} ${dir === 'asc' ? 'ASC' : 'DESC'}, b.bill_no ${dir === 'asc' ? 'ASC' : 'DESC'}`;
  const rows = db
    .prepare(
      `SELECT b.*, (SELECT COUNT(*) FROM bill_lines l WHERE l.bill_id = b.id) AS line_count,
         (SELECT l.name FROM bill_lines l WHERE l.bill_id = b.id ORDER BY l.pos LIMIT 1) AS first_line
       FROM bills b WHERE ${w.sql} ORDER BY ${order} LIMIT @limit OFFSET @offset`
    )
    .all({ ...w.params, limit, offset });
  const sums = db
    .prepare(
      `SELECT COUNT(*) AS n,
         COALESCE(SUM(CASE WHEN b.status = 'issued' THEN b.total_paise END), 0) AS total,
         COALESCE(SUM(CASE WHEN b.status = 'issued' THEN MIN(b.paid_paise, b.total_paise) END), 0) AS paid,
         COALESCE(SUM(CASE WHEN b.status = 'issued' THEN MAX(b.total_paise - b.paid_paise, 0) END), 0) AS due
       FROM bills b WHERE ${w.sql}`
    )
    .get(w.params);
  return { rows, total: sums.n, sums };
}

/** All matching bills with their lines (CSV export). */
export function billsForExport(shopId, filters) {
  const w = where(shopId, filters);
  return db
    .prepare(
      `SELECT b.*, (SELECT GROUP_CONCAT(l.name || ' x ' || l.qty, '; ') FROM bill_lines l WHERE l.bill_id = b.id) AS lines_text
       FROM bills b WHERE ${w.sql} ORDER BY b.bill_date, b.bill_no`
    )
    .all(w.params);
}

/** Top tiles: today, this month, still to collect. */
export function billStats(shopId) {
  const today = ymd();
  const sum = (from, to) =>
    db
      .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total_paise), 0) AS total FROM bills WHERE shop_id = ? AND status = 'issued' AND bill_date BETWEEN ? AND ?")
      .get(shopId, from, to);
  const due = db
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total_paise - paid_paise), 0) AS total FROM bills WHERE shop_id = ? AND status = 'issued' AND paid_paise < total_paise")
    .get(shopId);
  const all = db.prepare('SELECT COUNT(*) AS n FROM bills WHERE shop_id = ?').get(shopId).n;
  return { today: sum(today, today), month: sum(today.slice(0, 8) + '01', today), due, all };
}
