import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import PDFDocument from 'pdfkit';
import * as fontkit from 'fontkit';
import QRCode from 'qrcode';
import { ROOT } from '../config.js';
import { formatDate, inkFor, isHexColor, prettyPhone } from '../lib/util.js';
import { logoPath } from './shops.js';
import { amountInWords, amountText, billDue, billSettings, payState, PAY_MODES, qtyText, upiPayUrl } from './bills.js';

// A4 PDF of one bill, in the shop's name and logo. Text is set in Poppins (the app font):
// each run of text picks the subset that has its characters – Latin, Latin-ext (₹) or
// Devanagari (Hindi names and items, shaped by fontkit).
//
// Design: white page, hairline rules, light title, one aligned text line on each side.
// Rules and the total bar reach EDGE (5pt) from the paper edge; text sits PAD inside them,
// so nothing is lost when printing. The shop colour is used only for the total.

const FONT_DIR = path.join(ROOT, 'node_modules/@fontsource/poppins/files');
const SUBSETS = ['latin', 'latin-ext', 'devanagari'];
const WEIGHTS = { l: 300, r: 400, m: 500, s: 600 };

/**
 * WOFF → plain TrueType, once per font at first use. fontkit would otherwise inflate every
 * table with a pure-JS inflater on every bill (≈80% of the PDF time); native zlib does it in ~1 ms.
 */
function woffToTtf(woff) {
  if (woff.readUInt32BE(0) !== 0x774f4646) return woff; // not 'wOFF'
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const at = 44 + i * 20;
    const tag = woff.readUInt32BE(at);
    const offset = woff.readUInt32BE(at + 4);
    const compLength = woff.readUInt32BE(at + 8);
    const origLength = woff.readUInt32BE(at + 12);
    const checksum = woff.readUInt32BE(at + 16);
    const raw = woff.subarray(offset, offset + compLength);
    tables.push({ tag, checksum, data: compLength < origLength ? zlib.inflateSync(raw) : Buffer.from(raw) });
  }
  let pow = 1;
  let log = 0;
  while (pow * 2 <= numTables) {
    pow *= 2;
    log++;
  }
  const headerLen = 12 + numTables * 16;
  const size = headerLen + tables.reduce((a, t) => a + ((t.data.length + 3) & ~3), 0);
  const out = Buffer.alloc(size);
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(pow * 16, 6);
  out.writeUInt16BE(log, 8);
  out.writeUInt16BE(numTables * 16 - pow * 16, 10);
  let offset = headerLen;
  tables.forEach((t, i) => {
    const rec = 12 + i * 16;
    out.writeUInt32BE(t.tag, rec);
    out.writeUInt32BE(t.checksum, rec + 4);
    out.writeUInt32BE(offset, rec + 8);
    out.writeUInt32BE(t.data.length, rec + 12);
    t.data.copy(out, offset);
    offset += (t.data.length + 3) & ~3;
  });
  return out;
}

let FONTS = null;
function fonts() {
  if (FONTS) return FONTS;
  const files = {};
  const cover = {};
  for (const sub of SUBSETS) {
    for (const [w, n] of Object.entries(WEIGHTS)) files[`${sub}-${w}`] = woffToTtf(fs.readFileSync(path.join(FONT_DIR, `poppins-${sub}-${n}-normal.woff`)));
    const fk = fontkit.create(files[`${sub}-r`]);
    const memo = new Map();
    cover[sub] = (cp) => {
      if (!memo.has(cp)) memo.set(cp, fk.hasGlyphForCodePoint(cp));
      return memo.get(cp);
    };
  }
  FONTS = { files, cover };
  return FONTS;
}

/** Splits text into runs of one font subset; neutral characters (spaces, digits, punctuation) stay in the current run. */
function runs(text) {
  const { cover } = fonts();
  const out = [];
  let cur = null;
  for (const ch of String(text ?? '')) {
    const cp = ch.codePointAt(0);
    if (cp === 0x0a || cp === 0x0d || cp === 0x09) continue;
    const neutral = cp < 0x80 && !/[A-Za-z]/.test(ch);
    const sub = cur && neutral && cover[cur.sub](cp) ? cur.sub : SUBSETS.find((s) => cover[s](cp));
    if (!sub) continue; // no font has it (emoji, other scripts): leave it out
    if (cur && cur.sub === sub) cur.text += ch;
    else out.push((cur = { sub, text: ch }));
  }
  return out;
}

