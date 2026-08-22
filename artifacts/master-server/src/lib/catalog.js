import { makeId, nowIso } from './db-util.js';
import { assignIdentifier, createRotational, upsertProduct } from './domain.js';

export function listNames(db) {
  return db
    .prepare(
      `SELECT id, name, created_at as createdAt, updated_at as updatedAt FROM products WHERE archived = 0 ORDER BY name COLLATE NOCASE`,
    )
    .all();
}

export function listGroupedCatalog(db) {
  const names = listNames(db);
  const assets = db
    .prepare(
      `SELECT r.id, r.asset_code as barcode, r.product_id as nameId, r.notes,
              r.created_at as createdAt, r.updated_at as updatedAt, r.updated_at as scannedAt, r.status
       FROM rotational_assets r ORDER BY r.updated_at DESC`,
    )
    .all();
  const tools = db
    .prepare(
      `SELECT t.id, t.tool_code as barcode, t.product_id as nameId, t.notes,
              t.created_at as createdAt, t.updated_at as updatedAt, t.updated_at as scannedAt, t.status
       FROM tools t ORDER BY t.updated_at DESC`,
    )
    .all();
  const byName = {};
  for (const item of [...assets, ...tools]) {
    if (!byName[item.nameId]) byName[item.nameId] = [];
    byName[item.nameId].push(item);
  }
  return names.map((group) => ({
    ...group,
    count: (byName[group.id] || []).length,
    items: byName[group.id] || [],
  }));
}

export function ensureName(db, name) {
  const cleaned = String(name || '').trim();
  if (!cleaned) throw new Error('Name is required');
  const existing = db
    .prepare(`SELECT id, name, created_at as createdAt, updated_at as updatedAt FROM products WHERE name = ? COLLATE NOCASE`)
    .get(cleaned);
  if (existing) return existing;
  const product = upsertProduct(
    db,
    { name: cleaned, inventoryType: 'rotational' },
    { userId: null, deviceId: null },
  );
  return { id: product.id, name: product.name, createdAt: product.createdAt, updatedAt: product.updatedAt };
}

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

  const tx = db.transaction(() => {
    for (const barcode of barcodes) {
      const ident = db
        .prepare(`SELECT target_type as targetType, target_id as targetId FROM identifiers WHERE code = ? COLLATE NOCASE`)
        .get(barcode);
      if (!ident) {
        createRotational(db, { productId: nameRow.id, assetCode: barcode, notes, qr: barcode }, {});
        added++;
        continue;
      }
      if (ident.targetType === 'rotational_asset') {
        const asset = db.prepare(`SELECT id, product_id as productId FROM rotational_assets WHERE id = ?`).get(ident.targetId);
        if (!asset) continue;
        if (asset.productId === nameRow.id) {
          db.prepare(`DELETE FROM identifiers WHERE target_type = 'rotational_asset' AND target_id = ?`).run(asset.id);
          db.prepare(`DELETE FROM rotational_assets WHERE id = ?`).run(asset.id);
          removed++;
        } else {
          db.prepare(`UPDATE rotational_assets SET product_id = ?, notes = ?, updated_at = ? WHERE id = ?`).run(
            nameRow.id,
            notes,
            now,
            asset.id,
          );
          moved++;
        }
      }
    }
    db.prepare(`UPDATE products SET updated_at = ? WHERE id = ?`).run(now, nameRow.id);
  });
  tx();
  return { name: nameRow, added, removed, moved, groups: listGroupedCatalog(db), names: listNames(db) };
}

export function deleteItem(db, itemId) {
  db.prepare(`DELETE FROM identifiers WHERE target_type IN ('rotational_asset','tool') AND target_id = ?`).run(itemId);
  db.prepare(`DELETE FROM rotational_assets WHERE id = ?`).run(itemId);
  db.prepare(`DELETE FROM tools WHERE id = ?`).run(itemId);
  return { groups: listGroupedCatalog(db), names: listNames(db) };
}

export function deleteGroup(db, nameId) {
  const assets = db.prepare(`SELECT id FROM rotational_assets WHERE product_id = ?`).all(nameId);
  const tools = db.prepare(`SELECT id FROM tools WHERE product_id = ?`).all(nameId);
  for (const row of [...assets, ...tools]) {
    db.prepare(`DELETE FROM identifiers WHERE target_id = ?`).run(row.id);
  }
  db.prepare(`DELETE FROM rotational_assets WHERE product_id = ?`).run(nameId);
  db.prepare(`DELETE FROM tools WHERE product_id = ?`).run(nameId);
  db.prepare(`DELETE FROM identifiers WHERE target_type = 'product' AND target_id = ?`).run(nameId);
  db.prepare(`UPDATE products SET archived = 1, updated_at = ? WHERE id = ?`).run(nowIso(), nameId);
  return { groups: listGroupedCatalog(db), names: listNames(db) };
}

export { assignIdentifier, makeId };
