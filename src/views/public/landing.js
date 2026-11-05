import { html } from '../../lib/html.js';
import { planFeatureList } from '../../services/entitlements.js';
import { config } from '../../config.js';
import { icon } from '../components.js';
import { activePlans, formatINR } from '../../services/billing.js';

const DM_URL = `https://ig.me/m/${config.instagram}`;
const MB = (bytes) => Math.round(bytes / (1024 * 1024));

// ---------- hero ----------
/** Decorative phone showing the customer's order tracking page (pure HTML + CSS). */
function phoneMockup() {
  return html`<div class="lp-visual" aria-hidden="true">
    <div class="lp-phone">
      <div class="lp-screen">
        <div class="lp-screen-top"><i></i></div>
        <div class="lp-shop"><span class="lp-shop-logo">N</span><b>Navrang Prints</b></div>
        <div class="lp-order">
          <div class="lp-order-row">
            <span class="order-no lp-order-no">Order P-1024</span>
            <span class="pill pill-proof_sent">Waiting for OK</span>
          </div>
          <div class="lp-proof">${icon('file')}<span>Design preview</span></div>
          <div class="lp-approve">${icon('check')}<span>OK, print it</span></div>
        </div>
      </div>
    </div>
  </div>`;
}

function hero() {
  return html`<section class="lp-hero">
    <div class="container lp-hero-grid">
      <div class="lp-hero-copy">
        <p class="lp-eyebrow">Online order desk for print shops</p>
        <h1 class="lp-title">One link. One order number. One final file.</h1>
        <p class="lp-sub">Your customers upload print files through one link and tap OK on the design, so you print the right file every time.</p>
        <div class="lp-cta">
          <a class="btn btn-primary btn-lg" href="/demo"><span>Try live demo</span>${icon('arrowRight')}</a>
          <a class="btn btn-secondary btn-lg" href="/register">Register your shop</a>
        </div>
      </div>
      ${phoneMockup()}
    </div>
  </section>`;
}

// ---------- what you get ----------
const FEATURES = [
  ['upload', 'Upload link with size & quantity', 'Customers choose size, quantity and colour, then upload their files from any phone.'],
  ['orders', 'Order number for every file', 'Every order gets its own number, so the right file is easy to find at the counter.'],
  ['eye', 'Customer OKs the design before printing', 'Send a design preview. The customer taps OK or asks for changes. Fewer reprints.'],
  ['whatsapp', 'Ready message in one tap', 'One tap opens WhatsApp with the order number and pickup details already written.'],
];

function features() {
  return html`<section class="lp-section" id="features" aria-labelledby="features-title">
    <div class="container">
      <div class="lp-head">
        <h2 id="features-title">What you get</h2>
        <p>Every print job in one place, from upload to pickup.</p>
      </div>
      <ul class="lp-grid">
        ${FEATURES.map(
          ([ic, title, text]) => html`<li class="lp-card">
            <span class="lp-card-ic">${icon(ic)}</span>
            <h3>${title}</h3>
            <p>${text}</p>
          </li>`
        )}
      </ul>
    </div>
  </section>`;
}

// ---------- how it works ----------
const STEPS = [
  ['Register and choose a plan', 'Fill in a short form and pay online. Your order link opens in about a minute.'],
  ['Share your link and QR code', 'Put the QR code at your counter and share the link on WhatsApp and Instagram.'],
  ['Customers upload, you check', 'New orders show up on your dashboard with a sound. Print, or send a design preview first.'],
  ['They approve, you print', 'Print the approved file, mark it ready and send the ready message.'],
];

function howItWorks() {
  return html`<section class="lp-section lp-alt" id="how" aria-labelledby="how-title">
    <div class="container">
      <div class="lp-head">
        <h2 id="how-title">How it works</h2>
        <p>Four simple steps. Your counter works the same way as today.</p>
      </div>
      <ol class="lp-steps">
        ${STEPS.map(
          ([title, text], i) => html`<li class="lp-step">
            <span class="lp-step-no" aria-hidden="true">${i + 1}</span>
            <div>
              <h3>${title}</h3>
              <p>${text}</p>
            </div>
          </li>`
        )}
      </ol>
    </div>
  </section>`;
}

// ---------- who it is for ----------
const AUDIENCE = [
  'Print shops',
  'Xerox / photocopy centres',
  'Flex & banner printers',
  'Offset printers',
  'Digital & photo studios',
  'Visiting card & wedding card printers',
];

