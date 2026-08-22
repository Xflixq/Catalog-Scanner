import Database from 'better-sqlite3';
import { applySchema } from './schema.js';
export { nowIso, makeId, makeLoginCode, makeToken, parseJson } from './db-util.js';

/**
 * @param {string} dbPath
 * @param {{ dataDir?: string }} [opts]
 */
export function openDb(dbPath, opts = {}) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applySchema(db, { dataDir: opts.dataDir });
  return db;
}
