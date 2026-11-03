import { db, now } from '../db.js';
import { randomToken } from '../lib/util.js';
import { canTransition, PROOF_ALLOWED, STATUS_LABEL, TABS } from '../lib/status.js';
import { removeStoredFile } from '../lib/uploads.js';
import { emailCustomer, emailShopNewOrder } from './notify.js';

// Every query here is scoped by shop_id (tenant isolation) or by the
// customer's unguessable token.

export const getOrderByNo = (shopId, orderNo) =>
  db.prepare('SELECT * FROM orders WHERE shop_id = ? AND order_no = ?').get(shopId, Number(orderNo) || 0);

export const getOrderByToken = (shopId, token) =>
  db.prepare('SELECT * FROM orders WHERE shop_id = ? AND token = ?').get(shopId, String(token || ''));

export const getOrderById = (shopId, id) => db.prepare('SELECT * FROM orders WHERE shop_id = ? AND id = ?').get(shopId, id);

/** Files of one order (both kinds, newest proof last). Includes deleted ones (deleted_at set). */
export const orderFiles = (order) =>
  db.prepare('SELECT * FROM files WHERE order_id = ? AND shop_id = ? ORDER BY id').all(order.id, order.shop_id);

export const getOrderFile = (order, fileId) =>
  db.prepare('SELECT * FROM files WHERE id = ? AND order_id = ? AND shop_id = ?').get(Number(fileId) || 0, order.id, order.shop_id);

export const orderEvents = (order) => db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id').all(order.id);

/** Latest proof file row (or undefined). */
export const latestProof = (order) =>
  db.prepare("SELECT * FROM files WHERE order_id = ? AND shop_id = ? AND kind = 'proof' ORDER BY id DESC LIMIT 1").get(order.id, order.shop_id);

function addEvent(orderId, { actor, type, from = null, to = null, note = '', at = now() }) {
  db.prepare('INSERT INTO order_events (order_id, at, actor, type, from_status, to_status, note) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    orderId, at, actor, type, from, to, note
  );
}
export { addEvent };

/**
 * Creates an order with its uploaded files (multer file objects with
 * originalname/filename/size). Allocates the next per-shop order number.
 */
export const createOrder = (shop, data, files = [], { isSample = false, at } = {}) => {
  const created = at || now();
  const run = db.transaction(() => {
    const { order_no } = db.prepare('UPDATE shops SET next_order_no = next_order_no + 1 WHERE id = ? RETURNING next_order_no - 1 AS order_no').get(shop.id);
    const token = randomToken(24);
    const info = db
      .prepare(
        `INSERT INTO orders (shop_id, order_no, token, customer_name, customer_mobile, customer_email, size, quantity,
           color_mode, sides, notes, status, is_sample, created_at, updated_at)
         VALUES (@shop_id, @order_no, @token, @customer_name, @customer_mobile, @customer_email, @size, @quantity,
           @color_mode, @sides, @notes, 'new', @is_sample, @created, @created)`
      )
      .run({
        shop_id: shop.id,
        order_no,
        token,
        customer_name: data.customer_name,
        customer_mobile: data.customer_mobile,
        customer_email: data.customer_email || '',
        size: data.size || '',
        quantity: data.quantity || 1,
        color_mode: data.color_mode === 'bw' ? 'bw' : 'color',
        sides: data.sides === 'both' ? 'both' : 'single',
        notes: data.notes || '',
        is_sample: isSample ? 1 : 0,
        created,
      });
    const orderId = info.lastInsertRowid;
    const insFile = db.prepare(
      "INSERT INTO files (order_id, shop_id, kind, original_name, stored_name, size_bytes, created_at) VALUES (?, ?, 'customer', ?, ?, ?, ?)"
    );
    for (const f of files) insFile.run(orderId, shop.id, String(f.originalname).slice(0, 200), f.filename, f.size || 0, created);
    addEvent(orderId, { actor: 'customer', type: 'created', to: 'new', note: `${files.length} file${files.length === 1 ? '' : 's'} uploaded`, at: created });
    return getOrderById(shop.id, orderId);
  });
  const order = run();
  if (!isSample) {
    emailShopNewOrder(shop, order);
    emailCustomer(shop, order, 'received');
  }
  return order;
};

/**
 * Changes status if the transition is allowed. Returns the updated order or
 * throws Error with a friendly message.
 */
export function setStatus(shop, order, to, { actor = 'shop', note = '', notify = true } = {}) {
  if (!canTransition(order.status, to)) throw new Error(`Cannot change from “${STATUS_LABEL[order.status]}” to “${STATUS_LABEL[to] || to}”.`);
  db.transaction(() => {
    // Only from the status the caller saw: a concurrent change makes this a no-op.
    const info = db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND shop_id = ? AND status = ?').run(to, now(), order.id, shop.id, order.status);
    if (!info.changes) throw new Error('This order was just updated. Please check it and try again.');
    addEvent(order.id, { actor, type: 'status', from: order.status, to, note });
  })();
  const updated = getOrderById(shop.id, order.id);
  if (notify && to === 'ready') emailCustomer(shop, updated, 'ready');
  return updated;
}

