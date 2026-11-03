import { Router } from 'express';
import { html } from '../lib/html.js';
import { db } from '../db.js';
import { clean, cleanLine, flash, formatDate } from '../lib/util.js';
import { getShopById, shopState } from '../services/shops.js';
import { orderFormUrl } from '../services/notify.js';
import { CYCLES, daysLeft, getPlan } from '../services/billing.js';
import { getTicket, listAllTickets, listShopTickets, markTicketReadByAdmin, replyToTicket, setTicketStatus, ticketMessages, TICKET_STATUS_LABEL } from '../services/support.js';
import { broadcastToShops, listAdminNotifications, markAdminRead, notifyShop, unreadAdminCount } from '../services/notifications.js';
import { messagePage, render } from '../views/layout.js';
import { INBOX_FILTERS, REPLY_MAX, adminTicketView, inboxView } from '../views/admin-support/tickets.js';
import { adminNotificationsView } from '../views/admin-support/notifications.js';
import { NOTIFY_LIMITS } from '../views/admin-support/forms.js';

// Super admin: support inbox, ticket replies, notifications and announcements.
// Mounted at /admin behind requireAdmin. Links are written as /admin/… (works on the admin host too).

const router = Router();

const ID = ':id(\\d{1,10})';
const SHOP_LINK = /^\/shop(?:\/[a-z0-9\-/]*)?$/;

// Same audience as broadcastToShops(): live (non-demo) shops that are active or paused.
const qRecipients = db.prepare("SELECT COUNT(*) AS n FROM shops WHERE is_demo = 0 AND status IN ('active','paused')");
// Opening a ticket also clears the admin bell rows that point to it.
const qReadTicketNotes = db.prepare("UPDATE notifications SET read_at = ? WHERE audience = 'admin' AND link = ? AND read_at IS NULL");

const multiline = (value, max) =>
  clean(value, max + 1)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

function notFound(res) {
  messagePage(res, {
    status: 404,
    title: 'Ticket not found',
    text: 'This ticket does not exist or was removed with its shop.',
    variant: 'admin',
    iconName: 'search',
    action: html`<a class="btn btn-primary" href="/admin/tickets">Back to tickets</a>`,
  });
}

function loadTicket(req, res, next) {
  const ticket = getTicket(req.params.id);
  const shop = ticket && getShopById(ticket.shop_id);
  if (!ticket || !shop) return notFound(res);
  req.ticket = ticket;
  req.ticketShop = shop;
  next();
}

function planInfo(shop) {
  if (shop.is_demo) return { planText: 'Demo shop', paidText: shop.paid_until ? `Demo until ${formatDate(shop.paid_until)}` : 'Shared sample – never ends' };
  const plan = getPlan(shop.plan);
  const planText = plan ? `${plan.name}${shop.billing_cycle && CYCLES[shop.billing_cycle] ? ` · ${CYCLES[shop.billing_cycle]}` : ''}` : 'No plan yet';
  if (!shop.paid_until) return { planText, paidText: 'Not paid yet' };
  const left = daysLeft(shop);
  const note = left < 0 ? `ended ${-left} day${left === -1 ? '' : 's'} ago` : left === 0 ? 'ends today' : `${left} day${left === 1 ? '' : 's'} left`;
  return { planText, paidText: `${formatDate(shop.paid_until)} (${note})` };
}

function showTicket(req, res, { reply = '', error = '', status = 200 } = {}) {
  const { ticket, ticketShop: shop } = req;
  if (ticket.admin_unread) markTicketReadByAdmin(ticket);
  if (qReadTicketNotes.run(new Date().toISOString(), `/admin/tickets/${ticket.id}`).changes) res.locals.adminUnread = unreadAdminCount();
  const others = listShopTickets(shop.id).filter((t) => t.id !== ticket.id);
  render(
    res,
    adminTicketView(res, {
      ticket,
      shop,
      messages: ticketMessages(ticket.id),
      state: shopState(shop),
      ...planInfo(shop),
      orderUrl: orderFormUrl(shop),
      others,
      reply,
      error,
    }),
    status
  );
}

