import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { icon, logoMark } from '../components.js';

const DM_URL = `https://ig.me/m/${config.instagram}`;
const MB = (bytes) => Math.round(bytes / (1024 * 1024));

// Two extra line icons in the same style as components.icon().
const EXTRA = {
  banner: '<rect x="3" y="4" width="18" height="11" rx="1.5"/><path d="M8 15v5M16 15v5M7 8.5h10M7 11.5h6"/>',
  camera: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H7l1.6-2h6.8L17 6h1.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
};
const ico = (name) =>
  EXTRA[name]
    ? raw(`<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${EXTRA[name]}</svg>`)
    : icon(name);

// ---------- hero mockup (decorative, pure HTML + CSS) ----------
const ROWS = [
  { no: 1024, name: 'Priya Sharma', meta: 'A4 · 50 copies · Colour', status: 'proof_sent', label: 'Proof sent', fresh: true },
  { no: 1023, name: 'Ravi Traders', meta: 'Visiting card · 500 · Both sides', status: 'printing', label: 'Printing' },
  { no: 1022, name: 'Meena Iyer', meta: 'Photo 4x6 · 12 · Colour', status: 'ready', label: 'Ready' },
  { no: 1021, name: 'Arjun Mehta', meta: 'Flex / Banner · 1 · Colour', status: 'approved', label: 'Approved' },
];

function heroMockup() {
  return html`<div class="lp-visual" aria-hidden="true">
    <div class="lp-stage">
      <div class="lp-desk">
        <div class="lp-desk-bar"><i></i><i></i><i></i><span class="lp-url">${config.baseUrl.replace(/^https?:\/\//, '')}/shop</span></div>
        <div class="lp-desk-main">
          <div class="lp-side">${logoMark(28)}<span class="is-on">${icon('orders')}</span><span>${icon('qr')}</span><span>${icon('settings')}</span></div>
          <div class="lp-main">
            <div class="lp-head"><b>Orders</b><span class="lp-search">${icon('search')}<span>Search name or #</span></span></div>
            <div class="lp-stats">
              <div class="lp-stat lp-c"><small>New today</small><b>6</b></div>
              <div class="lp-stat lp-m"><small>To approve</small><b>3</b></div>
              <div class="lp-stat lp-y"><small>Printing</small><b>4</b></div>
              <div class="lp-stat lp-k"><small>Ready</small><b>2</b></div>
            </div>
            <div class="lp-rows">
              ${ROWS.map(
                (r) => html`<div class="lp-row${r.fresh ? ' is-fresh' : ''}">
                  <span class="lp-no">#${r.no}</span>
                  <span class="lp-who"><b>${r.name}</b><small>${r.meta}</small></span>
                  <span class="pill pill-${r.status}">${r.label}</span>
                </div>`
              )}
            </div>
          </div>
        </div>
      </div>

      <div class="lp-phone">
        <div class="lp-screen">
          <div class="lp-ph-head"><span class="lp-ph-logo">N</span><span><b>Navrang Prints</b><small>Order tracking</small></span></div>
          <div class="lp-ph-body">
            <small class="lp-ph-label">Your order</small>
            <div class="lp-ph-no">#1024</div>
            <span class="pill pill-proof_sent">Proof sent</span>
            <div class="lp-ph-steps"><i class="is-done"></i><i class="is-current"></i><i></i><i></i><i></i></div>
            <div class="lp-proof">
              <div class="lp-proof-art"><span class="lp-proof-bars"><i></i><i></i><i></i></span><span class="lp-proof-lines"><i></i><i></i><i></i></span></div>
              <div class="lp-proof-file">${icon('file')}<span>proof-v2.pdf</span></div>
            </div>
            <div class="lp-ph-btn lp-ph-approve">${icon('check')}<span>Approve proof</span></div>
            <div class="lp-ph-btn lp-ph-change">Request changes</div>
          </div>
        </div>
      </div>

      <div class="lp-toast">
        <span class="lp-toast-ic">${icon('bell')}</span>
        <span><b>New order <span class="lp-mono">#1025</span></b><small>Flex / Banner · just now</small></span>
      </div>
    </div>
  </div>`;
}

