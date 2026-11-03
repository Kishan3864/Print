import fs from 'node:fs';
import { Router } from 'express';
import QRCode from 'qrcode';
import { actionLimiter, loginLimiter, loginShop } from '../lib/security.js';
import { logoUpload, discardUploads } from '../lib/uploads.js';
import { clean, cleanLine, digits, flash, isHexColor } from '../lib/util.js';
import { DEFAULT_SIZES, checkPassword, removeLogoFile, setPassword, sizeOptions, updateShopSettings } from '../services/shops.js';
import { orderFormUrl } from '../services/notify.js';
import { isSampleShop } from '../services/billing.js';
import { render } from '../views/layout.js';
import { linkView, posterView } from '../views/shop-settings/link.js';
import { settingsView } from '../views/shop-settings/settings.js';

// Shop area: "Link & QR", counter poster, QR images and Settings.
// Mounted under the /shop gate, so req.shop and req.shopState are set.

const router = Router();

const DEMO_LOCKED = 'Settings are locked in the sample shop – create your own demo or register your shop to customise.';
const MAX_SIZES = 30;
const MAX_SIZE_LEN = 40;
const MAX_ADDRESS = 240;

// ---------- QR codes ----------
const QR_COLOR = { dark: '#0b1220', light: '#ffffff' };
const qrCache = new Map();

/** QR for a URL, memoised (the URL of a shop never changes while the process runs). */
async function qr(url, type) {
  const key = `${type}|${url}`;
  if (qrCache.has(key)) return qrCache.get(key);
  const out =
    type === 'svg'
      ? await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: QR_COLOR })
      : await QRCode.toBuffer(url, { type: 'png', width: 1024, margin: 2, errorCorrectionLevel: 'M', color: QR_COLOR });
  if (qrCache.size >= 400) qrCache.delete(qrCache.keys().next().value);
  qrCache.set(key, out);
  return out;
}

