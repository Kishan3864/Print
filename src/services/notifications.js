import { db, now } from '../db.js';
import { publish } from '../lib/live.js';

// In-app notifications. audience 'shop' rows belong to one shop; 'admin' rows
// are for the super admin. dedupe_key makes repeated jobs (reminders) idempotent.

function insert({ audience, shopId = null, kind = 'info', title, body = '', link = '', dedupe = null }) {
  const info = db
    .prepare(
      `INSERT INTO notifications (audience, shop_id, kind, title, body, link, dedupe_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(dedupe_key) DO NOTHING`
    )
    .run(audience, shopId, kind, String(title).slice(0, 160), String(body).slice(0, 2000), String(link).slice(0, 300), dedupe, now());
  if (info.changes) publish(audience === 'admin' ? 'admin' : `shop:${shopId}`);
  return info.changes > 0;
}

/** kind: 'info' | 'success' | 'warn' | 'payment' | 'support' | 'announcement' */
export const notifyShop = (shopId, n) => insert({ ...n, audience: 'shop', shopId });
export const notifyAdmin = (n) => insert({ ...n, audience: 'admin' });

// Messages from the admin to many shops at once: services/announcements.js.

export const listShopNotifications = (shopId, limit = 50) =>
  db.prepare("SELECT * FROM notifications WHERE audience = 'shop' AND shop_id = ? ORDER BY id DESC LIMIT ?").all(shopId, limit);
export const unreadShopCount = (shopId) =>
  db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE audience = 'shop' AND shop_id = ? AND read_at IS NULL").get(shopId).n;
export const markShopRead = (shopId) =>
  db.prepare("UPDATE notifications SET read_at = ? WHERE audience = 'shop' AND shop_id = ? AND read_at IS NULL").run(now(), shopId);

export const listAdminNotifications = (limit = 100) =>
  db.prepare("SELECT * FROM notifications WHERE audience = 'admin' ORDER BY id DESC LIMIT ?").all(limit);
export const unreadAdminCount = () => db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE audience = 'admin' AND read_at IS NULL").get().n;
export const markAdminRead = () => db.prepare("UPDATE notifications SET read_at = ? WHERE audience = 'admin' AND read_at IS NULL").run(now());
