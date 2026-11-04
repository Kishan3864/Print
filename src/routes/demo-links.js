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
  const shopLink = (l) =>
    l.shop_id ? html`<a href="/admin/shops/${l.shop_id}">${l.shop_slug}</a> <span class="adm-sub">· ${l.orders} order${l.orders === 1 ? '' : 's'}</span>` : html`<span class="adm-sub">Not opened yet</span>`;
  render(res, {
    title: 'Demo links',
    variant: 'admin',
    active: 'demos',
    scripts: ['/js/admin.js'],
    body: html`<section class="container adm">
      <div class="adm-pagehead">
        <div>
          <p class="adm-kicker">${running ? `${running} running` : 'No links running'} · ${links.length} made · one link per person</p>
          <h1>Demo links</h1>
        </div>
        ${running
          ? html`<form method="post" action="/admin/demo-links/expire-all" class="adm-pagehead-actions">${csrfField(res)}<button class="btn btn-danger" type="submit" data-confirm="Expire all ${running} running demo link(s) now?">${icon('x')}<span>Expire all (${running})</span></button></form>`
          : ''}
      </div>

      <form method="post" action="/admin/demo-links" class="card adm-dl-create">
        ${csrfField(res)}
        <div class="adm-dl-create-head">
          <span class="fold-ic">${icon('link')}</span>
          <div><h2>Make a new demo link</h2><p class="hint">Opens a fresh demo shop with sample orders. Stops working when the time is up.</p></div>
        </div>
        <div class="adm-dl-create-body">
          <div class="field"><label for="dl-label">Who is it for?</label><input type="text" id="dl-label" name="label" required maxlength="80" autocomplete="off" placeholder="e.g. Sharma Xerox, Surat (Instagram)"></div>
          <div class="field"><label for="dl-hours">Works for (hours)</label><input id="dl-hours" name="hours" type="number" inputmode="numeric" min="1" max="2160" value="${DEFAULT_HOURS}" required></div>
          <button class="btn btn-primary" type="submit">${icon('plus')}<span>Create link</span></button>
        </div>
      </form>

      <section class="card adm-tablecard adm-dl-list" aria-label="Demo links">
        ${links.length
          ? html`<div class="adm-toolbar">
              <div class="search-input adm-toolbar-search">
                ${icon('search')}
                <label class="sr-only" for="dl-q">Filter demo links</label>
                <input type="search" id="dl-q" placeholder="Filter by name or shop" autocomplete="off" data-row-filter="#adm-dl-table">
              </div>
              <p class="adm-count" aria-live="polite" data-row-count data-noun="link"><b>${links.length}</b> link${links.length === 1 ? '' : 's'} · ${running} running</p>
            </div>
            <div class="table-wrap adm-table-wrap"><table class="table adm-table adm-dl-table" id="adm-dl-table">
              <thead><tr><th scope="col">For</th><th scope="col">Status</th><th scope="col">Time left</th><th scope="col" class="adm-dl-shopcol">Demo shop</th><th scope="col" class="adm-dl-actions"><span class="sr-only">Actions</span></th></tr></thead>
              <tbody>${links.map((l) => {
                const ms = Date.parse(l.expires_at) - Date.now();
                const pct = l.state === 'expired' || ms <= 0 ? 0 : Math.max(4, Math.min(100, Math.round((ms / (Math.max(1, l.hours || DEFAULT_HOURS) * 3600000)) * 100)));
                const tone = l.state === 'expired' || ms <= 0 ? 'danger' : ms < 3 * 3600000 ? 'warn' : 'ok';
                return html`<tr data-row data-search="${[l.label, l.shop_slug].filter(Boolean).join(' ').toLowerCase()}"${l.state === 'expired' ? html` class="is-expired"` : ''}>
                  <td class="adm-dl-forcol"><div class="adm-dl-for"><b>${l.label}</b><span class="adm-sub">Made ${timeAgo(l.created_at)}</span><span class="adm-dl-shop adm-dl-shop-inline">${shopLink(l)}</span></div></td>
                  <td class="adm-dl-statuscol"><span class="pill ${STATE[l.state][1]}">${STATE[l.state][0]}</span></td>
                  <td class="adm-dl-leftcol"><div class="adm-dl-left">
                    <span class="${tone === 'danger' ? 'adm-danger' : tone === 'warn' ? 'adm-warn' : 'adm-ok'}">${l.state === 'expired' ? 'Ended' : left(l.expires_at)}</span>
                    <svg class="adm-days is-${tone}" viewBox="0 0 100 4" preserveAspectRatio="none" width="100" height="4" aria-hidden="true" focusable="false"><rect class="adm-days-track" width="100" height="4"/><rect class="adm-days-fill" width="${pct}" height="4"/></svg>
                    <span class="adm-sub">${l.state === 'expired' ? 'ended' : 'until'} ${formatDateTime(l.expires_at)}</span>
                  </div></td>
                  <td class="adm-dl-shopcol"><span class="adm-dl-shop">${shopLink(l)}</span></td>
                  <td class="adm-dl-actions"><div class="adm-dl-acts">
                    <button type="button" class="btn btn-secondary btn-sm" data-copy="${url(l)}" data-copy-msg="Demo link copied">${icon('copy')}<span>Copy link</span></button>
                    <form method="post" action="/admin/demo-links/${l.id}/extend" class="adm-dl-extend">${csrfField(res)}<input name="hours" type="number" inputmode="numeric" min="1" max="2160" value="24" class="dl-hours" aria-label="Hours to add for ${l.label}"><button class="btn btn-secondary btn-sm" type="submit">${icon('clock')}<span>${l.state === 'expired' ? 'Reopen' : 'Add hours'}</span></button></form>
                    ${l.state !== 'expired' ? html`<form method="post" action="/admin/demo-links/${l.id}/expire">${csrfField(res)}<button class="btn btn-ghost btn-sm" type="submit" data-confirm="Expire this demo link now?" title="Expire now">${icon('x')}<span>Expire</span></button></form>` : ''}
                  </div></td>
                </tr>`;
              })}</tbody>
            </table>
            <p class="adm-nomatch" data-row-empty hidden>No demo link matches this filter.</p></div>`
          : html`<div class="empty"><h3>No demo links yet</h3><p>Create one above and send it to a lead on Instagram or WhatsApp.</p></div>`}
      </section>
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

