import { makeId, makeToken, nowIso, parseJson } from './db-util.js';
import { hashNfcUid, hashPassword, hashToken, randomCode, verifyPassword } from './security.js';
import { writeAudit } from './audit.js';

function pepper(db) {
  return db.prepare(`SELECT value FROM meta WHERE key = 'nfc_pepper'`).get()?.value || 'dtm';
}

function masterSecret(db) {
  return db.prepare(`SELECT value FROM meta WHERE key = 'master_secret'`).get()?.value;
}

export function getMasterSecret(db) {
  return masterSecret(db);
}

export function listRoles(db) {
  return db
    .prepare(
      `SELECT id, name, description, permissions_json as permissionsJson, created_at as createdAt, updated_at as updatedAt FROM roles ORDER BY name`,
    )
    .all()
    .map((r) => ({ ...r, permissions: parseJson(r.permissionsJson, []) }));
}

export function saveRole(db, payload, actor) {
  const name = String(payload.name || '').trim();
  if (!name) throw new Error('Role name is required');
  const permissions = Array.isArray(payload.permissions) ? payload.permissions : [];
  const now = nowIso();
  if (payload.id) {
    db.prepare(`UPDATE roles SET name = ?, description = ?, permissions_json = ?, updated_at = ? WHERE id = ?`).run(
      name,
      payload.description || '',
      JSON.stringify(permissions),
      now,
      payload.id,
    );
    writeAudit(db, { ...actor, action: 'role.update', entityType: 'role', entityId: payload.id, payload: { name, permissions } });
    return listRoles(db).find((r) => r.id === payload.id);
  }
  const id = makeId();
  db.prepare(`INSERT INTO roles (id, name, description, permissions_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id,
    name,
    payload.description || '',
    JSON.stringify(permissions),
    now,
    now,
  );
  writeAudit(db, { ...actor, action: 'role.create', entityType: 'role', entityId: id });
  return listRoles(db).find((r) => r.id === id);
}

export function listUsers(db) {
  return db
    .prepare(
      `SELECT u.id, u.username, u.display_name as displayName, u.status, u.created_at as createdAt,
              u.last_login_at as lastLoginAt, r.id as roleId, r.name as role,
              (SELECT COUNT(*) FROM nfc_credentials n WHERE n.user_id = u.id AND n.revoked_at IS NULL) as nfcCount
       FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.username COLLATE NOCASE`,
    )
    .all();
}

export function getUserAuth(db, id) {
  const row = db
    .prepare(
      `SELECT u.*, r.name as roleName, r.permissions_json as permissionsJson
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    )
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    status: row.status,
    roleId: row.role_id,
    role: row.roleName,
    permissions: parseJson(row.permissionsJson, []),
  };
}

export function upsertUser(db, payload, actor) {
  const username = String(payload.username || '').trim();
  const displayName = String(payload.displayName || payload.display_name || username).trim();
  if (!username) throw new Error('Username is required');
  const now = nowIso();
  if (payload.id) {
    const existing = db.prepare(`SELECT * FROM users WHERE id = ?`).get(payload.id);
    if (!existing) throw new Error('User not found');
    db.prepare(
      `UPDATE users SET username = ?, display_name = ?, role_id = ?, status = ?, updated_at = ? WHERE id = ?`,
    ).run(username, displayName, payload.roleId || existing.role_id, payload.status || existing.status, now, payload.id);
    if (payload.password) {
      db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(hashPassword(payload.password), now, payload.id);
    }
    writeAudit(db, { ...actor, action: 'user.update', entityType: 'user', entityId: payload.id, payload: { username } });
    return listUsers(db).find((u) => u.id === payload.id);
  }
  if (!payload.password) throw new Error('Password is required');
  const roleId = payload.roleId || db.prepare(`SELECT id FROM roles WHERE name = 'standard_user'`).get()?.id;
  if (!roleId) throw new Error('Role is required');
  const id = makeId();
  db.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, role_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, username, displayName, hashPassword(payload.password), roleId, payload.status || 'active', now, now);
  writeAudit(db, { ...actor, action: 'user.create', entityType: 'user', entityId: id, payload: { username } });
  return listUsers(db).find((u) => u.id === id);
}

