import { Router } from 'express';
import { html } from '../lib/html.js';
import { config } from '../config.js';
import { cleanLine, flash, isEmail, isMobile, slugError, slugify } from '../lib/util.js';
import { actionLimiter, demoLimiter, loginLimiter, loginShop, logout, registerLimiter, safeNext } from '../lib/security.js';
import { checkPassword, createShop, emailTaken, getShopByEmail, getShopBySlug, slugTaken, touchLogin } from '../services/shops.js';
import { emailAdminNewShop } from '../services/notify.js';
import { messagePage, render } from '../views/layout.js';
import { landingPage } from '../views/public/landing.js';
import { demoPage } from '../views/public/demo.js';
import { loginPage, registerPage } from '../views/public/auth.js';

const router = Router();

// Compared against when no account matches, so a wrong email costs the same time as a wrong password.
const DUMMY_HASH = '$2b$10$Oq4omzJceL.qkeHgnZw0jOh4q1PB8l01eLaLvnhRSX1m0iBEApB42';

// ---------- landing + demo ----------
router.get('/', (req, res) => {
  render(res, {
    title: 'PrintDesk',
    variant: 'public',
    description: 'PrintDesk gives your print shop one order link. Customers upload files, every job gets an order number, the customer approves the proof, and the ready message goes out on WhatsApp in one tap.',
    bodyClass: 'page-landing',
    body: landingPage(),
  });
});

router.get('/demo', (req, res) => {
  res.locals.isDemo = true;
  const realShop = req.shop && !req.shop.is_demo ? req.shop : null;
  render(res, {
    title: 'Live demo',
    variant: 'public',
    active: 'demo',
    description: 'Try PrintDesk live: place a print order as a customer, then manage it from the shop dashboard. No sign-up needed.',
    body: demoPage(res, { realShop }),
  });
});

router.post('/demo/login', demoLimiter, (req, res) => {
  const shop = getShopBySlug(config.demo.slug);
  if (!shop || !shop.is_demo) {
    return messagePage(res, {
      status: 503,
      title: 'Demo is being prepared',
      text: 'Demo is being prepared, try again in a minute.',
      iconName: 'clock',
      action: html`<a class="btn btn-primary" href="/demo">Back to demo</a>`,
    });
  }
  loginShop(req, shop, { demo: true });
  flash(req, 'info', `You are in the demo dashboard. Sample data resets every ${config.demo.resetHours} hours.`);
  res.redirect('/shop');
});

// ---------- register ----------
const normSlug = (v) => String(v ?? '').trim().toLowerCase().slice(0, 60);

/** First free, valid link name built from `base` (adds the city, then a number). */
function freeSlug(base, city) {
  const root = slugify(base).slice(0, 34).replace(/-+$/, '');
  if (!root) return '';
  const tries = [root, `${root}-${slugify(city)}`.slice(0, 40).replace(/-+$/, ''), ...[2, 3, 4, 5].map((n) => `${root}-${n}`)];
  return tries.find((s) => !slugError(s) && !slugTaken(s)) || '';
}

function slugProblem(slug, { name, city }) {
  const err = slugError(slug);
  if (err) {
    const tip = freeSlug(slug || name, city);
    return tip && tip !== slug ? `${err} How about "${tip}"?` : err;
  }
  if (slugTaken(slug)) {
    const tip = freeSlug(slug, city);
    return `This link is already taken.${tip ? ` How about "${tip}"?` : ' Please choose another one.'}`;
  }
  return null;
}

function readRegistration(body) {
  return {
    name: cleanLine(body.name, 80),
    city: cleanLine(body.city, 60),
    slug: normSlug(body.slug),
    owner_name: cleanLine(body.owner_name, 80),
    mobile: cleanLine(body.mobile, 20),
    email: cleanLine(body.email, 160).toLowerCase(),
  };
}

