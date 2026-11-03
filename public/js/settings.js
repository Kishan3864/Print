/* Brighton Print – shop settings, link page and counter poster (CSP-safe, no inline JS). */
(function () {
  'use strict';

  var $ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  // ---------- poster: print + paper size ----------
  $$('[data-print]').forEach(function (b) {
    b.addEventListener('click', function () {
      window.print();
    });
  });

  var poster = $('[data-poster]');
  $$('[data-paper]').forEach(function (b) {
    b.addEventListener('click', function () {
      var a5 = b.getAttribute('data-paper') === 'a5';
      if (poster) poster.classList.toggle('is-a5', a5);
      document.body.classList.toggle('set-paper-a5', a5);
      $$('[data-paper]').forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
    });
  });

  // ---------- link page: read-only message boxes grow to fit their text ----------
  var copyBoxes = $$('.set-copy-text');
  function fitBoxes() {
    copyBoxes.forEach(function (t) {
      t.style.height = 'auto';
      t.style.height = t.scrollHeight + 2 + 'px';
    });
  }
  if (copyBoxes.length) {
    fitBoxes();
    window.addEventListener('resize', fitBoxes);
  }

  // ---------- settings: live preview ----------
  var form = $('[data-settings-form]');
  if (!form) return;
  var preview = $('[data-brand-preview]');

  // Same colour rule as the server's /brand/<slug>.css (src/lib/util.js inkFor).
  var HEX = /^#?([0-9a-f]{6})$/i;
  function luminance(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    var x = luminance(a);
    var y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  // Dark ink or white text, whichever contrasts more with the colour.
  function inkFor(hex) {
    return contrast(hex, '#0b1220') >= contrast(hex, '#ffffff') ? '#0b1220' : '#ffffff';
  }

  var picker = $('[data-color-picker]', form);
  var text = $('[data-color-text]', form);
  var swatches = $$('[data-swatch]', form);
  var current = null;

  // The preview shows the brand colour exactly as customers see it.
  function paint() {
    if (!preview || !current) return;
    preview.style.setProperty('--brand', current);
    preview.style.setProperty('--brand-ink', inkFor(current));
  }

  function applyColor(hex, from) {
    var m = HEX.exec(String(hex || '').trim());
    if (!m) return;
    hex = '#' + m[1].toLowerCase();
    current = hex;
    paint();
    if (picker && from !== 'picker') picker.value = hex;
    if (text && from !== 'text') text.value = hex;
    swatches.forEach(function (s) {
      s.setAttribute('aria-pressed', String(s.getAttribute('data-swatch') === hex));
    });
  }

  if (picker) {
    picker.addEventListener('input', function () {
      applyColor(picker.value, 'picker');
    });
  }
  if (text) {
    text.addEventListener('input', function () {
      applyColor(text.value, 'text');
    });
    text.addEventListener('blur', function () {
      var m = HEX.exec(text.value.trim());
      if (m) text.value = '#' + m[1].toLowerCase();
    });
    applyColor(text.value, 'init');
  }
  swatches.forEach(function (s) {
    s.addEventListener('click', function () {
      applyColor(s.getAttribute('data-swatch'));
    });
  });

  // Shop name + first address line.
  var nameIn = $('[data-preview-source="name"]', form);
  var addrIn = $('[data-preview-source="address"]', form);
  var nameOut = $('[data-preview-name]', form);
  var addrOut = $('[data-preview-address]', form);
  var initialOut = $('[data-preview-initial]', form);
  function syncText() {
    if (nameIn && nameOut) {
      var name = nameIn.value.trim() || 'Your shop';
      nameOut.textContent = name;
      if (initialOut) initialOut.textContent = name.charAt(0).toUpperCase();
    }
    if (addrIn && addrOut) {
      var first = addrIn.value.split('\n')[0].trim();
      addrOut.textContent = first;
      addrOut.hidden = !first;
    }
  }
  if (nameIn) nameIn.addEventListener('input', syncText);
  if (addrIn) addrIn.addEventListener('input', syncText);

  // Logo: preview the chosen file before saving, and catch over-size files early.
  var logoIn = $('#logo', form);
  var logoName = $('[data-logo-name]', form);
  var logoError = $('[data-logo-error]', form);
  var thumb = $('[data-logo-thumb]', form);
  var thumbEmpty = $('[data-logo-thumb-empty]', form);
  var previewLogo = $('[data-preview-logo]', form);
  var lastUrl = null;
  if (logoIn) {
    logoIn.addEventListener('change', function () {
      var f = logoIn.files && logoIn.files[0];
      var max = parseInt(logoIn.getAttribute('data-max-bytes'), 10) || 2097152;
      if (logoError) {
        logoError.hidden = true;
        logoError.textContent = '';
      }
      if (!f) {
        if (logoName) logoName.hidden = true;
        return;
      }
      if (f.size > max || !/\.(png|jpe?g|webp)$/i.test(f.name)) {
        if (logoError) {
          logoError.textContent = f.size > max ? 'That logo is larger than 2 MB. Please choose a smaller image.' : 'Please choose a PNG, JPG or WebP image.';
          logoError.hidden = false;
        }
        logoIn.value = '';
        if (logoName) logoName.hidden = true;
        return;
      }
      if (logoName) {
        logoName.textContent = 'New logo: ' + f.name + ' – click Save changes to use it.';
        logoName.hidden = false;
      }
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(f);
      [thumb, previewLogo].forEach(function (img) {
        if (!img) return;
        img.src = lastUrl;
        img.hidden = false;
      });
      if (thumbEmpty) thumbEmpty.hidden = true;
      if (initialOut) initialOut.hidden = true;
    });
  }

  // Size list counter.
  var sizeIn = $('[data-size-input]', form);
  var sizeCount = $('[data-size-count]', form);
  if (sizeIn && sizeCount) {
    sizeIn.addEventListener('input', function () {
      var n = sizeIn.value.split('\n').filter(function (l) {
        return l.trim();
      }).length;
      sizeCount.textContent = n;
      sizeCount.classList.toggle('set-over', n > 30);
    });
  }
})();
