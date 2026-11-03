import { html } from '../../lib/html.js';
import { config } from '../../config.js';
import { csrfField, icon } from '../components.js';

const MB = (bytes) => Math.round(bytes / (1024 * 1024));
const DM_URL = `https://ig.me/m/${config.instagram}`;

const STEPS = [
  ['Place an order as a customer.', 'Upload a small file, pick size and quantity, note the order number.'],
  ['See it in the dashboard.', 'Open the shop dashboard. The new order is at the top.'],
  ['Send a proof.', 'Open the order and upload a proof file.'],
  ['Approve it and mark ready.', 'Approve the proof on the customer page, then mark the order ready in the dashboard.'],
];

/** /demo: pick a side: customer order page or one-click shop dashboard. */
export function demoPage(res, { realShop = null } = {}) {
  const files = config.limits.demoFiles;
  return html`<section class="container dm">
    <div class="dm-head">
      <h1>PrintDesk live demo</h1>
      <p class="lead">Try it yourself with a sample print shop – no sign-up needed.</p>
    </div>

    <div class="dm-choices">
      <div class="dm-card">
        <span class="dm-icon">${icon('user')}</span>
        <h2>I am a customer</h2>
        <p>See what your customers see: upload a file, choose size &amp; quantity, get an order number.</p>
        <a class="btn btn-primary btn-lg btn-block dm-action" href="/${config.demo.slug}" target="_blank" rel="noopener"><span>Open customer page</span>${icon('arrowRight')}<span class="sr-only"> (opens in a new tab)</span></a>
      </div>

      <div class="dm-card">
        <span class="dm-icon">${icon('store')}</span>
        <h2>I am the shop owner</h2>
        <p>See your dashboard: new orders, send proof, mark ready, WhatsApp the customer.</p>
        ${realShop ? html`<p class="dm-note">${icon('info')}<span>You are logged in as ${realShop.name}. Opening the demo logs you out of your shop.</span></p>` : ''}
        <form method="post" action="/demo/login" class="dm-action">
          ${csrfField(res)}
          <button type="submit" class="btn btn-primary btn-lg btn-block" data-loading="Opening dashboard…"><span>Open shop dashboard</span>${icon('arrowRight')}</button>
        </form>
      </div>
    </div>

    <div class="card dm-try">
      <h2>Try this in 1 minute</h2>
      <ol class="dm-steps">
        ${STEPS.map(
          ([title, text], i) => html`<li>
            <span class="dm-step-no" aria-hidden="true">${i + 1}</span>
            <span><b>${title}</b> ${text}</span>
          </li>`
        )}
      </ol>
    </div>

    <div class="dm-info">
      <p>Sample data · resets every ${config.demo.resetHours} hours · demo uploads: ${files} file${files === 1 ? '' : 's'} up to ${MB(config.limits.demoFileBytes)} MB</p>
      <p>Want this for your shop? <a href="/register">Register</a> or DM <b>PRINT</b> to <a href="${DM_URL}" target="_blank" rel="noopener">@${config.instagram}</a></p>
    </div>
  </section>`;
}
