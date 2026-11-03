import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { waLink } from '../lib/util.js';

// ---------- links ----------
export const orderFormUrl = (shop) => `${config.baseUrl}/${shop.slug}`;
export const trackPath = (shop, order) => `/${shop.slug}/o/${order.token}`;
export const trackUrl = (shop, order) => config.baseUrl + trackPath(shop, order);

// ---------- WhatsApp (wa.me with a pre-written message) ----------
export const waProofText = (shop, order) =>
  `Hi ${order.customer_name}, your proof for order #${order.order_no} at ${shop.name} is ready. Please check and approve here: ${trackUrl(shop, order)}`;

export const waReadyText = (shop, order) =>
  `Hi ${order.customer_name}, your order #${order.order_no} at ${shop.name} is ready for pickup.` +
  (shop.address ? ` Address: ${shop.address}.` : '') +
  ` Details: ${trackUrl(shop, order)}`;

export const waProofLink = (shop, order) => waLink(order.customer_mobile, waProofText(shop, order));
export const waReadyLink = (shop, order) => waLink(order.customer_mobile, waReadyText(shop, order));

// ---------- email (optional, only when SMTP_HOST is set) ----------
let transport = null;
function getTransport() {
  if (!config.smtp.enabled) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
  }
  return transport;
}

export const mailEnabled = () => config.smtp.enabled;

/** Fire-and-forget email. Never throws; resolves true when sent. */
export async function sendMail({ to, subject, text, replyTo }) {
  const t = getTransport();
  if (!t || !to) return false;
  try {
    await t.sendMail({ from: config.smtp.from, to, subject, text, replyTo });
    return true;
  } catch (err) {
    console.error('[mail] failed:', err.message);
    return false;
  }
}

const sign = (shop) => `\n\n${shop.name}${shop.phone ? `\nPhone: ${shop.phone}` : ''}${shop.address ? `\n${shop.address}` : ''}\n\nSent via PrintDesk`;

/** kind: 'received' | 'proof' | 'ready'. Skipped for the demo shop or when no customer email. */
export function emailCustomer(shop, order, kind) {
  if (shop.is_demo || !order.customer_email) return Promise.resolve(false);
  const n = `#${order.order_no}`;
  const link = trackUrl(shop, order);
  const msg = {
    received: [`Order ${n} received – ${shop.name}`, `Hi ${order.customer_name},\n\nWe received your order ${n}. Track it here:\n${link}`],
    proof: [`Proof ready for order ${n} – ${shop.name}`, `Hi ${order.customer_name},\n\nYour proof for order ${n} is ready. Please check it and approve, or ask for changes:\n${link}${order.proof_note ? `\n\nNote from the shop: ${order.proof_note}` : ''}`],
    ready: [`Order ${n} is ready for pickup – ${shop.name}`, `Hi ${order.customer_name},\n\nYour order ${n} is ready for pickup.\n${link}`],
  }[kind];
  if (!msg) return Promise.resolve(false);
  return sendMail({ to: order.customer_email, subject: msg[0], text: msg[1] + sign(shop), replyTo: shop.email });
}

export function emailShopNewOrder(shop, order) {
  if (shop.is_demo) return Promise.resolve(false);
  return sendMail({
    to: shop.email,
    subject: `New order #${order.order_no} from ${order.customer_name}`,
    text: `New order #${order.order_no}\n\nCustomer: ${order.customer_name} (${order.customer_mobile})\nSize: ${order.size} · Qty: ${order.quantity}\n\nOpen: ${config.baseUrl}/shop/orders/${order.order_no}\n\nPrintDesk`,
  });
}

export function emailAdminNewShop(shop) {
  if (!config.adminEmail) return Promise.resolve(false);
  return sendMail({
    to: config.adminEmail,
    subject: `New PrintDesk shop waiting for approval: ${shop.name}`,
    text: `${shop.name} (${shop.city})\nOwner: ${shop.owner_name}\nMobile: ${shop.mobile}\nEmail: ${shop.email}\nLink: ${config.baseUrl}/${shop.slug}\n\nApprove: ${config.baseUrl}/admin/shops/${shop.id}`,
  });
}

export function emailShopApproved(shop) {
  return sendMail({
    to: shop.email,
    subject: 'Your PrintDesk account is active',
    text: `Hi ${shop.owner_name || shop.name},\n\nYour PrintDesk account is approved. Log in: ${config.baseUrl}/login\nYour customer order link: ${config.baseUrl}/${shop.slug}\n\nBrighton Solution`,
  });
}
