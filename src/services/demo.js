// Shared sample demo shop (slug config.demo.slug): created once at boot, wiped and
// re-seeded with sample orders every config.demo.resetHours (see src/jobs.js).
// Personal demo shops (created at /demo/register) are only touched by
// cleanupEndedDemos(), which deletes them some days after their demo ended.
import fs from 'node:fs';
import path from 'node:path';
import { db, now } from '../db.js';
import { config, paths } from '../config.js';
import { addDays, randomHex, randomToken, startOfTodayIso, ymd } from '../lib/util.js';
import { canTransition, PROOF_ALLOWED } from '../lib/status.js';
import { extOf, removeStoredFile } from '../lib/uploads.js';
import { Canvas, hexRgb } from '../lib/png.js';
import { DEFAULT_SIZES, hashPassword, removeLogoFile } from './shops.js';
import { createOrder, addEvent } from './orders.js';

const DEFAULTS = {
  name: 'Demo Print Studio',
  owner_name: 'Demo Owner',
  email: 'demo@printdesk.invalid',
  city: 'Your City',
  address: 'Sample address, Your City',
  brand_color: '#1a5d40',
};

/** The demo shop row (only a shop flagged is_demo – never touches a real shop). */
export const getDemoShop = () => db.prepare('SELECT * FROM shops WHERE slug = ? AND is_demo = 1').get(config.demo.slug);

/** Creates the demo shop if missing. Returns true when it was created. */
export function ensureDemoShop() {
  if (getDemoShop()) return false;
  if (db.prepare('SELECT 1 FROM shops WHERE slug = ?').get(config.demo.slug)) {
    console.warn(`[demo] slug "${config.demo.slug}" belongs to a real shop – demo disabled`);
    return false;
  }
  const at = now();
  db.prepare(
    `INSERT INTO shops (slug, name, owner_name, mobile, email, city, password_hash, status, plan, paid_until, is_demo,
       brand_color, phone, address, size_options, retention_days, next_order_no, created_at, approved_at)
     VALUES (@slug, @name, @owner_name, '', @email, @city, @hash, 'active', 'business', '2099-12-31', 1,
       @brand_color, '', @address, @sizes, 15, 1001, @at, @at)`
  ).run({ ...DEFAULTS, slug: config.demo.slug, hash: hashPassword(randomToken(32)), sizes: JSON.stringify(DEFAULT_SIZES), at });
  return true;
}

// ---------- sample orders ----------
const HOUR = 60 * 60 * 1000;

/**
 * Order plan, oldest first (so #1001… follow creation time). `steps` run after
 * creation: `h` = hours after the order was placed; a step with `proof` uploads
 * a proof (status -> proof_sent); otherwise `to` is the new status, by the shop
 * unless `by: 'customer'`.
 */
