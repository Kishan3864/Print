import { db, meta, now } from '../db.js';
import { config } from '../config.js';
import { publishShop } from '../lib/live.js';
import { audit, ipOf } from './audit.js';

// Terms of Service, Privacy Policy, Refund & Cancellation Policy.
// The admin edits them in /admin/legal. Publishing a new VERSION asks every shop owner to accept again
// (a blocking screen in /shop). Every acceptance is stored in `consents` with time, IP and browser.
// Customers accept on the order form (stored on the order + consents).
//
// Text format: blank line = new paragraph, "## " = heading, "- " = bullet.

const CO = 'Brighton Solution';
const APP = 'Brighton Print';

export const DEFAULT_DOCS = {
  terms: {
    title: 'Terms of Service',
    body: `These terms are an agreement between you (the shop owner, "you") and ${CO} ("we", "us"), the maker of ${APP}. By creating an account or using ${APP} you accept them.

## 1. What ${APP} does
${APP} gives your print shop an online order link, an order dashboard, design previews, customer tracking pages and – where your plan or add-ons include them – features such as Bills. We host the software; you use it through your browser.

## 2. Your account
- Give true details when you register and keep your password secret. You are responsible for everything done with your login.
- One account is for one shop. Tell us if you think someone else used your account.
- You must be 18 or older and allowed to run your business.

## 3. Plans, payments and lifetime licences
- Monthly and yearly plans are paid in advance. When a plan ends, your order link closes and paid features stop until you renew. Your data is kept safe for at least 90 days after a plan ends.
- A lifetime licence is a one-time payment for the features of that plan, for as long as ${APP} is offered. It includes one year of Updates & Support; after that you may renew Updates & Support yearly to receive new features and priority help. Bug and security fixes are always included.
- Add-ons (for example Bills) are sold separately unless your plan includes them, and follow their own validity.
- A feature or add-on is only switched on after the payment is confirmed by the payment gateway or recorded by us.
- Prices may change for future payments; a running period is never repriced.

## 4. Fair use
- Do not upload or let customers upload illegal, harmful or infringing content. You are responsible for what you print.
- Do not try to break, overload, copy or resell the software.
- Storage and file sizes follow your plan. Customer files are deleted automatically after your retention period.

## 5. Your data and your customers' data
You own your shop's data. You are the one who collects your customers' details; we process them only to run ${APP} for you, as described in our Privacy Policy. You can export your bills and request deletion of your account.

## 6. Support, custom work and changes
Help with problems and bugs is free during an active plan (lifetime: during Updates & Support). Custom changes and setup help are paid services quoted in advance. We decide which ideas become part of ${APP} for everyone.

## 7. Suspension and ending
We may pause or close an account that breaks these terms, does not pay, or harms others. You may stop using ${APP} at any time.

## 8. Liability
We work hard to keep ${APP} available and correct, but it is provided "as is". To the extent the law allows, our total liability is limited to the amount you paid us in the last 12 months. We are not liable for indirect losses or lost profits.

## 9. Changes to these terms
We may update these terms. When we do, you will be asked to accept the new version before continuing.

## 10. Law and contact
These terms follow the laws of India. Courts at our registered place of business have jurisdiction. Contact: Instagram @${config.instagram} or ${config.companyUrl}.`,
  },
  privacy: {
    title: 'Privacy Policy',
    body: `This policy explains what personal data ${APP} (by ${CO}) handles, why, and your choices. We follow the Information Technology Act, 2000 and the Digital Personal Data Protection Act, 2023.

## What we collect
- Shop owners: name, shop name, email, mobile, city, address, logo, login times, payment records (payments are processed by our payment partner – we never see card or UPI PIN details).
- Customers of a shop: name, mobile, optional email, the files they upload and their order choices.
- Technical data: IP address and browser details for security, fraud prevention and to record consent.

## Why we use it
- To run the service: take orders, show tracking pages, make bills, send notifications.
- To bill shops for plans, add-ons and services and to keep receipts.
- To keep the service secure and to answer support requests.
We do not sell personal data and we do not use customers' files for anything except completing their order.

## Sharing
- With the print shop the customer chose (the shop owner sees their order).
- With service providers who help us run ${APP} (hosting, email, the payment gateway), only as needed.
- When the law requires it.

## How long we keep it
- Customer files: deleted automatically after the shop's retention period (usually 15 days).
- Orders and bills: while the shop's account exists, and up to 90 days after it ends, unless the shop deletes them earlier.
- Payment and consent records: as long as tax and legal rules require.

## Your rights
You can ask to see, correct or delete your personal data, or withdraw consent (this may stop the service working for you). Customers can contact the shop or us. Contact: Instagram @${config.instagram} or ${config.companyUrl}.

## Security
Data is sent over HTTPS, passwords are stored hashed, every shop only sees its own data, and access is logged.

## Changes
If this policy changes we will ask shop owners to accept the new version.`,
  },
  refund: {
    title: 'Refund & Cancellation Policy',
    body: `## Free demo first
Every shop can try ${APP} free before paying, so you know what you buy.

## Plans and add-ons
- Monthly and yearly payments start a period immediately and are not refunded for unused days. You can stop renewing at any time; the plan simply ends on its date.
- Upgrades credit the unused days of your current plan, so you never pay twice for the same days.
- Lifetime licences can be refunded in full within 7 days of payment if you have not used the paid features. After 7 days they are not refundable.

## Paid services
- A review fee is not refunded once we have studied your request, but it is taken off the price if you go ahead.
- Quoted custom work is refunded in full if we do not deliver what was agreed.

## Failed or double payments
If money was taken but your plan did not switch on, or you were charged twice, contact us with the payment reference. We check it with the payment gateway and refund any extra charge within 7 working days to the original payment method.

## Contact
Instagram @${config.instagram} or ${config.companyUrl}.`,
  },
};
export const DOC_KEYS = Object.keys(DEFAULT_DOCS);
export const DOC_PATHS = { terms: '/terms', privacy: '/privacy', refund: '/refund-policy' };
const DEFAULT_VERSION = '2026-11-05';