function validateRegistration(values, password, password2) {
  const errors = {};
  if (values.name.length < 2) errors.name = values.name ? 'Shop name is too short.' : 'Enter your shop name.';
  if (values.city.length < 2) errors.city = values.city ? 'City name is too short.' : 'Enter your city.';
  const slugErr = slugProblem(values.slug, values);
  if (slugErr) errors.slug = slugErr;
  if (values.owner_name.length < 2) errors.owner_name = values.owner_name ? 'Name is too short.' : 'Enter your name.';
  if (!isMobile(values.mobile)) errors.mobile = values.mobile ? 'Enter a valid mobile number (10 digits).' : 'Enter your mobile number.';
  if (!isEmail(values.email)) errors.email = values.email ? 'Enter a valid email address.' : 'Enter your email address.';
  else if (emailTaken(values.email)) errors.email = 'This email is already registered. Log in instead, or use another email.';
  if (password.length < 8) errors.password = password ? 'Use at least 8 characters.' : 'Choose a password.';
  else if (Buffer.byteLength(password) > 72) errors.password = 'Use at most 72 characters.';
  if (!errors.password && password2 !== password) errors.password2 = 'Passwords do not match.';
  return errors;
}

const showRegister = (res, data = {}, status = 200) =>
  render(
    res,
    {
      title: 'Register your shop',
      variant: 'auth',
      bodyClass: 'page-register',
      scripts: ['/js/register.js'],
      body: registerPage(res, data),
    },
    status
  );

router.get('/register', (req, res) => {
  if (req.shop && !req.shop.is_demo) return res.redirect('/shop');
  showRegister(res);
});

router.post('/register', registerLimiter, (req, res) => {
  const values = readRegistration(req.body);
  const password = String(req.body.password ?? '');
  const password2 = String(req.body.password2 ?? '');
  const errors = validateRegistration(values, password, password2);
  if (Object.keys(errors).length) return showRegister(res, { values, errors }, 400);

  let shop;
  try {
    shop = createShop({ ...values, password });
  } catch (err) {
    // Lost a race with another sign-up for the same link or email.
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const field = /email/.test(err.message) ? 'email' : 'slug';
      const msg = field === 'email' ? 'This email is already registered. Log in instead, or use another email.' : 'This link was just taken. Please choose another one.';
      return showRegister(res, { values, errors: { [field]: msg } }, 409);
    }
    throw err;
  }

  emailAdminNewShop(shop).catch(() => {});
  touchLogin(shop.id);
  loginShop(req, shop);
  flash(req, 'success', 'Your shop is registered. We will check your details and switch your account on soon.');
  res.redirect('/shop');
});

// Live availability check for the link name field (public/js/register.js).
router.get('/api/slug-check', actionLimiter, (req, res) => {
  const slug = normSlug(req.query.slug);
  const err = slugError(slug) || (slugTaken(slug) ? 'This link is already taken.' : null);
  res.json({ ok: !err, message: err || 'Nice, this link is available.' });
});

// ---------- login / logout ----------
const showLogin = (res, data = {}, status = 200) =>
  render(res, { title: 'Log in', variant: 'auth', bodyClass: 'page-login', body: loginPage(res, data) }, status);

router.get('/login', (req, res) => {
  const next = safeNext(req.query.next, '');
  if (req.shop && !req.shop.is_demo) return res.redirect(next || '/shop');
  showLogin(res, { next, demoSession: Boolean(req.shop) });
});

router.post('/login', loginLimiter, (req, res) => {
  const email = cleanLine(req.body.email, 160).toLowerCase();
  const password = String(req.body.password ?? '').slice(0, 200);
  const next = safeNext(req.body.next, '');
  const shop = isEmail(email) ? getShopByEmail(email) : null;
  const usable = shop && !shop.is_demo;
  const ok = checkPassword(password, usable ? shop.password_hash : DUMMY_HASH) && usable;
  if (!ok) {
    // 401 so the login limiter counts the failure (it skips successful responses).
    return showLogin(res, { email, next, error: 'That email and password do not match. Please try again.', demoSession: Boolean(req.shop?.is_demo) }, 401);
  }
  loginShop(req, shop);
  touchLogin(shop.id);
  res.redirect(next || '/shop');
});

router.post('/logout', (req, res) => {
  res.setHeader('Clear-Site-Data', '"cache"');
  logout(req);
  flash(req, 'info', 'You are logged out.');
  res.redirect('/');
});

export default router;
