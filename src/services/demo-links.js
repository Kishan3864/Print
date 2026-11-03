import { db, now } from '../db.js';
import { randomHex, randomToken, ymd } from '../lib/util.js';
import { createShop, getShopById } from './shops.js';
import { seedSampleOrders } from './demo.js';
import { publishShop } from '../lib/live.js';

// Admin-made demo links: one link = one person = one fresh demo shop with sample
// orders. Each link expires after N hours (default 24); the admin can extend it,
// expire it, or expire all links at once. An expired link stops working and its
// demo shop closes. Demo shops can never be paid for – testers register for real.

export const DEFAULT_HOURS = 24;

export const getDemoLink = (id) => db.prepare('SELECT * FROM demo_links WHERE id = ?').get(Number(id) || 0);
const byToken = (token) => db.prepare('SELECT * FROM demo_links WHERE token = ?').get(String(token || ''));

export function linkState(link) {
  if (link.revoked_at) return 'expired';
  if (Date.parse(link.expires_at) <= Date.now()) return 'expired';
  return link.opened_at ? 'active' : 'unused';
}

export function listDemoLinks() {
  return db
    .prepare('SELECT d.*, s.name AS shop_name, s.slug AS shop_slug, (SELECT COUNT(*) FROM orders o WHERE o.shop_id = d.shop_id) AS orders FROM demo_links d LEFT JOIN shops s ON s.id = d.shop_id ORDER BY d.id DESC LIMIT 300')
    .all()
    .map((l) => ({ ...l, state: linkState(l) }));
}

export function createDemoLink(label, hours = DEFAULT_HOURS) {
  const h = Math.min(24 * 90, Math.max(1, Math.round(Number(hours) || DEFAULT_HOURS)));
  const info = db
    .prepare('INSERT INTO demo_links (token, label, hours, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(randomToken(18), String(label).slice(0, 80), h, new Date(Date.now() + h * 3600000).toISOString(), now());
  return getDemoLink(info.lastInsertRowid);
}

/** Sets a link's end time (and its demo shop's), e.g. extend or expire now. */
function setExpiry(link, iso) {
  db.transaction(() => {
    db.prepare('UPDATE demo_links SET expires_at = ? WHERE id = ?').run(iso, link.id);
    if (link.shop_id) db.prepare('UPDATE shops SET demo_expires_at = ?, paid_until = ? WHERE id = ? AND is_demo = 1').run(iso, iso.slice(0, 10), link.shop_id);
  })();
  if (link.shop_id) publishShop(link.shop_id);
}

/** Adds hours counted from now (or from the current end if that is later). */
export function extendDemoLink(link, hours) {
  const h = Math.min(24 * 90, Math.max(1, Math.round(Number(hours) || DEFAULT_HOURS)));
  const base = Math.max(Date.now(), Date.parse(link.expires_at));
  db.prepare('UPDATE demo_links SET revoked_at = NULL WHERE id = ?').run(link.id);
  setExpiry(link, new Date(base + h * 3600000).toISOString());
}

export function expireDemoLink(link) {
  db.prepare('UPDATE demo_links SET revoked_at = ? WHERE id = ?').run(now(), link.id);
  setExpiry(link, now());
}

/** Expires every link that is still running. Returns how many. */
export function expireAllDemoLinks() {
  const open = listDemoLinks().filter((l) => l.state !== 'expired');
  open.forEach(expireDemoLink);
  return open.length;
}

/**
 * Opens a demo link: returns its demo shop (created fresh with sample orders on
 * first use), or null when the link is unknown or expired.
 */
export function openDemoLink(token) {
  const link = byToken(token);
  if (!link || linkState(link) === 'expired') return null;
  if (link.shop_id) {
    const shop = getShopById(link.shop_id);
    if (shop) return shop;
  }
  const tag = randomHex(3);
  const shop = createShop({
    slug: `demo-${tag}${randomHex(2)}`,
    name: 'Your Print Shop',
    owner_name: link.label || 'Demo user',
    mobile: '',
    email: `demo-${link.id}-${tag}@printdesk.invalid`,
    city: 'Your City',
    password: randomToken(24),
    demo: true,
  });
  db.prepare('UPDATE shops SET demo_expires_at = ?, paid_until = ? WHERE id = ?').run(link.expires_at, link.expires_at.slice(0, 10) < ymd() ? ymd() : link.expires_at.slice(0, 10), shop.id);
  db.prepare('UPDATE demo_links SET shop_id = ?, opened_at = ? WHERE id = ?').run(shop.id, now(), link.id);
  seedSampleOrders(getShopById(shop.id));
  return getShopById(shop.id);
}

