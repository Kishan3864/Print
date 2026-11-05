import { db, now } from '../db.js';

// Audit log: who changed what, when – plan / add-on / feature changes, payments, consent, deletes.
// actor: 'admin' | 'shop' | 'system' | 'payu' | 'customer'.

const qInsert = db.prepare('INSERT INTO audit_log (at, actor, shop_id, action, detail, ip) VALUES (?, ?, ?, ?, ?, ?)');

export function audit({ actor = 'system', shopId = null, action, detail = '', ip = '' }) {
  try {
    qInsert.run(now(), actor, shopId || null, String(action).slice(0, 60), String(detail).slice(0, 600), String(ip || '').slice(0, 64));
  } catch (err) {
    console.error('[audit] could not write:', err.message);
  }
}

/** Client IP for the log (Express resolves it through trust proxy). */
export const ipOf = (req) => (req && (req.ip || req.socket?.remoteAddress)) || '';

export const auditForShop = (shopId, limit = 40) =>
  db.prepare('SELECT * FROM audit_log WHERE shop_id = ? ORDER BY id DESC LIMIT ?').all(shopId, limit);

/** Admin log page: newest first, optional text / actor / shop filters. */
export function listAudit({ q = '', actor = '', shopId = null, limit = 100, offset = 0 } = {}) {
  const where = ['1 = 1'];
  const p = { limit, offset };
  if (actor) {
    where.push('a.actor = @actor');
    p.actor = actor;
  }
  if (shopId) {
    where.push('a.shop_id = @shopId');
    p.shopId = shopId;
  }
  if (q) {
    where.push("(a.action LIKE @q ESCAPE '\\' OR a.detail LIKE @q ESCAPE '\\' OR s.name LIKE @q ESCAPE '\\')");
    p.q = `%${String(q).replace(/[%_\\]/g, (c) => '\\' + c)}%`;
  }
  const sql = `FROM audit_log a LEFT JOIN shops s ON s.id = a.shop_id WHERE ${where.join(' AND ')}`;
  const rows = db.prepare(`SELECT a.*, s.name AS shop_name ${sql} ORDER BY a.id DESC LIMIT @limit OFFSET @offset`).all(p);
  const total = db.prepare(`SELECT COUNT(*) AS n ${sql}`).get(p).n;
  return { rows, total };
}
