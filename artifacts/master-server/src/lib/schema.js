import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { makeId, nowIso } from './db-util.js';
import { ROLE_PRESETS } from './constants.js';
import { hashPassword } from './security.js';

function tableExists(db, name) {
  return Boolean(
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name),
  );
}

function ensureColumn(db, table, column, ddlSuffix) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlSuffix}`);
  }
}

function metaGet(db, key) {
  return db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key)?.value;
}

function metaSet(db, key, value) {
  db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(
    key,
    String(value),
  );
}

export function applySchema(db, { dataDir } = {}) {
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

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      description TEXT NOT NULL DEFAULT '',
      permissions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      pin_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT,
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    CREATE TABLE IF NOT EXISTS nfc_credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      created_by TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      device_uid TEXT NOT NULL DEFAULT '',
      token_hash TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      app_version TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      last_seen_at TEXT,
      current_user_id TEXT,
      paired_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (current_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS pairing_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS pairing_requests (
      id TEXT PRIMARY KEY,
      pairing_code_id TEXT NOT NULL,
      device_name TEXT NOT NULL,
      device_uid TEXT NOT NULL DEFAULT '',
      app_version TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      decided_at TEXT,
      device_id TEXT,
      claim_token TEXT,
      FOREIGN KEY (pairing_code_id) REFERENCES pairing_codes(id)
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      code TEXT,
      notes TEXT NOT NULL DEFAULT '',
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      inventory_type TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category_id TEXT,
      name TEXT NOT NULL,
      sku TEXT,
      inventory_type TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'ea',
      qty REAL NOT NULL DEFAULT 0,
      min_qty REAL NOT NULL DEFAULT 0,
      reorder_qty REAL NOT NULL DEFAULT 0,
      supplier TEXT NOT NULL DEFAULT '',
      cost_cents INTEGER,
      location_id TEXT,
      notes TEXT NOT NULL DEFAULT '',
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (location_id) REFERENCES locations(id)
    );

    CREATE TABLE IF NOT EXISTS rotational_assets (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      asset_code TEXT NOT NULL UNIQUE,
      serial TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'available',
      holder_user_id TEXT,
      location_id TEXT,
      issued_at TEXT,
      returned_at TEXT,
      condition TEXT NOT NULL DEFAULT 'good',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (holder_user_id) REFERENCES users(id),
      FOREIGN KEY (location_id) REFERENCES locations(id)
    );

    CREATE TABLE IF NOT EXISTS tools (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      tool_code TEXT NOT NULL UNIQUE,
      serial TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'available',
      holder_user_id TEXT,
      location_id TEXT,
      issued_at TEXT,
      expected_return_at TEXT,
      returned_at TEXT,
      condition TEXT NOT NULL DEFAULT 'good',
      service_info TEXT NOT NULL DEFAULT '',
      inspection_info TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (holder_user_id) REFERENCES users(id),
      FOREIGN KEY (location_id) REFERENCES locations(id)
    );

    CREATE TABLE IF NOT EXISTS identifiers (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      kind TEXT NOT NULL DEFAULT 'qr',
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL UNIQUE,
      user_id TEXT,
      device_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT '',
      target_id TEXT NOT NULL DEFAULT '',
      product_id TEXT,
      qty REAL,
      prev_state TEXT,
      new_state TEXT,
      location_id TEXT,
      notes TEXT NOT NULL DEFAULT '',
      result TEXT NOT NULL DEFAULT 'ok',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_history (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      event TEXT NOT NULL,
      user_id TEXT,
      device_id TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      user_id TEXT,
      device_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT,
      token_hash TEXT NOT NULL UNIQUE,
      method TEXT NOT NULL DEFAULT 'password',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS login_events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      device_id TEXT,
      method TEXT NOT NULL,
      success INTEGER NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      acknowledged_at TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      from_location_id TEXT,
      to_location_id TEXT,
      user_id TEXT,
      device_id TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);

  if (tableExists(db, 'pairing_requests')) {
    ensureColumn(db, 'pairing_requests', 'claim_token', 'TEXT');
  }

  if (tableExists(db, 'items')) {
    ensureColumn(db, 'items', 'scanned_at', `TEXT NOT NULL DEFAULT ''`);
    db.exec(`
      UPDATE items SET scanned_at = created_at WHERE scanned_at IS NULL OR scanned_at = '';
      CREATE INDEX IF NOT EXISTS idx_items_name_id ON items(name_id);
      CREATE INDEX IF NOT EXISTS idx_items_scanned_at ON items(scanned_at);
    `);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_type ON products(inventory_type);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_rot_status ON rotational_assets(status);
    CREATE INDEX IF NOT EXISTS idx_tools_status ON tools(status);
    CREATE INDEX IF NOT EXISTS idx_identifiers_target ON identifiers(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_logs(at);
    CREATE INDEX IF NOT EXISTS idx_alerts_open ON alerts(acknowledged_at);
  `);

  if (!metaGet(db, 'master_secret')) {
    metaSet(db, 'master_secret', crypto.randomBytes(24).toString('hex'));
  }
  if (!metaGet(db, 'nfc_pepper')) {
    metaSet(db, 'nfc_pepper', crypto.randomBytes(24).toString('hex'));
  }

  seedRolesAndAdmin(db, dataDir);
  migrateLegacyCatalog(db);
  metaSet(db, 'schema_version', '2');
}