function samplePlan(nowMs, todayMs) {
  const ago = (h) => nowMs - h * HOUR;
  // "Today" in APP_TZ even just after midnight, never in the future.
  const today = (mins, frac) => Math.max(nowMs - mins * 60 * 1000, todayMs + (nowMs - todayMs) * frac);
  return [
    {
      at: ago(74),
      data: { customer_name: 'Sanjay', customer_mobile: '98xxxxxx10', size: 'A4', quantity: 500, color_mode: 'color', sides: 'single', notes: 'Sample order – Letterheads for my clinic. Logo on top, address and phone number in the footer.' },
      files: [{ name: 'Clinic letterhead final.pdf', pdf: { title: 'Clinic Letterhead', subtitle: 'A4 · 500 sheets · colour · single side', accent: '#1a5d40' } }],
      steps: [
        { h: 1.5, proof: { name: 'Letterhead design.png', art: { style: 'band', paper: [210, 297], accent: '#1a5d40', title: 'City Clinic', sub: 'Letterhead' } }, note: 'Letterhead design – please check the address and phone number.' },
        { h: 3, by: 'customer', to: 'approved', note: 'All correct, please print.' },
        { h: 4, to: 'printing' },
        { h: 22, to: 'ready', note: '500 letterheads packed and ready for pickup.' },
        { h: 27, to: 'delivered', note: 'Collected from the shop.' },
      ],
    },
    {
      at: ago(66),
      data: { customer_name: 'Kavita', customer_mobile: '97xxxxxx23', size: 'A5', quantity: 10, color_mode: 'bw', sides: 'single', notes: 'Sample order – Bill books with my shop name, 50 sets per book, numbered.' },
      files: [{ name: 'Bill book design.pdf', pdf: { title: 'Bill Book', subtitle: 'A5 · 10 books · black & white · numbered', accent: '#475569' } }],
      steps: [{ h: 2, to: 'cancelled', note: 'Customer called – will order next month.' }],
    },
    {
      at: ago(52),
      data: { customer_name: 'Arjun', customer_mobile: '99xxxxxx37', size: 'Flex / Banner', quantity: 1, color_mode: 'color', sides: 'single', notes: 'Sample order – Shop opening flex banner, 6 x 3 ft, with eyelets on all four corners.' },
      files: [{ name: 'Opening banner 6x3 ft.pdf', pdf: { title: 'Grand Opening Banner', subtitle: 'Flex · 6 x 3 ft · colour · with eyelets', accent: '#f97316' } }],
      steps: [
        { h: 1, proof: { name: 'Banner design 6x3.png', art: { style: 'banner', paper: [6, 3], accent: '#f97316', title: 'Grand Opening', sub: 'Shree Mobile Point' } }, note: 'Banner design (6 x 3 ft) – please check the spelling of the shop name and phone number.' },
        { h: 2.5, by: 'customer', to: 'approved' },
        { h: 3, to: 'printing' },
        { h: 8, to: 'ready', note: 'Banner ready with eyelets on all corners.' },
      ],
    },
    {
      at: ago(30),
      data: { customer_name: 'Rahul', customer_mobile: '90xxxxxx41', size: 'A4', quantity: 2, color_mode: 'bw', sides: 'both', notes: 'Sample order – Final year college project, 86 pages. Spiral binding with a clear front cover, 2 copies.' },
      files: [{ name: 'Project report final.pdf', pdf: { title: 'College Project Report', subtitle: 'A4 · 86 pages · both sides · spiral binding', accent: '#1e3a8a' } }],
      steps: [
        { h: 1, proof: { name: 'Project cover design.png', art: { style: 'band', paper: [210, 297], accent: '#1e3a8a', title: 'Project Report', sub: 'Final year' } }, note: 'Cover page design – please check your name, roll number and college name.' },
        { h: 3, by: 'customer', to: 'approved' },
        { h: 20, to: 'printing', note: 'Printing both copies now. Binding after printing.' },
      ],
    },
    {
      at: ago(26),
      data: { customer_name: 'Neha', customer_mobile: '98xxxxxx56', size: 'Other', quantity: 300, color_mode: 'color', sides: 'both', notes: 'Sample order – Wedding invitation cards, 5 x 7 inch, golden border. Hindi on the front, English on the back.' },
      files: [
        { name: 'Wedding card front.png', art: { style: 'wedding', paper: [5, 7], title: 'Shubh Vivah', sub: 'Neha & Vikram', date: '14 December' } },
        { name: 'Wedding card back.png', art: { style: 'wedding', paper: [5, 7], title: 'Neha & Vikram', sub: 'Wedding invitation', date: '14 December' } },
      ],
      steps: [
        { h: 2, proof: { name: 'Wedding card design 1.png', art: { style: 'wedding', paper: [5, 7], title: 'Neha & Vikram', sub: 'Wedding invitation', date: '12 December' } }, note: 'Design 1 – please check the names, date and venue carefully.' },
        { h: 4, by: 'customer', to: 'changes_requested', note: 'Please change the date to 14 December and make the names a little bigger.' },
        { h: 6, proof: { name: 'Wedding card design 2.png', art: { style: 'wedding', paper: [5, 7], title: 'Neha & Vikram', sub: 'Wedding invitation', date: '14 December', big: true } }, note: 'Design 2 – date changed to 14 December and names made bigger.' },
        { h: 7, by: 'customer', to: 'approved', note: 'Looks perfect now. Please print.' },
      ],
    },
    {
      at: ago(20),
      data: { customer_name: 'Pooja', customer_mobile: '96xxxxxx62', size: 'Visiting card', quantity: 500, color_mode: 'color', sides: 'both', notes: 'Sample order – 500 visiting cards, matte finish. Same design as last time with my new phone number.' },
      files: [{ name: 'Visiting card design.pdf', pdf: { title: 'Visiting Card', subtitle: '500 cards · colour · both sides · matte', accent: '#0f766e' } }],
      steps: [
        { h: 1, proof: { name: 'Visiting card design.png', art: { style: 'card', paper: [3.5, 2], accent: '#0f766e', title: 'Pooja', sub: 'Boutique & tailoring' } }, note: 'Visiting card design – front side. The back stays the same as your old card.' },
        { h: 3, by: 'customer', to: 'changes_requested', note: 'Please make the phone number bold and remove the fax line.' },
      ],
    },
    {
      at: ago(6),
      data: { customer_name: 'Priya', customer_mobile: '88xxxxxx78', size: 'A5', quantity: 1000, color_mode: 'color', sides: 'both', notes: 'Sample order – Coaching class pamphlets, 1000 copies. Please check the spelling before printing.' },
      files: [{ name: 'Pamphlet A5 final.pdf', pdf: { title: 'Admissions Open Pamphlet', subtitle: 'A5 · 1000 copies · colour · both sides', accent: '#f97316' } }],
      steps: [
        { h: 0.7, proof: { name: 'Pamphlet design.png', art: { style: 'band', paper: [148, 210], accent: '#f97316', title: 'Bright Classes', sub: 'Admissions open' } }, note: 'Pamphlet design attached – please check the class timings and phone number.' },
      ],
    },
    {
      at: today(130, 0.35),
      data: { customer_name: 'Amit', customer_mobile: '97xxxxxx84', size: 'A4', quantity: 120, color_mode: 'bw', sides: 'both', notes: 'Sample order – Class notes, 120 pages, black & white, both sides. Stapled.' },
      files: [{ name: 'Class notes 120 pages.pdf', pdf: { title: 'Class Notes', subtitle: 'A4 · 120 pages · black & white · both sides', accent: '#334155' } }],
      steps: [],
    },
    {
      at: today(25, 0.7),
      data: { customer_name: 'Ravi', customer_mobile: '98xxxxxx95', size: 'Photo 4x6', quantity: 24, color_mode: 'color', sides: 'single', notes: 'Sample order – Photo prints 4x6 from our family trip, glossy finish. 12 copies of each photo.' },
      files: [
        { name: 'Family trip photo 1.png', photo: 0 },
        { name: 'Family trip photo 2.png', photo: 1 },
      ],
      steps: [],
    },
  ];
}

