import { makeId, nowIso } from './db-util.js';
import { INVENTORY_TYPES, ROTATIONAL_STATUSES, TOOL_STATUSES } from './constants.js';
import { writeAudit, writeHistory, writeTransaction, refreshAlerts } from './audit.js';

export function assignIdentifier(db, { code, kind = 'qr', targetType, targetId }) {
  const cleaned = String(code || '').trim();
  if (!cleaned) throw new Error('Code is required');
  const existing = db
    .prepare(`SELECT id, target_type as targetType, target_id as targetId FROM identifiers WHERE code = ? COLLATE NOCASE`)
    .get(cleaned);
  if (existing && (existing.targetType !== targetType || existing.targetId !== targetId)) {
    throw new Error(`Code already assigned to ${existing.targetType}`);
  }
  if (existing) return existing;
  const row = { id: makeId(), code: cleaned, kind, targetType, targetId, createdAt: nowIso() };
  db.prepare(
    `INSERT INTO identifiers (id, code, kind, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.code, row.kind, row.targetType, row.targetId, row.createdAt);
  return row;
}

export function lookupCode(db, code) {
  const cleaned = String(code || '').trim();
  if (!cleaned) return null;
  const ident = db
    .prepare(
      `SELECT id, code, kind, target_type as targetType, target_id as targetId FROM identifiers WHERE code = ? COLLATE NOCASE`,
    )
    .get(cleaned);
  if (!ident) {
    const product = db.prepare(`SELECT * FROM products WHERE sku = ? COLLATE NOCASE`).get(cleaned);
    if (product) return { type: 'product', product: mapProduct(db, product) };
    return null;
  }
  return hydrateTarget(db, ident.targetType, ident.targetId, ident);
}

function hydrateTarget(db, type, id, identifier) {
  if (type === 'product') {
    const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    return product ? { type: 'product', identifier, product: mapProduct(db, product) } : null;
  }
  if (type === 'rotational_asset') {
    const asset = getRotational(db, id);
    return asset ? { type: 'rotational_asset', identifier, asset, product: mapProduct(db, db.prepare(`SELECT * FROM products WHERE id = ?`).get(asset.productId)) } : null;
  }
  if (type === 'tool') {
    const tool = getTool(db, id);
    return tool ? { type: 'tool', identifier, tool, product: mapProduct(db, db.prepare(`SELECT * FROM products WHERE id = ?`).get(tool.productId)) } : null;
  }
  if (type === 'location') {
    const location = getLocation(db, id);
    return location ? { type: 'location', identifier, location } : null;
  }
  if (type === 'user') {
    const user = getUserPublic(db, id);
    return user ? { type: 'user', identifier, user } : null;
  }
  if (type === 'category') {
    const category = getCategory(db, id);
    return category ? { type: 'category', identifier, category } : null;
  }
  if (type === 'device') {
    const device = getDevice(db, id);
    return device ? { type: 'device', identifier, device } : null;
  }
  return { type, identifier };
}

function mapProduct(db, row) {
  if (!row) return null;
  const category = row.category_id
    ? db.prepare(`SELECT id, name, inventory_type as inventoryType FROM categories WHERE id = ?`).get(row.category_id)
    : null;
  const location = row.location_id
    ? db.prepare(`SELECT id, name FROM locations WHERE id = ?`).get(row.location_id)
    : null;
  const codes = db
    .prepare(`SELECT code, kind FROM identifiers WHERE target_type = 'product' AND target_id = ?`)
    .all(row.id);
  return {
    id: row.id,
    categoryId: row.category_id,
    category,
    name: row.name,
    sku: row.sku,
    inventoryType: row.inventory_type,
    unit: row.unit,
    qty: row.qty,
    minQty: row.min_qty,
    reorderQty: row.reorder_qty,
    supplier: row.supplier,
    costCents: row.cost_cents,
    locationId: row.location_id,
    location,
    notes: row.notes,
    archived: Boolean(row.archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    codes,
  };
}

export function listCategories(db) {
  return db
    .prepare(
      `SELECT id, name, inventory_type as inventoryType, description, archived, created_at as createdAt, updated_at as updatedAt
       FROM categories ORDER BY name COLLATE NOCASE`,
    )
    .all();
}

export function getCategory(db, id) {
  return db
    .prepare(
      `SELECT id, name, inventory_type as inventoryType, description, archived, created_at as createdAt, updated_at as updatedAt
       FROM categories WHERE id = ?`,
    )
    .get(id);
}

export function upsertCategory(db, payload, actor) {
  const name = String(payload.name || '').trim();
  const inventoryType = String(payload.inventoryType || payload.inventory_type || '').trim();
  if (!name) throw new Error('Category name is required');
  if (!INVENTORY_TYPES.includes(inventoryType)) throw new Error('Choose rotational, consumable, or tool');
  const now = nowIso();
  if (payload.id) {
    db.prepare(
      `UPDATE categories SET name = ?, inventory_type = ?, description = ?, archived = ?, updated_at = ? WHERE id = ?`,
    ).run(name, inventoryType, String(payload.description || ''), payload.archived ? 1 : 0, now, payload.id);
    writeAudit(db, { ...actor, action: 'category.update', entityType: 'category', entityId: payload.id, payload: { name, inventoryType } });
    return getCategory(db, payload.id);
  }
  const id = makeId();
  db.prepare(
    `INSERT INTO categories (id, name, inventory_type, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, name, inventoryType, String(payload.description || ''), now, now);
  if (payload.code) assignIdentifier(db, { code: payload.code, kind: 'qr', targetType: 'category', targetId: id });
  writeAudit(db, { ...actor, action: 'category.create', entityType: 'category', entityId: id, payload: { name, inventoryType } });
  return getCategory(db, id);
}

export function listLocations(db) {
  return db
    .prepare(
      `SELECT id, name, code, notes, archived, created_at as createdAt, updated_at as updatedAt FROM locations ORDER BY name COLLATE NOCASE`,
    )
    .all()
    .map((row) => ({
      ...row,
      codes: db.prepare(`SELECT code, kind FROM identifiers WHERE target_type = 'location' AND target_id = ?`).all(row.id),
    }));
}

export function getLocation(db, id) {
  return listLocations(db).find((l) => l.id === id) || null;
}

export function upsertLocation(db, payload, actor) {
  const name = String(payload.name || '').trim();
  if (!name) throw new Error('Location name is required');
  const now = nowIso();
  if (payload.id) {
    db.prepare(`UPDATE locations SET name = ?, code = ?, notes = ?, archived = ?, updated_at = ? WHERE id = ?`).run(
      name,
      payload.code || null,
      String(payload.notes || ''),
      payload.archived ? 1 : 0,
      now,
      payload.id,
    );
    if (payload.qr) assignIdentifier(db, { code: payload.qr, kind: 'qr', targetType: 'location', targetId: payload.id });
    writeAudit(db, { ...actor, action: 'location.update', entityType: 'location', entityId: payload.id });
    return getLocation(db, payload.id);
  }
  const id = makeId();
  db.prepare(`INSERT INTO locations (id, name, code, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id,
    name,
    payload.code || null,
    String(payload.notes || ''),
    now,
    now,
  );
  if (payload.qr || payload.code) {
    assignIdentifier(db, { code: payload.qr || payload.code, kind: 'qr', targetType: 'location', targetId: id });
  }
  writeAudit(db, { ...actor, action: 'location.create', entityType: 'location', entityId: id });
  return getLocation(db, id);
}

export function listProducts(db, { q = '', type = '', archived = false } = {}) {
  const rows = db
    .prepare(
      `SELECT * FROM products WHERE (? = 1 OR archived = 0) ORDER BY name COLLATE NOCASE`,
    )
    .all(archived ? 1 : 0)
    .map((row) => mapProduct(db, row));
  return rows.filter((p) => {
    if (type && p.inventoryType !== type) return false;
    if (!q) return true;
    const hay = `${p.name} ${p.sku || ''} ${p.codes.map((c) => c.code).join(' ')}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });
}

