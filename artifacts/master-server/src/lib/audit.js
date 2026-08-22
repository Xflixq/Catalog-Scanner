import { makeId, nowIso, parseJson } from './db-util.js';

export function writeAudit(db, { userId, deviceId, action, entityType = '', entityId = '', payload = {} }) {
  db.prepare(
    `INSERT INTO audit_logs (id, at, user_id, device_id, action, entity_type, entity_id, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    makeId(),
    nowIso(),
    userId || null,
    deviceId || null,
    action,
    entityType,
    entityId,
    JSON.stringify(payload),
  );
}

export function writeHistory(db, { targetType, targetId, event, userId, deviceId, payload = {} }) {
  db.prepare(
    `INSERT INTO asset_history (id, target_type, target_id, event, user_id, device_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(makeId(), targetType, targetId, event, userId || null, deviceId || null, JSON.stringify(payload), nowIso());
}

export function writeTransaction(db, row) {
  const existing = db.prepare(`SELECT id, result FROM transactions WHERE client_id = ?`).get(row.clientId);
  if (existing) return { duplicate: true, id: existing.id, result: existing.result };
  const id = makeId();
  db.prepare(
    `INSERT INTO transactions (
      id, client_id, user_id, device_id, action, target_type, target_id, product_id,
      qty, prev_state, new_state, location_id, notes, result, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    row.clientId,
    row.userId || null,
    row.deviceId || null,
    row.action,
    row.targetType || '',
    row.targetId || '',
    row.productId || null,
    row.qty ?? null,
    row.prevState ?? null,
    row.newState ?? null,
    row.locationId || null,
    row.notes || '',
    row.result || 'ok',
    nowIso(),
  );
  return { duplicate: false, id };
}

export function refreshAlerts(db) {
  const now = nowIso();
  db.prepare(`DELETE FROM alerts WHERE acknowledged_at IS NULL AND type IN (
    'low_stock', 'out_of_stock', 'overdue_tool', 'awaiting_collection', 'damaged', 'missing', 'device_offline'
  )`).run();

  const insert = db.prepare(
    `INSERT INTO alerts (id, type, severity, title, body, entity_type, entity_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const low = db
    .prepare(
      `SELECT id, name, qty, min_qty FROM products
       WHERE archived = 0 AND inventory_type = 'consumable' AND qty <= min_qty AND min_qty > 0`,
    )
    .all();
  for (const p of low) {
    insert.run(
      makeId(),
      p.qty <= 0 ? 'out_of_stock' : 'low_stock',
      p.qty <= 0 ? 'critical' : 'warning',
      p.qty <= 0 ? `Out of stock: ${p.name}` : `Low stock: ${p.name}`,
      `Quantity ${p.qty} (minimum ${p.min_qty})`,
      'product',
      p.id,
      now,
    );
  }

  const overdue = db
    .prepare(
      `SELECT t.id, t.tool_code, u.display_name
       FROM tools t LEFT JOIN users u ON u.id = t.holder_user_id
       WHERE t.status IN ('checked_out', 'overdue')
         AND t.expected_return_at IS NOT NULL
         AND t.expected_return_at < ?`,
    )
    .all(now);
  for (const t of overdue) {
    db.prepare(`UPDATE tools SET status = 'overdue', updated_at = ? WHERE id = ? AND status = 'checked_out'`).run(now, t.id);
    insert.run(
      makeId(),
      'overdue_tool',
      'warning',
      `Overdue tool ${t.tool_code}`,
      t.display_name ? `Held by ${t.display_name}` : 'Expected return date passed',
      'tool',
      t.id,
      now,
    );
  }

  for (const row of db.prepare(`SELECT id, asset_code, status FROM rotational_assets WHERE status IN ('awaiting_collection', 'damaged', 'missing')`).all()) {
    insert.run(
      makeId(),
      row.status === 'awaiting_collection' ? 'awaiting_collection' : row.status,
      row.status === 'missing' ? 'critical' : 'warning',
      `${row.status.replaceAll('_', ' ')}: ${row.asset_code}`,
      '',
      'rotational_asset',
      row.id,
      now,
    );
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  for (const d of db
    .prepare(
      `SELECT id, name, last_seen_at FROM devices WHERE status = 'active' AND (last_seen_at IS NULL OR last_seen_at < ?)`,
    )
    .all(cutoff)) {
    insert.run(makeId(), 'device_offline', 'info', `Device offline: ${d.name}`, d.last_seen_at || 'Never seen', 'device', d.id, now);
  }
}

export function listAlerts(db) {
  return db
    .prepare(
      `SELECT id, type, severity, title, body, entity_type as entityType, entity_id as entityId,
              created_at as createdAt, acknowledged_at as acknowledgedAt
       FROM alerts ORDER BY CASE WHEN acknowledged_at IS NULL THEN 0 ELSE 1 END, created_at DESC LIMIT 200`,
    )
    .all();
}

export { parseJson };
