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
  brand_color     TEXT NOT NULL DEFAULT '#0077b6',
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