// ---------- sections ----------
function hero() {
  return html`<section class="lp-hero">
    <div class="container lp-hero-grid">
      <div class="lp-hero-copy">
        <p class="lp-kicker"><span class="lp-kicker-cmyk" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Online order desk for print shops</p>
        <h1 class="lp-title"><span class="lp-line">One <span class="lp-hl lp-hl-c">link</span>.</span> <span class="lp-line">One <span class="lp-hl lp-hl-m">order number</span>.</span> <span class="lp-line">One <span class="lp-hl lp-hl-y">final file</span>.</span></h1>
        <p class="lp-sub">Customers send print files through your link. Every job gets an order number, the customer approves the proof before printing, and the ready message goes out in one tap.</p>
        <div class="lp-cta">
          <a class="btn btn-primary btn-lg" href="/demo"><span>Try live demo</span>${icon('arrowRight')}</a>
          <a class="btn btn-secondary btn-lg" href="/register">Register your shop</a>
        </div>
      </div>
      ${heroMockup()}
    </div>
  </section>`;
}

function features() {
  return html`<section class="lp-section lp-features" id="features" aria-labelledby="features-title">
    <div class="container">
      <div class="lp-section-head">
        <h2 id="features-title">Every job, from upload to pickup, in one place</h2>
        <p>No more files lost in WhatsApp chats or reprints from an old version. PrintDesk keeps every order clear for you and your customer.</p>
      </div>
      <div class="lp-bento">
        <article class="lp-tile lp-tile-wide lp-tile-c">
          <div class="lp-tile-copy">
            <span class="lp-tile-ic">${icon('upload')}</span>
            <h3>Upload link with size &amp; quantity</h3>
            <p>Customers open your link, choose size, quantity, colour or B&amp;W, single or both sides, and attach up to ${config.limits.orderFiles} files.</p>
          </div>
          <div class="lp-tile-art lp-form-art" aria-hidden="true">
            <div class="lp-chips"><span>A4</span><span>50 copies</span><span class="is-on">Colour</span><span>Both sides</span></div>
            <div class="lp-file"><span class="file-ext">PDF</span><span class="lp-file-name">college-project.pdf</span><span class="lp-file-size">8.4 MB</span></div>
            <div class="lp-file"><span class="file-ext">CDR</span><span class="lp-file-name">shop-banner-final.cdr</span><span class="lp-file-size">31 MB</span></div>
          </div>
        </article>

        <article class="lp-tile lp-tile-k">
          <div class="lp-tile-copy">
            <span class="lp-tile-ic">${icon('orders')}</span>
            <h3>Order number for every file</h3>
            <p>Each order gets its own number, starting at #1001. No more "which file was mine?" at the counter.</p>
          </div>
          <div class="lp-numbers" aria-hidden="true"><span>#1023</span><b>#1024</b><span>#1025</span></div>
        </article>

        <article class="lp-tile lp-tile-m">
          <div class="lp-tile-copy">
            <span class="lp-tile-ic">${icon('eye')}</span>
            <h3>Customer approves the proof before printing</h3>
            <p>Upload a proof and the customer taps Approve or asks for changes. Fewer reprints, no arguments.</p>
          </div>
          <div class="lp-approve-art" aria-hidden="true">
            <span class="lp-mini-btn is-yes">${icon('check')}Approve proof</span>
            <span class="lp-mini-btn">Request changes</span>
          </div>
        </article>

        <article class="lp-tile lp-tile-wide lp-tile-y">
          <div class="lp-tile-copy">
            <span class="lp-tile-ic lp-tile-ic-wa">${icon('whatsapp')}</span>
            <h3>Ready message in one tap</h3>
            <p>When the job is done, one tap opens WhatsApp with the order number, your address and the tracking link already written.</p>
          </div>
          <div class="lp-tile-art lp-chat" aria-hidden="true">
            <div class="lp-bubble">Hi Priya, your order <span class="lp-mono">#1024</span> at Navrang Prints is ready for pickup. Details: ${config.baseUrl.replace(/^https?:\/\//, '')}/navrang-prints/o/…<span class="lp-bubble-time">4:52 pm ${icon('check')}</span></div>
            <span class="lp-wa-btn">${icon('whatsapp')}Send ready message</span>
          </div>
        </article>
      </div>
    </div>
  </section>`;
}

const STEPS = [
  ['Register your shop', 'Fill in a short form. We check your details and switch your account on.'],
  ['Share your link and QR', 'Put the QR code at your counter and the link on WhatsApp and Instagram.'],
  ['Customers upload, you send a proof', 'New orders pop up on your dashboard. Upload the proof right from the order.'],
  ['They approve, you print', 'Print the approved file, mark it ready and send the ready message on WhatsApp.'],
];