function seedRolesAndAdmin(db, dataDir) {
  const now = nowIso();
  for (const [name, permissions] of Object.entries(ROLE_PRESETS)) {
    const existing = db.prepare(`SELECT id FROM roles WHERE name = ?`).get(name);
    if (existing) {
      if (name === 'administrator') {
        db.prepare(`UPDATE roles SET permissions_json = ?, updated_at = ? WHERE id = ?`).run(
          JSON.stringify(permissions),
          now,
          existing.id,
        );
      }
      continue;
    }
    db.prepare(
      `INSERT INTO roles (id, name, description, permissions_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(makeId(), name, name.replaceAll('_', ' '), JSON.stringify(permissions), now, now);
  }

  const adminRole = db.prepare(`SELECT id FROM roles WHERE name = 'administrator'`).get();
  const userCount = db.prepare(`SELECT COUNT(*) as c FROM users`).get().c;
  if (userCount === 0 && adminRole) {
    const password = randomBootstrapPassword();
    const userId = makeId();
    db.prepare(
      `INSERT INTO users (id, username, display_name, password_hash, role_id, status, created_at, updated_at)
       VALUES (?, 'admin', 'Administrator', ?, ?, 'active', ?, ?)`,
    ).run(userId, hashPassword(password), adminRole.id, now, now);
    metaSet(db, 'admin_bootstrap_pending', '1');
    if (dataDir) {
      try {
        const file = path.join(dataDir, 'admin-bootstrap.txt');
        fs.writeFileSync(
          file,
          `DTM Inventory initial administrator login\nUsername: admin\nPassword: ${password}\n\nChange this password in Users after first login.\n`,
          { encoding: 'utf8' },
        );
      } catch {
        // ignore filesystem errors; password still returned via API for loopback master
      }
    }
    metaSet(db, 'admin_bootstrap_password', password);
  }

  const loc = db.prepare(`SELECT id FROM locations LIMIT 1`).get();
  if (!loc) {
    db.prepare(
      `INSERT INTO locations (id, name, code, notes, created_at, updated_at) VALUES (?, 'Main Store', 'MAIN', '', ?, ?)`,
    ).run(makeId(), now, now);
  }
}

function randomBootstrapPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function migrateLegacyCatalog(db) {
  if (metaGet(db, 'legacy_catalog_migrated') === '1') return;
  const names = tableExists(db, 'product_names')
    ? db.prepare(`SELECT id, name, created_at, updated_at FROM product_names`).all()
    : [];
  if (!names.length) {
    metaSet(db, 'legacy_catalog_migrated', '1');
    return;
  }
  const existingProducts = db.prepare(`SELECT COUNT(*) as c FROM products`).get().c;
  if (existingProducts > 0) {
    metaSet(db, 'legacy_catalog_migrated', '1');
    return;
  }

  const now = nowIso();
  const location = db.prepare(`SELECT id FROM locations ORDER BY created_at ASC LIMIT 1`).get();
  const categoryId = makeId();
  db.prepare(
    `INSERT INTO categories (id, name, inventory_type, description, created_at, updated_at)
     VALUES (?, 'Imported catalogue', 'rotational', 'Migrated from previous barcode groups', ?, ?)`,
  ).run(categoryId, now, now);

  const insertProduct = db.prepare(
    `INSERT INTO products (id, category_id, name, inventory_type, unit, location_id, created_at, updated_at)
     VALUES (@id, @categoryId, @name, 'rotational', 'ea', @locationId, @createdAt, @updatedAt)`,
  );
  const insertAsset = db.prepare(
    `INSERT INTO rotational_assets (id, product_id, asset_code, serial, status, location_id, notes, created_at, updated_at)
     VALUES (@id, @productId, @assetCode, '', 'available', @locationId, @notes, @createdAt, @updatedAt)`,
  );
  const insertIdent = db.prepare(
    `INSERT OR IGNORE INTO identifiers (id, code, kind, target_type, target_id, created_at)
     VALUES (?, ?, 'barcode', 'rotational_asset', ?, ?)`,
  );

  const items = tableExists(db, 'items')
    ? db
        .prepare(
          `SELECT id, barcode, name_id as nameId, notes, created_at as createdAt, updated_at as updatedAt FROM items`,
        )
        .all()
    : [];

  const tx = db.transaction(() => {
    const productByName = new Map();
    for (const name of names) {
      const productId = name.id;
      insertProduct.run({
        id: productId,
        categoryId,
        name: name.name,
        locationId: location?.id || null,
        createdAt: name.created_at,
        updatedAt: name.updated_at,
      });
      insertIdent.run(makeId(), `PRD-${productId.slice(0, 8)}`, 'qr', 'product', productId, now);
      productByName.set(name.id, productId);
    }
    for (const item of items) {
      const productId = productByName.get(item.nameId);
      if (!productId) continue;
      insertAsset.run({
        id: item.id,
        productId,
        assetCode: item.barcode,
        locationId: location?.id || null,
        notes: item.notes || '',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
      insertIdent.run(makeId(), item.barcode, 'barcode', 'rotational_asset', item.id, now);
    }
  });
  tx();
  metaSet(db, 'legacy_catalog_migrated', '1');
}