// ---------- sample file bytes (generated once per process, then cached) ----------
const cache = new Map();
const cached = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

function pdfText(s) {
  return String(s)
    .replace(/[\\()]/g, (c) => '\\' + c)
    .replace(/–/g, '\\226')
    .replace(/·/g, '\\267')
    .replace(/[^\x20-\x7e]/g, '');
}

/** One-page A4 PDF (Helvetica, WinAnsi) clearly marked as demo artwork. */
function makePdf({ title, subtitle, accent }) {
  const rgb = (hex) => hexRgb(hex).map((v) => (v / 255).toFixed(3)).join(' ');
  const ops = [];
  [['#ef8a2b', 48], ['#f97316', 62], ['#fbbf24', 76], ['#0b1220', 90]].forEach(([c, x]) => ops.push(`${rgb(c)} rg ${x} 768 10 40 re f`));
  ops.push(`BT /F1 10 Tf ${rgb('#64748b')} rg 116 794 Td (SAMPLE ARTWORK) Tj ET`);
  ops.push(`BT /F2 10 Tf ${rgb('#64748b')} rg 116 778 Td (${pdfText('Brighton Print demo – sample artwork')}) Tj ET`);
  ops.push(`BT /F1 28 Tf ${rgb('#0b1220')} rg 48 700 Td (${pdfText(title)}) Tj ET`);
  ops.push(`BT /F2 13 Tf ${rgb('#3b4a5e')} rg 48 676 Td (${pdfText(subtitle)}) Tj ET`);
  ops.push(`${rgb(accent)} rg 48 650 72 5 re f`);
  ops.push(`${rgb('#cbd5e1')} RG 1 w 48 170 499 450 re S`);
  const widths = [0.9, 0.82, 0.94, 0.55, 0, 0.88, 0.92, 0.78, 0.86, 0.4, 0, 0.9, 0.84, 0.7];
  widths.forEach((w, i) => w && ops.push(`${rgb('#e2e8f0')} rg 76 ${584 - i * 28} ${Math.round(443 * w)} 10 re f`));
  ops.push(`BT /F2 9 Tf ${rgb('#64748b')} rg 48 70 Td (This file is part of the Brighton Print demo. It is not a real customer order.) Tj ET`);
  const content = ops.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    `<< /Title (${pdfText(title + ' – Brighton Print demo')}) /Producer (Brighton Print) >>`,
  ];
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = objs.map((body, i) => {
    const at = Buffer.byteLength(out, 'latin1');
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Largest whole pixel-font block size so `text` fits `maxW` (capped at `maxS`). */
const fit = (text, maxW, maxS) => Math.max(1, Math.min(maxS, Math.floor(maxW / (String(text).length * 6 - 1))));

function skeleton(c, x, y, w, bottom, { bar = 8, gap = 14, color = '#e2e8f0', center = false, pattern = [0.92, 0.84, 0.96, 0.58, 0, 0.9, 0.8, 0.88, 0.46] } = {}) {
  for (let i = 0, yy = y; yy + bar <= bottom; i++, yy += bar + gap) {
    const k = pattern[i % pattern.length];
    if (k) c.roundRect(center ? x + (w - w * k) / 2 : x, yy, w * k, bar, bar / 2, color);
  }
}

/** Paper content for the four sample artwork styles. */
function drawPaper(c, a, x, y, w, h) {
  const pad = Math.round(Math.min(w, h) * 0.08);
  if (a.style === 'band') {
    const band = Math.round(h * 0.28);
    c.roundRect(x, y, w, band, 4, a.accent);
    c.rect(x, y + band - 6, w, 6, a.accent);
    // Title on one line when it fits large enough, else one word per line.
    const lines = fit(a.title, w - pad * 2, 6) >= 4 ? [a.title] : a.title.split(' ');
    const s = Math.min(lines.length > 1 ? 4 : 5, ...lines.map((l) => fit(l, w - pad * 2, 6)));
    let ty = y + (band - (lines.length * (7 * s + 8) + 16)) / 2;
    for (const line of lines) {
      c.text(line, x + pad, ty, s, '#ffffff');
      ty += 7 * s + 8;
    }
    c.text(a.sub, x + pad, ty + 2, 2, '#ffffff', { alpha: 0.85 });
    skeleton(c, x + pad, y + band + pad, w - pad * 2, y + h - pad * 2.2);
    c.rect(x + pad, y + h - pad * 1.4, w - pad * 2, 2, a.accent);
    ['#ef8a2b', '#f97316', '#fbbf24'].forEach((col, i) => c.circle(x + w - pad - i * 16 - 6, y + h - pad * 0.8, 5, col));
  } else if (a.style === 'card') {
    const side = Math.round(w * 0.34);
    c.roundRect(x, y, side, h, 4, a.accent);
    c.rect(x + side - 6, y, 6, h, a.accent);
    c.text(a.title.charAt(0), x + side / 2, y + h / 2 - 45, 13, '#ffffff', { align: 'center' });
    const tx = x + side + pad;
    const tw = w - side - pad * 2;
    const s = fit(a.title, tw, 7);
    c.text(a.title, tx, y + pad + 4, s, a.accent);
    c.text(a.sub, tx, y + pad + 7 * s + 18, Math.max(2, Math.min(3, fit(a.sub, tw, 3))), '#64748b');
    skeleton(c, tx, y + h * 0.46, tw, y + h - pad, { bar: 9, gap: 14, pattern: [0.8, 0.62, 0.9] });
  } else if (a.style === 'banner') {
    c.roundRect(x, y, w, h, 4, a.accent);
    const s = fit(a.title, w - pad * 3, 9);
    c.text(a.title, x + w / 2, y + h * 0.3, s, '#ffffff', { align: 'center' });
    const s2 = fit(a.sub, w - pad * 4, 5);
    c.text(a.sub, x + w / 2, y + h * 0.3 + 7 * s + 22, s2, '#fbbf24', { align: 'center' });
    skeleton(c, x + pad * 2, y + h * 0.78, w - pad * 4, y + h - pad * 0.6, { color: '#ffffff', center: true, pattern: [0.5] });
    for (const [ex, ey] of [[x + 16, y + 16], [x + w - 16, y + 16], [x + 16, y + h - 16], [x + w - 16, y + h - 16]]) {
      c.circle(ex, ey, 8, '#cbd5e1');
      c.circle(ex, ey, 4, '#ffffff');
    }
  } else if (a.style === 'wedding') {
    const gold = '#c9a227';
    const cream = '#fdf7e7';
    const maroon = '#8a1c2b';
    c.roundRect(x, y, w, h, 4, cream);
    c.roundRect(x + 10, y + 10, w - 20, h - 20, 6, gold);
    c.roundRect(x + 14, y + 14, w - 28, h - 28, 4, cream);
    c.roundRect(x + 20, y + 20, w - 40, h - 40, 3, gold);
    c.roundRect(x + 22, y + 22, w - 44, h - 44, 2, cream);
    const cx = x + w / 2;
    [-16, 0, 16].forEach((d, i) => c.circle(cx + d, y + 58, i === 1 ? 6 : 4, gold));
    // Names stacked one word per line; proof 2 ("names bigger") uses a larger size.
    const lines = a.title.split(' ');
    const s = Math.min(a.big ? 5 : 4, ...lines.map((l) => fit(l, w - 60, 5)));
    let ty = y + 86;
    for (const line of lines) {
      c.text(line, cx, ty, s, maroon, { align: 'center' });
      ty += 7 * s + 10;
    }
    c.text(a.sub, cx, ty + 6, 2, gold, { align: 'center' });
    c.text(a.date, cx, ty + 36, 3, maroon, { align: 'center' });
    skeleton(c, x + 50, ty + 78, w - 100, y + h - 64, { bar: 6, gap: 12, color: '#ead9b0', center: true, pattern: [0.8, 0.6, 0.7, 0.4] });
    [-16, 0, 16].forEach((d, i) => c.circle(cx + d, y + h - 44, i === 1 ? 6 : 4, gold));
  }
}

/** Sample proof / artwork preview: the "paper" on a soft backdrop with crop marks. */
function artImage(a, { label, tagColor, caption }) {
  const W = 960;
  const H = 640;
  const c = new Canvas(W, H);
  c.gradient(0, 0, W, H, '#f4f7fb', '#dfe6ef');
  const k = Math.min(720 / a.paper[0], 420 / a.paper[1]);
  const w = Math.round(a.paper[0] * k);
  const h = Math.round(a.paper[1] * k);
  const x = Math.round((W - w) / 2);
  const y = Math.round(328 - h / 2);
  c.shadow(x, y + 10, w, h, 6, 30, '#0b1220', 0.12);
  c.shadow(x, y + 2, w, h, 4, 6, '#0b1220', 0.12);
  c.roundRect(x, y, w, h, 4, '#ffffff');
  drawPaper(c, a, x, y, w, h);
  for (const [cx, cy, dx, dy] of [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]]) {
    c.rect(dx < 0 ? cx - 30 : cx + 8, cy - 1, 22, 2, '#94a3b8');
    c.rect(cx - 1, dy < 0 ? cy - 30 : cy + 8, 2, 22, '#94a3b8');
  }
  const tw = Canvas.measure(label, 3);
  c.roundRect(24, 24, tw + 36, 42, 21, tagColor);
  c.text(label, 42, 35, 3, '#ffffff');
  c.text(caption, W / 2, H - 40, 2, '#64748b', { align: 'center' });
  return c.toPng();
}

const PHOTOS = [
  { sky: ['#5fb3e6', '#d7effa'], sun: [690, 150], sunColor: '#fff4c2', hills: ['#7fb58f', '#4f8f68', '#2f6a4c'], phase: 0.4 },
  { sky: ['#ff9a6b', '#ffd59e'], sun: [260, 250], sunColor: '#fff1d0', hills: ['#a0587a', '#6b3a6b', '#3b2348'], phase: 2.1 },
];

/** A simple generated landscape "photo". */
function photoImage(p) {
  const W = 900;
  const H = 600;
  const c = new Canvas(W, H);
  c.gradient(0, 0, W, 420, p.sky[0], p.sky[1]);
  c.circle(p.sun[0], p.sun[1], 90, p.sunColor, 0.25);
  c.circle(p.sun[0], p.sun[1], 52, p.sunColor);
  c.area((x) => 300 + 46 * Math.sin(x / 140 + p.phase) + 22 * Math.sin(x / 53 + p.phase * 2), H, p.hills[0]);
  c.area((x) => 390 + 32 * Math.sin(x / 95 + p.phase + 1) + 10 * Math.sin(x / 31), H, p.hills[1]);
  c.area((x) => 480 + 20 * Math.sin(x / 72 + p.phase + 2), H, p.hills[2]);
  const label = 'Sample photo';
  const tw = Canvas.measure(label, 3);
  c.roundRect(W - tw - 60, H - 66, tw + 36, 42, 21, '#0b1220', 0.55);
  c.text(label, W - tw - 42, H - 55, 3, '#ffffff');
  return c.toPng();
}

function customerFileBytes(f, orderNo) {
  if (f.pdf) return cached(`pdf:${f.name}`, () => makePdf(f.pdf));
  if (f.photo != null) return cached(`photo:${f.photo}`, () => photoImage(PHOTOS[f.photo]));
  return cached(`art:${orderNo}:${f.name}`, () => artImage(f.art, { label: 'Sample artwork', tagColor: '#1a5d40', caption: `Brighton Print demo - order P-${orderNo}` }));
}

const proofBytes = (p, orderNo) =>
  cached(`proof:${orderNo}:${p.name}`, () => artImage(p.art, { label: 'Design preview', tagColor: '#f97316', caption: `Design preview for order P-${orderNo} - Brighton Print demo` }));

// ---------- reset ----------
const iso = (ms) => new Date(ms).toISOString();

function seedOrder(shop, plan) {
  const order = createOrder(shop, plan.data, plan.files, { isSample: true, at: iso(plan.at) });
  let status = 'new';
  let proofNote = '';
  let customerNote = '';
  let last = plan.at;
  const insProof = db.prepare(
    "INSERT INTO files (order_id, shop_id, kind, original_name, stored_name, size_bytes, created_at) VALUES (?, ?, 'proof', ?, ?, ?, ?)"
  );
  for (const step of plan.steps) {
    last = plan.at + step.h * HOUR;
    const at = iso(last);
    if (step.file) {
      if (!PROOF_ALLOWED.has(status)) throw new Error(`[demo] proof not allowed in status ${status}`);
      insProof.run(order.id, shop.id, step.file.originalname, step.file.filename, step.file.size, at);
      addEvent(order.id, { actor: 'shop', type: 'proof', from: status, to: 'proof_sent', note: step.note, at });
      [status, proofNote, customerNote] = ['proof_sent', step.note, ''];
    } else {
      if (!canTransition(status, step.to)) throw new Error(`[demo] bad transition ${status} -> ${step.to}`);
      addEvent(order.id, { actor: step.by || 'shop', type: 'status', from: status, to: step.to, note: step.note || '', at });
      if (step.to === 'changes_requested') customerNote = step.note || '';
      else if (step.to === 'approved') customerNote = '';
      status = step.to;
    }
  }
  db.prepare('UPDATE orders SET status = ?, proof_note = ?, customer_note = ?, updated_at = ? WHERE id = ? AND shop_id = ?').run(
    status,
    proofNote,
    customerNote,
    iso(last),
    order.id,
    shop.id
  );
}

/**
 * Wipes the demo shop (orders, files, logo, settings) and seeds fresh sample
 * orders #1001… covering every status. New files are written first and the
 * data is swapped in one transaction, so the demo is never half-empty.
 */
export function resetDemo() {
  const shop = getDemoShop();
  if (!shop) return false;
  const dir = path.join(paths.uploads, String(shop.id));
  fs.mkdirSync(dir, { recursive: true });

  const written = [];
  const store = (name, bytes) => {
    const filename = `${randomHex(16)}.${extOf(name)}`;
    fs.writeFileSync(path.join(dir, filename), bytes);
    written.push(filename);
    return { originalname: name, filename, size: bytes.length };
  };

  const oldFiles = db.prepare('SELECT shop_id, stored_name FROM files WHERE shop_id = ?').all(shop.id);
  try {
    const plans = samplePlan(Date.now(), Date.parse(startOfTodayIso())).map((p, i) => {
      const orderNo = 1001 + i;
      return {
        ...p,
        files: p.files.map((f) => store(f.name, customerFileBytes(f, orderNo))),
        steps: p.steps.map((s) => (s.proof ? { ...s, file: store(s.proof.name, proofBytes(s.proof, orderNo)) } : s)),
      };
    });
    db.transaction(() => {
      db.prepare('DELETE FROM orders WHERE shop_id = ?').run(shop.id); // files + events cascade
      db.prepare('DELETE FROM files WHERE shop_id = ?').run(shop.id);
      db.prepare(
        `UPDATE shops SET name = @name, owner_name = @owner_name, city = @city, mobile = '', phone = '', address = @address,
           brand_color = @brand_color, logo_file = NULL, size_options = @sizes, retention_days = 15, next_order_no = 1001,
           password_hash = @hash, is_demo = 1
         WHERE id = @id AND is_demo = 1`
      ).run({ ...DEFAULTS, sizes: JSON.stringify(DEFAULT_SIZES), hash: hashPassword(randomToken(32)), id: shop.id });
      for (const plan of plans) seedOrder(shop, plan);
    })();
  } catch (err) {
    for (const name of written) fs.rmSync(path.join(dir, name), { force: true });
    throw err;
  }

  // Old files and anything else left in the demo upload folder (e.g. visitor uploads).
  const keep = new Set(written);
  for (const row of oldFiles) {
    try {
      removeStoredFile(row);
    } catch (err) {
      console.warn('[demo] could not remove', row.stored_name, err.message);
    }
  }
  for (const name of fs.readdirSync(dir)) {
    if (keep.has(name)) continue;
    try {
      fs.rmSync(path.join(dir, name), { force: true, recursive: true });
    } catch (err) {
      console.warn('[demo] could not remove', name, err.message);
    }
  }
  if (shop.logo_file) removeLogoFile(shop);
  return true;
}

/** Fills a fresh (empty) demo shop with the same sample orders as the shared demo. */
export function seedSampleOrders(shop) {
  const dir = path.join(paths.uploads, String(shop.id));
  fs.mkdirSync(dir, { recursive: true });
  const store = (name, bytes) => {
    const filename = `${randomHex(16)}.${extOf(name)}`;
    fs.writeFileSync(path.join(dir, filename), bytes);
    return { originalname: name, filename, size: bytes.length };
  };
  const plans = samplePlan(Date.now(), Date.parse(startOfTodayIso())).map((p, i) => ({
    ...p,
    files: p.files.map((f) => store(f.name, customerFileBytes(f, 1001 + i))),
    steps: p.steps.map((s) => (s.proof ? { ...s, file: store(s.proof.name, proofBytes(s.proof, 1001 + i)) } : s)),
  }));
  db.transaction(() => plans.forEach((plan) => seedOrder(shop, plan)))();
}

// ---------- personal demo shops ----------
/**
 * Deletes personal demo shops whose demo ended more than config.demo.keepDays
 * ago (never the sample shop, never a shop that went live – paying sets is_demo = 0).
 * Their orders, files, tickets, payments and notifications go with the shop row
 * (ON DELETE CASCADE); the upload folder and logo are removed from disk. Returns the count.
 */
export function cleanupEndedDemos() {
  const cutoff = addDays(ymd(), -config.demo.keepDays);
  const ended = db
    .prepare('SELECT * FROM shops WHERE is_demo = 1 AND slug != ? AND paid_until IS NOT NULL AND paid_until < ?')
    .all(config.demo.slug, cutoff);
  const del = db.prepare('DELETE FROM shops WHERE id = ? AND is_demo = 1 AND slug != ?');
  let n = 0;
  for (const shop of ended) {
    if (!del.run(shop.id, config.demo.slug).changes) continue;
    n++;
    try {
      fs.rmSync(path.join(paths.uploads, String(Number(shop.id))), { recursive: true, force: true });
    } catch (err) {
      console.warn('[demo] could not remove uploads of shop', shop.id, err.message);
    }
    removeLogoFile(shop);
  }
  if (n) console.log(`[demo] deleted ${n} ended demo shop(s)`);
  return n;
}
