import { html } from '../../lib/html.js';
import { config } from '../../config.js';
import { csrfField, icon } from '../components.js';

const MB = (bytes) => Math.round(bytes / (1024 * 1024));

/** /demo: pick a side: customer order form or one-click shop dashboard. */
export function demoPage(res, { realShop = null } = {}) {
  const files = config.limits.demoFiles;
  return html`<section class="container dm">
    <div class="dm-head">
      <h1>Try PrintDesk live</h1>
      <p class="lead">Play both sides of a real order: the customer who sends the file, and the shop that prints it.</p>
    </div>

    <div class="dm-choices">
      <a class="dm-card dm-card-customer" href="/${config.demo.slug}" target="_blank" rel="noopener">
        <span class="dm-icon">${icon('upload')}</span>
        <span class="dm-title">Try as customer</span>
        <span class="dm-text">Open the demo shop's order link and send a test file, just like your customers will.</span>
        <span class="dm-go"><span>Open order form</span>${icon('arrowRight')}</span>
      </a>

      <form method="post" action="/demo/login" class="dm-form">
        ${csrfField(res)}
        <button type="submit" class="dm-card dm-card-shop">
          <span class="dm-icon">${icon('orders')}</span>
          <span class="dm-title">Try the shop dashboard</span>
          <span class="dm-text">One click, no password. See new orders, send proofs and the WhatsApp ready message.</span>
          <span class="dm-go"><span>Open dashboard</span>${icon('arrowRight')}</span>
        </button>
        ${realShop ? html`<p class="dm-note">${icon('info')}<span>You are logged in as ${realShop.name}. Opening the demo logs you out of your shop.</span></p>` : ''}
      </form>
    </div>

    <div class="dm-try card">
      <h2>What to try</h2>
      <ol class="dm-steps">
        <li><b>Place an order as a customer.</b> Upload a small file, pick a size and quantity, and note your order number.</li>
        <li><b>See it arrive in the dashboard.</b> A new-order alert shows up within about 30 seconds.</li>
        <li><b>Send a proof, then approve it.</b> Upload a proof on the order page, then approve it from the customer's tracking page.</li>
        <li><b>Mark it ready.</b> Tap the WhatsApp button and see the ready message, already written for you.</li>
      </ol>
      <p class="dm-meta">${icon('refresh')}<span>Sample data, resets every ${config.demo.resetHours} hours. Demo uploads: ${files} file${files === 1 ? '' : 's'} up to ${MB(config.limits.demoFileBytes)} MB.</span></p>
    </div>

    <p class="dm-foot">Like what you see? <a href="/register">Register your shop</a> and get your own order link.</p>
  </section>`;
}
