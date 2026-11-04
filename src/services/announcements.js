import { db, now } from '../db.js';
import { publish } from '../lib/live.js';
import { daysLeft, isSampleShop } from './billing.js';
import { getShopById, shopState } from './shops.js';

// Admin → shop announcements. One `announcements` row per send; every receiving shop gets a
// notification row linked to it (Alerts + red badge + chime), and important ones also show as a
// banner on every shop page until the shop taps "Got it" or opens Alerts.
// The shared sample demo shop only gets an announcement when it is picked as the one shop.

/** Who can receive a broadcast. `test(shop, state)` – rejected shops and the sample shop never match. */
export const AUDIENCES = [
  { key: 'all', label: 'All shops', sub: 'Every registered shop – active, paused, not paid yet or plan ended', test: (s) => !s.is_demo },
  { key: 'active', label: 'Shops with an active plan', sub: 'Paid and taking orders', test: (s, st) => !s.is_demo && st === 'active' },
  {
    key: 'ending',
    label: 'Plan ending soon or ended',
    sub: 'Ends within 7 days, or already ended',
    test: (s, st) => !s.is_demo && (st === 'expired' || (st === 'active' && daysLeft(s) != null && daysLeft(s) <= 7)),
  },
  { key: 'pending', label: 'Registered, not paid yet', sub: 'Signed up but no plan yet', test: (s, st) => !s.is_demo && st === 'pending' },
  { key: 'demo', label: 'Demo shops', sub: 'Running demos made from demo links', test: (s, st) => Boolean(s.is_demo) && st === 'active' },
  { key: 'shop', label: 'One shop', sub: 'Pick the shop below', test: () => false },
];
export const audienceOf = (key) => AUDIENCES.find((a) => a.key === key) || null;

const qAllShops = db.prepare('SELECT * FROM shops ORDER BY name COLLATE NOCASE');

/** Shops in a broadcast group (never rejected shops, never the sample shop). */
export function audienceShops(key) {
  const a = audienceOf(key);
  if (!a || key === 'shop') return [];
  return qAllShops.all().filter((s) => s.status !== 'rejected' && !isSampleShop(s) && a.test(s, shopState(s)));
}

/** { all: 12, active: 9, … } for the compose form. */
export function audienceCounts() {
  const shops = qAllShops.all().filter((s) => s.status !== 'rejected' && !isSampleShop(s)).map((s) => [s, shopState(s)]);
  const counts = {};
  for (const a of AUDIENCES) counts[a.key] = a.key === 'shop' ? 1 : shops.filter(([s, st]) => a.test(s, st)).length;
  return counts;
}

/** Every shop the admin may message one-to-one (the sample shop included, rejected shops left out). */
export const pickableShops = () => qAllShops.all().filter((s) => s.status !== 'rejected');

/** Recipients for a compose request: { shops, label } or { error }. */
export function resolveRecipients(audience, shopId) {
  const a = audienceOf(audience);
  if (!a) return { error: 'Choose who gets the announcement.' };
  if (audience === 'shop') {
    const shop = /^\d{1,10}$/.test(String(shopId || '')) ? getShopById(Number(shopId)) : null;
    if (!shop || shop.status === 'rejected') return { error: 'Pick the shop that should get it.' };
    return { shops: [shop], label: shop.name, shop };
  }
  return { shops: audienceShops(audience), label: a.label };
}

const qInsertAnn = db.prepare(
  `INSERT INTO announcements (nonce, audience, shop_id, shop_name, title, body, link, important, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(nonce) DO NOTHING`
);
const qInsertNote = db.prepare(
  `INSERT INTO notifications (audience, shop_id, kind, title, body, link, dedupe_key, created_at, announcement_id)
   VALUES ('shop', ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(dedupe_key) DO NOTHING`
);
const qSetReached = db.prepare('UPDATE announcements SET reached = ? WHERE id = ?');

/**
 * Sends one announcement in a single transaction. `nonce` makes a double-submit a no-op.
 * Returns { id, reached } or { duplicate: true } or { error }.
 */
export function sendAnnouncement({ audience, shopId = null, title, body = '', link = '', important = false, nonce = null }) {
  const r = resolveRecipients(audience, shopId);
  if (r.error) return r;
  if (!r.shops.length) return { error: 'No shop is in this group right now, so nothing was sent.' };
  const kind = important ? 'warn' : 'announcement';
  const at = now();
  const result = db.transaction(() => {
    const ins = qInsertAnn.run(nonce || null, audience, r.shop ? r.shop.id : null, r.shop ? r.shop.name : '', title, body, link, important ? 1 : 0, at);
    if (!ins.changes) return { duplicate: true };
    const id = Number(ins.lastInsertRowid);
    let reached = 0;
    for (const s of r.shops) reached += qInsertNote.run(s.id, kind, title.slice(0, 160), body.slice(0, 2000), link.slice(0, 300), `ann:${id}:${s.id}`, at, id).changes;
    qSetReached.run(reached, id);
    return { id, reached, shopIds: r.shops.map((s) => s.id) };
  })();
  // Tell open shop tabs after the rows are committed (badge, banner and Alerts refresh live).
  for (const sid of result.shopIds || []) publish(`shop:${sid}`);
  return result;
}

/** Sent announcements, newest first, with how many shops have read each one. */
export const listAnnouncements = (limit = 50) =>
  db
    .prepare(
      `SELECT a.*,
              (SELECT COUNT(*) FROM notifications n WHERE n.announcement_id = a.id AND n.read_at IS NOT NULL) AS read_count,
              (SELECT COUNT(*) FROM notifications n WHERE n.announcement_id = a.id) AS live_count
         FROM announcements a ORDER BY a.id DESC LIMIT ?`
    )
    .all(limit);

/** Unread important announcements for a shop, newest first (the page banner). */
export const unreadImportant = (shopId) =>
  db
    .prepare(
      `SELECT n.* FROM notifications n JOIN announcements a ON a.id = n.announcement_id
        WHERE n.audience = 'shop' AND n.shop_id = ? AND n.read_at IS NULL AND a.important = 1
        ORDER BY n.id DESC LIMIT 5`
    )
    .all(shopId);

/** "Got it" / "Open" on the banner: marks that one notification read. Returns the row (or null). */
export function dismissNotification(shopId, notificationId) {
  const row = db.prepare("SELECT * FROM notifications WHERE id = ? AND audience = 'shop' AND shop_id = ?").get(Number(notificationId) || 0, shopId);
  if (!row) return null;
  if (!row.read_at) {
    db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL').run(now(), row.id);
    publish(`shop:${shopId}`);
  }
  return row;
}