function howItWorks() {
  return html`<section class="lp-section lp-how" id="how" aria-labelledby="how-title">
    <div class="container">
      <div class="lp-section-head">
        <h2 id="how-title">How it works</h2>
        <p>From sign-up to your first ready message, without changing how your counter works.</p>
      </div>
      <ol class="lp-steps">
        ${STEPS.map(
          ([title, text], i) => html`<li class="lp-step">
            <span class="lp-step-no" aria-hidden="true">${i + 1}</span>
            <h3>${title}</h3>
            <p>${text}</p>
          </li>`
        )}
      </ol>
    </div>
  </section>`;
}

const AUDIENCE = [
  ['store', 'Print shops'],
  ['copy', 'Xerox & photocopy centres'],
  ['banner', 'Flex & banner printers'],
  ['printer', 'Offset printers'],
  ['camera', 'Digital & photo studios'],
  ['mail', 'Visiting-card & wedding-card printers'],
];

function audience() {
  return html`<section class="lp-section lp-who" aria-labelledby="who-title">
    <div class="container">
      <div class="lp-who-box">
        <h2 id="who-title">Made for every print counter</h2>
        <p>If customers send you files to print, PrintDesk fits your shop.</p>
        <ul class="lp-who-list">
          ${AUDIENCE.map(([ic, label]) => html`<li><span class="lp-who-ic">${ico(ic)}</span><span>${label}</span></li>`)}
        </ul>
      </div>
    </div>
  </section>`;
}

function faq() {
  const items = [
    ['Do my customers need an app or a login?', html`No. They open your link in any browser, fill in the form and upload their files. Each order gets a private tracking page. Nothing to install, no password.`],
    [
      'Which files can customers send?',
      html`PDF, JPG, PNG, TIFF, HEIC and WebP images, CorelDRAW (CDR), Illustrator (AI), Photoshop (PSD), EPS and SVG, Word, Excel and PowerPoint files, and ZIP, RAR or 7z archives.`,
    ],
    ['How big can the files be?', html`Up to ${MB(config.limits.orderFileBytes)} MB per file and ${config.limits.orderFiles} files per order, enough for print-ready PDFs and big CorelDRAW or Photoshop files.`],
    ['How long are files kept?', html`Files are deleted automatically after your retention period: 15 days by default, and you can change it in Settings. The order details and history stay.`],
    ['Can I use my own logo and colour?', html`Yes. Your order page shows your shop name, logo and brand colour, so customers see your shop first.`],
    ['Does it work on mobile?', html`Yes. Customers order from any phone, and you can run the whole counter from yours. PrintDesk also installs like an app on your phone or computer, straight from the browser.`],
    ['How do I get started?', html`<a href="/register">Register your shop</a> with a short form. Brighton Solution checks your details and approves your account, then you share your link and start taking orders. Want to look around first? <a href="/demo">Try the live demo</a>.`],
    ['What does it cost?', html`Plans depend on your shop. Send us a DM on Instagram at <a href="${DM_URL}" target="_blank" rel="noopener">@${config.instagram}</a> and we will share the details.`],
  ];
  return html`<section class="lp-section lp-faq" id="faq" aria-labelledby="faq-title">
    <div class="container lp-faq-grid">
      <div class="lp-faq-intro">
        <h2 id="faq-title">Questions shop owners ask</h2>
        <p>Something else on your mind? Send us a message and we will reply.</p>
        <a class="btn btn-secondary" href="${DM_URL}" target="_blank" rel="noopener">DM @${config.instagram}</a>
      </div>
      <div class="lp-faq-list">
        ${items.map(
          ([q, a]) => html`<details class="lp-qa" name="faq">
            <summary>${q}</summary>
            <div class="lp-qa-body"><p>${a}</p></div>
          </details>`
        )}
      </div>
    </div>
  </section>`;
}

function ctaBand() {
  return html`<section class="lp-section lp-final" aria-labelledby="final-title">
    <div class="container">
      <div class="lp-final-card">
        <div class="lp-final-copy">
          <h2 id="final-title">Give your customers one link for every print job</h2>
          <p>Try the demo in a minute, or register your shop and we will get you set up.</p>
        </div>
        <div class="lp-final-actions">
          <a class="btn btn-primary btn-lg" href="/demo"><span>Try live demo</span>${icon('arrowRight')}</a>
          <a class="btn btn-lg lp-btn-light" href="/register">Register your shop</a>
        </div>
      </div>
    </div>
  </section>`;
}

export function landingPage() {
  return html`<div class="lp">${hero()}${features()}${howItWorks()}${audience()}${faq()}${ctaBand()}</div>`;
}