function audience() {
  return html`<section class="lp-section" aria-labelledby="who-title">
    <div class="container">
      <div class="lp-head">
        <h2 id="who-title">Who it is for</h2>
        <p>If customers send you files to print, Brighton Print fits your shop.</p>
      </div>
      <ul class="lp-chips">
        ${AUDIENCE.map((label) => html`<li>${icon('check')}<span>${label}</span></li>`)}
      </ul>
    </div>
  </section>`;
}

// ---------- pricing ----------
const PLAN_FEATURES = ['Unlimited orders, order link + QR code', 'Customer OK on designs, WhatsApp messages'];

/** Yearly saving against 12 monthly payments: { rupees, pct } (0 when there is none). */
function yearlySaving(plan) {
  const full = plan.monthly * 12;
  const rupees = Math.max(0, full - plan.yearly);
  return { rupees, pct: full > 0 ? Math.round((rupees / full) * 100) : 0 };
}

// Both cycles are rendered; the Monthly/Yearly radios show one of them with CSS only.
function planCard(plan) {
  const save = yearlySaving(plan);
  const cta = (cycle) =>
    html`<a class="btn ${plan.popular ? 'btn-primary' : 'btn-secondary'} btn-lg btn-block lp-plan-cta lp-only-${cycle}" href="/register?plan=${plan.key}&cycle=${cycle}"><span>Start now</span>${icon('arrowRight')}<span class="sr-only"> with ${plan.name} (${cycle})</span></a>`;
  return html`<li class="lp-plan${plan.popular ? ' is-popular' : ''}">
    <div class="lp-plan-top">
      <h3>${plan.name}</h3>
      ${plan.popular ? html`<span class="lp-plan-tag">Most popular</span>` : ''}
    </div>
    <div class="lp-price lp-only-monthly">
      <p class="lp-price-main"><b>${formatINR(plan.monthly)}</b><span>/ month</span></p>
      <p class="lp-price-sub">Billed every month</p>
    </div>
    <div class="lp-price lp-only-yearly">
      <p class="lp-price-main"><b>${formatINR(plan.yearly)}</b><span>/ year</span></p>
      <p class="lp-price-sub">${save.rupees ? html`About ${formatINR(Math.round(plan.yearly / 12))}/month · <span class="lp-save">you save ${formatINR(save.rupees)}</span>` : 'Billed once a year'}</p>
    </div>
    ${plan.lifetime
      ? html`<div class="lp-price lp-only-lifetime">
          <p class="lp-price-main"><b>${formatINR(plan.lifetime)}</b><span>once</span></p>
          <p class="lp-price-sub">Pay once, use for life · 1 year updates included</p>
        </div>`
      : html`<div class="lp-price lp-only-lifetime"><p class="lp-price-main"><b>—</b></p><p class="lp-price-sub">Monthly or yearly only</p></div>`}
    <ul class="lp-plan-list">
      ${PLAN_FEATURES.map((f) => html`<li>${icon('check')}<span>${f}</span></li>`)}
      ${planFeatureList(plan.key).map((f) => html`<li>${icon('check')}<span>${f}</span></li>`)}
    </ul>
    ${cta('monthly')}${cta('yearly')}${plan.lifetime ? cta('lifetime') : ''}
  </li>`;
}

function pricing() {
  const plans = activePlans();
  const bestPct = Math.max(0, ...plans.map((p) => yearlySaving(p).pct));
  return html`<section class="lp-section lp-sep" id="pricing" aria-labelledby="pricing-title">
    <div class="container">
      <div class="lp-head">
        <h2 id="pricing-title">Simple pricing</h2>
        <p>Pay monthly, yearly (2 months free) or once for life. Bigger plans add your branding, reprints, Bills and priority help.</p>
      </div>
      ${plans.length
        ? html`<div class="lp-pricing">
            <input class="lp-cycle-input" type="radio" name="lp-cycle" id="lp-cycle-monthly" value="monthly" checked>
            <input class="lp-cycle-input" type="radio" name="lp-cycle" id="lp-cycle-yearly" value="yearly">
            <input class="lp-cycle-input" type="radio" name="lp-cycle" id="lp-cycle-lifetime" value="lifetime">
            <div class="lp-cycle">
              <label for="lp-cycle-monthly" class="lp-cycle-m">Monthly</label>
              <label for="lp-cycle-yearly" class="lp-cycle-y">Yearly${bestPct ? html` <span class="lp-cycle-save">save ${bestPct}%</span>` : ''}</label>
              ${plans.some((p) => p.lifetime) ? html`<label for="lp-cycle-lifetime" class="lp-cycle-l">Lifetime</label>` : ''}
            </div>
            <ul class="lp-plans">${plans.map(planCard)}</ul>
          </div>`
        : html`<p class="lp-plans-empty">New plans are on the way. DM us on Instagram at <a href="${DM_URL}" target="_blank" rel="noopener">@${config.instagram}</a> for the current price.</p>`}
      <div class="lp-pricing-foot">
        <div class="lp-try">
          <span class="lp-try-ic">${icon('sparkle')}</span>
          <p><b>Try free first:</b> create a demo shop – no payment, ready in a minute.</p>
          <a class="btn btn-secondary" href="/demo"><span>Create a demo shop</span>${icon('arrowRight')}</a>
        </div>
        <p class="lp-pay-note">${icon('shield')}<span>Prices in rupees. Pay securely by UPI, card or net banking through PayU. Renew anytime.</span></p>
      </div>
    </div>
  </section>`;
}