// ---------- page grid + colours ----------
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const EDGE = 5; // rules / total bar: 5pt from the paper edge
const PAD = 12; // text sits this far inside the rules
const X0 = EDGE + PAD; // the one left text line
const X1 = PAGE_W - EDGE - PAD; // the one right text line
const W = X1 - X0;
const BOTTOM = PAGE_H - 46; // content stops here; the footer sits below
const INK = '#14171c';
const TEXT2 = '#3f4550';
const MUTED = '#6b717c';
const HAIR = '#e4e6ea';
const STRONG = '#14171c';
const STATE_DOT = { paid: '#16a34a', part: '#f59e0b', due: '#f59e0b', cancelled: '#dc2626' };
const STATE_TEXT = { paid: 'Paid', part: 'Part paid', due: 'Not paid yet', cancelled: 'Cancelled' };

// Text widths are the slow part (shaping); they never change, so they are cached across bills.
const WIDTHS = new Map();
const RUNS = new Map();
const runsOf = (text) => {
  const key = String(text ?? '');
  let r = RUNS.get(key);
  if (!r) {
    if (RUNS.size > 20000) RUNS.clear();
    r = runs(key);
    RUNS.set(key, r);
  }
  return r;
};

/** Text helper over pdfkit: mixed-font runs, measuring, wrapping, alignment. */
class Pen {
  constructor(doc) {
    this.doc = doc;
  }
  use(sub, weight, size) {
    this.doc.font(`${sub}-${weight}`).fontSize(size);
  }
  /** Width of one run (cached). */
  runWidth(r, weight, size, spacing) {
    const key = `${r.sub}-${weight}|${size}|${spacing}|${r.text}`;
    let w = WIDTHS.get(key);
    if (w === undefined) {
      if (WIDTHS.size > 50000) WIDTHS.clear();
      this.use(r.sub, weight, size);
      w = this.doc.widthOfString(r.text, { characterSpacing: spacing });
      WIDTHS.set(key, w);
    }
    return w;
  }
  width(text, { size = 9, weight = 'r', spacing = 0 } = {}) {
    let w = 0;
    for (const r of runsOf(text)) w += this.runWidth(r, weight, size, spacing);
    return w;
  }
  lh(size) {
    return size * 1.45;
  }
  text(text, x, y, { size = 9, weight = 'r', color = INK, width = 0, align = 'left', spacing = 0 } = {}) {
    const total = align === 'left' ? 0 : this.width(text, { size, weight, spacing });
    let cx = align === 'right' ? x + width - total : align === 'center' ? x + (width - total) / 2 : x;
    for (const r of runsOf(text)) {
      this.use(r.sub, weight, size);
      this.doc.fillColor(color).text(r.text, cx, y, { lineBreak: false, characterSpacing: spacing });
      cx += this.runWidth(r, weight, size, spacing);
    }
  }
  /** Greedy word wrap; very long words break between characters. */
  wrap(text, maxW, opts = {}) {
    const lines = [];
    for (const para of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (this.width(next, opts) <= maxW) {
          line = next;
          continue;
        }
        if (line) lines.push(line);
        line = '';
        if (this.width(word, opts) <= maxW) {
          line = word;
          continue;
        }
        let piece = '';
        for (const ch of word) {
          if (piece && this.width(piece + ch, opts) > maxW) {
            lines.push(piece);
            piece = '';
          }
          piece += ch;
        }
        line = piece;
      }
      if (line) lines.push(line);
    }
    return lines;
  }
  /** Draws lines one under another; returns the y below them. */
  block(lines, x, y, opts = {}) {
    const step = this.lh(opts.size || 9);
    lines.forEach((l, i) => this.text(l, x, y + i * step, opts));
    return y + lines.length * step;
  }
  /** Small uppercase caption. */
  label(text, x, y, opts = {}) {
    this.text(String(text).toUpperCase(), x, y, { size: 6.9, weight: 'm', color: MUTED, spacing: 0.9, ...opts });
  }
}

