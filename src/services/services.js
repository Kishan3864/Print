import { db, meta, now } from '../db.js';
import { publishShop } from '../lib/live.js';
import { notifyAdmin, notifyShop } from './notifications.js';
import { createTicket, replyToTicket, getTicket } from './support.js';
import { audit } from './audit.js';
import { createPayment, getPayment } from './billing.js'; // call time only (billing.js imports this file)

// Paid services from Brighton Solution, so custom wishes stay fair and manageable:
//   setup   – we set the shop up for them (fixed price)
//   review  – a shop asks for a change; a small fee to study it, then we reply with a quote
//             (the fee is taken off the quote if they go ahead)
//   custom  – the quoted work itself (paid after the shop accepts the quote)
// Every request has a conversation (a support ticket) and a status the admin moves along.

export const SERVICE_DEFS = [
  {
    key: 'setup',
    name: 'Setup by our team',
    blurb: 'We set up your shop for you: logo and colour, sizes and papers, your rate list, and a print-ready counter poster.',
    price: 499,
    ask: 'Anything we should know? (logo file, your rates, timings…)',
  },
  {
    key: 'review',
    name: 'Request a change or new feature',
    blurb: 'Tell us what you want changed or added. We study it and reply with yes/no, the time and the price. The review fee is taken off the price if you go ahead.',
    price: 299,
    ask: 'Describe the change: what should happen, where, and why it helps your shop.',
  },
];
export const REQUEST_STATUS = {
  awaiting_payment: 'Waiting for payment',
  open: 'With our team',
  quoted: 'Quote sent',
  in_progress: 'In progress',
  done: 'Done',
  declined: 'Not possible',
  cancelled: 'Cancelled',
};

/** Services with the admin's prices (meta 'services'), plus the custom-work note shown to shops. */
export function getServices() {
  let saved = {};
  try {
    saved = JSON.parse(meta.get('services') || '{}') || {};
  } catch {
    /* defaults */
  }
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : d);
  return SERVICE_DEFS.map((s) => ({ ...s, price: num(saved[s.key]?.price, s.price), active: saved[s.key]?.active === undefined ? true : Boolean(saved[s.key].active) }));
}
export const getService = (key) => getServices().find((s) => s.key === key) || null;
export function customRates() {
  let saved = {};
  try {
    saved = JSON.parse(meta.get('services') || '{}') || {};
  } catch {
    /* defaults */
  }
  return { min: Number(saved._custom?.min) || 3000, hourly: Number(saved._custom?.hourly) || 1000 };
}
export function saveServices(list, custom) {
  const out = Object.fromEntries(list.map((s) => [s.key, { price: s.price, active: s.active }]));
  out._custom = custom;
  meta.set('services', JSON.stringify(out));
}

// ---------- requests ----------
export const getRequest = (id) => db.prepare('SELECT * FROM service_requests WHERE id = ?').get(Number(id) || 0);
export const getShopRequest = (shopId, id) => db.prepare('SELECT * FROM service_requests WHERE id = ? AND shop_id = ?').get(Number(id) || 0, shopId);
export const listShopRequests = (shopId) => db.prepare('SELECT * FROM service_requests WHERE shop_id = ? ORDER BY id DESC').all(shopId);
export function listRequests({ status = '' } = {}) {
  return db
    .prepare(
      `SELECT r.*, s.name AS shop_name FROM service_requests r JOIN shops s ON s.id = r.shop_id
       WHERE (? = '' OR r.status = ?) ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'quoted' THEN 2 WHEN 'awaiting_payment' THEN 3 ELSE 4 END, r.updated_at DESC`
    )
    .all(status, status);
}
export const openRequestCount = () => db.prepare("SELECT COUNT(*) AS n FROM service_requests WHERE status IN ('open','in_progress')").get().n;

