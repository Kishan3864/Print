import { Router } from 'express';
import { html } from '../lib/html.js';
import { db } from '../db.js';
import { clean, cleanLine, flash, formatDate } from '../lib/util.js';
import { getShopById, shopState } from '../services/shops.js';
import { orderFormUrl } from '../services/notify.js';
import { CYCLES, daysLeft, getPlan } from '../services/billing.js';
import { getTicket, listAllTickets, listShopTickets, markTicketReadByAdmin, replyToTicket, setTicketStatus, ticketMessages, TICKET_STATUS_LABEL } from '../services/support.js';
import { listAdminNotifications, markAdminRead, unreadAdminCount } from '../services/notifications.js';
import { AUDIENCES, audienceCounts, listAnnouncements, pickableShops, resolveRecipients, sendAnnouncement } from '../services/announcements.js';
import { messagePage, render } from '../views/layout.js';
import { INBOX_FILTERS, REPLY_MAX, adminTicketView, inboxView } from '../views/admin-support/tickets.js';
import { adminNotificationsView } from '../views/admin-support/notifications.js';
import { announcementPreviewView, announcementsView } from '../views/admin-support/announcements.js';
import { NOTIFY_LIMITS, newNonce } from '../views/admin-support/forms.js';

// Super admin: support inbox, ticket replies, notifications and announcements.
// Mounted at /admin behind requireAdmin. Links are written as /admin/… (works on the admin host too).

const router = Router();

const ID = ':id(\\d{1,10})';
const SHOP_LINK = /^\/shop(?:\/[a-z0-9\-/]*)?$/;

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
  const last = listAnnouncements(1)[0] || null;
  render(res, adminNotificationsView(res, { items, unread, reachAll: audienceCounts().all, last }));
  markAdminRead();
});

router.post('/notifications/read', (req, res) => {
  markAdminRead();
  res.redirect(303, '/admin/notifications');
});

// ---------- announcements: write → preview → send ----------
const NONCE = /^[a-f0-9]{16,64}$/;

/** Reads and checks the compose fields. Returns { values, errors } (errors keyed by field). */
function readAnnouncement(body) {
  const values = {
    audience: AUDIENCES.some((a) => a.key === body.audience) ? body.audience : '',
    shop_id: /^\d{1,10}$/.test(String(body.shop_id || '').trim()) ? String(body.shop_id).trim() : '',
    title: cleanLine(body.title, NOTIFY_LIMITS.titleMax + 1),
    body: multiline(body.body, NOTIFY_LIMITS.bodyMax),
    link: cleanLine(body.link, 200),
    important: body.important === '1' ? '1' : '',
    nonce: NONCE.test(String(body.nonce || '')) ? String(body.nonce) : newNonce(),
  };
  const errors = {};
  if (!values.audience) errors.audience = 'Choose who gets it.';
  else if (values.audience === 'shop' && !values.shop_id) errors.shop_id = 'Pick the shop.';
  if (values.title.length < NOTIFY_LIMITS.titleMin) errors.title = 'Write a title (at least 3 characters).';
  else if (values.title.length > NOTIFY_LIMITS.titleMax) errors.title = `Keep the title to ${NOTIFY_LIMITS.titleMax} characters or fewer.`;
  if (values.body.length > NOTIFY_LIMITS.bodyMax) errors.body = `Keep the message to ${NOTIFY_LIMITS.bodyMax} characters or fewer.`;
  if (values.link && (!SHOP_LINK.test(values.link) || values.link.includes('//'))) errors.link = 'The button must open a page in the shop app.';
  return { values, errors };
}

function renderCompose(res, { values, errors = {}, status = 200 }) {
  render(res, announcementsView(res, { values, errors, counts: audienceCounts(), shops: pickableShops(), history: listAnnouncements(50) }), status);
}

const blankAnnouncement = () => ({ audience: 'all', shop_id: '', title: '', body: '', link: '', important: '', nonce: newNonce() });

router.get('/announcements', (req, res) => {
  const values = blankAnnouncement();
  // ?shop=12 (from a shop page) starts a message to that one shop.
  if (/^\d{1,10}$/.test(String(req.query.shop || ''))) Object.assign(values, { audience: 'shop', shop_id: String(req.query.shop) });
  renderCompose(res, { values });
});

router.post('/announcements/edit', (req, res) => renderCompose(res, { values: readAnnouncement(req.body).values }));

router.post('/announcements/preview', (req, res) => {
  const { values, errors } = readAnnouncement(req.body);
  if (Object.keys(errors).length) return renderCompose(res, { values, errors, status: 422 });
  const r = resolveRecipients(values.audience, values.shop_id);
  if (r.error) return renderCompose(res, { values, errors: { shop_id: r.error }, status: 422 });
  render(res, announcementPreviewView(res, { values, recipients: r.shops, label: r.label }));
});

router.post('/announcements/send', (req, res) => {
  const { values, errors } = readAnnouncement(req.body);
  if (Object.keys(errors).length) return renderCompose(res, { values, errors, status: 422 });
  const out = sendAnnouncement({ ...values, shopId: values.shop_id, important: values.important === '1' });
  if (out.error) return renderCompose(res, { values, errors: { [values.audience === 'shop' ? 'shop_id' : 'audience']: out.error }, status: 422 });
  if (out.duplicate) flash(req, 'info', 'This announcement was already sent – it was not sent twice.');
  else flash(req, 'success', `Sent to ${out.reached} shop${out.reached === 1 ? '' : 's'}. They see it in Alerts now${values.important ? ', with a banner on every page' : ''}.`);
  res.redirect(303, '/admin/announcements#sent');
});

// ---------- message to one shop (form on the admin shop page) ----------
router.post('/notify', (req, res) => {
  const target = typeof req.body.shop_id === 'string' ? req.body.shop_id.trim() : '';
  const shop = /^\d{1,10}$/.test(target) ? getShopById(Number(target)) : null;
  if (!shop) {
    flash(req, 'error', 'That shop was not found. Nothing was sent.');
    return res.redirect(303, '/admin/announcements');
  }
  const back = `/admin/shops/${shop.id}`;
  const { values, errors } = readAnnouncement({ ...req.body, audience: 'shop', shop_id: String(shop.id) });
  const error = Object.values(errors)[0];
  if (error) {
    flash(req, 'error', `${error} Nothing was sent.`);
    return res.redirect(303, back);
  }
  const out = sendAnnouncement({ ...values, shopId: shop.id, important: values.important === '1' });
  if (out.duplicate) flash(req, 'info', 'This message was already sent – it was not sent twice.');
  else if (out.error) flash(req, 'error', out.error);
  else flash(req, 'success', `Sent to ${shop.name}. It shows in their Alerts${values.important ? ' and as a banner' : ''}.`);
  res.redirect(303, back);
});

export default router;
