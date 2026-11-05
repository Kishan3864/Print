import fs from 'node:fs';
import path from 'node:path';
import { db, meta } from './db.js';
import { config, paths } from './config.js';
import { purgeExpiredFiles } from './services/orders.js';
import * as demo from './services/demo.js';
import { reconcilePayu, runReminders } from './services/billing.js';

const HOUR = 60 * 60 * 1000;
const STORED_RE = /^[a-f0-9]{32}\.[a-z0-9]{1,5}$/;

/**
 * Deletes upload/logo files that no database row points to (uploads cut off by
 * a restart, rejected forms). Only files older than 3 h, so running uploads are safe.
 */
function sweepOrphans() {
  const cutoff = Date.now() - 3 * HOUR;
  const known = db.prepare('SELECT 1 FROM files WHERE shop_id = ? AND stored_name = ?');
  const logos = new Set(db.prepare('SELECT logo_file FROM shops WHERE logo_file IS NOT NULL').all().map((r) => r.logo_file));
  let n = 0;
  const sweep = (dir, isKnown) => {
    for (const name of fs.readdirSync(dir)) {
      if (!STORED_RE.test(name) || isKnown(name)) continue;
      const file = path.join(dir, name);
      if (fs.statSync(file).mtimeMs < cutoff) {
        fs.rmSync(file, { force: true });
        n++;
      }
    }
  };
  for (const id of fs.readdirSync(paths.uploads)) {
    if (/^\d+$/.test(id)) sweep(path.join(paths.uploads, id), (name) => Boolean(known.get(Number(id), name)));
  }
  sweep(paths.logos, (name) => logos.has(name));
  return n;
}

function runRetention() {
  try {
    const n = purgeExpiredFiles();
    const orphans = sweepOrphans();
    meta.set('retention_last_run', new Date().toISOString());
    if (n || orphans) console.log(`[retention] deleted ${n} expired and ${orphans} orphaned file(s)`);
  } catch (err) {
    console.error('[retention] failed:', err);
  }
}

function maybeResetDemo(force = false) {
  try {
    const last = Date.parse(meta.get('demo_last_reset') || '') || 0;
    if (force || Date.now() - last >= config.demo.resetHours * HOUR) {
      demo.resetDemo();
      meta.set('demo_last_reset', new Date().toISOString());
      console.log('[demo] demo shop reset with sample data');
    }
  } catch (err) {
    console.error('[demo] reset failed:', err);
  }
}

/** Renewal reminders, expiry notices and ended-demo cleanup (all idempotent). */
function runBilling() {
  try {
    runReminders();
    if (typeof demo.cleanupEndedDemos === 'function') demo.cleanupEndedDemos();
  } catch (err) {
    console.error('[billing] daily job failed:', err);
  }
}

export function startJobs() {
  const created = demo.ensureDemoShop();
  maybeResetDemo(Boolean(created));
  // Retention: once at start (after a short delay) and then daily.
  setTimeout(runRetention, 10 * 1000).unref();
  setInterval(runRetention, 24 * HOUR).unref();
  // Billing reminders: shortly after start, then every 6 hours (dedupe keys prevent repeats).
  setTimeout(runBilling, 15 * 1000).unref();
  setInterval(runBilling, 6 * HOUR).unref();
  // Demo reset check every 10 minutes (resets every config.demo.resetHours).
  setInterval(() => maybeResetDemo(), 10 * 60 * 1000).unref();
  // Unfinished online payments: confirm with PayU every 5 minutes (browser closed, webhook missed).
  const reconcile = () =>
    reconcilePayu()
      .then((n) => n && console.log(`[payu] confirmed ${n} payment(s) on recheck`))
      .catch((err) => console.error('[payu] recheck failed:', err.message));
  setTimeout(reconcile, 30 * 1000).unref();
  setInterval(reconcile, 5 * 60 * 1000).unref();
}