function logoImage(shop) {
  const file = logoPath(shop);
  if (!file || !/\.(png|jpe?g)$/i.test(file)) return null; // pdfkit reads PNG/JPEG only
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

/**
 * Renders the bill. Returns a Promise<Buffer> of the PDF.
 * shop: shop row, bill: bill row, lines: bill_lines rows.
 */
export async function billPdf(shop, bill, lines) {
  const settings = billSettings(shop);
  const brand = isHexColor(shop.brand_color) ? shop.brand_color : '#0a7a50';
  const brandInk = inkFor(brand);
  const billNo = `B-${bill.bill_no}`;
  const state = payState(bill);
  const due = billDue(bill);
  const upiUrl = upiPayUrl(shop, bill, settings);
  const qr = upiUrl ? QRCode.create(upiUrl, { errorCorrectionLevel: 'M' }).modules : null;
  const isTax = Boolean(settings.gstin) && bill.tax_bp > 0;

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    bufferPages: true,
    info: { Title: `Bill ${billNo} – ${shop.name}`, Author: shop.name, Creator: 'Brighton Print', Producer: 'Brighton Print' },
  });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  for (const [name, buf] of Object.entries(fonts().files)) doc.registerFont(name, buf);
  const pen = new Pen(doc);
  const rule = (y, { color = HAIR, width = 0.6, x1 = EDGE, x2 = PAGE_W - EDGE } = {}) => doc.moveTo(x1, y).lineTo(x2, y).lineWidth(width).strokeColor(color).stroke();
  const vrule = (x, y1, y2) => doc.moveTo(x, y1).lineTo(x, y2).lineWidth(0.6).strokeColor(HAIR).stroke();

  // ---------- header: logo + shop (left) · title + number (right) ----------
  let y = 26;
  const tile = 46;
  const logo = logoImage(shop);
  let drewLogo = false;
  if (logo) {
    try {
      doc.image(logo, X0, y, { fit: [tile, tile], align: 'center', valign: 'center' });
      drewLogo = true;
    } catch {
      drewLogo = false;
    }
  }
  if (!drewLogo) {
    doc.roundedRect(X0, y, tile, tile, 3).fill(brand);
    const initial = String(shop.name || 'S').trim().charAt(0).toUpperCase() || 'S';
    pen.text(initial, X0, y + 10, { size: 20, weight: 's', color: brandInk, width: tile, align: 'center' });
  }
  const metaW = 200;
  const leftX = X0 + tile + 14;
  const leftW = W - tile - 14 - metaW - 24;
  let ly = pen.block(pen.wrap(shop.name, leftW, { size: 15.5, weight: 's' }), leftX, y - 1, { size: 15.5, weight: 's', color: INK });
  ly += 1;
  const contact = [];
  const address = String(shop.address || '').trim() || String(shop.city || '').trim();
  if (address) contact.push(...pen.wrap(address, leftW, { size: 8.2 }));
  const phone = shop.phone || shop.mobile;
  const ids = [phone ? `Phone ${prettyPhone(phone)}` : '', settings.gstin ? `GSTIN ${settings.gstin}` : ''].filter(Boolean).join('   ·   ');
  if (ids) contact.push(...pen.wrap(ids, leftW, { size: 8.2 }));
  ly = pen.block(contact, leftX, ly, { size: 8.2, color: TEXT2 });

  const mx = X1 - metaW;
  pen.text(isTax ? 'TAX INVOICE' : 'BILL', mx, y - 4, { size: 21, weight: 'l', color: INK, width: metaW, align: 'right', spacing: isTax ? 2.2 : 4 });
  let my = y + 28;
  const meta = [['Bill no.', billNo], ['Date', formatDate(bill.bill_date)]];
  if (bill.order_no) meta.push(['Online order', `P-${bill.order_no}`]);
  for (const [k, v] of meta) {
    pen.text(k, mx + 70, my + 1, { size: 8, color: MUTED });
    pen.text(v, mx, my, { size: 9.2, weight: 'm', color: INK, width: metaW, align: 'right' });
    my += 14.5;
  }
  y = Math.max(y + tile, ly, my) + 16;
  rule(y, { color: STRONG, width: 0.9 });

  // ---------- summary strip: billed to | payment | amount ----------
  const c1 = Math.round(W * 0.44);
  const c2 = Math.round(W * 0.26);
  const c3 = W - c1 - c2;
  const top = y + 14;
  const name = pen.wrap(bill.customer_name || 'Cash customer', c1 - 20, { size: 10.5, weight: 's' });
  const cust = [];
  if (bill.customer_mobile) cust.push(`Mobile ${prettyPhone(bill.customer_mobile)}`);
  if (bill.customer_address) cust.push(...pen.wrap(bill.customer_address, c1 - 20, { size: 8.2 }));
  if (bill.customer_gstin) cust.push(`GSTIN ${bill.customer_gstin}`);
  pen.label('Billed to', X0, top);
  let cy = pen.block(name, X0, top + 13, { size: 10.5, weight: 's' });
  cy = pen.block(cust, X0, cy + 1, { size: 8.2, color: TEXT2 });

  const p2 = X0 + c1;
  pen.label('Payment', p2, top);
  doc.circle(p2 + 3.2, top + 13 + 7.6, 3.2).fill(STATE_DOT[state]);
  pen.text(STATE_TEXT[state], p2 + 11, top + 13, { size: 10.5, weight: 's' });
  const payLine = state === 'due' || state === 'cancelled' ? `Mode ${PAY_MODES[bill.pay_mode] || bill.pay_mode}` : `By ${PAY_MODES[bill.pay_mode] || bill.pay_mode}`;
  const py = pen.block([payLine], p2, top + 13 + pen.lh(10.5) + 1, { size: 8.2, color: TEXT2 });

  const p3 = X0 + c1 + c2;
  const showDue = due > 0;
  pen.label(state === 'cancelled' ? 'Bill amount' : showDue ? 'Amount due' : 'Total paid', p3, top, { width: c3, align: 'right' });
  pen.text(`₹${amountText(showDue ? due : bill.total_paise)}`, p3, top + 11, { size: 17, weight: 'm', color: INK, width: c3, align: 'right' });
  let ay = top + 11 + pen.lh(17);
  if (showDue && bill.paid_paise > 0) ay = pen.block([`of ₹${amountText(bill.total_paise)}`], p3, ay - 1, { size: 8.2, color: MUTED, width: c3, align: 'right' });

  const stripBottom = Math.max(cy, py, ay) + 12;
  vrule(p2 - 14, top - 2, stripBottom - 8);
  vrule(p3 - 14, top - 2, stripBottom - 8);
  y = stripBottom;
  rule(y);

  // ---------- items table ----------
  const cols = [
    { label: '#', w: 22, align: 'left' },
    { label: 'Item', w: 0, align: 'left' },
    { label: 'Qty', w: 64, align: 'right' },
    { label: 'Rate', w: 92, align: 'right' },
    { label: 'Amount', w: 100, align: 'right' },
  ];
  cols[1].w = W - cols.reduce((a, c) => a + c.w, 0);
  let cx = X0;
  for (const c of cols) {
    c.x = cx;
    cx += c.w;
  }
  const GAP = 8; // inner space between columns
  const cellX = (c) => (c.align === 'right' ? c.x + GAP : c.x);
  const cellW = (c) => c.w - GAP;
  const head = () => {
    y += 16;
    for (const c of cols) pen.label(c.label, cellX(c), y, { width: cellW(c), align: c.align });
    y += 16;
    rule(y, { color: STRONG, width: 0.9 });
  };
  const newPage = () => {
    doc.addPage({ size: 'A4', margin: 0 });
    y = 22;
    pen.text(shop.name, X0, y, { size: 8.4, weight: 'm', color: INK });
    pen.text(`${billNo} · continued`, X0, y, { size: 8.4, color: MUTED, width: W, align: 'right' });
    y += 14;
  };
  head();
  lines.forEach((l, i) => {
    const nameL = pen.wrap(l.name, cellW(cols[1]) - 6, { size: 9 });
    const rowH = Math.max(nameL.length * pen.lh(9), l.unit ? pen.lh(9) + pen.lh(7.2) - 1 : pen.lh(9)) + 15;
    if (y + rowH > BOTTOM) {
      newPage();
      head();
    }
    const ty = y + 8;
    pen.text(String(i + 1).padStart(2, '0'), cellX(cols[0]), ty, { size: 8.4, color: MUTED });
    pen.block(nameL, cellX(cols[1]), ty, { size: 9, color: INK });
    pen.text(qtyText(l.qty), cellX(cols[2]), ty, { size: 9, width: cellW(cols[2]), align: 'right' });
    pen.text(amountText(l.rate_paise), cellX(cols[3]), ty, { size: 9, width: cellW(cols[3]), align: 'right' });
    if (l.unit) pen.text(`per ${l.unit}`, cellX(cols[3]), ty + pen.lh(9) - 1, { size: 7.2, color: MUTED, width: cellW(cols[3]), align: 'right' });
    pen.text(amountText(l.amount_paise), cellX(cols[4]), ty, { size: 9, weight: 'm', width: cellW(cols[4]), align: 'right' });
    y += rowH;
    rule(y);
  });

  // ---------- totals (right) · amount in words + note (left) ----------
  const sumW = 236;
  const sx = X1 - sumW;
  const rows = [['Subtotal', amountText(bill.subtotal_paise)]];
  if (bill.discount_paise) rows.push(['Discount', `− ${amountText(bill.discount_paise)}`]);
  if (bill.tax_bp && bill.tax_paise) {
    const pct = bill.tax_bp / 100;
    if (settings.gstin) {
      const half = Math.floor(bill.tax_paise / 2);
      rows.push([`CGST ${pct / 2}%`, amountText(half)], [`SGST ${pct / 2}%`, amountText(bill.tax_paise - half)]);
    } else rows.push([`GST ${pct}%`, amountText(bill.tax_paise)]);
  }
  if (bill.round_paise) rows.push(['Round off', `${bill.round_paise < 0 ? '− ' : '+ '}${amountText(Math.abs(bill.round_paise))}`]);
  const after = [];
  if (state === 'paid') after.push(['Paid', amountText(bill.total_paise)]);
  else if (bill.paid_paise) after.push(['Paid', amountText(bill.paid_paise)]);
  if (due > 0) after.push(['Balance due', amountText(due)]);
  const ROW = 17;
  const BAR = 32;
  const sumH = 14 + rows.length * ROW + 6 + BAR + 8 + after.length * ROW;

  const wordsW = W - sumW - 40;
  const words = pen.wrap(amountInWords(bill.total_paise), wordsW, { size: 8.8, weight: 'm' });
  const notes = bill.notes ? pen.wrap(bill.notes, wordsW, { size: 8.4 }) : [];
  const leftH = 14 + 13 + words.length * pen.lh(8.8) + (notes.length ? 16 + 13 + notes.length * pen.lh(8.4) : 0);
  if (y + Math.max(sumH, leftH) > BOTTOM) newPage();
  const tTop = y + 14;

  let sy = tTop;
  for (const [k, v] of rows) {
    pen.text(k, sx, sy, { size: 8.8, color: TEXT2 });
    pen.text(v, sx, sy, { size: 8.8, color: INK, width: sumW, align: 'right' });
    sy += ROW;
  }
  sy += 2;
  // The one coloured element: the total bar, out to the page edge on the right.
  doc.rect(sx - PAD, sy, PAGE_W - EDGE - (sx - PAD), BAR).fill(brand);
  pen.text('Total', sx, sy + 9.5, { size: 9.6, weight: 'm', color: brandInk });
  pen.text(`₹${amountText(bill.total_paise)}`, sx, sy + 7, { size: 13, weight: 's', color: brandInk, width: sumW, align: 'right' });
  sy += BAR + 8;
  for (const [k, v] of after) {
    const strong = k === 'Balance due';
    pen.text(k, sx, sy, { size: 8.8, weight: strong ? 's' : 'r', color: strong ? INK : TEXT2 });
    pen.text(v, sx, sy, { size: 8.8, weight: strong ? 's' : 'r', color: INK, width: sumW, align: 'right' });
    sy += ROW;
  }

  pen.label('Amount in words', X0, tTop);
  let wy = pen.block(words, X0, tTop + 13, { size: 8.8, weight: 'm', color: INK });
  if (notes.length) {
    pen.label('Note', X0, wy + 14);
    wy = pen.block(notes, X0, wy + 27, { size: 8.4, color: TEXT2 });
  }
  y = Math.max(sy, wy) + 22;

  // ---------- pay by UPI (left) · signature (right) · terms ----------
  const terms = settings.terms ? pen.wrap(settings.terms, W, { size: 7.8 }) : [];
  const footH = 92 + (terms.length ? 18 + terms.length * pen.lh(7.8) : 0);
  if (y + footH > BOTTOM) newPage();
  if (qr) {
    const q = 72;
    const boxW = 236;
    doc.roundedRect(X0, y, boxW, q + 16, 3).lineWidth(0.6).strokeColor(HAIR).stroke();
    // Vector QR (sharp in print): one square per dark module, filled in one go.
    const cell = q / qr.size;
    for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) if (qr.get(r, c)) doc.rect(X0 + 8 + c * cell, y + 8 + r * cell, cell + 0.02, cell + 0.02);
    doc.fill(INK);
    const tx = X0 + q + 20;
    pen.label('Scan to pay', tx, y + 14);
    pen.text(`₹${amountText(due)}`, tx, y + 27, { size: 13, weight: 'm' });
    pen.block(pen.wrap(`UPI · ${settings.upi}`, boxW - q - 28, { size: 7.8 }), tx, y + 49, { size: 7.8, color: MUTED });
  }
  const sigW = 210;
  const sigX = X1 - sigW;
  pen.block(pen.wrap(`For ${shop.name}`, sigW, { size: 8.8, weight: 'm' }), sigX, y + 6, { size: 8.8, weight: 'm', width: sigW, align: 'right' });
  rule(y + 66, { color: '#b9bec7', width: 0.6, x1: X1 - 150, x2: X1 });
  pen.text('Authorised signatory', sigX, y + 71, { size: 7.6, color: MUTED, width: sigW, align: 'right' });
  y += 92;
  if (terms.length) {
    rule(y);
    pen.block(terms, X0, y + 9, { size: 7.8, color: MUTED });
  }

  // ---------- watermark + footer on every page ----------
  const range = doc.bufferedPageRange();
  const mark = bill.status === 'cancelled' ? 'CANCELLED' : shop.is_demo || bill.is_sample ? 'DEMO' : '';
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (mark) {
      doc.save();
      doc.rotate(-28, { origin: [PAGE_W / 2, PAGE_H / 2] });
      doc.fillOpacity(0.06);
      pen.text(mark, 0, PAGE_H / 2 - 46, { size: 80, weight: 's', color: mark === 'DEMO' ? MUTED : '#dc2626', width: PAGE_W, align: 'center', spacing: 8 });
      doc.restore();
      doc.fillOpacity(1);
    }
    const fy = PAGE_H - 26;
    rule(fy - 9);
    const left = shop.is_demo || bill.is_sample ? 'Demo bill for testing – not a real sale' : 'Computer-generated bill · Brighton Print';
    pen.text(left, X0, fy, { size: 7, color: MUTED });
    pen.text(range.count > 1 ? `${billNo}  ·  Page ${i - range.start + 1} of ${range.count}` : billNo, X0, fy, { size: 7, color: MUTED, width: W, align: 'right' });
  }
  doc.end();
  return done;
}

/** File name like "Bill-B-1001-Sharma-Printers.pdf". */
export function billFileName(shop, bill) {
  const name = String(shop.name || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return `Bill-B-${bill.bill_no}${name ? '-' + name : ''}.pdf`;
}

/** Sends a bill PDF (inline, or as a download). */
export async function sendBillPdf(res, shop, bill, lines, { download = false } = {}) {
  const pdf = await billPdf(shop, bill, lines);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${billFileName(shop, bill)}"`);
  res.type('application/pdf').send(pdf);
}