export function createRequest(shop, { service, title, details }, { actor = 'shop', ip = '' } = {}) {
  const def = getService(service);
  if (!def || !def.active) throw new Error('This service is not available right now.');
  const at = now();
  const info = db
    .prepare('INSERT INTO service_requests (shop_id, service, title, details, status, fee_paise, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(shop.id, service, title, details, def.price > 0 ? 'awaiting_payment' : 'open', def.price * 100, at, at);
  const req = getRequest(info.lastInsertRowid);
  audit({ actor, shopId: shop.id, action: 'service.request', detail: `${def.name}: ${title}`, ip });
  if (req.status === 'open') openConversation(shop, req);
  publishShop(shop.id);
  return getRequest(req.id);
}

/** The ticket that carries the conversation for a request (created once the request is with the team). */
function openConversation(shop, req) {
  if (req.ticket_id) return;
  const def = getService(req.service);
  const ticket = createTicket(shop, { subject: `[${def?.name || 'Service'}] ${req.title}`, category: 'feature', message: req.details || req.title });
  db.prepare('UPDATE service_requests SET ticket_id = ? WHERE id = ?').run(ticket.id, req.id);
}

/** Payment for a request: which = 'fee' (setup / review) or 'quote' (the accepted price, minus a paid review fee). */
export function startServicePayment(shop, req, which, { method = 'payu' } = {}) {
  const def = getService(req.service);
  if (which === 'fee') {
    if (req.status !== 'awaiting_payment') throw new Error('This request is already paid.');
    return createPayment(shop, { product: 'service', item: `${req.service}:fee`, cycle: 'once', amountPaise: req.fee_paise, method, refId: req.id, title: `${def?.name || 'Service'} – ${req.title}` });
  }
  if (req.status !== 'quoted' || !req.quote_paise) throw new Error('There is no quote to pay yet.');
  const due = Math.max(100, req.quote_paise - (req.service === 'review' ? req.fee_paise : 0));
  return createPayment(shop, { product: 'service', item: `${req.service}:quote`, cycle: 'once', amountPaise: due, method, refId: req.id, title: `Custom work – ${req.title}` });
}

/** Called from markPaid (inside its transaction). */
export function onServicePaid(payment) {
  const req = getRequest(payment.ref_id);
  if (!req) return;
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.shop_id);
  const which = String(payment.item).split(':')[1];
  const status = which === 'quote' ? 'in_progress' : 'open';
  db.prepare('UPDATE service_requests SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), req.id);
  if (which !== 'quote') openConversation(shop, getRequest(req.id));
  const fresh = getRequest(req.id);
  if (fresh.ticket_id && getTicket(fresh.ticket_id)) {
    replyToTicket(getTicket(fresh.ticket_id), 'shop', which === 'quote' ? `Paid ₹${(payment.amount_paise / 100).toLocaleString('en-IN')} – quote accepted. Please go ahead.` : `Paid ₹${(payment.amount_paise / 100).toLocaleString('en-IN')} for “${req.title}”.`);
  }
  notifyAdmin({ kind: 'payment', title: `${shop?.name || 'A shop'} paid for a service`, body: `${req.title} · ${which === 'quote' ? 'quote accepted – start work' : 'review / setup fee'}`, link: `/admin/services/${req.id}` });
}

export function setQuote(req, { amountPaise, note }, { ip = '' } = {}) {
  db.prepare("UPDATE service_requests SET status = 'quoted', quote_paise = ?, quote_note = ?, updated_at = ? WHERE id = ?").run(amountPaise, note, now(), req.id);
  audit({ actor: 'admin', shopId: req.shop_id, action: 'service.quote', detail: `${req.title}: ₹${amountPaise / 100}${note ? ` · ${note}` : ''}`, ip });
  notifyShop(req.shop_id, { kind: 'info', title: `Quote ₹${(amountPaise / 100).toLocaleString('en-IN')} for your request`, body: req.title, link: `/shop/services/${req.id}` });
  if (req.ticket_id && getTicket(req.ticket_id)) replyToTicket(getTicket(req.ticket_id), 'admin', `Quote: ₹${(amountPaise / 100).toLocaleString('en-IN')}${note ? `\n${note}` : ''}\nOpen the request to accept and pay.`);
  publishShop(req.shop_id);
}

export function setRequestStatus(req, status, { actor = 'admin', note = '', ip = '' } = {}) {
  if (!REQUEST_STATUS[status]) throw new Error('Unknown status.');
  db.prepare('UPDATE service_requests SET status = ?, admin_note = CASE WHEN ? <> \'\' THEN ? ELSE admin_note END, updated_at = ? WHERE id = ?').run(status, note, note, now(), req.id);
  audit({ actor, shopId: req.shop_id, action: 'service.status', detail: `${req.title}: ${REQUEST_STATUS[status]}${note ? ` · ${note}` : ''}`, ip });
  if (actor === 'admin') notifyShop(req.shop_id, { kind: status === 'done' ? 'success' : 'info', title: `Your request: ${REQUEST_STATUS[status]}`, body: req.title, link: `/shop/services/${req.id}` });
  publishShop(req.shop_id);
}

export const requestPayments = (req) => db.prepare("SELECT * FROM payments WHERE product = 'service' AND ref_id = ? ORDER BY id DESC").all(req.id);
export { getPayment };
