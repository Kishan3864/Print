import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = process.env;
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const bool = (v, d = false) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

const isProd = env.NODE_ENV === 'production';
const port = int(env.PORT, 3100);
const baseUrl = (env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');

let sessionSecret = env.SESSION_SECRET || '';
if (sessionSecret.length < 32) {
  if (isProd) {
    console.error('[config] SESSION_SECRET must be at least 32 characters in production');
    process.exit(1);
  }
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] SESSION_SECRET missing or short – using a random one (sessions reset on restart)');
}

export const config = {
  isProd,
  port,
  host: env.HOST || '127.0.0.1',
  baseUrl,
  secureCookies: baseUrl.startsWith('https://'),
  trustProxy: int(env.TRUST_PROXY, 1),
  sessionSecret,
  adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: env.ADMIN_PASSWORD || '',
  dataDir: path.resolve(ROOT, env.DATA_DIR || '../printdesk-data'),
  timeZone: env.APP_TZ || 'Asia/Kolkata',
  countryCode: (env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '') || '91',
  rateLimitOff: bool(env.DISABLE_RATE_LIMIT, false) && !isProd,
  smtp: {
    host: env.SMTP_HOST || '',
    port: int(env.SMTP_PORT, 587),
    secure: bool(env.SMTP_SECURE, false),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || 'PrintDesk <no-reply@brightonsolution.com>',
  },
  // Admin panel lives on its own host in production (e.g. adminprint.brightonsolution.com).
  // Empty = served at /admin on the main host (local development).
  adminHost: (env.ADMIN_HOST || '').trim().toLowerCase(),
  payu: {
    key: env.PAYU_KEY || '',
    salt: env.PAYU_SALT || '',
    test: bool(env.PAYU_TEST, false),
  },
  demo: {
    slug: 'demo-print-studio',
    resetHours: 6,
    // Personal demo shops (created from /demo) run this many days, then must go live.
    trialDays: int(env.DEMO_DAYS, 7),
    // Ended demo shops are deleted this many days after the demo ended.
    keepDays: 14,
  },
  // Days before expiry when renewal reminders are sent.
  reminderDays: [7, 3, 1],
  limits: {
    orderFiles: 5,
    orderFileBytes: 100 * 1024 * 1024,
    demoFiles: 1,
    demoFileBytes: 5 * 1024 * 1024,
    logoBytes: 2 * 1024 * 1024,
    demoStorageBytes: 200 * 1024 * 1024,
    minFreeBytes: int(env.MIN_FREE_DISK_MB, 3072) * 1024 * 1024,
    shopQuotaBytes: int(env.SHOP_QUOTA_GB, 0) * 1024 * 1024 * 1024,
  },
  instagram: 'brighton.solution',
  companyUrl: 'https://brightonsolution.com',
};
config.smtp.enabled = Boolean(config.smtp.host);
config.payu.enabled = Boolean(config.payu.key && config.payu.salt);
// Public address of the admin panel (for emails / links).
config.adminUrl = config.adminHost ? `${config.baseUrl.startsWith('https') ? 'https' : 'http'}://${config.adminHost}/admin` : `${config.baseUrl}/admin`;

export const paths = {
  root: ROOT,
  public: path.join(ROOT, 'public'),
  data: config.dataDir,
  db: path.join(config.dataDir, 'printdesk.db'),
  uploads: path.join(config.dataDir, 'uploads'),
  logos: path.join(config.dataDir, 'logos'),
};

for (const dir of [paths.data, paths.uploads, paths.logos]) fs.mkdirSync(dir, { recursive: true });
