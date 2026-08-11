import { makeId, nowIso } from './db.js';

/**
 * @param {import('better-sqlite3').Database} db
 */
export function listGroupedCatalog(db) {
  const names = db
    .prepare(
      `SELECT id, name, created_at as createdAt, updated_at as updatedAt
       FROM product_names
       ORDER BY name COLLATE NOCASE ASC`,
    )
    .all();
  const items = db
    .prepare(
      `SELECT id, barcode, name_id as nameId, notes, created_at as createdAt, updated_at as updatedAt
       FROM items
       ORDER BY created_at DESC`,
    )
    .all();

  /** @type {Record<string, any[]>} */
  const byName = {};
  for (const item of items) {
    if (!byName[item.nameId]) byName[item.nameId] = [];
    byName[item.nameId].push(item);
  }

  return names.map((group) => ({
    ...group,
    count: (byName[group.id] || []).length,
    items: byName[group.id] || [],
  }));
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function listNames(db) {
  return db
    .prepare(
      `SELECT id, name, created_at as createdAt, updated_at as updatedAt
       FROM product_names
       ORDER BY name COLLATE NOCASE ASC`,
    )
    .all();
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} name
 */
export function ensureName(db, name) {
  const cleaned = String(name || '').trim();
  if (!cleaned) throw new Error('Name is required');
  const existing = db
    .prepare(`SELECT id, name, created_at as createdAt, updated_at as updatedAt FROM product_names WHERE name = ? COLLATE NOCASE`)
    .get(cleaned);
  if (existing) return existing;
  const now = nowIso();
  const row = { id: makeId(), name: cleaned, createdAt: now, updatedAt: now };
  db.prepare(
    `INSERT INTO product_names (id, name, created_at, updated_at) VALUES (@id, @name, @createdAt, @updatedAt)`,
  ).run(row);
  return row;
}

/**
 * Toggle barcodes into/out of a named group.
 * Second scan of same barcode removes it.
 * @param {import('better-sqlite3').Database} db
 * @param {{ name: string, barcodes: string[], notes?: string }} payload
 */
export function applyBulkScan(db, payload) {
  const nameRow = ensureName(db, payload.name);
  const notes = String(payload.notes || '').trim();
  const barcodes = Array.from(
    new Set(
      (payload.barcodes || [])
        .map((b) => String(b || '').replace(/[^0-9A-Za-z-]/g, '').trim())
        .filter((b) => b.length >= 4),
    ),
  );

  let added = 0;
  let removed = 0;
  let moved = 0;
  const now = nowIso();

  const findItem = db.prepare(`SELECT id, barcode, name_id as nameId FROM items WHERE barcode = ?`);
  const insertItem = db.prepare(
    `INSERT INTO items (id, barcode, name_id, notes, created_at, updated_at)
     VALUES (@id, @barcode, @nameId, @notes, @createdAt, @updatedAt)`,
  );
  const deleteItem = db.prepare(`DELETE FROM items WHERE id = ?`);
  const updateItem = db.prepare(
    `UPDATE items SET name_id = @nameId, notes = @notes, updated_at = @updatedAt WHERE id = @id`,
  );

  const tx = db.transaction(() => {
    for (const barcode of barcodes) {
      const existing = findItem.get(barcode);
      if (!existing) {
        insertItem.run({
          id: makeId(),
          barcode,
          nameId: nameRow.id,
          notes,
          createdAt: now,
          updatedAt: now,
        });
        added++;
        continue;
      }
      if (existing.nameId === nameRow.id) {
        deleteItem.run(existing.id);
        removed++;
        continue;
      }
      updateItem.run({ id: existing.id, nameId: nameRow.id, notes, updatedAt: now });
      moved++;
    }
    db.prepare(`UPDATE product_names SET updated_at = ? WHERE id = ?`).run(now, nameRow.id);
  });
  tx();

  return {
    name: nameRow,
    added,
    removed,
    moved,
    groups: listGroupedCatalog(db),
    names: listNames(db),
  };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} itemId
 */
export function deleteItem(db, itemId) {
  db.prepare(`DELETE FROM items WHERE id = ?`).run(itemId);
  return { groups: listGroupedCatalog(db), names: listNames(db) };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} nameId
 */
export function deleteGroup(db, nameId) {
  db.prepare(`DELETE FROM items WHERE name_id = ?`).run(nameId);
  db.prepare(`DELETE FROM product_names WHERE id = ?`).run(nameId);
  return { groups: listGroupedCatalog(db), names: listNames(db) };
}
