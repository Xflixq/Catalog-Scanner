
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { openDb } from './artifacts/master-server/src/lib/db.js';

const dir = fs.mkdtempSync('/tmp/cs-db-');
const dbPath = path.join(dir, 'old.sqlite');
const raw = new Database(dbPath);
raw.exec(`
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE product_names (
    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE items (
    id TEXT PRIMARY KEY, barcode TEXT NOT NULL UNIQUE, name_id TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  INSERT INTO product_names VALUES ('n1','Widget','2020-01-01T00:00:00.000Z','2020-01-01T00:00:00.000Z');
  INSERT INTO items VALUES ('i1','123','n1','','2020-01-01T00:00:00.000Z','2020-01-01T00:00:00.000Z');
`);
raw.close();

const db = openDb(dbPath);
const cols = db.prepare('PRAGMA table_info(items)').all().map(c => c.name);
const row = db.prepare('SELECT scanned_at FROM items WHERE id = ?').get('i1');
console.log(JSON.stringify({ cols, scanned_at: row.scanned_at }));
db.close();
