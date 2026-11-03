/* PrintDesk – customer order form: selected-file list, step tracking, live
   order summary, client-side checks and upload with a real progress bar.
   Progressive enhancement: without this script the form still posts normally
   (multipart, CSRF token in the URL). */
(function () {
  'use strict';

  var form = document.querySelector('form[data-order-form]');
  var input = form && form.querySelector('input[type=file]');
  if (!form || !input) return;

  function $(sel) {
    return form.querySelector(sel);
  }
  var zone = $('[data-dropzone]');
  var zoneTitle = $('[data-dz-title]');
  var field = $('[data-files-field]');
  var list = $('[data-file-list]');
  var bar = $('[data-files-bar]');
  var summary = $('[data-files-summary]');
  var clearBtn = $('[data-files-clear]');
  var filesError = $('[data-files-error]');
  var formError = $('[data-form-error]');
  var formErrorText = $('[data-form-error-text]');
  var progress = $('[data-progress]');
  var pBar = $('[data-progress-bar]');
  var pTitle = $('[data-progress-title]');
  var pPct = $('[data-progress-pct]');
  var pBytes = $('[data-progress-bytes]');
  var pEta = $('[data-progress-eta]');
  var pCancel = $('[data-progress-cancel]');
  var submit = $('[data-submit]');
  var submitLabel = $('[data-submit-label]');

  var MB = 1024 * 1024;
  var maxFiles = toInt(form.getAttribute('data-max-files'), 5);
  var maxBytes = toInt(form.getAttribute('data-max-bytes'), 100 * MB);
  var accept = (form.getAttribute('data-accept') || '')
    .toLowerCase()
    .split(',')
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  var zoneTitleText = zoneTitle ? zoneTitle.textContent : '';
  var submitText = submitLabel ? submitLabel.textContent : '';
  var BUSY_MSG = 'The server could not take the order just now – please try again in a minute. Your files are still selected.';
  var X_ICON =
    '<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M18 6L6 18M6 6l12 12"/></svg>';

  var selected = []; // File objects that will be sent
  var canEdit = supportsDataTransfer(); // can we rewrite input.files (remove / add more)?
  var xhr = null;
  var busy = false;
  var placed = false;
  var retried = false; // one automatic resend per submit after a CSRF token refresh
  var wakeLock = null;
  var started = 0;
  var speed = 0;
  var lastSample = null;

  // We lock the form ourselves (app.js would also lock it when we stop a submit).
  form.setAttribute('data-no-lock', '');
  form.classList.add('is-enhanced');

  // ---------- helpers ----------
  function toInt(v, d) {
    var n = parseInt(v, 10);
    return n > 0 ? n : d;
  }
  function extOf(name) {
    var m = /\.([a-z0-9]{1,5})$/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }
  function allowed(name) {
    return !accept.length || accept.indexOf('.' + extOf(name)) !== -1;
  }
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    var units = ['KB', 'MB', 'GB'];
    var i = -1;
    do {
      n /= 1024;
      i++;
    } while (n >= 1024 && i < units.length - 1);
    return (n >= 100 ? Math.round(n) : n.toFixed(1)) + ' ' + units[i];
  }
  function limitText(n) {
    return n % MB === 0 ? n / MB + ' MB' : fmtBytes(n);
  }
  function shortName(name) {
    return name.length > 42 ? name.slice(0, 28) + '…' + name.slice(-10) : name;
  }
  function fileKey(f) {
    return f.name + '|' + f.size + '|' + f.lastModified;
  }
  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function toast(text) {
    if (window.PD && window.PD.toast) window.PD.toast(text);
  }

  function supportsDataTransfer() {
    try {
      var dt = new DataTransfer();
      dt.items.add(new File(['x'], 'x.txt', { type: 'text/plain' }));
      return dt.files.length === 1;
    } catch (e) {
      return false;
    }
  }

  /** Mirrors `selected` into the real input so a plain (non-XHR) submit sends the same files. */
  function syncInput() {
    if (!canEdit) return;
    try {
      var dt = new DataTransfer();
      selected.forEach(function (f) {
        dt.items.add(f);
      });
      input.files = dt.files;
      if (input.files.length !== selected.length) canEdit = false;
    } catch (e) {
      canEdit = false;
    }
  }

  // ---------- errors ----------
  function showFilesError(msg) {
    if (!filesError) return;
    filesError.textContent = msg || '';
    filesError.hidden = !msg;
    if (field) field.classList.toggle('has-error', Boolean(msg));
    if (msg) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  function showFormError(msg) {
    if (!formError) return;
    formErrorText.textContent = msg || '';
    formError.hidden = !msg;
  }
  function reveal(node) {
    if (!node) return;
    try {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) {
      node.scrollIntoView();
    }
  }

  // ---------- file selection ----------
  function addFiles(picked) {
    var problems = [];
    var tooMany = 0;
    // With an editable input new picks are added to the list; otherwise they replace it.
    var next = canEdit && maxFiles > 1 ? selected.slice() : [];
    var seen = {};
    next.forEach(function (f) {
      seen[fileKey(f)] = true;
    });
    picked.forEach(function (f) {
      if (seen[fileKey(f)]) return;
      if (!allowed(f.name)) {
        problems.push('“' + shortName(f.name) + '” is not an allowed file type.');
      } else if (f.size > maxBytes) {
        problems.push('“' + shortName(f.name) + '” is ' + fmtBytes(f.size) + ' – each file must be ' + limitText(maxBytes) + ' or smaller.');
      } else if (f.size === 0) {
        problems.push('“' + shortName(f.name) + '” is empty.');
      } else if (next.length >= maxFiles) {
        tooMany++;
      } else {
        seen[fileKey(f)] = true;
        next.push(f);
      }
    });
    if (tooMany) problems.push('You can send up to ' + plural(maxFiles, 'file') + ' per order' + (next.length ? ' – the first ' + plural(next.length, 'file') + ' were kept.' : '.'));
    selected = next;
    syncInput();
    render();
    showFilesError(problems.join(' '));
    showFormError('');
  }

  function render() {
    if (!list) return;
    list.textContent = '';
    var total = 0;
    selected.forEach(function (f, i) {
      total += f.size;
      var li = el('li', 'cust-file cust-file-new');
      li.appendChild(el('span', 'cust-file-ext', extOf(f.name) || 'file'));
      var main = el('span', 'cust-file-main');
      var name = el('span', 'cust-file-name', f.name);
      name.title = f.name;
      main.appendChild(name);
      main.appendChild(el('span', 'cust-file-meta', fmtBytes(f.size)));
      li.appendChild(main);
      if (canEdit) {
        var rm = el('button', 'btn btn-ghost btn-icon cust-file-btn cust-file-remove');
        rm.type = 'button';
        rm.setAttribute('data-remove', String(i));
        rm.setAttribute('aria-label', 'Remove ' + f.name);
        rm.innerHTML = X_ICON;
        li.appendChild(rm);
      }
      list.appendChild(li);
    });
    var n = selected.length;
    // `required` follows our list (files dropped on the page may not be in input.files).
    input.required = !n;
    list.hidden = !n;
    if (bar) bar.hidden = !n;
    if (summary) summary.textContent = n ? (maxFiles > 1 ? n + ' of ' + maxFiles + ' files' : '1 file') + ' · ' + fmtBytes(total) : '';
    if (clearBtn) clearBtn.textContent = canEdit ? (n > 1 ? 'Remove all' : 'Remove') : 'Clear';
    if (zoneTitle) {
      if (!n) zoneTitle.textContent = zoneTitleText;
      else if (maxFiles === 1) zoneTitle.textContent = 'Choose a different file';
      else if (!canEdit) zoneTitle.textContent = 'Choose different files';
      else if (n < maxFiles) zoneTitle.textContent = 'Add more files';
      else zoneTitle.textContent = 'File limit reached (' + maxFiles + ')';
    }
    if (zone) zone.classList.toggle('has-files', n > 0);
    updateFlow();
  }

  input.addEventListener('change', function () {
    addFiles(Array.prototype.slice.call(input.files || []));
  });

  // Our own message instead of the browser bubble on the hidden file input.
  input.addEventListener('invalid', function (e) {
    e.preventDefault();
    showFilesError(maxFiles > 1 ? 'Please choose at least one file to print.' : 'Please choose a file to print.');
    var first = form.querySelector('input:invalid, select:invalid, textarea:invalid');
    if (first === input) {
      reveal(zone);
      input.focus({ preventScroll: true });
    }
  });

  if (list)
    list.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-remove]') : null;
      if (!btn || busy) return;
      var i = parseInt(btn.getAttribute('data-remove'), 10);
      var removed = selected.splice(i, 1)[0];
      syncInput();
      render();
      showFilesError('');
      if (removed) toast('Removed ' + shortName(removed.name));
      var buttons = list.querySelectorAll('[data-remove]');
      (buttons[Math.min(i, buttons.length - 1)] || input).focus();
    });

  if (clearBtn)
    clearBtn.addEventListener('click', function () {
      if (busy) return;
      selected = [];
      try {
        input.value = '';
      } catch (e) {}
      syncInput();
      render();
      showFilesError('');
      input.focus();
    });

  // Files dropped anywhere on the page are added too (instead of the browser opening them).
  function hasFiles(e) {
    var types = e.dataTransfer && e.dataTransfer.types;
    return Boolean(types && Array.prototype.indexOf.call(types, 'Files') !== -1);
  }
  document.addEventListener('dragover', function (e) {
    if (!hasFiles(e) || e.target === input) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = busy ? 'none' : 'copy';
  });
  document.addEventListener('drop', function (e) {
    if (!hasFiles(e) || e.target === input) return;
    e.preventDefault();
    if (zone) zone.classList.remove('is-over');
    if (busy) return;
    addFiles(Array.prototype.slice.call(e.dataTransfer.files || []));
    reveal(zone);
  });

  // ---------- other fields: same rules as the server ----------
  var nameInput = $('input[name=name]');
  var mobileInput = $('input[name=mobile]');
  var emailInput = $('input[name=email]');
  var EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

  function check() {
    if (nameInput) nameInput.setCustomValidity(nameInput.value.trim() ? '' : 'Please enter your name.');
    if (mobileInput) {
      var raw = mobileInput.value.trim();
      var d = raw.replace(/\D/g, '');
      mobileInput.setCustomValidity(!raw ? 'Please enter your mobile number.' : d.length < 10 || d.length > 15 ? 'Enter a valid mobile number, e.g. 98765 43210.' : '');
    }
    if (emailInput) {
      var em = emailInput.value.trim();
      emailInput.setCustomValidity(em && !EMAIL_RE.test(em) ? 'Enter a valid email like name@gmail.com, or leave it empty.' : '');
    }
  }
  [nameInput, mobileInput, emailInput].forEach(function (x) {
    if (x) x.addEventListener('input', check);
  });
  check();

  // The optional email sits in a <details>: open it when the browser wants to point at it.
  var emailMore = $('[data-email-more]');
  if (emailInput && emailMore)
    emailInput.addEventListener('invalid', function () {
      emailMore.open = true;
    });

  // Quantity − / + buttons.
  var qtyWrap = $('[data-qty]');
  var qty = qtyWrap && qtyWrap.querySelector('input');
  if (qty) {
    qtyWrap.classList.add('is-enhanced');
    Array.prototype.forEach.call(qtyWrap.querySelectorAll('[data-qty-step]'), function (b) {
      b.hidden = false;
      b.addEventListener('click', function () {
        var n = (parseInt(qty.value, 10) || 0) + parseInt(b.getAttribute('data-qty-step'), 10);
        qty.value = String(Math.min(100000, Math.max(1, n)));
        updateFlow();
      });
    });
    qty.addEventListener('blur', function () {
      if (qty.value === '') return;
      var n = parseInt(qty.value, 10);
      qty.value = String(Math.min(100000, Math.max(1, n || 1)));
      updateFlow();
    });
  }

  // ---------- steps + live summary ----------
  var STEP_KEYS = ['details', 'files', 'options', 'send'];
  var steps = form.querySelectorAll('[data-step]');
  var sums = {};
  Array.prototype.forEach.call(form.querySelectorAll('[data-sum]'), function (x) {
    sums[x.getAttribute('data-sum')] = x;
  });
  var sumBox = $('[data-summary]');
  var sumLine = $('[data-sum-line]');
  var optionsSec = $('[data-sec=options]');
  var optionsTouched = false;
  var flowReady = true;
  if (sumBox) sumBox.hidden = false;
  if (sumLine) sumLine.hidden = false;

  function mobileOk() {
    var d = mobileInput ? mobileInput.value.replace(/\D/g, '') : '';
    return d.length >= 10 && d.length <= 15;
  }
  /** Text of the chosen option of a radio group or select (size, colour, sides). */
  function chosen(name) {
    var x = form.querySelector('input[name="' + name + '"]:checked');
    if (x) {
      var b = x.parentNode.querySelector('b');
      return b ? b.textContent : x.value;
    }
    var sel = form.querySelector('select[name="' + name + '"]');
    return sel ? sel.value : '';
  }
  function setText(node, text, missing) {
    if (!node) return;
    node.textContent = text;
    node.classList.toggle('is-missing', Boolean(missing));
  }

  function updateFlow() {
    if (!flowReady) return;
    var done = {
      details: Boolean(nameInput && nameInput.value.trim()) && mobileOk(),
      files: selected.length > 0,
    };
    // Print options have sensible defaults: done once looked at, or once the rest is filled in.
    done.options = optionsTouched || (done.details && done.files);
    var current = 'send';
    for (var i = 0; i < STEP_KEYS.length; i++) {
      if (!done[STEP_KEYS[i]]) {
        current = STEP_KEYS[i];
        break;
      }
    }
    Array.prototype.forEach.call(steps, function (li) {
      var key = li.getAttribute('data-step');
      var link = li.querySelector('a');
      var sr = li.querySelector('[data-step-sr]');
      li.classList.toggle('is-done', Boolean(done[key]));
      li.classList.toggle('is-current', key === current);
      if (link) {
        if (key === current) link.setAttribute('aria-current', 'step');
        else link.removeAttribute('aria-current');
      }
      if (sr) sr.textContent = done[key] ? ' (done)' : '';
    });
    ['details', 'files', 'options'].forEach(function (key) {
      var sec = form.querySelector('[data-sec=' + key + ']');
      if (sec) sec.classList.toggle('is-done', Boolean(done[key]));
    });

    // Summary (side card on desktop, one line above the button on phones).
    var total = 0;
    selected.forEach(function (f) {
      total += f.size;
    });
    var n = selected.length;
    var q = qty ? Math.max(1, parseInt(qty.value, 10) || 1) : 1;
    var size = chosen('size');
    var print = chosen('color_mode') + ' · ' + chosen('sides');
    setText(sums.files, n ? plural(n, 'file') + ' · ' + fmtBytes(total) : 'Not added yet', !n);
    setText(sums.size, size);
    setText(sums.qty, String(q));
    setText(sums.print, print);
    if (sumLine) {
      if (!n) setText(sumLine, maxFiles > 1 ? 'Add your files, then send' : 'Add your file, then send', true);
      else setText(sumLine, plural(n, 'file') + ' · ' + size + ' · ' + q + (q === 1 ? ' copy' : ' copies') + ' · ' + chosen('color_mode'), false);
    }
  }

  form.addEventListener('input', updateFlow);
  form.addEventListener('change', updateFlow);
  if (optionsSec) {
    var touch = function () {
      if (optionsTouched) return;
      optionsTouched = true;
      updateFlow();
    };
    optionsSec.addEventListener('focusin', touch);
    optionsSec.addEventListener('click', touch);
  }

  // Files already in the input (e.g. restored by the browser).
  if (input.files && input.files.length) addFiles(Array.prototype.slice.call(input.files));
  updateFlow();

  // ---------- floating send bar (phones) ----------
  var submitBar = $('[data-submit-bar]');
  var afterBar = submitBar && submitBar.nextElementSibling;
  var barFrame = 0;
  var barPad = -1;
  function measureBar() {
    barFrame = 0;
    if (!submitBar || !afterBar) return;
    // Sticky and lifted above its place in the page = floating over the form.
    var rect = submitBar.getBoundingClientRect();
    var gap = afterBar.getBoundingClientRect().top - rect.bottom;
    submitBar.classList.toggle('is-stuck', gap > 28);
    // Keep focused fields (keyboard, browser validation) clear of the floating bar.
    var floating = window.getComputedStyle(submitBar).position === 'sticky';
    var pad = floating ? Math.ceil(rect.height) + 24 : 0;
    if (pad !== barPad) {
      barPad = pad;
      document.documentElement.style.scrollPaddingBottom = pad ? pad + 'px' : '';
    }
  }
  function scheduleBar() {
    if (!barFrame) barFrame = window.requestAnimationFrame(measureBar);
  }
  window.addEventListener('scroll', scheduleBar, { passive: true });
  window.addEventListener('resize', scheduleBar);
  measureBar();

  // No floating bar while the on-screen keyboard is up (CSS limits this to touch screens).
  var TYPING = 'input[type=text], input[type=tel], input[type=email], input[type=number], textarea';
  form.addEventListener('focusin', function (e) {
    if (e.target.matches && e.target.matches(TYPING)) form.classList.add('is-typing');
    scheduleBar();
  });
  form.addEventListener('focusout', function () {
    form.classList.remove('is-typing');
    scheduleBar();
  });

  // ---------- submit + upload ----------
  form.addEventListener('submit', function (e) {
    if (busy || placed) {
      e.preventDefault();
      return;
    }
    showFormError('');
    if (!selected.length) {
      e.preventDefault();
      showFilesError(maxFiles > 1 ? 'Please choose at least one file to print.' : 'Please choose a file to print.');
      reveal(zone);
      return;
    }
    retried = false;
    if (startUpload()) {
      e.preventDefault();
      return;
    }
    // No XHR upload support: let the browser post the form normally.
    setTimeout(function () {
      busy = true;
      submit.disabled = true;
      if (submitLabel) submitLabel.textContent = submit.getAttribute('data-loading') || 'Uploading…';
      showProgress();
      progress.classList.add('is-processing');
      pBar.value = 100;
      pPct.textContent = '';
      pBytes.textContent = 'Sending ' + plural(selected.length, 'file') + '…';
      if (pCancel) pCancel.hidden = true;
    }, 0);
  });

  /** Builds the request body by hand so the files go last (fields are read first on the server). */
  function buildData() {
    var data = new FormData();
    var els = form.elements;
    for (var i = 0; i < els.length; i++) {
      var x = els[i];
      if (!x.name || x.disabled || x.type === 'file' || x.type === 'submit' || x.type === 'button') continue;
      if ((x.type === 'radio' || x.type === 'checkbox') && !x.checked) continue;
      data.append(x.name, x.value);
    }
    selected.forEach(function (f) {
      data.append('files', f, f.name);
    });
    return data;
  }

  function startUpload() {
    var req, data;
    try {
      req = new XMLHttpRequest();
      if (!req.upload || !window.FormData) return false;
      data = buildData();
      req.open('POST', form.action, true);
    } catch (err) {
      return false;
    }
    xhr = req;
    req.upload.addEventListener('progress', onProgress);
    req.upload.addEventListener('load', onSent);
    req.addEventListener('load', onDone);
    req.addEventListener('error', function () {
      fail('Upload failed – please check your internet connection and try again. Your files are still selected.');
    });
    req.addEventListener('abort', function () {
      if (placed) return;
      reset();
      toast('Upload cancelled');
    });

    busy = true;
    started = Date.now();
    speed = 0;
    lastSample = { t: started, loaded: 0 };
    form.classList.add('is-uploading');
    submit.disabled = true;
    if (submitLabel) submitLabel.textContent = 'Uploading…';
    showProgress();
    pTitle.textContent = selected.length === 1 ? 'Uploading your file…' : 'Uploading ' + selected.length + ' files…';
    window.addEventListener('beforeunload', onBeforeUnload);
    keepAwake();
    req.send(data);
    return true;
  }

  function showProgress() {
    progress.hidden = false;
    progress.classList.remove('is-processing');
    pBar.value = 0;
    pBar.textContent = '0%';
    pPct.textContent = '0%';
    pBytes.textContent = 'Starting…';
    pEta.textContent = '';
    if (pCancel) pCancel.hidden = false;
    try {
      progress.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (e) {}
  }

  function onProgress(e) {
    if (!e.lengthComputable || !e.total) {
      pBytes.textContent = fmtBytes(e.loaded) + ' sent';
      return;
    }
    var pct = Math.min(100, Math.floor((e.loaded / e.total) * 100));
    pBar.value = pct;
    pBar.textContent = pct + '%';
    pPct.textContent = pct + '%';
    pBytes.textContent = (e.loaded / MB).toFixed(1) + ' MB of ' + (e.total / MB).toFixed(1) + ' MB';
    // Smoothed speed → time left.
    var now = Date.now();
    var dt = (now - lastSample.t) / 1000;
    if (dt >= 0.8) {
      var inst = (e.loaded - lastSample.loaded) / dt;
      speed = speed ? speed * 0.7 + inst * 0.3 : inst;
      lastSample = { t: now, loaded: e.loaded };
    }
    if (now - started > 2500 && speed > 0 && pct < 100) pEta.textContent = timeLeft((e.total - e.loaded) / speed);
  }

  function timeLeft(s) {
    if (s < 10) return 'A few seconds left';
    if (s < 60) return 'About ' + Math.ceil(s / 5) * 5 + ' sec left';
    if (s < 3600) return 'About ' + Math.ceil(s / 60) + ' min left';
    return 'More than an hour left';
  }

  function onSent() {
    progress.classList.add('is-processing');
    pBar.value = 100;
    pPct.textContent = '100%';
    pTitle.textContent = 'Files uploaded – creating your order…';
    pEta.textContent = '';
    if (pCancel) pCancel.hidden = true;
  }

  function onDone() {
    var r = xhr;
    var url = r.responseURL || '';
    if (r.status >= 200 && r.status < 300 && /\/o\/[A-Za-z0-9_-]{20,}/.test(url)) {
      placed = true;
      pTitle.textContent = 'Order placed! Opening your order…';
      stopBusy();
      location.href = url;
      return;
    }
    var text = r.responseText || '';
    // Our own pages carry the session's CSRF token (<body data-csrf>); proxy error pages (nginx 502…) do not.
    var appPage = /data-csrf=/.test(text);
    if (r.status === 403 && appPage && !retried) {
      // Usually a stale form token (someone logged in or out in another tab): get the current one and
      // send the same files again, once. A 403 that is not about the token (closed shop) is shown as is.
      retried = true;
      resendWithFreshToken(text);
      return;
    }
    stopBusy();
    if (appPage && r.status < 500) {
      // The server answered with a page (form errors, closed shop, rate limit…): show it.
      showPage(text);
      return;
    }
    // Server errors and proxy pages (restart or deploy in progress): keep the form and the chosen files.
    fail(r.status >= 500 || /<html[\s>]/i.test(text) ? BUSY_MSG : 'Something went wrong (error ' + r.status + '). Please try again.');
  }

  function showPage(text) {
    stopBusy();
    document.open();
    document.write(text);
    document.close();
  }

  /** Re-reads the session's CSRF token from the shop page; if it changed, puts it into the form and uploads again. */
  function resendWithFreshToken(page403) {
    var req = new XMLHttpRequest(); // same-origin GET: sends the session cookie
    xhr = req; // so Cancel can stop it
    pTitle.textContent = 'Reconnecting…';
    if (pCancel) pCancel.hidden = false;
    req.addEventListener('load', function () {
      var html = req.responseText || '';
      var m = /data-csrf="([^"]+)"/.exec(html) || /name="_csrf" value="([^"]+)"/.exec(html);
      if (!m) {
        fail(BUSY_MSG); // not one of our pages (server restarting?)
        return;
      }
      var token = m[1];
      var action = form.getAttribute('action') || '';
      var q = /([?&]_csrf=)([^&#]*)/.exec(action);
      if (q && q[2] === encodeURIComponent(token)) {
        showPage(page403); // the token was fine: a real 403 (e.g. the shop stopped taking orders)
        return;
      }
      form.setAttribute('action', q ? action.replace(q[0], q[1] + encodeURIComponent(token)) : action + (action.indexOf('?') === -1 ? '?' : '&') + '_csrf=' + encodeURIComponent(token));
      Array.prototype.forEach.call(document.querySelectorAll('input[name=_csrf]'), function (x) {
        x.value = token; // also the page's other forms (e.g. Log out)
      });
      document.body.setAttribute('data-csrf', token);
      if (window.PD) window.PD.csrf = token;
      if (!startUpload()) showPage(page403);
    });
    req.addEventListener('error', function () {
      fail('Upload failed – please check your internet connection and try again. Your files are still selected.');
    });
    req.addEventListener('abort', function () {
      reset();
      toast('Upload cancelled');
    });
    try {
      req.open('GET', location.pathname, true);
      req.send();
    } catch (err) {
      showPage(page403);
    }
  }

  function onBeforeUnload(e) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }

  function keepAwake() {
    // Stop the phone screen from sleeping (and pausing the upload) where supported.
    if (wakeLock) return; // still held (automatic resend)
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock
          .request('screen')
          .then(function (lock) {
            if (busy) wakeLock = lock;
            else lock.release();
          })
          .catch(function () {});
      }
    } catch (e) {}
  }

  function stopBusy() {
    busy = false;
    window.removeEventListener('beforeunload', onBeforeUnload);
    if (wakeLock) {
      wakeLock.release().catch(function () {});
      wakeLock = null;
    }
  }

  function reset() {
    stopBusy();
    xhr = null;
    progress.hidden = true;
    progress.classList.remove('is-processing');
    form.classList.remove('is-uploading');
    submit.disabled = false;
    if (submitLabel) submitLabel.textContent = submitText;
  }

  function fail(msg) {
    reset();
    showFormError(msg);
    reveal(formError);
  }

  if (pCancel)
    pCancel.addEventListener('click', function () {
      if (xhr && busy) xhr.abort();
    });

  // Back button after a placed order (page restored from cache): start a fresh form.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    if (placed) {
      placed = false;
      form.reset();
      selected = [];
      syncInput();
      render();
    }
    reset();
    check();
    updateFlow();
    scheduleBar();
  });
})();
