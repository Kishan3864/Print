import { Router } from 'express';
import { html } from '../lib/html.js';
import { config } from '../config.js';
import { clean, flash, formatDateTime, timeAgo } from '../lib/util.js';
import { demoLimiter, loginShop, requireAdmin } from '../lib/security.js';
import { DEFAULT_HOURS, createDemoLink, expireAllDemoLinks, expireDemoLink, extendDemoLink, getDemoLink, listDemoLinks, openDemoLink } from '../services/demo-links.js';

import { messagePage, render } from '../views/layout.js';
import { csrfField, icon } from '../views/components.js';

// Personal demo links made by the admin: /try/<token> opens a fresh demo shop.

export const tryRouter = Router();

tryRouter.get('/try/:token([A-Za-z0-9_-]{16,40})', demoLimiter, (req, res) => {
  const shop = openDemoLink(req.params.token);
  if (!shop) {
    return messagePage(res, {
      status: 410,
      title: 'This demo link has expired',
      text: 'Demo links work for a limited time. Ask Brighton Solution for a new link, or register your shop to start for real.',
      iconName: 'clock',
      action: html`<div class="btn-row"><a class="btn btn-primary" href="/register">Register your shop</a><a class="btn btn-secondary" href="https://ig.me/m/${config.instagram}" target="_blank" rel="noopener">Message us</a></div>`,
    });
  }
  loginShop(req, shop, { demo: true });
  flash(req, 'success', 'Welcome to your demo shop! It has sample orders – open one, send a design preview for the customer’s OK, then mark it ready.');
  res.redirect(303, '/shop');
});

export const adminDemoRouter = Router();
adminDemoRouter.use(requireAdmin);

const STATE = { unused: ['Not opened', 'pill-new'], active: ['Active', 'pill-approved'], expired: ['Expired', 'pill-cancelled'] };

function left(iso) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'ended';
  const h = Math.floor(ms / 3600000);
  return h >= 48 ? `${Math.floor(h / 24)} days left` : h >= 1 ? `${h} h left` : `${Math.ceil(ms / 60000)} min left`;
}

adminDemoRouter.get('/demo-links', (req, res) => {
  const links = listDemoLinks();
  const running = links.filter((l) => l.state !== 'expired').length;
  const url = (l) => `${config.baseUrl}/try/${l.token}`;
  render(res, {
    title: 'Demo links',
    variant: 'admin',
    active: 'demos',
    body: html`<section class="container adm">
      <div class="adm-pagehead">
        <div>
          <p class="adm-kicker">${running ? `${running} running` : 'No links running'} · one link per person</p>
          <h1>Demo links</h1>
        </div>
        ${running
          ? html`<form method="post" action="/admin/demo-links/expire-all" class="adm-pagehead-actions">${csrfField(res)}<button class="btn btn-danger" type="submit" data-confirm="Expire all ${running} running demo link(s) now?">${icon('x')}<span>Expire all (${running})</span></button></form>`
          : ''}
      </div>

      <form method="post" action="/admin/demo-links" class="card adm-dl-create">
        ${csrfField(res)}
        <div class="adm-dl-intro">
          <span class="fold-ic">${icon('link')}</span>
          <div><h2>Make a new demo link</h2><p class="hint">It opens a fresh demo shop with sample orders, and stops working when the time is up.</p></div>
        </div>
        <div class="form-row">
          <div class="field"><label for="dl-label">Who is it for?</label><input id="dl-label" name="label" required maxlength="80" placeholder="e.g. Sharma Xerox, Surat (Instagram)"></div>
          <div class="field"><label for="dl-hours">Works for (hours)</label><input id="dl-hours" name="hours" type="number" min="1" max="2160" value="${DEFAULT_HOURS}" required></div>
        </div>
        <button class="btn btn-primary btn-lg" type="submit">${icon('plus')}<span>Create demo link</span></button>
      </form>

      <div class="card adm-tablecard adm-dl-list">
        ${links.length
          ? html`<div class="table-wrap adm-table-wrap"><table class="table table-cards adm-dl-table">
              <thead><tr><th scope="col">For</th><th scope="col">Status</th><th scope="col">Expires</th><th scope="col">Demo shop</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
              <tbody>${links.map(
                (l) => html`<tr>
                  <td data-label="For" class="adm-dl-for"><b>${l.label}</b><span class="adm-sub">created ${timeAgo(l.created_at)}</span></td>
                  <td data-label="Status"><span class="pill ${STATE[l.state][1]}">${STATE[l.state][0]}</span></td>
                  <td data-label="Expires"><span class="adm-lines"><span>${formatDateTime(l.expires_at)}</span><span class="adm-sub">${left(l.expires_at)}</span></span></td>
                  <td data-label="Demo shop">${l.shop_id ? html`<a href="/admin/shops/${l.shop_id}">${l.shop_slug}</a> · ${l.orders} orders` : html`<span class="adm-sub">Not opened yet</span>`}</td>
                  <td class="adm-dl-actions">
                    <button type="button" class="btn btn-soft btn-sm" data-copy="${url(l)}" data-copy-msg="Demo link copied">${icon('copy')}<span>Copy link</span></button>
                    <form method="post" action="/admin/demo-links/${l.id}/extend" class="adm-dl-extend">${csrfField(res)}<input name="hours" type="number" min="1" max="2160" value="24" class="dl-hours" aria-label="Hours to add"><button class="btn btn-secondary btn-sm" type="submit">${icon('clock')}<span>${l.state === 'expired' ? 'Reopen' : 'Add hours'}</span></button></form>
                    ${l.state !== 'expired' ? html`<form method="post" action="/admin/demo-links/${l.id}/expire">${csrfField(res)}<button class="btn btn-ghost btn-sm" type="submit" data-confirm="Expire this demo link now?">${icon('x')}<span>Expire</span></button></form>` : ''}
                  </td>
                </tr>`
              )}</tbody>
            </table></div>`
          : html`<div class="empty"><h3>No demo links yet</h3><p>Create one above and send it to a lead on Instagram or WhatsApp.</p></div>`}
      </div>
    </section>`,
  });
});

adminDemoRouter.post('/demo-links', (req, res) => {
  const label = clean(req.body.label, 80);
  if (!label) {
    flash(req, 'error', 'Write who the link is for.');
    return res.redirect(303, '/admin/demo-links');
  }
  const link = createDemoLink(label, req.body.hours);
  flash(req, 'success', `Demo link for ${label} is ready (valid ${link.hours} h): ${config.baseUrl}/try/${link.token}`);
  res.redirect(303, '/admin/demo-links');
});

adminDemoRouter.post('/demo-links/expire-all', (req, res) => {
  flash(req, 'success', `${expireAllDemoLinks()} demo link(s) expired.`);
  res.redirect(303, '/admin/demo-links');
});

adminDemoRouter.post('/demo-links/:id(\\d+)/:action(extend|expire)', (req, res) => {
  const link = getDemoLink(req.params.id);
  if (!link) return res.redirect(303, '/admin/demo-links');
  if (req.params.action === 'expire') {
    expireDemoLink(link);
    flash(req, 'success', `Demo link for ${link.label} expired.`);
  } else {
    extendDemoLink(link, req.body.hours);
    flash(req, 'success', `Demo link for ${link.label} extended.`);
  }
  res.redirect(303, '/admin/demo-links');
});