// ---------- FAQ ----------
function faq() {
  const items = [
    ['Do my customers need an app or a login?', html`No. They open your link in any browser, fill in the form and upload their files. Each order gets a private tracking page. Nothing to install, no password.`],
    [
      'Which files can customers send?',
      html`PDF, JPG, PNG, TIFF, HEIC and WebP images, CorelDRAW (CDR), Illustrator (AI), Photoshop (PSD), EPS and SVG, Word, Excel and PowerPoint files, and ZIP, RAR or 7z archives.`,
    ],
    ['How big can the files be?', html`Up to ${MB(config.limits.orderFileBytes)} MB per file and ${config.limits.orderFiles} files per order. That is enough for big CorelDRAW or Photoshop files.`],
    ['How long are files kept?', html`Files are deleted automatically after 15 days by default. You can change this in Settings. Order details and history stay.`],
    ['Can I use my own logo and colour?', html`Yes. Your order page shows your shop name, logo and brand colour.`],
    ['Does it work on mobile?', html`Yes. Customers order from any phone, and you can run the whole counter from yours. Brighton Print also installs like an app, straight from the browser.`],
    ['How do I get started?', html`<a href="/register">Register your shop</a> with a short form, choose a plan and pay online. Your order link opens right away – share it and start taking orders.`],
    ['How do I pay?', html`Online through PayU with UPI, debit or credit card, or net banking. Pay monthly or yearly and renew anytime from your dashboard. See the <a href="/#pricing">plans and prices</a>.`],
    ['What happens when my plan ends?', html`Your order link stops taking new orders and your dashboard asks you to renew. Your orders and settings are kept – renew and the link opens again straight away. We remind you before the end date.`],
    ['Can I try before paying?', html`Yes. <a href="/demo">Try the live demo</a> – no payment and no approval. It runs for ${config.demo.trialDays} days with your own shop name and link. Go live anytime by choosing a plan.`],
  ];
  return html`<section class="lp-section lp-alt" id="faq" aria-labelledby="faq-title">
    <div class="container">
      <div class="lp-head">
        <h2 id="faq-title">Questions shop owners ask</h2>
      </div>
      <div class="lp-faq-list">
        ${items.map(
          ([q, a]) => html`<details class="lp-qa" name="faq">
            <summary>${q}</summary>
            <div class="lp-qa-body"><p>${a}</p></div>
          </details>`
        )}
      </div>
      <p class="lp-faq-more">Another question? DM us on Instagram at <a href="${DM_URL}" target="_blank" rel="noopener">@${config.instagram}</a>.</p>
    </div>
  </section>`;
}

// ---------- final call to action ----------
function ctaBand() {
  return html`<section class="lp-section lp-final" aria-labelledby="final-title">
    <div class="container">
      <div class="lp-final-card">
        <h2 id="final-title">See it working in 2 minutes</h2>
        <p>Try the demo as a customer and as the shop, or create your own free demo shop. No payment needed.</p>
        <div class="lp-cta">
          <a class="btn btn-primary btn-lg" href="/demo"><span>Try live demo</span>${icon('arrowRight')}</a>
          <a class="btn btn-secondary btn-lg" href="/register">Register your shop</a>
        </div>
      </div>
    </div>
  </section>`;
}

export function landingPage() {
  return html`<div class="lp">${hero()}${features()}${howItWorks()}${audience()}${pricing()}${faq()}${ctaBand()}</div>`;
}
