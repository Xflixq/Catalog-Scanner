import Database from 'better-sqlite3';
import crypto from 'node:crypto';

/**
 * Ensure a column exists on a table (SQLite has no IF NOT EXISTS for ADD COLUMN
 * on older versions; PRAGMA table_info is the portable check).
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 * @param {string} column
 * @param {string} ddlSuffix e.g. "TEXT NOT NULL DEFAULT ''"
 */
function ensureColumn(db, table, column, ddlSuffix) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlSuffix}`);
  }
}

/**
 * @param {string} dbPath
 */
export function openDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create base tables. Do NOT create indexes that depend on columns that may
  // be missing from older DBs — migrate first, then index.
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_names (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dashboard_pins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      label TEXT,
      barcode TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(target_type, target_id)
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      barcode TEXT NOT NULL UNIQUE,
      name_id TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      scanned_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (name_id) REFERENCES product_names(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS login_codes (
      code TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      label TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      device_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
  `);

  // Migrations for DBs created before scanned_at existed.
  // CREATE TABLE IF NOT EXISTS does not add new columns to existing tables.
  ensureColumn(db, 'items', 'scanned_at', `TEXT NOT NULL DEFAULT ''`);
  db.exec(`
    UPDATE items
    SET scanned_at = created_at
    WHERE scanned_at IS NULL OR scanned_at = ''
  `);

  // Indexes after migrations so older DBs never fail on missing columns.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_items_name_id ON items(name_id);
    CREATE INDEX IF NOT EXISTS idx_items_scanned_at ON items(scanned_at);
  `);

  const masterSecret = db.prepare(`SELECT value FROM meta WHERE key = 'master_secret'`).get();
  if (!masterSecret) {
    db.prepare(`INSERT INTO meta (key, value) VALUES ('master_secret', ?)`).run(
      crypto.randomBytes(24).toString('hex'),
    );
  }

  return db;
}

export function nowIso() {
  return new Date().toISOString();
}

export function makeId() {
  return crypto.randomUUID();
}

export function makeLoginCode() {
  // Easy to type: 6 chars, no ambiguous 0/O/1/I
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}
