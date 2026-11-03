import Database from 'better-sqlite3';
import { paths } from './config.js';

export const db = new Database(paths.db);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS shops (
  id              INTEGER PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  owner_name      TEXT NOT NULL DEFAULT '',
  mobile          TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  city            TEXT NOT NULL DEFAULT '',
  password_hash   TEXT NOT NULL,
  pw_version      INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','rejected')),
  plan            TEXT CHECK (plan IS NULL OR plan IN ('starter','pro','business')),
  paid_until      TEXT,
  is_demo         INTEGER NOT NULL DEFAULT 0,
  brand_color     TEXT NOT NULL DEFAULT '#1a5d40',
  logo_file       TEXT,
  phone           TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  size_options    TEXT NOT NULL DEFAULT '[]',
  retention_days  INTEGER NOT NULL DEFAULT 15,
  next_order_no   INTEGER NOT NULL DEFAULT 1001,
  admin_note      TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  approved_at     TEXT,
  last_login_at   TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY,
  shop_id         INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_no        INTEGER NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  customer_name   TEXT NOT NULL,
  customer_mobile TEXT NOT NULL,
  customer_email  TEXT NOT NULL DEFAULT '',
  size            TEXT NOT NULL DEFAULT '',
  quantity        INTEGER NOT NULL DEFAULT 1,
  color_mode      TEXT NOT NULL DEFAULT 'color' CHECK (color_mode IN ('color','bw')),
  sides           TEXT NOT NULL DEFAULT 'single' CHECK (sides IN ('single','both')),
  notes           TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','proof_sent','approved','changes_requested','printing','ready','delivered','cancelled')),
  proof_note      TEXT NOT NULL DEFAULT '',
  customer_note   TEXT NOT NULL DEFAULT '',
  is_sample       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (shop_id, order_no)
);
CREATE INDEX IF NOT EXISTS idx_orders_shop_status  ON orders(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_shop_created ON orders(shop_id, created_at);

CREATE TABLE IF NOT EXISTS files (
  id              INTEGER PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shop_id         INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('customer','proof')),
  original_name   TEXT NOT NULL,
  stored_name     TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  deleted_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_files_order ON files(order_id);
CREATE INDEX IF NOT EXISTS idx_files_shop  ON files(shop_id, deleted_at);

CREATE TABLE IF NOT EXISTS order_events (
  id              INTEGER PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  at              TEXT NOT NULL,
  actor           TEXT NOT NULL CHECK (actor IN ('customer','shop','system')),
  type            TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  note            TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`);

// Additive migrations, tracked with PRAGMA user_version. Never edit a shipped
// entry – append a new one.
const MIGRATIONS = [
  // 1: subscriptions, payments, support tickets, notifications
  `ALTER TABLE shops ADD COLUMN billing_cycle TEXT;
   ALTER TABLE shops ADD COLUMN went_live_at TEXT;

   CREATE TABLE IF NOT EXISTS payments (
     id                  INTEGER PRIMARY KEY,
     shop_id             INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
     plan                TEXT NOT NULL,
     cycle               TEXT NOT NULL CHECK (cycle IN ('monthly','yearly')),
     amount_paise        INTEGER NOT NULL,
     currency            TEXT NOT NULL DEFAULT 'INR',
     method              TEXT NOT NULL CHECK (method IN ('razorpay','manual')),
     status              TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed','cancelled')),
     reference           TEXT NOT NULL UNIQUE,
     provider_link_id    TEXT,
     provider_link_url   TEXT,
     provider_payment_id TEXT,
     note                TEXT NOT NULL DEFAULT '',
     period_start        TEXT,
     period_end          TEXT,
     created_at          TEXT NOT NULL,
     paid_at             TEXT
   );
   CREATE INDEX IF NOT EXISTS idx_payments_shop ON payments(shop_id, created_at);
   CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, paid_at);

   CREATE TABLE IF NOT EXISTS tickets (
     id            INTEGER PRIMARY KEY,
     shop_id       INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
     subject       TEXT NOT NULL,
     category      TEXT NOT NULL DEFAULT 'general',
     status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
     last_author   TEXT NOT NULL DEFAULT 'shop' CHECK (last_author IN ('shop','admin')),
     shop_unread   INTEGER NOT NULL DEFAULT 0,
     admin_unread  INTEGER NOT NULL DEFAULT 1,
     created_at    TEXT NOT NULL,
     updated_at    TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_tickets_shop ON tickets(shop_id, updated_at);
   CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, updated_at);

   CREATE TABLE IF NOT EXISTS ticket_messages (
     id         INTEGER PRIMARY KEY,
     ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
     author     TEXT NOT NULL CHECK (author IN ('shop','admin')),
     body       TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_ticket_messages ON ticket_messages(ticket_id);

   CREATE TABLE IF NOT EXISTS notifications (
     id          INTEGER PRIMARY KEY,
     audience    TEXT NOT NULL CHECK (audience IN ('shop','admin')),
     shop_id     INTEGER REFERENCES shops(id) ON DELETE CASCADE,
     kind        TEXT NOT NULL DEFAULT 'info',
     title       TEXT NOT NULL,
     body        TEXT NOT NULL DEFAULT '',
     link        TEXT NOT NULL DEFAULT '',
     dedupe_key  TEXT UNIQUE,
     created_at  TEXT NOT NULL,
     read_at     TEXT
   );
   CREATE INDEX IF NOT EXISTS idx_notifications_shop ON notifications(audience, shop_id, read_at);`,

  // 2: PayU as a payment method, admin-made demo links with their own expiry
  `CREATE TABLE payments_v2 (
     id                  INTEGER PRIMARY KEY,
     shop_id             INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
     plan                TEXT NOT NULL,
     cycle               TEXT NOT NULL CHECK (cycle IN ('monthly','yearly')),
     amount_paise        INTEGER NOT NULL,
     currency            TEXT NOT NULL DEFAULT 'INR',
     method              TEXT NOT NULL CHECK (method IN ('payu','razorpay','manual')),
     status              TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed','cancelled')),
     reference           TEXT NOT NULL UNIQUE,
     provider_link_id    TEXT,
     provider_link_url   TEXT,
     provider_payment_id TEXT,
     note                TEXT NOT NULL DEFAULT '',
     period_start        TEXT,
     period_end          TEXT,
     created_at          TEXT NOT NULL,
     paid_at             TEXT
   );
   INSERT INTO payments_v2 SELECT * FROM payments;
   DROP TABLE payments;
   ALTER TABLE payments_v2 RENAME TO payments;
   CREATE INDEX IF NOT EXISTS idx_payments_shop ON payments(shop_id, created_at);
   CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, paid_at);

   ALTER TABLE shops ADD COLUMN demo_expires_at TEXT;

   CREATE TABLE IF NOT EXISTS demo_links (
     id          INTEGER PRIMARY KEY,
     token       TEXT NOT NULL UNIQUE,
     label       TEXT NOT NULL,
     hours       INTEGER NOT NULL,
     expires_at  TEXT NOT NULL,
     shop_id     INTEGER REFERENCES shops(id) ON DELETE SET NULL,
     revoked_at  TEXT,
     opened_at   TEXT,
     created_at  TEXT NOT NULL
   );`,

  // 3: paper + pickup/delivery on orders, file versions (new version replaces the old)
  `ALTER TABLE orders ADD COLUMN paper TEXT NOT NULL DEFAULT '';
   ALTER TABLE orders ADD COLUMN delivery TEXT NOT NULL DEFAULT 'pickup';
   ALTER TABLE files ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
   ALTER TABLE files ADD COLUMN replaced_at TEXT;
   ALTER TABLE shops ADD COLUMN paper_options TEXT NOT NULL DEFAULT '[]';`,

  // 4: plan changes – renew / upgrade with credit for unused days; upgraded payments are superseded
  `ALTER TABLE payments ADD COLUMN kind TEXT NOT NULL DEFAULT 'new';
   ALTER TABLE payments ADD COLUMN credit_paise INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE payments ADD COLUMN superseded_at TEXT;`,
];

for (let v = db.pragma('user_version', { simple: true }); v < MIGRATIONS.length; v++) {
  db.transaction(() => {
    db.exec(MIGRATIONS[v]);
    db.pragma(`user_version = ${v + 1}`);
  })();
}

export const now = () => new Date().toISOString();

export const meta = {
  get(key) {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? row.value : null;
  },
  set(key, value) {
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
  },
};