export function getProduct(db, id) {
  const row = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
  if (!row) return null;
  const product = mapProduct(db, row);
  product.assets = db
    .prepare(
      `SELECT id FROM rotational_assets WHERE product_id = ?`,
    )
    .all(id)
    .map((r) => getRotational(db, r.id));
  product.tools = db.prepare(`SELECT id FROM tools WHERE product_id = ?`).all(id).map((r) => getTool(db, r.id));
  return product;
}

export function upsertProduct(db, payload, actor) {
  const name = String(payload.name || '').trim();
  const inventoryType = String(payload.inventoryType || payload.inventory_type || '').trim();
  if (!name) throw new Error('Product name is required');
  if (!INVENTORY_TYPES.includes(inventoryType)) throw new Error('Choose an inventory type');
  if (payload.categoryId) {
    const cat = getCategory(db, payload.categoryId);
    if (cat && cat.inventoryType !== inventoryType) {
      throw new Error('Product type must match the category type');
    }
  }
  const now = nowIso();
  const fields = {
    category_id: payload.categoryId || null,
    name,
    sku: payload.sku || null,
    inventory_type: inventoryType,
    unit: payload.unit || 'ea',
    qty: Number(payload.qty ?? 0),
    min_qty: Number(payload.minQty ?? 0),
    reorder_qty: Number(payload.reorderQty ?? 0),
    supplier: payload.supplier || '',
    cost_cents: payload.costCents != null ? Number(payload.costCents) : null,
    location_id: payload.locationId || null,
    notes: payload.notes || '',
    archived: payload.archived ? 1 : 0,
    updated_at: now,
  };

  let id = payload.id;
  if (id) {
    const prev = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    if (!prev) throw new Error('Product not found');
    db.prepare(
      `UPDATE products SET category_id=@category_id, name=@name, sku=@sku, inventory_type=@inventory_type,
       unit=@unit, qty=@qty, min_qty=@min_qty, reorder_qty=@reorder_qty, supplier=@supplier,
       cost_cents=@cost_cents, location_id=@location_id, notes=@notes, archived=@archived, updated_at=@updated_at
       WHERE id=@id`,
    ).run({ ...fields, id });
    writeAudit(db, { ...actor, action: 'product.update', entityType: 'product', entityId: id, payload: { name } });
  } else {
    id = makeId();
    db.prepare(
      `INSERT INTO products (id, category_id, name, sku, inventory_type, unit, qty, min_qty, reorder_qty, supplier, cost_cents, location_id, notes, archived, created_at, updated_at)
       VALUES (@id, @category_id, @name, @sku, @inventory_type, @unit, @qty, @min_qty, @reorder_qty, @supplier, @cost_cents, @location_id, @notes, @archived, @created_at, @updated_at)`,
    ).run({ ...fields, id, created_at: now });
    writeAudit(db, { ...actor, action: 'product.create', entityType: 'product', entityId: id, payload: { name, inventoryType } });
  }

  if (payload.code || payload.qr) {
    assignIdentifier(db, { code: payload.qr || payload.code, kind: payload.kind || 'qr', targetType: 'product', targetId: id });
  }

  const units = Array.isArray(payload.units) ? payload.units : [];
  if (inventoryType === 'rotational') {
    for (const unit of units) {
      createRotational(db, { productId: id, assetCode: unit.code || unit.assetCode, serial: unit.serial, notes: unit.notes, locationId: payload.locationId }, actor);
    }
  }
  if (inventoryType === 'tool') {
    for (const unit of units) {
      createTool(db, {
        productId: id,
        toolCode: unit.code || unit.toolCode,
        serial: unit.serial,
        condition: unit.condition,
        serviceInfo: unit.serviceInfo,
        notes: unit.notes,
        locationId: payload.locationId,
      }, actor);
    }
  }

  refreshAlerts(db);
  return getProduct(db, id);
}