/** Stores a proof file (multer file object), moves the order to proof_sent. */
export function addProof(shop, order, file, note = '') {
  if (!PROOF_ALLOWED.has(order.status)) throw new Error('A proof can only be sent before printing starts.');
  db.transaction(() => {
    db.prepare(
      "INSERT INTO files (order_id, shop_id, kind, original_name, stored_name, size_bytes, created_at) VALUES (?, ?, 'proof', ?, ?, ?, ?)"
    ).run(order.id, shop.id, String(file.originalname).slice(0, 200), file.filename, file.size || 0, now());
    db.prepare("UPDATE orders SET status = 'proof_sent', proof_note = ?, customer_note = '', updated_at = ? WHERE id = ? AND shop_id = ?").run(
      note,
      now(),
      order.id,
      shop.id
    );
    addEvent(order.id, { actor: 'shop', type: 'proof', from: order.status, to: 'proof_sent', note: note || `Proof uploaded: ${file.originalname}` });
  })();
  const updated = getOrderById(shop.id, order.id);
  emailCustomer(shop, updated, 'proof');
  return updated;
}

/** Customer approves the proof or asks for changes (only while status is proof_sent). */
export function customerDecision(shop, order, decision, note = '', proof = null) {
  if (order.status !== 'proof_sent') throw new Error('There is no proof waiting for your approval.');
  const to = decision === 'approve' ? 'approved' : 'changes_requested';
  db.transaction(() => {
    const info = db
      .prepare("UPDATE orders SET status = ?, customer_note = ?, updated_at = ? WHERE id = ? AND shop_id = ? AND status = 'proof_sent'")
      .run(to, to === 'changes_requested' ? note : '', now(), order.id, shop.id);
    if (!info.changes) throw new Error('There is no proof waiting for your approval.');
    // Record which proof file the decision was about.
    const about = proof ? `Proof: ${proof.original_name}` : '';
    addEvent(order.id, { actor: 'customer', type: 'status', from: order.status, to, note: [note, about].filter(Boolean).join('\n') });
  })();
  return getOrderById(shop.id, order.id);
}

/** Orders list for the dashboard. tab = TABS key, q = search text (name, mobile, order no). */
export function listOrders(shopId, { tab = 'active', q = '', limit = 50, offset = 0 } = {}) {
  const def = TABS.find((t) => t.key === tab) || TABS[0];
  const where = ['o.shop_id = @shopId'];
  const params = { shopId, limit, offset };
  if (def.statuses) {
    where.push(`o.status IN (${def.statuses.map((_, i) => `@s${i}`).join(', ')})`);
    def.statuses.forEach((s, i) => (params[`s${i}`] = s));
  }
  const needle = String(q || '').trim().replace(/^#/, '');
  if (needle) {
    const conds = ['o.customer_name LIKE @like', 'o.customer_mobile LIKE @like', 'CAST(o.order_no AS TEXT) LIKE @like', 'o.notes LIKE @like'].map((c) => `${c} ESCAPE '\\'`);
    params.like = '%' + needle.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    // Mobile numbers match on digits only, so "+91 98765 43210" finds "9876543210".
    const d = needle.replace(/\D/g, '');
    if (d.length >= 3) {
      conds.push("REPLACE(REPLACE(REPLACE(REPLACE(o.customer_mobile, ' ', ''), '-', ''), '+', ''), '.', '') LIKE @dlike");
      params.dlike = '%' + (d.length > 10 ? d.slice(-10) : d) + '%';
    }
    where.push(`(${conds.join(' OR ')})`);
  }
  const sqlWhere = where.join(' AND ');
  const rows = db
    .prepare(
      `SELECT o.*,
         (SELECT COUNT(*) FROM files f WHERE f.order_id = o.id AND f.kind = 'customer') AS file_count
       FROM orders o WHERE ${sqlWhere}
       ORDER BY CASE o.status WHEN 'new' THEN 0 WHEN 'changes_requested' THEN 1 ELSE 2 END, o.id DESC
       LIMIT @limit OFFSET @offset`
    )
    .all(params);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM orders o WHERE ${sqlWhere}`).get(params).n;
  return { rows, total, tab: def.key };
}

/** Count of orders per tab key, for tab badges. */
export function tabCounts(shopId) {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM orders WHERE shop_id = ? GROUP BY status').all(shopId);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  return Object.fromEntries(TABS.map((t) => [t.key, (t.statuses || Object.keys(by)).reduce((a, s) => a + (by[s] || 0), 0)]));
}

/** Orders created after `sinceId` (for the 30 s live alert poll). */
export const ordersSince = (shopId, sinceId) =>
  db
    .prepare('SELECT id, order_no, customer_name, size, quantity, created_at FROM orders WHERE shop_id = ? AND id > ? ORDER BY id DESC LIMIT 20')
    .all(shopId, Number(sinceId) || 0);

export const latestOrderId = (shopId) => db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM orders WHERE shop_id = ?').get(shopId).id;

/**
 * Deletes stored files older than each shop's retention_days and marks them
 * deleted. Returns number of files removed.
 */
export function purgeExpiredFiles() {
  const rows = db
    .prepare(
      `SELECT f.*, s.retention_days FROM files f JOIN shops s ON s.id = f.shop_id
       WHERE f.deleted_at IS NULL AND f.created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || s.retention_days || ' days')`
    )
    .all();
  const byOrder = new Map();
  const mark = db.prepare('UPDATE files SET deleted_at = ? WHERE id = ?');
  for (const f of rows) {
    try {
      removeStoredFile(f);
    } catch (err) {
      console.error('[retention] could not delete', f.stored_name, err.message);
      continue;
    }
    mark.run(now(), f.id);
    byOrder.set(f.order_id, { n: (byOrder.get(f.order_id)?.n || 0) + 1, days: f.retention_days });
  }
  for (const [orderId, { n, days }] of byOrder) {
    addEvent(orderId, { actor: 'system', type: 'files_deleted', note: `${n} file${n === 1 ? '' : 's'} auto-deleted after ${days} days` });
  }
  return rows.length;
}