router.get('/qr.svg', async (req, res, next) => {
  try {
    const svg = await qr(orderFormUrl(req.shop), 'svg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.type('image/svg+xml').send(svg);
  } catch (err) {
    next(err);
  }
});

router.get('/qr.png', async (req, res, next) => {
  try {
    const png = await qr(orderFormUrl(req.shop), 'png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.attachment(`${req.shop.slug}-qr.png`);
    res.type('image/png').send(png);
  } catch (err) {
    next(err);
  }
});

// ---------- link page + poster ----------
router.get('/link', (req, res) => {
  render(res, linkView(res, { shop: req.shop, state: req.shopState }));
});

router.get('/poster', (req, res) => {
  render(res, posterView(res, { shop: req.shop }));
});

// ---------- settings ----------
function currentValues(shop) {
  return {
    name: shop.name,
    brand_color: isHexColor(shop.brand_color) ? shop.brand_color.toLowerCase() : '#0077b6',
    phone: shop.phone || '',
    address: shop.address || '',
    size_options: sizeOptions(shop).join('\n'),
    retention_days: String(shop.retention_days || 15),
  };
}

function showSettings(req, res, { values, errors = {}, pwErrors = {}, status = 200 } = {}) {
  render(res, settingsView(res, { shop: req.shop, state: req.shopState, values: values || currentValues(req.shop), errors, pwErrors }), status);
}

// The shared sample shop is read-only; personal demo shops can brand themselves.
function demoLocked(req, res, next) {
  if (!isSampleShop(req.shop)) return next();
  flash(req, 'info', DEMO_LOCKED);
  res.redirect('/shop/settings');
}

const lines = (text) =>
  String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

/** Validates the profile form. Returns { values (as typed), errors, fields (ready to save) }. */
function readProfile(body) {
  const values = {
    name: cleanLine(body.name, 120),
    brand_color: cleanLine(body.brand_color, 20).toLowerCase(),
    phone: cleanLine(body.phone, 30),
    address: clean(body.address, 600).replace(/\r\n?/g, '\n'),
    size_options: clean(body.size_options, 4000).replace(/\r\n?/g, '\n'),
    retention_days: cleanLine(body.retention_days, 10),
  };
  const errors = {};

  if (values.name.length < 2) errors.name = 'Enter your shop name.';
  else if (values.name.length > 80) errors.name = 'Keep the shop name to 80 characters or fewer.';

  if (values.brand_color && !values.brand_color.startsWith('#')) values.brand_color = '#' + values.brand_color;
  if (!isHexColor(values.brand_color)) errors.brand_color = 'Pick a colour, or type it as # and 6 characters, like #0077b6.';

  const phoneDigits = digits(values.phone).length;
  if (values.phone && (!/^\+?[\d\s\-()]+$/.test(values.phone) || phoneDigits < 8 || phoneDigits > 15)) {
    errors.phone = 'Enter a valid phone number, like 98765 43210.';
  }

  const addressLines = lines(values.address);
  const address = addressLines.join('\n');
  if (addressLines.length > 4) errors.address = 'Keep the address to 3–4 short lines.';
  else if (address.length > MAX_ADDRESS) errors.address = `Keep the address to ${MAX_ADDRESS} characters or fewer.`;

  const seen = new Set();
  const sizes = [];
  for (const s of lines(values.size_options)) {
    if (s.length > MAX_SIZE_LEN) {
      errors.size_options = `“${s.slice(0, 30)}…” is too long. Keep each size to ${MAX_SIZE_LEN} characters or fewer.`;
      break;
    }
    if (!seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      sizes.push(s);
    }
  }
  if (!errors.size_options && sizes.length > MAX_SIZES) errors.size_options = `You have ${sizes.length} sizes. The limit is ${MAX_SIZES} – remove a few.`;

  let retention = 15;
  if (values.retention_days !== '') {
    retention = Number(values.retention_days);
    if (!/^\d{1,3}$/.test(values.retention_days) || retention < 1 || retention > 90) errors.retention_days = 'Choose a number from 1 to 90.';
  }

  const fields = {
    name: values.name,
    brand_color: values.brand_color,
    phone: values.phone,
    address,
    size_options: JSON.stringify(sizes.length ? sizes : DEFAULT_SIZES),
    retention_days: retention,
  };
  return { values, errors, fields };
}

/** True when the file starts with a PNG, JPEG or WebP signature (the extension alone is not trusted). */
function isRealImage(file) {
  let fd;
  try {
    fd = fs.openSync(file.path, 'r');
    const b = Buffer.alloc(12);
    const n = fs.readSync(fd, b, 0, 12, 0);
    if (n < 12) return false;
    const png = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const webp = b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP';
    return png || jpg || webp;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

router.get('/settings', (req, res) => showSettings(req, res));

// Profile + branding (multipart: CSRF token is in the query string, checked before the upload).
router.post('/settings', actionLimiter, demoLocked, logoUpload, (req, res, next) => {
  const shop = req.shop;
  const { values, errors, fields } = readProfile(req.body);
  const file = req.files[0];
  if (req.uploadError) errors.logo = req.uploadError;
  else if (file && !isRealImage(file)) errors.logo = 'That file is not a valid PNG, JPG or WebP image.';

  if (Object.keys(errors).length) {
    discardUploads(req);
    if (file && !errors.logo) errors.logo = 'Your new logo was not saved – fix the errors below and choose it again.';
    return showSettings(req, res, { values, errors, status: 422 });
  }

  try {
    if (file) fields.logo_file = file.filename;
    updateShopSettings(shop.id, fields);
  } catch (err) {
    discardUploads(req);
    return next(err);
  }
  if (file && shop.logo_file && shop.logo_file !== file.filename) removeLogoFile(shop);
  flash(req, 'success', 'Settings saved. Your order page is updated.');
  res.redirect('/shop/settings');
});

router.post('/settings/logo/remove', actionLimiter, demoLocked, (req, res) => {
  const shop = req.shop;
  if (shop.logo_file) {
    updateShopSettings(shop.id, { logo_file: null });
    removeLogoFile(shop);
    flash(req, 'success', 'Logo removed. Your order page now shows your shop initial.');
  }
  res.redirect('/shop/settings');
});

// Failed attempts count towards the login limiter (422 responses), so the
// current password cannot be brute-forced from a stolen session.
router.post('/settings/password', loginLimiter, demoLocked, (req, res) => {
  const shop = req.shop;
  const current = String(req.body.current_password ?? '');
  const next = String(req.body.new_password ?? '');
  const confirm = String(req.body.confirm_password ?? '');
  const pwErrors = {};

  if (!current) pwErrors.current_password = 'Enter your current password.';
  else if (!checkPassword(current, shop.password_hash)) pwErrors.current_password = 'That is not your current password.';
  if (next.length < 8) pwErrors.new_password = 'Use at least 8 characters.';
  else if (Buffer.byteLength(next) > 72) pwErrors.new_password = 'Use at most 72 characters.';
  else if (next === current) pwErrors.new_password = 'Choose a password different from your current one.';
  else if (confirm !== next) pwErrors.confirm_password = 'The two new passwords do not match.';

  if (Object.keys(pwErrors).length) return showSettings(req, res, { pwErrors, status: 422 });

  const updated = setPassword(shop.id, next);
  loginShop(req, updated); // new session for this device; other devices are logged out (pw_version bumped)
  flash(req, 'success', 'Password changed. Other phones and computers have been logged out.');
  res.redirect('/shop/settings');
});

export default router;