export function getRotational(db, id) {
  const row = db.prepare(`SELECT * FROM rotational_assets WHERE id = ?`).get(id);
  if (!row) return null;
  const holder = row.holder_user_id ? getUserPublic(db, row.holder_user_id) : null;
  const history = db
    .prepare(
      `SELECT id, event, payload_json as payload, created_at as createdAt, user_id as userId
       FROM asset_history WHERE target_type = 'rotational_asset' AND target_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .all(id);
  const codes = db.prepare(`SELECT code, kind FROM identifiers WHERE target_type = 'rotational_asset' AND target_id = ?`).all(id);
  return {
    id: row.id,
    productId: row.product_id,
    assetCode: row.asset_code,
    serial: row.serial,
    status: row.status,
    holderUserId: row.holder_user_id,
    holder,
    locationId: row.location_id,
    issuedAt: row.issued_at,
    returnedAt: row.returned_at,
    condition: row.condition,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history,
    codes,
  };
}

export function getTool(db, id) {
  const row = db.prepare(`SELECT * FROM tools WHERE id = ?`).get(id);
  if (!row) return null;
  const holder = row.holder_user_id ? getUserPublic(db, row.holder_user_id) : null;
  const history = db
    .prepare(
      `SELECT id, event, payload_json as payload, created_at as createdAt FROM asset_history
       WHERE target_type = 'tool' AND target_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .all(id);
  const codes = db.prepare(`SELECT code, kind FROM identifiers WHERE target_type = 'tool' AND target_id = ?`).all(id);
  return {
    id: row.id,
    productId: row.product_id,
    toolCode: row.tool_code,
    serial: row.serial,
    status: row.status,
    holderUserId: row.holder_user_id,
    holder,
    locationId: row.location_id,
    issuedAt: row.issued_at,
    expectedReturnAt: row.expected_return_at,
    returnedAt: row.returned_at,
    condition: row.condition,
    serviceInfo: row.service_info,
    inspectionInfo: row.inspection_info,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history,
    codes,
  };
}

export function getUserPublic(db, id) {
  return db
    .prepare(
      `SELECT u.id, u.username, u.display_name as displayName, u.status, r.name as role
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    )
    .get(id);
}

export function getDevice(db, id) {
  return db
    .prepare(
      `SELECT d.id, d.name, d.device_uid as deviceUid, d.status, d.app_version as appVersion, d.platform,
              d.last_seen_at as lastSeenAt, d.current_user_id as currentUserId, d.paired_at as pairedAt, d.revoked_at as revokedAt,
              u.display_name as currentUserName
       FROM devices d LEFT JOIN users u ON u.id = d.current_user_id WHERE d.id = ?`,
    )
    .get(id);
}

export function createRotational(db, payload, actor) {
  const productId = payload.productId;
  const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(productId);
  if (!product) throw new Error('Product not found');
  const assetCode = String(payload.assetCode || payload.code || makeId().slice(0, 8)).trim();
  const now = nowIso();
  const id = makeId();
  db.prepare(
    `INSERT INTO rotational_assets (id, product_id, asset_code, serial, status, location_id, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'available', ?, ?, ?, ?)`,
  ).run(id, productId, assetCode, payload.serial || '', payload.locationId || product.location_id, payload.notes || '', now, now);
  assignIdentifier(db, { code: payload.qr || assetCode, kind: 'qr', targetType: 'rotational_asset', targetId: id });
  writeHistory(db, { targetType: 'rotational_asset', targetId: id, event: 'created', ...actor });
  return getRotational(db, id);
}

export function createTool(db, payload, actor) {
  const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(payload.productId);
  if (!product) throw new Error('Product not found');
  const toolCode = String(payload.toolCode || payload.code || makeId().slice(0, 8)).trim();
  const now = nowIso();
  const id = makeId();
  db.prepare(
    `INSERT INTO tools (id, product_id, tool_code, serial, status, location_id, condition, service_info, inspection_info, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    payload.productId,
    toolCode,
    payload.serial || '',
    payload.locationId || product.location_id,
    payload.condition || 'good',
    payload.serviceInfo || '',
    payload.inspectionInfo || '',
    payload.notes || '',
    now,
    now,
  );
  assignIdentifier(db, { code: payload.qr || toolCode, kind: 'qr', targetType: 'tool', targetId: id });
  writeHistory(db, { targetType: 'tool', targetId: id, event: 'created', ...actor });
  return getTool(db, id);
}

function requireClientId(payload) {
  const clientId = String(payload.clientId || payload.client_id || '').trim();
  if (!clientId) throw new Error('clientId is required');
  return clientId;
}

export function applyInventoryAction(db, payload, actor) {
  const clientId = requireClientId(payload);
  const action = String(payload.action || '').trim();
  const dup = db.prepare(`SELECT id, result FROM transactions WHERE client_id = ?`).get(clientId);
  if (dup) return { ok: true, duplicate: true, transactionId: dup.id };

  const tx = db.transaction(() => {
    let result;
    if (action === 'consumable.take' || action === 'consumable.add' || action === 'consumable.adjust' || action === 'consumable.return') {
      result = mutateConsumable(db, payload, actor, clientId, action);
    } else if (action.startsWith('rotational.')) {
      result = mutateRotational(db, payload, actor, clientId, action);
    } else if (action.startsWith('tool.')) {
      result = mutateTool(db, payload, actor, clientId, action);
    } else if (action === 'location.transfer') {
      result = transferItems(db, payload, actor, clientId);
    } else {
      throw new Error('Unknown inventory action');
    }
    refreshAlerts(db);
    return result;
  });
  return tx();
}

function mutateConsumable(db, payload, actor, clientId, action) {
  const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(payload.productId || payload.targetId);
  if (!product || product.inventory_type !== 'consumable') throw new Error('Consumable product not found');
  const qty = Number(payload.qty);
  if (!Number.isFinite(qty) || qty < 0) throw new Error('Quantity is required');
  const prev = product.qty;
  let next = prev;
  if (action === 'consumable.take') {
    if (qty <= 0) throw new Error('Quantity must be greater than zero');
    if (prev < qty) throw new Error('Insufficient stock');
    next = prev - qty;
  } else if (action === 'consumable.return' || action === 'consumable.add') {
    next = prev + qty;
  } else if (action === 'consumable.adjust') {
    next = qty;
  }
  db.prepare(`UPDATE products SET qty = ?, updated_at = ? WHERE id = ?`).run(next, nowIso(), product.id);
  const written = writeTransaction(db, {
    clientId,
    userId: actor.userId,
    deviceId: actor.deviceId,
    action,
    targetType: 'product',
    targetId: product.id,
    productId: product.id,
    qty: action === 'consumable.adjust' ? next : qty,
    prevState: String(prev),
    newState: String(next),
    locationId: payload.locationId,
    notes: payload.notes || '',
  });
  writeAudit(db, { ...actor, action, entityType: 'product', entityId: product.id, payload: { prev, next, qty } });
  return { ok: true, duplicate: written.duplicate, product: mapProduct(db, db.prepare(`SELECT * FROM products WHERE id = ?`).get(product.id)) };
}

function mutateRotational(db, payload, actor, clientId, action) {
  const asset = db.prepare(`SELECT * FROM rotational_assets WHERE id = ?`).get(payload.targetId || payload.assetId);
  if (!asset) throw new Error('Rotational item not found');
  const prev = asset.status;
  const now = nowIso();
  let status = payload.status || prev;
  let holder = asset.holder_user_id;
  let issuedAt = asset.issued_at;
  let returnedAt = asset.returned_at;
  if (action === 'rotational.issue') {
    holder = payload.holderUserId || actor.userId;
    if (!holder) throw new Error('Holder is required');
    status = 'issued';
    issuedAt = now;
    returnedAt = null;
  } else if (action === 'rotational.return') {
    status = payload.status && ROTATIONAL_STATUSES.includes(payload.status) ? payload.status : 'returned';
    returnedAt = now;
    holder = null;
  } else if (action === 'rotational.status') {
    if (!ROTATIONAL_STATUSES.includes(status)) throw new Error('Invalid status');
    if (['available', 'returned', 'empty', 'awaiting_collection', 'retired'].includes(status) && status !== 'issued') {
      if (status !== 'issued') holder = status === 'available' || status === 'returned' ? null : holder;
    }
  } else {
    throw new Error('Unknown rotational action');
  }
  db.prepare(
    `UPDATE rotational_assets SET status = ?, holder_user_id = ?, issued_at = ?, returned_at = ?, condition = ?, notes = ?, location_id = ?, updated_at = ? WHERE id = ?`,
  ).run(
    status,
    holder,
    issuedAt,
    returnedAt,
    payload.condition || asset.condition,
    payload.notes != null ? payload.notes : asset.notes,
    payload.locationId || asset.location_id,
    now,
    asset.id,
  );
  writeTransaction(db, {
    clientId,
    userId: actor.userId,
    deviceId: actor.deviceId,
    action,
    targetType: 'rotational_asset',
    targetId: asset.id,
    productId: asset.product_id,
    prevState: prev,
    newState: status,
    locationId: payload.locationId,
    notes: payload.notes || '',
  });
  writeHistory(db, {
    targetType: 'rotational_asset',
    targetId: asset.id,
    event: action,
    ...actor,
    payload: { prev, status, holder },
  });
  return { ok: true, asset: getRotational(db, asset.id) };
}

function mutateTool(db, payload, actor, clientId, action) {
  const tool = db.prepare(`SELECT * FROM tools WHERE id = ?`).get(payload.targetId || payload.toolId);
  if (!tool) throw new Error('Tool not found');
  const prev = tool.status;
  const now = nowIso();
  let status = tool.status;
  let holder = tool.holder_user_id;
  let issuedAt = tool.issued_at;
  let returnedAt = tool.returned_at;
  let expected = tool.expected_return_at;
  if (action === 'tool.checkout') {
    holder = payload.holderUserId || actor.userId;
    if (!holder) throw new Error('Holder is required');
    status = 'checked_out';
    issuedAt = now;
    returnedAt = null;
    expected = payload.expectedReturnAt || null;
  } else if (action === 'tool.return') {
    status = 'available';
    returnedAt = now;
    holder = null;
    expected = null;
  } else if (action === 'tool.status') {
    if (!TOOL_STATUSES.includes(payload.status)) throw new Error('Invalid status');
    status = payload.status;
  } else {
    throw new Error('Unknown tool action');
  }
  db.prepare(
    `UPDATE tools SET status = ?, holder_user_id = ?, issued_at = ?, expected_return_at = ?, returned_at = ?,
     condition = ?, service_info = ?, inspection_info = ?, notes = ?, location_id = ?, updated_at = ? WHERE id = ?`,
  ).run(
    status,
    holder,
    issuedAt,
    expected,
    returnedAt,
    payload.condition || tool.condition,
    payload.serviceInfo != null ? payload.serviceInfo : tool.service_info,
    payload.inspectionInfo != null ? payload.inspectionInfo : tool.inspection_info,
    payload.notes != null ? payload.notes : tool.notes,
    payload.locationId || tool.location_id,
    now,
    tool.id,
  );
  writeTransaction(db, {
    clientId,
    userId: actor.userId,
    deviceId: actor.deviceId,
    action,
    targetType: 'tool',
    targetId: tool.id,
    productId: tool.product_id,
    prevState: prev,
    newState: status,
    notes: payload.notes || '',
  });
  writeHistory(db, { targetType: 'tool', targetId: tool.id, event: action, ...actor, payload: { prev, status, holder } });
  return { ok: true, tool: getTool(db, tool.id) };
}

function transferItems(db, payload, actor, clientId) {
  const toLocationId = payload.toLocationId || payload.locationId;
  if (!toLocationId) throw new Error('Destination location is required');
  const ids = payload.items || [];
  for (const item of ids) {
    if (item.type === 'rotational_asset') {
      const prev = db.prepare(`SELECT location_id FROM rotational_assets WHERE id = ?`).get(item.id);
      db.prepare(`UPDATE rotational_assets SET location_id = ?, updated_at = ? WHERE id = ?`).run(toLocationId, nowIso(), item.id);
      db.prepare(
        `INSERT INTO stock_movements (id, product_id, target_type, target_id, from_location_id, to_location_id, user_id, device_id, notes, created_at)
         VALUES (?, ?, 'rotational_asset', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(makeId(), item.productId || null, item.id, prev?.location_id || null, toLocationId, actor.userId, actor.deviceId, payload.notes || '', nowIso());
    } else if (item.type === 'tool') {
      const prev = db.prepare(`SELECT location_id FROM tools WHERE id = ?`).get(item.id);
      db.prepare(`UPDATE tools SET location_id = ?, updated_at = ? WHERE id = ?`).run(toLocationId, nowIso(), item.id);
      db.prepare(
        `INSERT INTO stock_movements (id, product_id, target_type, target_id, from_location_id, to_location_id, user_id, device_id, notes, created_at)
         VALUES (?, ?, 'tool', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(makeId(), item.productId || null, item.id, prev?.location_id || null, toLocationId, actor.userId, actor.deviceId, payload.notes || '', nowIso());
    } else if (item.type === 'product') {
      db.prepare(`UPDATE products SET location_id = ?, updated_at = ? WHERE id = ?`).run(toLocationId, nowIso(), item.id);
      db.prepare(
        `INSERT INTO stock_movements (id, product_id, target_type, target_id, from_location_id, to_location_id, user_id, device_id, notes, created_at)
         VALUES (?, ?, 'product', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(makeId(), item.id, item.id, null, toLocationId, actor.userId, actor.deviceId, payload.notes || '', nowIso());
    }
  }
  writeTransaction(db, {
    clientId,
    userId: actor.userId,
    deviceId: actor.deviceId,
    action: 'location.transfer',
    targetType: 'location',
    targetId: toLocationId,
    notes: payload.notes || '',
  });
  return { ok: true };
}

export function globalSearch(db, q) {
  const term = `%${String(q || '').trim()}%`;
  if (String(q || '').trim().length < 1) return { products: [], assets: [], tools: [], users: [], locations: [], identifiers: [] };
  return {
    products: db
      .prepare(
        `SELECT id, name, inventory_type as inventoryType, sku FROM products
         WHERE name LIKE ? OR IFNULL(sku,'') LIKE ? COLLATE NOCASE LIMIT 20`,
      )
      .all(term, term),
    assets: db
      .prepare(
        `SELECT r.id, r.asset_code as assetCode, r.status, p.name as productName
         FROM rotational_assets r JOIN products p ON p.id = r.product_id
         WHERE r.asset_code LIKE ? OR r.serial LIKE ? LIMIT 20`,
      )
      .all(term, term),
    tools: db
      .prepare(
        `SELECT t.id, t.tool_code as toolCode, t.status, t.serial, p.name as productName
         FROM tools t JOIN products p ON p.id = t.product_id
         WHERE t.tool_code LIKE ? OR t.serial LIKE ? LIMIT 20`,
      )
      .all(term, term),
    users: db
      .prepare(`SELECT id, username, display_name as displayName FROM users WHERE username LIKE ? OR display_name LIKE ? LIMIT 20`)
      .all(term, term),
    locations: db.prepare(`SELECT id, name, code FROM locations WHERE name LIKE ? OR IFNULL(code,'') LIKE ? LIMIT 20`).all(term, term),
    identifiers: db
      .prepare(`SELECT code, kind, target_type as targetType, target_id as targetId FROM identifiers WHERE code LIKE ? LIMIT 20`)
      .all(term),
  };
}

export function dashboardStats(db) {
  refreshAlerts(db);
  const issued = db.prepare(`SELECT COUNT(*) as c FROM rotational_assets WHERE status IN ('issued', 'empty', 'awaiting_collection')`).get().c;
  const toolsOut = db.prepare(`SELECT COUNT(*) as c FROM tools WHERE status IN ('checked_out', 'overdue', 'reserved')`).get().c;
  const overdue = db.prepare(`SELECT COUNT(*) as c FROM tools WHERE status = 'overdue'`).get().c;
  const missing = db
    .prepare(
      `SELECT (
         (SELECT COUNT(*) FROM rotational_assets WHERE status IN ('missing','damaged')) +
         (SELECT COUNT(*) FROM tools WHERE status IN ('missing','damaged'))
       ) as c`,
    )
    .get().c;
  const low = db.prepare(`SELECT COUNT(*) as c FROM products WHERE inventory_type = 'consumable' AND archived = 0 AND qty <= min_qty AND min_qty > 0`).get().c;
  const devices = db.prepare(`SELECT COUNT(*) as c FROM devices WHERE status = 'active'`).get().c;
  return {
    products: db.prepare(`SELECT COUNT(*) as c FROM products WHERE archived = 0`).get().c,
    issued,
    toolsOut,
    rotationalAway: issued,
    lowStock: low,
    overdue,
    missingDamaged: missing,
    connectedDevices: devices,
  };
}

export function listTransactions(db, { q = '', limit = 200 } = {}) {
  const rows = db
    .prepare(
      `SELECT t.id, t.created_at as createdAt, t.action, t.target_type as targetType, t.target_id as targetId,
              t.qty, t.prev_state as prevState, t.new_state as newState, t.notes, t.result,
              u.display_name as userName, d.name as deviceName, p.name as productName, t.location_id as locationId
       FROM transactions t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN devices d ON d.id = t.device_id
       LEFT JOIN products p ON p.id = t.product_id
       ORDER BY t.created_at DESC LIMIT ?`,
    )
    .all(Math.min(Number(limit) || 200, 1000));
  const term = String(q || '').toLowerCase();
  if (!term) return rows;
  return rows.filter((r) =>
    `${r.action} ${r.userName || ''} ${r.deviceName || ''} ${r.productName || ''} ${r.notes || ''} ${r.targetId}`.toLowerCase().includes(term),
  );
}

export function myItems(db, userId) {
  return {
    tools: db
      .prepare(
        `SELECT t.id, t.tool_code as toolCode, t.status, t.issued_at as issuedAt, t.expected_return_at as expectedReturnAt, p.name as productName
         FROM tools t JOIN products p ON p.id = t.product_id WHERE t.holder_user_id = ?`,
      )
      .all(userId),
    rotational: db
      .prepare(
        `SELECT r.id, r.asset_code as assetCode, r.status, r.issued_at as issuedAt, p.name as productName
         FROM rotational_assets r JOIN products p ON p.id = r.product_id WHERE r.holder_user_id = ?`,
      )
      .all(userId),
  };
}