export function listNfc(db, userId) {
  return db
    .prepare(
      `SELECT id, label, created_at as createdAt, revoked_at as revokedAt FROM nfc_credentials WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .all(userId);
}

export function assignNfc(db, { userId, uid, label }, actor) {
  const tokenHash = hashNfcUid(uid, pepper(db));
  const existing = db.prepare(`SELECT id, user_id as userId, revoked_at as revokedAt FROM nfc_credentials WHERE token_hash = ?`).get(tokenHash);
  if (existing && !existing.revokedAt) throw new Error('This NFC credential is already assigned');
  const id = makeId();
  db.prepare(
    `INSERT INTO nfc_credentials (id, user_id, token_hash, label, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, tokenHash, label || '', nowIso(), actor.userId || null);
  writeAudit(db, { ...actor, action: 'nfc.assign', entityType: 'user', entityId: userId });
  return listNfc(db, userId);
}

export function revokeNfc(db, { id, userId }, actor) {
  db.prepare(`UPDATE nfc_credentials SET revoked_at = ? WHERE id = ?`).run(nowIso(), id);
  writeAudit(db, { ...actor, action: 'nfc.revoke', entityType: 'nfc', entityId: id });
  return listNfc(db, userId);
}

export function createUserSession(db, { user, deviceId, method }) {
  const raw = makeToken();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const now = nowIso();
  db.prepare(
    `INSERT INTO user_sessions (id, user_id, device_id, token_hash, method, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(makeId(), user.id, deviceId || null, hashToken(raw, masterSecret(db)), method, now, expiresAt, now);
  db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(now, user.id);
  if (deviceId) db.prepare(`UPDATE devices SET current_user_id = ?, last_seen_at = ? WHERE id = ?`).run(user.id, now, deviceId);
  db.prepare(
    `INSERT INTO login_events (id, user_id, device_id, method, success, detail, created_at) VALUES (?, ?, ?, ?, 1, '', ?)`,
  ).run(makeId(), user.id, deviceId || null, method, now);
  writeAudit(db, { userId: user.id, deviceId, action: 'login', entityType: 'user', entityId: user.id, payload: { method } });
  return { token: raw, expiresAt, user };
}

export function failLogin(db, { userId, deviceId, method, detail }) {
  db.prepare(
    `INSERT INTO login_events (id, user_id, device_id, method, success, detail, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)`,
  ).run(makeId(), userId || null, deviceId || null, method, detail || '', nowIso());
}

export function loginPassword(db, { username, password, deviceId }) {
  const row = db
    .prepare(
      `SELECT u.*, r.name as roleName, r.permissions_json as permissionsJson FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = ? COLLATE NOCASE`,
    )
    .get(String(username || '').trim());
  if (!row || row.status !== 'active' || !verifyPassword(password, row.password_hash)) {
    failLogin(db, { userId: row?.id, deviceId, method: 'password', detail: 'invalid' });
    throw new Error('Invalid username or password');
  }
  const user = getUserAuth(db, row.id);
  return createUserSession(db, { user, deviceId, method: 'password' });
}

export function loginNfc(db, { uid, deviceId }) {
  const tokenHash = hashNfcUid(uid, pepper(db));
  const cred = db
    .prepare(`SELECT * FROM nfc_credentials WHERE token_hash = ? AND revoked_at IS NULL`)
    .get(tokenHash);
  if (!cred) {
    failLogin(db, { deviceId, method: 'nfc', detail: 'unknown_card' });
    throw new Error('NFC card is not recognised');
  }
  const user = getUserAuth(db, cred.user_id);
  if (!user || user.status !== 'active') {
    failLogin(db, { userId: cred.user_id, deviceId, method: 'nfc', detail: 'disabled' });
    throw new Error('User account is disabled');
  }
  return createUserSession(db, { user, deviceId, method: 'nfc' });
}

export function logoutUser(db, { sessionId, userId, deviceId }, actor) {
  const now = nowIso();
  if (sessionId) db.prepare(`UPDATE user_sessions SET revoked_at = ? WHERE id = ?`).run(now, sessionId);
  else if (userId) db.prepare(`UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).run(now, userId);
  if (deviceId) db.prepare(`UPDATE devices SET current_user_id = NULL WHERE id = ?`).run(deviceId);
  writeAudit(db, { ...actor, action: 'logout', entityType: 'user', entityId: userId || '' });
}

export function resolveUserSession(db, rawToken) {
  if (!rawToken) return null;
  const hashed = hashToken(rawToken, masterSecret(db));
  const row = db
    .prepare(
      `SELECT s.*, u.status as userStatus FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .get(hashed);
  if (!row || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  if (row.userStatus !== 'active') return null;
  db.prepare(`UPDATE user_sessions SET last_seen_at = ? WHERE id = ?`).run(nowIso(), row.id);
  return getUserAuth(db, row.user_id);
}

export function listDevices(db) {
  return db
    .prepare(
      `SELECT d.id, d.name, d.device_uid as deviceUid, d.status, d.app_version as appVersion, d.platform,
              d.last_seen_at as lastSeenAt, d.paired_at as pairedAt, d.revoked_at as revokedAt,
              u.display_name as currentUserName, u.id as currentUserId
       FROM devices d LEFT JOIN users u ON u.id = d.current_user_id
       ORDER BY d.created_at DESC`,
    )
    .all();
}

export function createPairingCode(db, actor, ttlMinutes = 15) {
  const code = randomCode(8);
  const id = makeId();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + Math.min(Math.max(ttlMinutes, 2), 60) * 60_000).toISOString();
  db.prepare(
    `INSERT INTO pairing_codes (id, code, created_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, code, createdAt, expiresAt, actor.userId || null);
  writeAudit(db, { ...actor, action: 'pairing.create', entityType: 'pairing_code', entityId: id });
  return { id, code, createdAt, expiresAt };
}

export function listPairing(db) {
  const now = Date.now();
  db.prepare(
    `UPDATE pairing_requests SET status = 'expired' WHERE status = 'pending' AND id IN (
      SELECT r.id FROM pairing_requests r JOIN pairing_codes c ON c.id = r.pairing_code_id
      WHERE c.expires_at < ?
    )`,
  ).run(new Date().toISOString());
  return {
    codes: db
      .prepare(
        `SELECT id, code, created_at as createdAt, expires_at as expiresAt, used_at as usedAt FROM pairing_codes ORDER BY created_at DESC LIMIT 20`,
      )
      .all()
      .map((c) => ({ ...c, expired: new Date(c.expiresAt).getTime() < now || Boolean(c.usedAt) })),
    requests: db
      .prepare(
        `SELECT r.id, r.device_name as deviceName, r.device_uid as deviceUid, r.app_version as appVersion, r.platform,
                r.status, r.created_at as createdAt, r.decided_at as decidedAt, r.device_id as deviceId, c.code
         FROM pairing_requests r JOIN pairing_codes c ON c.id = r.pairing_code_id
         ORDER BY r.created_at DESC LIMIT 50`,
      )
      .all(),
  };
}

export function requestPairing(db, { code, deviceName, deviceUid, appVersion, platform }) {
  const cleaned = String(code || '').trim().toUpperCase();
  const row = db.prepare(`SELECT * FROM pairing_codes WHERE code = ?`).get(cleaned);
  if (!row) throw new Error('Invalid pairing code');
  if (row.used_at) throw new Error('Pairing code already used');
  if (new Date(row.expires_at).getTime() < Date.now()) throw new Error('Pairing code expired');
  const id = makeId();
  db.prepare(
    `INSERT INTO pairing_requests (id, pairing_code_id, device_name, device_uid, app_version, platform, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(id, row.id, String(deviceName || 'Handheld').trim(), String(deviceUid || ''), String(appVersion || ''), String(platform || 'android'), nowIso());
  return { requestId: id, status: 'pending' };
}

export function pairingStatus(db, requestId) {
  const row = db.prepare(`SELECT * FROM pairing_requests WHERE id = ?`).get(requestId);
  if (!row) throw new Error('Pairing request not found');
  if (row.status !== 'approved' || !row.device_id) {
    return { status: row.status, requestId };
  }
  return { status: 'approved', requestId, deviceId: row.device_id };
}

export function decidePairing(db, { requestId, approve, name }, actor) {
  const row = db.prepare(`SELECT * FROM pairing_requests WHERE id = ?`).get(requestId);
  if (!row) throw new Error('Pairing request not found');
  if (row.status !== 'pending') throw new Error('Request is no longer pending');
  const now = nowIso();
  if (!approve) {
    db.prepare(`UPDATE pairing_requests SET status = 'denied', decided_at = ? WHERE id = ?`).run(now, requestId);
    writeAudit(db, { ...actor, action: 'pairing.deny', entityType: 'pairing_request', entityId: requestId });
    return { status: 'denied' };
  }
  const rawToken = makeToken();
  const deviceId = makeId();
  db.prepare(
    `INSERT INTO devices (id, name, device_uid, token_hash, status, app_version, platform, last_seen_at, paired_at, created_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
  ).run(
    deviceId,
    name || row.device_name,
    row.device_uid,
    hashToken(rawToken, masterSecret(db)),
    row.app_version,
    row.platform,
    now,
    now,
    now,
  );
  db.prepare(`UPDATE pairing_requests SET status = 'approved', decided_at = ?, device_id = ?, claim_token = ? WHERE id = ?`).run(
    now,
    deviceId,
    rawToken,
    requestId,
  );
  db.prepare(`UPDATE pairing_codes SET used_at = ? WHERE id = ?`).run(now, row.pairing_code_id);
  writeAudit(db, { ...actor, action: 'pairing.approve', entityType: 'device', entityId: deviceId });
  return { status: 'approved', deviceId, token: rawToken };
}

export function consumeApprovedPairingToken(db, requestId) {
  const row = db.prepare(`SELECT * FROM pairing_requests WHERE id = ?`).get(requestId);
  if (!row || row.status !== 'approved' || !row.device_id) return null;
  // Token is only returned at approval time to the Master; Android polls a one-time claim table via pending_tokens in meta? 
  // We store the plaintext token once in pairing_requests? Better: extra column claim_token.
  return row;
}

export function setPairingClaimToken(db, requestId, token) {
  try {
    db.exec(`ALTER TABLE pairing_requests ADD COLUMN claim_token TEXT`);
  } catch {
    // exists
  }
  db.prepare(`UPDATE pairing_requests SET claim_token = ? WHERE id = ?`).run(token, requestId);
}

export function claimPairing(db, requestId) {
  try {
    db.exec(`ALTER TABLE pairing_requests ADD COLUMN claim_token TEXT`);
  } catch {
    // exists
  }
  const row = db.prepare(`SELECT * FROM pairing_requests WHERE id = ?`).get(requestId);
  if (!row) throw new Error('Pairing request not found');
  if (row.status !== 'approved') return { status: row.status };
  const token = row.claim_token;
  if (!token) return { status: 'approved_pending_token' };
  db.prepare(`UPDATE pairing_requests SET claim_token = NULL WHERE id = ?`).run(requestId);
  const device = db.prepare(`SELECT id, name FROM devices WHERE id = ?`).get(row.device_id);
  return { status: 'approved', token, deviceId: device?.id, deviceName: device?.name };
}

export function resolveDevice(db, rawToken) {
  if (!rawToken) return null;
  const hashed = hashToken(rawToken, masterSecret(db));
  const row = db.prepare(`SELECT * FROM devices WHERE token_hash = ?`).get(hashed);
  if (!row || row.status !== 'active') return null;
  db.prepare(`UPDATE devices SET last_seen_at = ? WHERE id = ?`).run(nowIso(), row.id);
  return {
    id: row.id,
    name: row.name,
    deviceUid: row.device_uid,
    status: row.status,
    currentUserId: row.current_user_id,
  };
}

export function revokeDevice(db, id, actor) {
  db.prepare(`UPDATE devices SET status = 'revoked', revoked_at = ?, token_hash = NULL, current_user_id = NULL WHERE id = ?`).run(
    nowIso(),
    id,
  );
  writeAudit(db, { ...actor, action: 'device.revoke', entityType: 'device', entityId: id });
}

export function renameDevice(db, id, name, actor) {
  db.prepare(`UPDATE devices SET name = ? WHERE id = ?`).run(String(name || '').trim(), id);
  writeAudit(db, { ...actor, action: 'device.rename', entityType: 'device', entityId: id });
}

export function loginHistory(db, userId) {
  return db
    .prepare(
      `SELECT id, method, success, detail, created_at as createdAt, device_id as deviceId
       FROM login_events WHERE (? IS NULL OR user_id = ?) ORDER BY created_at DESC LIMIT 100`,
    )
    .all(userId || null, userId || null);
}

export function bootstrapPassword(db) {
  if (db.prepare(`SELECT value FROM meta WHERE key = 'admin_bootstrap_pending'`).get()?.value !== '1') return null;
  return db.prepare(`SELECT value FROM meta WHERE key = 'admin_bootstrap_password'`).get()?.value || null;
}

export function clearBootstrapPassword(db) {
  db.prepare(`DELETE FROM meta WHERE key IN ('admin_bootstrap_password', 'admin_bootstrap_pending')`).run();
}
