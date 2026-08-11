import Database from 'better-sqlite3';
import crypto from 'node:crypto';

/**
 * @param {string} dbPath
 */
export function openDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

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

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      barcode TEXT NOT NULL UNIQUE,
      name_id TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (name_id) REFERENCES product_names(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_items_name_id ON items(name_id);

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

  const masterSecret = db.prepare(`SELECT value FROM meta WHERE key = 'master_secret'`).get();
  if (!masterSecret) {
    db.prepare(`INSERT INTO meta (key, value) VALUES ('master_secret', ?)`).run(crypto.randomBytes(24).toString('hex'));
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
