/* PrintDesk shop area (every /shop page): live new-order alert, relative times, proof file checks. CSP-safe. */
(function () {
  'use strict';

  var POLL_MS = 30000;
  var PD = window.PD || {};

  // ---------- storage (may be blocked: fail soft) ----------
  function sget(k) {
    try {
      return window.localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }
  function sset(k, v) {
    try {
      window.localStorage.setItem(k, String(v));
    } catch (e) {}
  }
  function num(v) {
    var n = parseInt(v, 10);
    return isFinite(n) && n >= 0 ? n : null;
  }

  // ---------- state ----------
  // seen    = highest order id the shop has seen on the dashboard (badge counts orders above it)
  // alerted = highest order id we already chimed for (so each order alerts once, across tabs)
  var live = document.querySelector('[data-orders-live]');
  var shopId = live ? live.getAttribute('data-shop-id') : sget('pd_shop');
  var seen = null;
  var alerted = null;

  function load() {
    seen = shopId ? num(sget('pd_seen_' + shopId)) : null;
    alerted = shopId ? num(sget('pd_alerted_' + shopId)) : null;
  }
  function save() {
    if (!shopId) return;
    sset('pd_shop', shopId);
    if (seen != null) sset('pd_seen_' + shopId, seen);
    if (alerted != null) sset('pd_alerted_' + shopId, alerted);
  }

  load();
  if (live) {
    // Viewing the dashboard marks everything up to now as seen.
    var latest = num(live.getAttribute('data-latest-order-id')) || 0;
    seen = latest;
    alerted = Math.max(alerted || 0, latest);
    save();
  }

  // ---------- badge, title, dashboard bar ----------
  var baseTitle = document.title.replace(/^\(\d+\+?\)\s+/, '');

  function setCount(n) {
    var label = n >= 20 ? '20+' : String(n);
    var badges = document.querySelectorAll('[data-new-badge]');
    for (var i = 0; i < badges.length; i++) {
      badges[i].textContent = n ? label : '';
      badges[i].hidden = !n;
      if (n) badges[i].setAttribute('title', label + ' new order' + (n === 1 ? '' : 's'));
    }
    document.title = n ? '(' + label + ') ' + baseTitle : baseTitle;
    if (!live) return;
    var bar = document.querySelector('[data-new-bar]');
    if (!bar) return;
    var text = bar.querySelector('[data-new-bar-text]');
    if (text) text.textContent = label + ' new order' + (n === 1 ? '' : 's');
    bar.hidden = !n;
  }

  function setStats(counts) {
    if (!live || !counts) return;
    var els = document.querySelectorAll('[data-stat]');
    for (var i = 0; i < els.length; i++) {
      var v = counts[els[i].getAttribute('data-stat')];
      if (typeof v === 'number') els[i].textContent = String(v);
    }
  }

  // ---------- soft chime (Web Audio; needs one user gesture first) ----------
  // Only these events count as a user gesture everywhere (iOS ignores touchstart and touch pointerdown).
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null;
  var gestures = ['pointerup', 'touchend', 'click', 'keydown'];

  function listen(on) {
    gestures.forEach(function (ev) {
      if (on) document.addEventListener(ev, unlock, true);
      else document.removeEventListener(ev, unlock, true);
    });
  }
  function unlocked() {
    if (ctx && ctx.state === 'running') listen(false);
  }

  function unlock() {
    if (!AC) return;
    try {
      if (!ctx) ctx = new AC();
      var p = ctx.state !== 'running' && ctx.resume ? ctx.resume() : null;
      if (p && p.then) p.then(unlocked, function () {});
      // iOS unlocks audio only when a sound starts inside the gesture: play one silent frame.
      try {
        var src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
      } catch (e) {}
      unlocked();
    } catch (e) {}
  }
  if (AC) listen(true);
  // iOS suspends ("interrupted") the audio again after the screen locks: unlock on the next tap.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') listen(true);
  });

  function tone(freq, start, dur) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.08, start + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  function chime() {
    if (!ctx) return;
    function play() {
      try {
        var t = ctx.currentTime + 0.03;
        tone(880, t, 0.35); // A5
        tone(1318.5, t + 0.17, 0.5); // E6
      } catch (e) {}
    }
    try {
      if (ctx.state === 'running') play();
      else if (ctx.resume) ctx.resume().then(play, function () {});
    } catch (e) {}
  }

  function announce(fresh) {
    chime();
    try {
      if (navigator.vibrate) navigator.vibrate([60, 60, 60]);
    } catch (e) {}
    if (typeof PD.toast !== 'function') return;
    var o = fresh[0]; // newest first
    var who = o.name ? ' from ' + o.name : '';
    if (fresh.length === 1) PD.toast('New order #' + o.no + who, { href: '/shop/orders/' + o.no, linkText: 'Open', duration: 10000 });
    else PD.toast(fresh.length + ' new orders – latest #' + o.no + who, { href: '/shop', linkText: 'View', duration: 10000 });
  }

  // ---------- polling ----------
  var stopped = false;
  var busy = false;
  var lastPoll = 0;
  var timer = null;

  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
  }

  function handle(d) {
    var sid = d && d.shopId != null ? String(d.shopId) : '';
    var latestId = num(d && d.latestId);
    if (!sid || latestId == null) return;

    if (sid !== String(shopId)) {
      // A different shop is logged in on this browser: switch keys.
      var sentSince = seen;
      shopId = sid;
      load();
      sset('pd_shop', shopId);
      if (seen != null && seen !== sentSince) {
        setTimeout(poll, 0); // this answer was for another baseline
        return;
      }
    }
    if (seen == null) {
      seen = alerted = latestId; // first visit on this browser: baseline only, no alert
      save();
      return;
    }
    if (seen > latestId) {
      seen = latestId; // orders were removed (e.g. demo reset)
      sset('pd_seen_' + shopId, seen);
    }
    // Another tab (also another dashboard) may have alerted for these orders while this poll ran.
    var stored = num(sget('pd_alerted_' + shopId));
    if (stored != null && (alerted == null || stored > alerted)) alerted = stored;
    if (alerted == null || alerted < seen) alerted = seen;
    if (alerted > latestId) alerted = latestId;

    var list = Array.isArray(d.newOrders) ? d.newOrders : [];
    var unseen = list.filter(function (o) {
      return num(o.id) > seen;
    });
    var fresh = unseen.filter(function (o) {
      return num(o.id) > alerted;
    });
    setCount(unseen.length);
    setStats(d.counts);
    if (fresh.length) announce(fresh);
    alerted = Math.max(alerted, latestId);
    sset('pd_alerted_' + shopId, alerted);
  }

  function poll() {
    if (stopped || busy || !window.fetch) return;
    // Other tabs may have moved the baseline (e.g. the dashboard was opened there). The alerted
    // mark is merged in handle() for every tab, so each order alerts once across tabs.
    if (!live && shopId) {
      var s = num(sget('pd_seen_' + shopId));
      if (s != null) seen = s;
    }
    busy = true;
    lastPoll = Date.now();
    fetch('/shop/api/poll' + (seen != null ? '?since=' + seen : ''), {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) {
          stop();
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        if (d) handle(d);
      })
      .catch(function () {})
      .then(function () {
        busy = false;
      });
  }

  if (window.fetch) {
    timer = setInterval(poll, POLL_MS);
    if (!live) setTimeout(poll, 1500);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Date.now() - lastPoll > 5000) poll();
    });
    window.addEventListener('online', poll);
  }

  // ---------- relative times ("5 min ago") stay fresh on long-open pages ----------
  function ago(iso) {
    var s = Math.round((Date.now() - Date.parse(iso)) / 1000);
    if (!isFinite(s) || s < -60) return null;
    if (s < 45) return 'just now';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' hr' + (h > 1 ? 's' : '') + ' ago';
    var d = Math.round(h / 24);
    if (d < 7) return d + ' day' + (d > 1 ? 's' : '') + ' ago';
    return null;
  }
  setInterval(function () {
    var els = document.querySelectorAll('time[data-ago]');
    for (var i = 0; i < els.length; i++) {
      var t = ago(els[i].getAttribute('datetime'));
      if (t) els[i].textContent = t;
    }
  }, 60000);

  // ---------- proof file input: show the chosen file, check size before upload ----------
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    var u = ['KB', 'MB', 'GB'];
    var i = -1;
    do {
      n /= 1024;
      i++;
    } while (n >= 1024 && i < u.length - 1);
    return (n >= 100 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
  }

  document.addEventListener('change', function (e) {
    var input = e.target;
    if (!input || !input.hasAttribute || !input.hasAttribute('data-proof-input')) return;
    var zone = input.closest ? input.closest('.dropzone') : null;
    var label = zone ? zone.querySelector('[data-file-name]') : null;
    var f = input.files && input.files[0];
    var max = num(input.getAttribute('data-proof-max'));
    if (f && max && f.size > max) {
      input.value = '';
      f = null;
      if (typeof PD.toast === 'function') PD.toast('That file is too big. The limit is ' + fmtBytes(max) + '.');
    }
    if (label) label.textContent = f ? f.name + ' · ' + fmtBytes(f.size) : label.getAttribute('data-default') || '';
    if (zone) zone.classList.toggle('has-file', Boolean(f));
  });
})();
