import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { db, now } from '../db.js';
import { config, paths } from '../config.js';
import { addDays, ymd, startOfTodayIso, randomToken } from '../lib/util.js';
import { publishShop } from '../lib/live.js';

export const DEFAULT_SIZES = ['A4', 'A3', 'A5', 'Letter', 'Visiting card', 'Photo 4x6', 'Flex / Banner', 'Other'];

export const hashPassword = (plain) => bcrypt.hashSync(String(plain), 10);
export const checkPassword = (plain, hash) => (hash ? bcrypt.compareSync(String(plain ?? ''), hash) : false);

export const getShopById = (id) => db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
export const getShopBySlug = (slug) => db.prepare('SELECT * FROM shops WHERE slug = ?').get(String(slug || '').toLowerCase());
export const getShopByEmail = (email) => db.prepare('SELECT * FROM shops WHERE email = ?').get(String(email || '').trim());
export const slugTaken = (slug) => Boolean(db.prepare('SELECT 1 FROM shops WHERE slug = ?').get(slug));
export const emailTaken = (email) => Boolean(db.prepare('SELECT 1 FROM shops WHERE email = ?').get(email));

/**
 * Effective state of a shop account:
 *   pending (registered, not paid yet) | rejected | paused | expired | active
 * Only 'active' shops accept new customer orders. The shared sample demo shop
 * never expires; personal demo shops expire when their demo days end.
 */
export function shopState(shop) {
  if (!shop) return 'pending';
  if (shop.status !== 'active') return shop.status;
  if (shop.is_demo && shop.slug === config.demo.slug) return 'active';
  if (shop.is_demo && shop.demo_expires_at) return Date.parse(shop.demo_expires_at) > Date.now() ? 'active' : 'expired';
  if (!shop.paid_until || shop.paid_until < ymd()) return 'expired';
  return 'active';
}
export const acceptsOrders = (shop) => shopState(shop) === 'active';

export const DEFAULT_PAPERS = ['Normal', 'Matte', 'Glossy', 'Art paper', 'Sticker', 'Other'];

export function paperOptions(shop) {
  try {
    const list = JSON.parse(shop.paper_options || '[]');
    if (Array.isArray(list) && list.length) return list.map(String);
  } catch {
    /* fall through */
  }
  return DEFAULT_PAPERS;
}

export function sizeOptions(shop) {
  try {
    const list = JSON.parse(shop.size_options || '[]');
    if (Array.isArray(list) && list.length) return list.map(String);
  } catch {
    /* fall through */
  }
  return DEFAULT_SIZES;
}

/**
 * Registers a shop. Real shops start 'pending' (they become active when they pay);
 * demo shops (demo: true) are active at once for config.demo.trialDays days.
 */
