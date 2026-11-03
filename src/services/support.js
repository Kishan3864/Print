import { db, now } from '../db.js';
import { config } from '../config.js';
import { notifyAdmin, notifyShop } from './notifications.js';
import { sendMail } from './notify.js';
import { publishShop } from '../lib/live.js';

// Help & support tickets between a shop and Brighton Solution (super admin).

export const TICKET_CATEGORIES = [
  { key: 'general', label: 'General question' },
  { key: 'billing', label: 'Plan & payment' },
  { key: 'orders', label: 'Orders & files' },
  { key: 'technical', label: 'Something is not working' },
  { key: 'feature', label: 'Feature request' },
];
export const TICKET_STATUS_LABEL = { open: 'Open', answered: 'Answered', closed: 'Closed' };
export const categoryLabel = (key) => TICKET_CATEGORIES.find((c) => c.key === key)?.label || 'General question';

/** Opens a ticket with its first message. Returns the ticket. */
export function createTicket(shop, { subject, category, message }) {
  const at = now();
  const cat = TICKET_CATEGORIES.some((c) => c.key === category) ? category : 'general';
  const id = db.transaction(() => {
    const info = db
      .prepare(
        "INSERT INTO tickets (shop_id, subject, category, status, last_author, shop_unread, admin_unread, created_at, updated_at) VALUES (?, ?, ?, 'open', 'shop', 0, 1, ?, ?)"
      )
      .run(shop.id, subject, cat, at, at);
    db.prepare("INSERT INTO ticket_messages (ticket_id, author, body, created_at) VALUES (?, 'shop', ?, ?)").run(info.lastInsertRowid, message, at);
    return info.lastInsertRowid;
  })();
  notifyAdmin({ kind: 'support', title: `New ticket from ${shop.name}`, body: subject, link: `/admin/tickets/${id}` });
  if (config.adminEmail) {
    sendMail({ to: config.adminEmail, subject: `[Brighton Print support] ${shop.name}: ${subject}`, text: `${message}\n\nOpen: ${config.adminUrl}/tickets/${id}` });
  }
  publishShop(shop.id);
  return getTicket(id);
}

export const getTicket = (id) => db.prepare('SELECT * FROM tickets WHERE id = ?').get(Number(id) || 0);
/** Ticket only if it belongs to this shop (tenant isolation). */
export const getShopTicket = (shopId, id) => db.prepare('SELECT * FROM tickets WHERE id = ? AND shop_id = ?').get(Number(id) || 0, shopId);
export const ticketMessages = (ticketId) => db.prepare('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY id').all(ticketId);

export const listShopTickets = (shopId) => db.prepare('SELECT * FROM tickets WHERE shop_id = ? ORDER BY updated_at DESC').all(shopId);

/** All tickets for the admin inbox (status filter optional), newest activity first, with shop name. */
export function listAllTickets({ status = '' } = {}) {
  const rows = db
    .prepare(
      `SELECT t.*, s.name AS shop_name, s.slug AS shop_slug,
         (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count
       FROM tickets t JOIN shops s ON s.id = t.shop_id
       ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END, t.updated_at DESC`
    )
    .all();
  return status ? rows.filter((t) => t.status === status) : rows;
}

/** Adds a reply. author 'shop' re-opens the ticket; 'admin' marks it answered and notifies the shop. */
export function replyToTicket(ticket, author, body) {
  const at = now();
  const status = author === 'admin' ? 'answered' : 'open';
  db.transaction(() => {
    db.prepare('INSERT INTO ticket_messages (ticket_id, author, body, created_at) VALUES (?, ?, ?, ?)').run(ticket.id, author, body, at);
    db.prepare(
      `UPDATE tickets SET status = ?, last_author = ?, updated_at = ?,
         shop_unread = CASE WHEN ? = 'admin' THEN 1 ELSE shop_unread END,
         admin_unread = CASE WHEN ? = 'shop' THEN 1 ELSE admin_unread END
       WHERE id = ?`
    ).run(status, author, at, author, author, ticket.id);
  })();
  if (author === 'admin') {
    notifyShop(ticket.shop_id, { kind: 'support', title: 'Brighton Solution replied to your ticket', body: ticket.subject, link: `/shop/support/${ticket.id}` });
  } else {
    const shop = db.prepare('SELECT name FROM shops WHERE id = ?').get(ticket.shop_id);
    notifyAdmin({ kind: 'support', title: `New reply from ${shop?.name || 'a shop'}`, body: ticket.subject, link: `/admin/tickets/${ticket.id}` });
  }
  publishShop(ticket.shop_id);
  return getTicket(ticket.id);
}

export function setTicketStatus(ticket, status) {
  if (!TICKET_STATUS_LABEL[status]) return ticket;
  db.prepare('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), ticket.id);
  publishShop(ticket.shop_id);
  return getTicket(ticket.id);
}

export const markTicketReadByShop = (ticket) => db.prepare('UPDATE tickets SET shop_unread = 0 WHERE id = ?').run(ticket.id);
export const markTicketReadByAdmin = (ticket) => db.prepare('UPDATE tickets SET admin_unread = 0 WHERE id = ?').run(ticket.id);
export const shopUnreadTickets = (shopId) => db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE shop_id = ? AND shop_unread = 1').get(shopId).n;
export const adminOpenTickets = () => db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'").get().n;
