/* Live page updates: listens on /live (Server-Sent Events) and, when something
   changes, re-fetches this page and swaps in the new content – no reload.
   Never replaces content while the user is typing in a form on the page. */
(function () {
  'use strict';
  if (!window.EventSource || !window.fetch || !window.DOMParser) return;

  var body = document.body;
  var params = '';
  var m = /^(?:\/demo)?\/([a-z0-9-]+)\/o\/([A-Za-z0-9_-]{20,64})/.exec(location.pathname);
  if (m) params = '?s=' + encodeURIComponent(m[1]) + '&t=' + encodeURIComponent(m[2]);
  else if (!/\bv-(shop|admin)\b/.test(body.className)) return;

  var pending = false;
  var busy = false;
  var timer = null;

  function editing() {
    // Forms that build up content (the bill editor) never get swapped under the user.
    if (document.querySelector('main [data-live-hold]')) return true;
    var el = document.activeElement;
    if (el && el.closest('main') && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== 'submit') return true;
    var fields = document.querySelectorAll('main textarea, main input[type=text], main input[type=file], main input[type=email], main input[type=tel], main input[type=number]');
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.type === 'file' ? f.files && f.files.length : f.value !== f.defaultValue) return true;
    }
    return document.querySelector('form.is-loading') !== null;
  }

  function swap(sel, doc) {
    var now = document.querySelector(sel);
    var next = doc.querySelector(sel);
    if (now && next && now.innerHTML !== next.innerHTML) now.innerHTML = next.innerHTML;
  }

  function refresh() {
    if (busy) return;
    if (editing()) {
      pending = true;
      return;
    }
    busy = true;
    pending = false;
    fetch(location.href, { credentials: 'same-origin', headers: { 'X-Live': '1' } })
      .then(function (r) {
        if (r.redirected && r.url !== location.href) { location.href = r.url; return null; }
        if (!r.ok) return null;
        return r.text();
      })
      .then(function (html) {
        if (!html) return;
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var openDetails = Array.prototype.map.call(document.querySelectorAll('main details[open]'), function (d, i) { return i; });
        swap('main', doc);
        swap('header', doc);
        swap('.tabbar', doc);
        swap('[data-annc]', doc);
        var csrf = doc.body && doc.body.getAttribute('data-csrf');
        if (csrf) body.setAttribute('data-csrf', csrf);
        var details = document.querySelectorAll('main details');
        openDetails.forEach(function (i) { if (details[i]) details[i].open = true; });
        document.dispatchEvent(new CustomEvent('pd:live-updated'));
      })
      .catch(function () {})
      .then(function () {
        busy = false;
      });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 250);
  }

  // Apply a held-back update once the user leaves the form.
  document.addEventListener('focusout', function () {
    if (pending) setTimeout(function () { if (pending) refresh(); }, 400);
  });

  var es = new EventSource('/live' + params);
  es.addEventListener('change', schedule);
})();