/** { version, updatedAt, docs: { terms: {title, body}, … } } – the admin's text over the defaults. */
export function legal() {
  let saved = {};
  try {
    saved = JSON.parse(meta.get('legal') || '{}') || {};
  } catch {
    /* defaults */
  }
  const docs = {};
  for (const k of DOC_KEYS) {
    const s = saved.docs?.[k] || {};
    docs[k] = { title: typeof s.title === 'string' && s.title.trim() ? s.title.trim() : DEFAULT_DOCS[k].title, body: typeof s.body === 'string' && s.body.trim() ? s.body : DEFAULT_DOCS[k].body };
  }
  return { version: saved.version || DEFAULT_VERSION, updatedAt: saved.updatedAt || null, docs };
}
export const legalVersion = () => legal().version;

/** Saves the texts. publish = new version → every shop owner accepts again. */
export function saveLegal(docs, { publish = false } = {}) {
  const cur = legal();
  const version = publish ? new Date().toISOString().slice(0, 16).replace('T', ' ') : cur.version;
  meta.set('legal', JSON.stringify({ version, updatedAt: now(), docs }));
  audit({ actor: 'admin', action: publish ? 'legal.publish' : 'legal.save', detail: publish ? `New version ${version} – shops must accept again` : 'Texts saved (same version)' });
  return version;
}

/** True when this shop owner still has to accept the current version. */
export const needsConsent = (shop) => Boolean(shop) && shop.terms_version !== legalVersion();

export function recordShopConsent(shop, req) {
  const version = legalVersion();
  const at = now();
  db.prepare('UPDATE shops SET terms_version = ?, terms_accepted_at = ? WHERE id = ?').run(version, at, shop.id);
  db.prepare("INSERT INTO consents (at, subject, shop_id, version, ip, user_agent) VALUES (?, 'shop', ?, ?, ?, ?)").run(at, shop.id, version, ipOf(req).slice(0, 64), String(req?.get?.('user-agent') || '').slice(0, 300));
  audit({ actor: 'shop', shopId: shop.id, action: 'consent', detail: `Accepted Terms, Privacy & Refund policy (version ${version})`, ip: ipOf(req) });
  publishShop(shop.id);
}

export function recordCustomerConsent(order, req) {
  const version = legalVersion();
  db.prepare('UPDATE orders SET consent_version = ? WHERE id = ?').run(version, order.id);
  db.prepare("INSERT INTO consents (at, subject, shop_id, order_id, version, ip, user_agent) VALUES (?, 'customer', ?, ?, ?, ?, ?)").run(
    now(), order.shop_id, order.id, version, ipOf(req).slice(0, 64), String(req?.get?.('user-agent') || '').slice(0, 300)
  );
}

export const shopConsents = (shopId, limit = 10) => db.prepare("SELECT * FROM consents WHERE subject = 'shop' AND shop_id = ? ORDER BY id DESC LIMIT ?").all(shopId, limit);

/** How many live shop owners accepted the current version. */
export function consentStats() {
  const v = legalVersion();
  const row = db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN terms_version = ? THEN 1 ELSE 0 END) AS accepted FROM shops WHERE status IN ('active','pending','paused')").get(v);
  return { version: v, total: row.total || 0, accepted: row.accepted || 0 };
}