export function createShop({ slug, name, owner_name, mobile, email, city, password, demo = false }) {
  const info = db
    .prepare(
      `INSERT INTO shops (slug, name, owner_name, mobile, email, city, password_hash, size_options, created_at, is_demo, status, paid_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      slug, name, owner_name, mobile, email.toLowerCase(), city, hashPassword(password), JSON.stringify(DEFAULT_SIZES), now(),
      demo ? 1 : 0, demo ? 'active' : 'pending', demo ? addDays(ymd(), config.demo.trialDays - 1) : null
    );
  return getShopById(info.lastInsertRowid);
}

export function touchLogin(shopId) {
  db.prepare('UPDATE shops SET last_login_at = ? WHERE id = ?').run(now(), shopId);
}

/** Settings a shop can edit itself. `fields` keys are trusted column names chosen by the caller. */
const SETTINGS_COLUMNS = new Set(['name', 'brand_color', 'phone', 'address', 'size_options', 'retention_days', 'logo_file', 'owner_name', 'city']);
export function updateShopSettings(shopId, fields) {
  const keys = Object.keys(fields).filter((k) => SETTINGS_COLUMNS.has(k));
  if (!keys.length) return;
  const sql = `UPDATE shops SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`;
  db.prepare(sql).run({ ...Object.fromEntries(keys.map((k) => [k, fields[k]])), id: shopId });
  publishShop(shopId);
}

/** Sets a new password and bumps pw_version so other sessions are logged out. */
export function setPassword(shopId, plain) {
  db.prepare('UPDATE shops SET password_hash = ?, pw_version = pw_version + 1 WHERE id = ?').run(hashPassword(plain), shopId);
  return getShopById(shopId);
}

export const generatePassword = () => randomToken(9).replace(/[-_]/g, 'x').slice(0, 10);

// ---------- admin actions ----------
export function approveShop(shopId, { plan, paid_until }) {
  db.prepare(
    `UPDATE shops SET status = 'active', plan = ?, paid_until = ?, approved_at = COALESCE(approved_at, ?) WHERE id = ?`
  ).run(plan, paid_until, now(), shopId);
  publishShop(shopId);
}
export function setShopStatus(shopId, status) {
  db.prepare('UPDATE shops SET status = ? WHERE id = ?').run(status, shopId);
  publishShop(shopId);
}
export function setAdminNote(shopId, note) {
  db.prepare('UPDATE shops SET admin_note = ? WHERE id = ?').run(note, shopId);
  publishShop(shopId);
}

// ---------- logo files ----------
export function logoPath(shop) {
  if (!shop?.logo_file || !/^[a-f0-9]{32}\.(png|jpe?g|webp)$/.test(shop.logo_file)) return null;
  return path.join(paths.logos, shop.logo_file);
}
export function removeLogoFile(shop) {
  const p = logoPath(shop);
  if (p) fs.rm(p, { force: true }, () => {});
}

// ---------- stats ----------
export function storageUsed(shopId) {
  return db.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS n FROM files WHERE shop_id = ? AND deleted_at IS NULL').get(shopId).n;
}

export function shopCounts(shopId) {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM orders WHERE shop_id = ? GROUP BY status').all(shopId);
  const counts = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const newToday = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE shop_id = ? AND created_at >= ?').get(shopId, startOfTodayIso()).n;
  const total = rows.reduce((a, r) => a + r.n, 0);
  return { ...counts, newToday, total };
}

/** Orders waiting on the shop: new, customer asked for changes, customer said OK (badge on the Orders tab). */
export const todoCount = (shopId) =>
  db.prepare("SELECT COUNT(*) AS n FROM orders WHERE shop_id = ? AND status IN ('new', 'changes_requested', 'approved')").get(shopId).n;

/** Every shop with usage numbers, pending first, then newest. */
export function listShopsForAdmin({ q = '', status = '' } = {}) {
  const rows = db
    .prepare(
      `SELECT s.*,
         (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id) AS orders_count,
         (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id AND o.created_at >= @today) AS orders_today,
         (SELECT MAX(created_at) FROM orders o WHERE o.shop_id = s.id) AS last_order_at,
         (SELECT COALESCE(SUM(size_bytes), 0) FROM files f WHERE f.shop_id = s.id AND f.deleted_at IS NULL) AS storage_bytes
       FROM shops s
       ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END, s.created_at DESC`
    )
    .all({ today: startOfTodayIso() });
  const needle = String(q || '').trim().toLowerCase();
  const nd = needle.replace(/\D/g, '');
  return rows
    .map((s) => ({ ...s, state: shopState(s) }))
    .filter((s) => !status || s.state === status)
    .filter(
      (s) =>
        !needle ||
        [s.name, s.slug, s.email, s.mobile, s.city, s.owner_name].some((v) => String(v).toLowerCase().includes(needle)) ||
        (nd.length >= 3 && String(s.mobile).replace(/\D/g, '').includes(nd.length > 10 ? nd.slice(-10) : nd))
    );
}

/** Platform totals – the demo shop is excluded from every number. */
export function adminOverview() {
  const shops = db.prepare('SELECT * FROM shops WHERE is_demo = 0').all();
  const states = { pending: 0, active: 0, paused: 0, expired: 0, rejected: 0 };
  for (const s of shops) states[shopState(s)]++;
  const real = 'shop_id IN (SELECT id FROM shops WHERE is_demo = 0)';
  const ordersToday = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE ${real} AND created_at >= ?`).get(startOfTodayIso()).n;
  const ordersTotal = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE ${real}`).get().n;
  const storage = db.prepare(`SELECT COALESCE(SUM(size_bytes), 0) AS n FROM files WHERE ${real} AND deleted_at IS NULL`).get().n;
  return { totalShops: shops.length, ...states, ordersToday, ordersTotal, storage };
}
