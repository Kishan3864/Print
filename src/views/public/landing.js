import { html } from '../../lib/html.js';
import { config } from '../../config.js';
import { icon } from '../components.js';

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
            <span class="order-no lp-order-no">Order #1024</span>
            <span class="pill pill-proof_sent">Proof sent</span>
          </div>
          <div class="lp-proof">${icon('file')}<span>Proof</span></div>
          <div class="lp-approve">${icon('check')}<span>Approve proof</span></div>
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
        <p class="lp-sub">Your customers upload print files through one link and approve the proof, so you print the right file every time.</p>
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
  ['eye', 'Customer approves the proof before printing', 'Send a proof. The customer taps Approve or asks for changes. Fewer reprints.'],
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
  ['Register your shop', 'Fill in a short form. We check your details and switch your account on.'],
  ['Share your link and QR code', 'Put the QR code at your counter and share the link on WhatsApp and Instagram.'],
  ['Customers upload, you send a proof', 'New orders show up on your dashboard. Upload the proof from the order.'],
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
        <p>If customers send you files to print, PrintDesk fits your shop.</p>
      </div>
      <ul class="lp-chips">
        ${AUDIENCE.map((label) => html`<li>${icon('check')}<span>${label}</span></li>`)}
      </ul>
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
    ['Does it work on mobile?', html`Yes. Customers order from any phone, and you can run the whole counter from yours. PrintDesk also installs like an app, straight from the browser.`],
    ['How do I get started?', html`<a href="/register">Register your shop</a> with a short form. Brighton Solution checks your details and approves your account. Then share your link and start taking orders. Want to look around first? <a href="/demo">Try the live demo</a>.`],
    ['What does it cost?', html`Plans depend on your shop. Send us a DM on Instagram at <a href="${DM_URL}" target="_blank" rel="noopener">@${config.instagram}</a> and we will share the details.`],
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
        <p>Try the demo as a customer and as the shop. No sign-up needed.</p>
        <div class="lp-cta">
          <a class="btn btn-primary btn-lg" href="/demo"><span>Try live demo</span>${icon('arrowRight')}</a>
          <a class="btn btn-secondary btn-lg" href="/register">Register your shop</a>
        </div>
      </div>
    </div>
  </section>`;
}

export function landingPage() {
  return html`<div class="lp">${hero()}${features()}${howItWorks()}${audience()}${faq()}${ctaBand()}</div>`;
}
