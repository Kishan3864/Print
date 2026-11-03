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

const OWN_DEMO = [
  'Your shop name, logo and colour',
  'Your own customer link and QR code',
  'Send it to a few customers and try real orders',
  'Go live anytime – just choose a plan',
];

/** "Create your own demo shop" – or a way back to the one this visitor already has. */
function ownDemoCard(res, { realShop, ownDemo }) {
  const days = config.demo.trialDays;
  return html`<div class="dm-own">
    <div class="dm-own-copy">
      <span class="dm-own-tag">${icon('sparkle')}<span>Free demo · ${days} days</span></span>
      <h2>Create your own demo shop</h2>
      <p>Your own PrintDesk with your shop's name – ready in a minute. No payment, no approval.</p>
      <ul class="dm-own-list">
        ${OWN_DEMO.map((t) => html`<li>${icon('check')}<span>${t}</span></li>`)}
      </ul>
    </div>
    <div class="dm-own-action">
      ${ownDemo
        ? html`<p class="dm-note">${icon('info')}<span>You already have a demo shop: <b>${ownDemo.name}</b>.</span></p>
            <a class="btn btn-primary btn-lg btn-block" href="/shop"><span>Open my demo shop</span>${icon('arrowRight')}</a>`
        : html`${realShop ? html`<p class="dm-note">${icon('info')}<span>You are logged in as ${realShop.name}. Creating a demo shop logs you out of it.</span></p>` : ''}
            <a class="btn btn-primary btn-lg btn-block" href="/demo/register"><span>Create my demo shop</span>${icon('arrowRight')}</a>
            <p class="dm-own-fine">Takes about a minute · no card needed</p>`}
    </div>
  </div>`;
}

/**
 * /demo: three ways in – the sample customer page, the sample shop dashboard
 * (one click) and a personal demo shop.
 */
export function demoPage(res, { realShop = null, ownDemo = null } = {}) {
  const files = config.limits.demoFiles;
  return html`<section class="container dm">
    <div class="dm-head">
      <h1>PrintDesk live demo</h1>
      <p class="lead">Look around a sample print shop in one click, or create your own demo shop – free, no payment.</p>
    </div>

    <div class="dm-choices">
      <div class="dm-card">
        <span class="dm-icon">${icon('user')}</span>
        <h2>Try as a customer</h2>
        <p>See what your customers see: upload a file, choose size &amp; quantity, get an order number.</p>
        <a class="btn btn-secondary btn-lg btn-block dm-action" href="/demo/${config.demo.slug}" target="_blank" rel="noopener"><span>Open customer page</span>${icon('arrowRight')}<span class="sr-only"> (opens in a new tab)</span></a>
      </div>

      <div class="dm-card">
        <span class="dm-icon">${icon('store')}</span>
        <h2>Open the sample shop dashboard</h2>
        <p>See the shop side: new orders, send a proof, mark ready, WhatsApp the customer.</p>
        ${realShop || ownDemo
          ? html`<p class="dm-note">${icon('info')}<span>You are logged in as ${(realShop || ownDemo).name}. Opening the sample shop logs you out of it.</span></p>`
          : ''}
        <form method="post" action="/demo/login" class="dm-action">
          ${csrfField(res)}
          <button type="submit" class="btn btn-secondary btn-lg btn-block" data-loading="Opening dashboard…"><span>Open shop dashboard</span>${icon('arrowRight')}</button>
        </form>
      </div>
    </div>

    ${ownDemoCard(res, { realShop, ownDemo })}

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
      <p>Sample shop · data resets every ${config.demo.resetHours} hours · demo uploads: ${files} file${files === 1 ? '' : 's'} up to ${MB(config.limits.demoFileBytes)} MB</p>
      <p>Ready for your shop? <a href="/#pricing">See plans</a> · <a href="/register">Register</a> or DM <b>PRINT</b> to <a href="${DM_URL}" target="_blank" rel="noopener">@${config.instagram}</a></p>
    </div>
  </section>`;
}
