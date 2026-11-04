import { Router } from 'express';
import { html } from '../lib/html.js';
import { db, now } from '../db.js';
import { actionLimiter, safeNext } from '../lib/security.js';
import { clean, cleanLine, flash } from '../lib/util.js';
import { isSampleShop } from '../services/billing.js';
import {
  TICKET_CATEGORIES,
  createTicket,
  getShopTicket,
  listShopTickets,
  markTicketReadByShop,
  replyToTicket,
  setTicketStatus,
  shopUnreadTickets,
  ticketMessages,
} from '../services/support.js';
import { listShopNotifications, markShopRead, unreadShopCount } from '../services/notifications.js';
import { messagePage, render } from '../views/layout.js';
import { LIMITS, notificationsView, supportView, ticketView } from '../views/shop-support/support.js';

// Shop area: Help & support tickets and notifications.
// Mounted under the /shop gate (req.shop is set; open even when the plan is pending/expired).

const router = Router();

const ID = ':id(\\d{1,10})';
const SAMPLE_MSG = 'Writing to us is off in the shared sample shop. Create your free demo shop to try it.';

// Reading a ticket also clears the bell notifications that point to it.
const qReadTicketNotes = db.prepare("UPDATE notifications SET read_at = ? WHERE audience = 'shop' AND shop_id = ? AND link = ? AND read_at IS NULL");

/** Multi-line text: normalised newlines, at most one empty line in a row. Returns '' or the text (may exceed max – caller checks). */
const multiline = (value, max) =>
  clean(value, max + 1)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

function readTicket(body) {
  const category = TICKET_CATEGORIES.some((c) => c.key === body.category) ? body.category : 'general';
  const values = { category, subject: cleanLine(body.subject, LIMITS.subjectMax + 1), message: multiline(body.message, LIMITS.messageMax) };
  const errors = {};
  if (values.subject.length < LIMITS.subjectMin) errors.subject = 'Write a short subject (at least 3 characters).';
  else if (values.subject.length > LIMITS.subjectMax) errors.subject = `Keep the subject to ${LIMITS.subjectMax} characters or fewer.`;
  if (values.message.length < LIMITS.messageMin) errors.message = 'Tell us a little more (at least 10 characters).';
  else if (values.message.length > LIMITS.messageMax) errors.message = `Keep the message to ${LIMITS.messageMax} characters or fewer.`;
  return { values, errors };
}

function readReply(body) {
  const text = multiline(body.body, LIMITS.replyMax);
  if (!text) return { text, error: 'Write a message first.' };
  if (text.length > LIMITS.replyMax) return { text, error: `Keep the reply to ${LIMITS.replyMax} characters or fewer.` };
  return { text, error: '' };
}

function notFound(res) {
  messagePage(res, {
    status: 404,
    title: 'Question not found',
    text: 'This question does not exist or belongs to another account.',
    variant: 'shop',
    iconName: 'search',
    action: html`<a class="btn btn-primary" href="/shop/support">Back to Help</a>`,
  });
}

/** Ticket of the logged-in shop only (tenant isolation). */
function loadTicket(req, res, next) {
  const ticket = getShopTicket(req.shop.id, req.params.id);
  if (!ticket) return notFound(res);
  req.ticket = ticket;
  next();
}

function sampleBlocked(req, res, next) {
  if (!isSampleShop(req.shop)) return next();
  flash(req, 'info', SAMPLE_MSG);
  res.redirect(303, '/shop/support');
}

function showSupport(req, res, { values, errors = {}, status = 200, formFirst } = {}) {
  const sample = isSampleShop(req.shop);
  const tickets = sample ? [] : listShopTickets(req.shop.id);
  const vals = values || { category: '', subject: '', message: '' };
  render(res, supportView(res, { shop: req.shop, tickets, values: vals, errors, sample, formFirst: formFirst ?? (!tickets.length || Boolean(vals.category)) }), status);
}

function showTicket(req, res, { reply = '', error = '', status = 200 } = {}) {
  const ticket = req.ticket;
  if (ticket.shop_unread) {
    markTicketReadByShop(ticket);
    res.locals.ticketsUnread = shopUnreadTickets(req.shop.id);
  }
  if (qReadTicketNotes.run(now(), req.shop.id, `/shop/support/${ticket.id}`).changes) res.locals.shopUnread = unreadShopCount(req.shop.id);
  render(res, ticketView(res, { shop: req.shop, ticket, messages: ticketMessages(ticket.id), reply, error, sample: isSampleShop(req.shop) }), status);
}

// ---------- help & support ----------
router.get('/support', (req, res) => {
  const pre = typeof req.query.new === 'string' && TICKET_CATEGORIES.some((c) => c.key === req.query.new) ? req.query.new : '';
  showSupport(req, res, { values: { category: pre, subject: '', message: '' } });
});

router.post('/support', actionLimiter, sampleBlocked, (req, res) => {
  const { values, errors } = readTicket(req.body);
  if (Object.keys(errors).length) return showSupport(req, res, { values, errors, status: 400, formFirst: true });
  // A double tap or a resubmitted form within a minute opens the ticket that was just created.
  const recent = listShopTickets(req.shop.id).find((t) => t.subject === values.subject && Date.now() - Date.parse(t.created_at) < 60_000);
  const ticket = recent || createTicket(req.shop, values);
  flash(req, 'success', 'Message sent. Our reply will show here and in Alerts.');
  res.redirect(303, `/shop/support/${ticket.id}`);
});

router.get(`/support/${ID}`, loadTicket, (req, res) => showTicket(req, res));

router.post(`/support/${ID}/reply`, actionLimiter, sampleBlocked, loadTicket, (req, res) => {
  const { text, error } = readReply(req.body);
  if (error) return showTicket(req, res, { reply: text.slice(0, LIMITS.replyMax), error, status: 400 });
  const reopened = req.ticket.status === 'closed';
  replyToTicket(req.ticket, 'shop', text);
  flash(req, 'success', reopened ? 'Opened again – your message was sent.' : 'Reply sent.');
  res.redirect(303, `/shop/support/${req.ticket.id}#latest`);
});

router.post(`/support/${ID}/close`, actionLimiter, sampleBlocked, loadTicket, (req, res) => {
  if (req.ticket.status !== 'closed') setTicketStatus(req.ticket, 'closed');
  flash(req, 'success', 'Marked as solved. Thank you! Write here any time to open it again.');
  res.redirect(303, `/shop/support/${req.ticket.id}`);
});

// ---------- notifications ----------
router.get('/notifications', (req, res) => {
  const items = listShopNotifications(req.shop.id, 60);
  const unread = items.filter((n) => !n.read_at).length;
  // New rows are highlighted on this view, then count as read (the bell clears now).
  res.locals.shopUnread = 0;
  render(res, notificationsView(res, { items, unread }));
  markShopRead(req.shop.id);
});

router.post('/notifications/read', (req, res) => {
  markShopRead(req.shop.id);
  const next = safeNext(req.body.next, '/shop/notifications');
  res.redirect(303, /^\/shop(?:[/?#]|$)/.test(next) ? next : '/shop/notifications');
});

export default router;