// ---------- inbox ----------
router.get('/tickets', (req, res) => {
  const filter = INBOX_FILTERS.some((f) => f.key === req.query.status) ? req.query.status : 'open';
  const all = listAllTickets();
  const counts = { all: all.length, open: 0, answered: 0, closed: 0, unread: 0 };
  for (const t of all) {
    counts[t.status]++;
    if (t.admin_unread) counts.unread++;
  }
  const tickets = filter === 'all' ? all : all.filter((t) => t.status === filter);
  render(res, inboxView(res, { tickets, filter, counts }));
});

router.get(`/tickets/${ID}`, loadTicket, (req, res) => showTicket(req, res));

router.post(`/tickets/${ID}/reply`, loadTicket, (req, res) => {
  const text = multiline(req.body.body, REPLY_MAX);
  const error = !text ? 'Write a reply first.' : text.length > REPLY_MAX ? `Keep the reply to ${REPLY_MAX} characters or fewer.` : '';
  if (error) return showTicket(req, res, { reply: text.slice(0, REPLY_MAX), error, status: 400 });
  const updated = replyToTicket(req.ticket, 'admin', text);
  if (req.body.then === 'close') setTicketStatus(updated, 'closed');
  flash(req, 'success', `Reply sent${req.body.then === 'close' ? ' and ticket closed' : ''}. ${req.ticketShop.name} gets a notification.`);
  res.redirect(303, `/admin/tickets/${req.ticket.id}#latest`);
});

router.post(`/tickets/${ID}/status`, loadTicket, (req, res) => {
  const status = typeof req.body.status === 'string' && Object.hasOwn(TICKET_STATUS_LABEL, req.body.status) ? req.body.status : '';
  if (!status) {
    flash(req, 'error', 'Choose a valid status.');
  } else if (status !== req.ticket.status) {
    setTicketStatus(req.ticket, status);
    flash(req, 'success', `Ticket marked as ${TICKET_STATUS_LABEL[status].toLowerCase()}.`);
  }
  res.redirect(303, `/admin/tickets/${req.ticket.id}`);
});

// ---------- notifications ----------
router.get('/notifications', (req, res) => {
  const items = listAdminNotifications(100);
  const unread = items.filter((n) => !n.read_at).length;
  // New rows are highlighted on this view, then count as read (the bell clears now).
  res.locals.adminUnread = 0;
  render(res, adminNotificationsView(res, { items, unread, recipients: qRecipients.get().n }));
  markAdminRead();
});

router.post('/notifications/read', (req, res) => {
  markAdminRead();
  res.redirect(303, '/admin/notifications');
});

// ---------- send a notification: one shop or every live shop ----------
router.post('/notify', (req, res) => {
  const target = typeof req.body.shop_id === 'string' ? req.body.shop_id.trim() : '';
  const shop = target !== 'all' && /^\d{1,10}$/.test(target) ? getShopById(Number(target)) : null;
  if (target !== 'all' && !shop) {
    flash(req, 'error', 'That shop was not found. Nothing was sent.');
    return res.redirect(303, '/admin/notifications');
  }
  const back = shop ? `/admin/shops/${shop.id}` : '/admin/notifications';

  const title = cleanLine(req.body.title, NOTIFY_LIMITS.titleMax + 1);
  const body = multiline(req.body.body, NOTIFY_LIMITS.bodyMax);
  const link = cleanLine(req.body.link, 200);
  let error = '';
  if (title.length < NOTIFY_LIMITS.titleMin) error = 'Write a title (at least 3 characters).';
  else if (title.length > NOTIFY_LIMITS.titleMax) error = `Keep the title to ${NOTIFY_LIMITS.titleMax} characters or fewer.`;
  else if (body.length > NOTIFY_LIMITS.bodyMax) error = `Keep the message to ${NOTIFY_LIMITS.bodyMax} characters or fewer.`;
  else if (link && (!SHOP_LINK.test(link) || link.includes('//'))) error = 'The link must be a page in the shop area (starting with /shop).';
  if (error) {
    flash(req, 'error', `${error} Nothing was sent.`);
    return res.redirect(303, back);
  }

  const kind = req.body.important === '1' ? 'warn' : 'announcement';
  const sent = shop ? (notifyShop(shop.id, { kind, title, body, link }), 1) : broadcastToShops({ kind, title, body, link });
  if (sent) flash(req, 'success', `Sent to ${sent} shop${sent === 1 ? '' : 's'}.`);
  else flash(req, 'info', 'There are no live shops yet, so nothing was sent.');
  res.redirect(303, back);
});

export default router;
