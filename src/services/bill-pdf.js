import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import * as fontkit from 'fontkit';
import QRCode from 'qrcode';
import { ROOT } from '../config.js';
import { formatDate, inkFor, isHexColor, prettyPhone } from '../lib/util.js';
import { logoPath } from './shops.js';
import { amountInWords, amountText, billDue, billSettings, payState, PAY_MODES, qtyText, upiPayUrl } from './bills.js';

// A4 PDF of one bill, in the shop's name, logo and colour. Text is set in Poppins
// (the app font): each run of text picks the subset that has its characters –
// Latin, Latin-ext (₹) or Devanagari (Hindi names and items, shaped by fontkit).

const FONT_DIR = path.join(ROOT, 'node_modules/@fontsource/poppins/files');
const SUBSETS = ['latin', 'latin-ext', 'devanagari'];
const WEIGHTS = { r: 400, m: 600, b: 700 };

let FONTS = null;
function fonts() {
  if (FONTS) return FONTS;
  const files = {};
  const cover = {};
  for (const sub of SUBSETS) {
    for (const [w, n] of Object.entries(WEIGHTS)) files[`${sub}-${w}`] = fs.readFileSync(path.join(FONT_DIR, `poppins-${sub}-${n}-normal.woff`));
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

// ---------- page + colours ----------
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40;
const W = PAGE_W - 2 * M;
const BOTTOM = PAGE_H - 52;
const INK = '#0f1115';
const TEXT2 = '#3a3f48';
const MUTED = '#5f6570';
const LINE = '#e3e5ea';
const SOFT = '#f5f6f8';
const ZEBRA = '#f9fafb';
const DANGER = '#c4242b';
const SUCCESS = '#13803f';
const WARN = '#a14a04';

/** Text helper over pdfkit: mixed-font runs, measuring, wrapping, alignment. */
class Pen {
  constructor(doc) {
    this.doc = doc;
  }
  use(sub, weight, size) {
    this.doc.font(`${sub}-${weight}`).fontSize(size);
  }
  width(text, { size = 9, weight = 'r', spacing = 0 } = {}) {
    let w = 0;
    for (const r of runs(text)) {
      this.use(r.sub, weight, size);
      w += this.doc.widthOfString(r.text, { characterSpacing: spacing });
    }
    return w;
  }
  /** Line height used for stacking lines of this size. */
  lh(size) {
    return size * 1.42;
  }
  text(text, x, y, { size = 9, weight = 'r', color = INK, width = 0, align = 'left', spacing = 0 } = {}) {
    const total = align === 'left' ? 0 : this.width(text, { size, weight, spacing });
    let cx = align === 'right' ? x + width - total : align === 'center' ? x + (width - total) / 2 : x;
    for (const r of runs(text)) {
      this.use(r.sub, weight, size);
      this.doc.fillColor(color).text(r.text, cx, y, { lineBreak: false, characterSpacing: spacing });
      cx += this.doc.widthOfString(r.text, { characterSpacing: spacing });
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
  /** Draws wrapped lines, returns the y below them. */
  block(lines, x, y, opts = {}) {
    const step = this.lh(opts.size || 9);
    lines.forEach((l, i) => this.text(l, x, y + i * step, opts));
    return y + lines.length * step;
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

const STATE_TEXT = { paid: 'Paid', part: 'Part paid', due: 'Not paid yet', cancelled: 'Cancelled' };
const STATE_COLOR = { paid: SUCCESS, part: WARN, due: WARN, cancelled: DANGER };

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
  const qr = upiUrl ? await QRCode.toBuffer(upiUrl, { type: 'png', width: 360, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1220', light: '#ffffff' } }) : null;
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

  const rule = (y, color = LINE, x1 = M, x2 = M + W, width = 0.75) => doc.moveTo(x1, y).lineTo(x2, y).lineWidth(width).strokeColor(color).stroke();

  // ---------- header: shop (left), bill title + number (right) ----------
  doc.rect(0, 0, PAGE_W, 5).fill(brand);
  let y = 34;
  const tile = 52;
  const logo = logoImage(shop);
  let drewLogo = false;
  if (logo) {
    try {
      doc.image(logo, M, y, { fit: [tile, tile], align: 'center', valign: 'center' });
      drewLogo = true;
    } catch {
      drewLogo = false;
    }
  }
  if (!drewLogo) {
    doc.rect(M, y, tile, tile).fill(brand);
    const initial = String(shop.name || 'S').trim().charAt(0).toUpperCase() || 'S';
    pen.text(initial, M, y + 11, { size: 22, weight: 'b', color: brandInk, width: tile, align: 'center' });
  }
  const rightW = 190;
  const leftX = M + tile + 14;
  const leftW = W - tile - 14 - rightW - 20;
  let ly = pen.block(pen.wrap(shop.name, leftW, { size: 16, weight: 'b' }), leftX, y - 2, { size: 16, weight: 'b', color: INK });
  ly += 2;
  const contact = [];
  const address = String(shop.address || '').trim() || String(shop.city || '').trim();
  if (address) contact.push(...pen.wrap(address, leftW, { size: 8.6 }));
  const phone = shop.phone || shop.mobile;
  if (phone) contact.push(`Phone: ${prettyPhone(phone)}`);
  if (settings.gstin) contact.push(`GSTIN: ${settings.gstin}`);
  ly = pen.block(contact, leftX, ly, { size: 8.6, color: TEXT2 });

  const rx = M + W - rightW;
  pen.text(isTax ? 'TAX INVOICE' : 'BILL', rx, y - 4, { size: 18, weight: 'b', color: INK, width: rightW, align: 'right', spacing: 1.2 });
  let ry = y + 26;
  const meta = [['Bill no.', billNo], ['Date', formatDate(bill.bill_date)]];
  if (bill.order_no) meta.push(['Online order', `P-${bill.order_no}`]);
  for (const [k, v] of meta) {
    pen.text(k, rx, ry + 1, { size: 8, color: MUTED, width: 80 });
    pen.text(v, rx + 80, ry, { size: 9.5, weight: 'm', color: INK, width: rightW - 80, align: 'right' });
    ry += 15;
  }
  y = Math.max(y + tile, ly, ry) + 14;
  rule(y, INK, M, M + W, 1);
  y += 14;

  // ---------- bill to / payment ----------
  const colW = (W - 36) / 2;
  const custLines = [];
  if (bill.customer_mobile) custLines.push(`Mobile: ${prettyPhone(bill.customer_mobile)}`);
  if (bill.customer_address) custLines.push(...pen.wrap(bill.customer_address, colW, { size: 8.6 }));
  if (bill.customer_gstin) custLines.push(`GSTIN: ${bill.customer_gstin}`);
  const nameLines = pen.wrap(bill.customer_name || 'Cash customer', colW, { size: 10.5, weight: 'b' });
  const payLines = [`Payment: ${PAY_MODES[bill.pay_mode] || bill.pay_mode}`];
  if (state === 'part' || state === 'due') payLines.push(`Balance due: ₹${amountText(due)}`);
  const boxH = 18 + Math.max(nameLines.length * pen.lh(10.5) + custLines.length * pen.lh(8.6), pen.lh(10.5) + payLines.length * pen.lh(8.6)) + 12;
  doc.rect(M, y, W, boxH).fill(SOFT);
  const bx = M + 14;
  const px = M + 14 + colW + 8;
  pen.text('BILL TO', bx, y + 10, { size: 7.4, weight: 'm', color: MUTED, spacing: 0.8 });
  let by = pen.block(nameLines, bx, y + 22, { size: 10.5, weight: 'b' });
  pen.block(custLines, bx, by, { size: 8.6, color: TEXT2 });
  pen.text('STATUS', px, y + 10, { size: 7.4, weight: 'm', color: MUTED, spacing: 0.8 });
  pen.text(STATE_TEXT[state], px, y + 22, { size: 10.5, weight: 'b', color: STATE_COLOR[state] });
  pen.block(payLines, px, y + 22 + pen.lh(10.5), { size: 8.6, color: TEXT2 });
  y += boxH + 16;

  // ---------- items table ----------
  const cols = [
    { key: 'n', label: '#', w: 24, align: 'center' },
    { key: 'item', label: 'Item', w: 0, align: 'left' },
    { key: 'qty', label: 'Qty', w: 66, align: 'right' },
    { key: 'rate', label: 'Rate (₹)', w: 96, align: 'right' },
    { key: 'amount', label: 'Amount (₹)', w: 96, align: 'right' },
  ];
  cols[1].w = W - cols.reduce((a, c) => a + c.w, 0);
  let cx = M;
  for (const c of cols) {
    c.x = cx;
    cx += c.w;
  }
  const PAD = 7;
  const tableHead = () => {
    doc.rect(M, y, W, 22).fill(brand);
    for (const c of cols) pen.text(c.label.toUpperCase(), c.x + PAD, y + 6.5, { size: 7.4, weight: 'm', color: brandInk, width: c.w - 2 * PAD, align: c.align, spacing: 0.5 });
    y += 22;
  };
  const newPage = () => {
    doc.addPage({ size: 'A4', margin: 0 });
    doc.rect(0, 0, PAGE_W, 5).fill(brand);
    y = 30;
    pen.text(`${shop.name} · Bill ${billNo} (continued)`, M, y, { size: 8.6, weight: 'm', color: MUTED });
    y += 22;
  };
  tableHead();
  lines.forEach((l, i) => {
    const nameL = pen.wrap(l.name, cols[1].w - 2 * PAD, { size: 9 });
    const rowH = Math.max(nameL.length * pen.lh(9), l.unit ? pen.lh(9) + pen.lh(7.4) : 0, pen.lh(9)) + 12;
    if (y + rowH > BOTTOM) {
      newPage();
      tableHead();
    }
    if (i % 2) doc.rect(M, y, W, rowH).fill(ZEBRA);
    const ty = y + 6;
    pen.text(String(i + 1), cols[0].x + PAD, ty, { size: 8.6, color: MUTED, width: cols[0].w - 2 * PAD, align: 'center' });
    pen.block(nameL, cols[1].x + PAD, ty, { size: 9, color: INK });
    pen.text(qtyText(l.qty), cols[2].x + PAD, ty, { size: 9, width: cols[2].w - 2 * PAD, align: 'right' });
    pen.text(amountText(l.rate_paise), cols[3].x + PAD, ty, { size: 9, width: cols[3].w - 2 * PAD, align: 'right' });
    if (l.unit) pen.text(`per ${l.unit}`, cols[3].x + PAD, ty + pen.lh(9), { size: 7.4, color: MUTED, width: cols[3].w - 2 * PAD, align: 'right' });
    pen.text(amountText(l.amount_paise), cols[4].x + PAD, ty, { size: 9, weight: 'm', width: cols[4].w - 2 * PAD, align: 'right' });
    y += rowH;
    rule(y);
  });

  // ---------- totals (right) + amount in words, notes (left) ----------
  const sumW = 236;
  const sx = M + W - sumW;
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
  if (bill.paid_paise && state !== 'paid') after.push(['Paid', amountText(bill.paid_paise)]);
  if (state === 'paid') after.push(['Paid', amountText(bill.total_paise)]);
  if (due > 0) after.push(['Balance due', amountText(due)]);
  const sumH = rows.length * 17 + 36 + after.length * 17 + 10;

  const wordsW = W - sumW - 28;
  const words = pen.wrap(amountInWords(bill.total_paise), wordsW, { size: 9, weight: 'm' });
  const notes = bill.notes ? pen.wrap(bill.notes, wordsW, { size: 8.6 }) : [];
  const leftH = 14 + words.length * pen.lh(9) + (notes.length ? 18 + notes.length * pen.lh(8.6) : 0);
  if (y + 14 + Math.max(sumH, leftH) > BOTTOM) newPage();
  y += 14;
  const top = y;

  // Values line up with the table's amount column (same inner padding).
  const valW = sumW - PAD;
  let sy = top;
  for (const [k, v] of rows) {
    pen.text(k, sx, sy, { size: 9, color: TEXT2 });
    pen.text(v, sx, sy, { size: 9, color: INK, width: valW, align: 'right' });
    sy += 17;
  }
  doc.rect(sx - 10, sy, sumW + 10, 28).fill(brand);
  pen.text('Total', sx, sy + 7, { size: 10.5, weight: 'b', color: brandInk });
  pen.text(`₹${amountText(bill.total_paise)}`, sx, sy + 6, { size: 12, weight: 'b', color: brandInk, width: valW, align: 'right' });
  sy += 36;
  for (const [k, v] of after) {
    const isDue = k === 'Balance due';
    pen.text(k, sx, sy, { size: 9, weight: isDue ? 'b' : 'r', color: isDue ? WARN : TEXT2 });
    pen.text(v, sx, sy, { size: 9, weight: isDue ? 'b' : 'r', color: isDue ? WARN : INK, width: valW, align: 'right' });
    sy += 17;
  }

  pen.text('AMOUNT IN WORDS', M, top, { size: 7.4, weight: 'm', color: MUTED, spacing: 0.8 });
  let wy = pen.block(words, M, top + 13, { size: 9, weight: 'm', color: INK });
  if (notes.length) {
    pen.text('NOTE', M, wy + 8, { size: 7.4, weight: 'm', color: MUTED, spacing: 0.8 });
    wy = pen.block(notes, M, wy + 21, { size: 8.6, color: TEXT2 });
  }
  y = Math.max(sy, wy) + 18;

  // ---------- pay by UPI (left) + signature (right), then terms ----------
  const terms = settings.terms ? pen.wrap(settings.terms, W, { size: 8 }) : [];
  const footH = 96 + (terms.length ? 16 + terms.length * pen.lh(8) : 0);
  if (y + footH > BOTTOM) newPage();
  if (qr) {
    const q = 80;
    doc.rect(M, y, 250, q + 16).lineWidth(0.75).strokeColor(LINE).stroke();
    doc.image(qr, M + 8, y + 8, { width: q });
    const tx = M + q + 18;
    pen.text('Scan to pay', tx, y + 14, { size: 10, weight: 'b' });
    pen.text(`₹${amountText(due)} by UPI`, tx, y + 30, { size: 9, color: TEXT2 });
    pen.block(pen.wrap(settings.upi, 250 - q - 26, { size: 8.4 }), tx, y + 46, { size: 8.4, color: MUTED });
  }
  const sigW = 200;
  const sigX = M + W - sigW;
  pen.block(pen.wrap(`For ${shop.name}`, sigW, { size: 9, weight: 'm' }), sigX, y + 4, { size: 9, weight: 'm', width: sigW, align: 'right' });
  rule(y + 70, MUTED, sigX + 50, sigX + sigW, 0.6);
  pen.text('Authorised signatory', sigX, y + 75, { size: 8, color: MUTED, width: sigW, align: 'right' });
  y += 96;
  if (terms.length) {
    rule(y, LINE);
    pen.block(terms, M, y + 8, { size: 8, color: MUTED });
  }

  // ---------- watermark + footer on every page ----------
  const range = doc.bufferedPageRange();
  const mark = bill.status === 'cancelled' ? 'CANCELLED' : shop.is_demo || bill.is_sample ? 'DEMO' : '';
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (mark) {
      doc.save();
      doc.rotate(-28, { origin: [PAGE_W / 2, PAGE_H / 2] });
      doc.fillOpacity(0.09);
      pen.text(mark, 0, PAGE_H / 2 - 50, { size: 84, weight: 'b', color: mark === 'DEMO' ? MUTED : DANGER, width: PAGE_W, align: 'center', spacing: 6 });
      doc.restore();
      doc.fillOpacity(1);
    }
    const fy = PAGE_H - 34;
    rule(fy - 8, LINE);
    const left = shop.is_demo || bill.is_sample ? 'Demo bill for testing – not a real sale' : 'Computer-generated bill · made with Brighton Print';
    pen.text(left, M, fy, { size: 7.4, color: MUTED });
    pen.text(range.count > 1 ? `${billNo} · page ${i - range.start + 1} of ${range.count}` : billNo, M, fy, { size: 7.4, color: MUTED, width: W, align: 'right' });
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
