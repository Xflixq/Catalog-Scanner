import { PERMISSIONS } from './constants.js';
import { hasPermission, isLoopback, rateLimit } from './security.js';
import { refreshAlerts, listAlerts, writeAudit } from './audit.js';
import {
  applyInventoryAction,
  assignIdentifier,
  createRotational,
  createTool,
  dashboardStats,
  getProduct,
  globalSearch,
  listCategories,
  listLocations,
  listProducts,
  listTransactions,
  lookupCode,
  myItems,
  upsertCategory,
  upsertLocation,
  upsertProduct,
} from './domain.js';
import {
  assignNfc,
  bootstrapPassword,
  claimPairing,
  clearBootstrapPassword,
  createPairingCode,
  decidePairing,
  getMasterSecret,
  getUserAuth,
  listDevices,
  listNfc,
  listPairing,
  listRoles,
  listUsers,
  loginHistory,
  loginNfc,
  loginPassword,
  logoutUser,
  renameDevice,
  requestPairing,
  resolveDevice,
  resolveUserSession,
  revokeDevice,
  revokeNfc,
  saveRole,
  upsertUser,
} from './authz.js';
import { applyBulkScan, deleteGroup, deleteItem, listGroupedCatalog, listNames, ensureName } from './catalog.js';
import { makeLoginCode, nowIso } from './db-util.js';
import { saveConfig } from './config.js';
import { getLanIPv4Addresses, pickPrimaryLanIp } from './network.js';

function actorOf(req) {
  return { userId: req.user?.id, deviceId: req.device?.id };
}

function requirePerm(permission) {
  return (req, res, next) => {
    if (req.masterLocal) return next();
    const perms = req.user?.permissions || [];
    if (!hasPermission(perms, permission)) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    next();
  };
}

function handheldReady(req, res, next) {
  if (req.masterLocal) return next();
  if (!req.device) {
    res.status(401).json({ error: 'Device is not paired' });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Sign in required' });
    return;
  }
  next();
}

export function registerApi(app, db, config) {
  function auth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : String(req.headers['x-session-token'] || '');
    const userToken = String(req.headers['x-user-token'] || '');
    if (token) {
      const device = resolveDevice(db, token);
      if (device) {
        req.device = device;
      } else {
        // legacy sessions table
        const session = db.prepare(`SELECT token, device_name as deviceName FROM sessions WHERE token = ?`).get(token);
        if (session) {
          db.prepare(`UPDATE sessions SET last_seen_at = ? WHERE token = ?`).run(new Date().toISOString(), token);
          req.legacySession = session;
        }
      }
    }
    if (userToken) req.user = resolveUserSession(db, userToken);
    if (req.device?.currentUserId && !req.user) {
      req.user = getUserAuth(db, req.device.currentUserId);
    }
    next();
  }

  function requireDeviceOrMaster(req, res, next) {
    if (req.masterLocal || req.device || req.legacySession) return next();
    res.status(401).json({ error: 'Authentication required' });
  }

  app.use('/api', (req, res, next) => {
    if (isLoopback(req)) req.loopback = true;
    next();
  });

  app.post('/api/auth/local', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Local master login is only available on this PC' });
      return;
    }
    const admin = db.prepare(`SELECT id FROM users WHERE username = 'admin'`).get();
    const user = admin ? getUserAuth(db, admin.id) : null;
    req.masterLocal = true;
    res.json({
      ok: true,
      masterLocal: true,
      user,
      bootstrapPassword: bootstrapPassword(db),
    });
  });

  app.use('/api', (req, _res, next) => {
    if (isLoopback(req) && String(req.headers['x-dtm-master'] || '') === '1') {
      req.masterLocal = true;
      const admin = db.prepare(`SELECT id FROM users WHERE username = 'admin'`).get();
      if (admin) req.user = getUserAuth(db, admin.id);
    }
    next();
  });

  app.use('/api', auth);

  app.get('/api/session', (req, res) => {
    if (!req.masterLocal && !req.device && !req.legacySession) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    res.json({
      ok: true,
      masterLocal: Boolean(req.masterLocal),
      device: req.device || null,
      user: req.user || null,
      permissions: req.masterLocal ? ['*'] : req.user?.permissions || [],
    });
  });

  app.post('/api/auth/pair/request', (req, res) => {
    const ip = req.socket?.remoteAddress || 'unknown';
    if (!rateLimit(`pair:${ip}`, 15, 60_000)) {
      res.status(429).json({ error: 'Too many pairing attempts' });
      return;
    }
    try {
      const result = requestPairing(db, {
        code: req.body?.code,
        deviceName: req.body?.deviceName,
        deviceUid: req.body?.deviceUid,
        appVersion: req.body?.appVersion,
        platform: req.body?.platform || 'android',
      });
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Pairing failed' });
    }
  });

  app.get('/api/auth/pair/status/:id', (req, res) => {
    try {
      res.json(claimPairing(db, req.params.id));
    } catch (error) {
      res.status(404).json({ error: error instanceof Error ? error.message : 'Not found' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    if (!req.device && !req.masterLocal) {
      res.status(401).json({ error: 'Pair this device before signing in' });
      return;
    }
    const ip = req.socket?.remoteAddress || 'unknown';
    if (!rateLimit(`login:${ip}`, 20, 60_000)) {
      res.status(429).json({ error: 'Too many login attempts' });
      return;
    }
    try {
      const result = loginPassword(db, {
        username: req.body?.username,
        password: req.body?.password,
        deviceId: req.device?.id,
      });
      res.json({
        token: result.token,
        expiresAt: result.expiresAt,
        user: result.user,
      });
    } catch (error) {
      res.status(401).json({ error: error instanceof Error ? error.message : 'Login failed' });
    }
  });

  app.post('/api/auth/nfc', (req, res) => {
    if (!req.device && !req.masterLocal) {
      res.status(401).json({ error: 'Pair this device before signing in' });
      return;
    }
    try {
      const result = loginNfc(db, { uid: req.body?.uid, deviceId: req.device?.id });
      res.json({ token: result.token, expiresAt: result.expiresAt, user: result.user });
    } catch (error) {
      res.status(401).json({ error: error instanceof Error ? error.message : 'NFC login failed' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    logoutUser(db, { userId: req.user?.id, deviceId: req.device?.id }, actorOf(req));
    res.json({ ok: true });
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'dtm-inventory-master',
      time: nowIso(),
      lanIps: getLanIPv4Addresses(),
      port: config.port,
    });
  });

  app.get('/api/master/status', (_req, res) => {
    const stats = dashboardStats(db);
    const primary = pickPrimaryLanIp();
    res.json({
      role: 'master',
      baseUrl: `http://${primary}:${config.port}`,
      lanIps: getLanIPv4Addresses(),
      host: config.host,
      port: config.port,
      dbPath: config.dbPath,
      dataDir: config.dataDir,
      sessions: db.prepare(`SELECT COUNT(*) as count FROM devices WHERE status = 'active'`).get().count,
      items: db.prepare(`SELECT COUNT(*) as count FROM rotational_assets`).get().count,
      names: db.prepare(`SELECT COUNT(*) as count FROM products WHERE archived = 0`).get().count,
      stats,
    });
  });

  app.get('/api/dashboard', requireDeviceOrMaster, (req, res) => {
    refreshAlerts(db);
    const stats = dashboardStats(db);
    const recent = listTransactions(db, { limit: 12 });
    const users = db
      .prepare(
        `SELECT display_name as displayName, last_login_at as lastLoginAt FROM users WHERE last_login_at IS NOT NULL ORDER BY last_login_at DESC LIMIT 8`,
      )
      .all();
    res.json({
      stats,
      alerts: listAlerts(db).filter((a) => !a.acknowledgedAt).slice(0, 20),
      recent,
      activeUsers: users,
      devices: listDevices(db).filter((d) => d.status === 'active'),
    });
  });

  app.get('/api/alerts', requireDeviceOrMaster, (_req, res) => {
    refreshAlerts(db);
    res.json({ alerts: listAlerts(db) });
  });

  app.post('/api/alerts/:id/ack', requirePerm('alerts.manage'), (req, res) => {
    db.prepare(`UPDATE alerts SET acknowledged_at = ? WHERE id = ?`).run(new Date().toISOString(), req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/search', requireDeviceOrMaster, (req, res) => {
    res.json(globalSearch(db, String(req.query.q || '')));
  });

  app.get('/api/lookup/:code', requireDeviceOrMaster, (req, res) => {
    const found = lookupCode(db, req.params.code);
    if (!found) {
      res.status(404).json({ error: 'Code not recognised' });
      return;
    }
    res.json(found);
  });

  app.get('/api/categories', requireDeviceOrMaster, (_req, res) => {
    res.json({ categories: listCategories(db) });
  });
  app.post('/api/categories', requirePerm('categories.manage'), (req, res) => {
    try {
      res.status(201).json({ category: upsertCategory(db, req.body || {}, actorOf(req)), categories: listCategories(db) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid category' });
    }
  });

  app.get('/api/locations', requireDeviceOrMaster, (_req, res) => {
    res.json({ locations: listLocations(db) });
  });
  app.post('/api/locations', requirePerm('locations.manage'), (req, res) => {
    try {
      res.status(201).json({ location: upsertLocation(db, req.body || {}, actorOf(req)), locations: listLocations(db) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid location' });
    }
  });

  app.get('/api/products', requireDeviceOrMaster, (req, res) => {
    res.json({
      products: listProducts(db, {
        q: String(req.query.q || ''),
        type: String(req.query.type || ''),
        archived: req.query.archived === '1',
      }),
    });
  });
  app.get('/api/products/:id', requireDeviceOrMaster, (req, res) => {
    const product = getProduct(db, req.params.id);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json({ product });
  });
  app.post('/api/products', requirePerm('products.manage'), (req, res) => {
    try {
      const product = upsertProduct(db, req.body || {}, actorOf(req));
      res.status(201).json({ product });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid product' });
    }
  });
  app.post('/api/products/:id/units', requirePerm('products.manage'), (req, res) => {
    try {
      const product = getProduct(db, req.params.id);
      if (!product) throw new Error('Product not found');
      if (product.inventoryType === 'tool') {
        res.json({ tool: createTool(db, { ...req.body, productId: product.id }, actorOf(req)) });
        return;
      }
      res.json({ asset: createRotational(db, { ...req.body, productId: product.id }, actorOf(req)) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Could not add unit' });
    }
  });

  app.post('/api/identifiers', requirePerm('labels.manage'), (req, res) => {
    try {
      const row = assignIdentifier(db, req.body || {});
      res.status(201).json({ identifier: row });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Duplicate or invalid code' });
    }
  });

  app.get('/api/labels/:targetType/:targetId', requireDeviceOrMaster, (req, res) => {
    const codes = db
      .prepare(
        `SELECT code, kind FROM identifiers WHERE target_type = ? AND target_id = ?`,
      )
      .all(req.params.targetType, req.params.targetId);
    res.json({ codes });
  });

  const actionPerm = {
    'consumable.take': 'inventory.take',
    'consumable.add': 'inventory.add',
    'consumable.return': 'inventory.return',
    'consumable.adjust': 'inventory.adjust',
    'rotational.issue': 'inventory.issue',
    'rotational.return': 'inventory.return',
    'rotational.status': 'inventory.issue',
    'tool.checkout': 'tools.checkout',
    'tool.return': 'tools.return',
    'tool.status': 'tools.checkout',
    'location.transfer': 'inventory.adjust',
  };

  app.post('/api/inventory/actions', handheldReady, (req, res) => {
    const action = String(req.body?.action || '');
    const perm = actionPerm[action];
    if (!req.masterLocal && perm && !hasPermission(req.user?.permissions || [], perm)) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    try {
      const result = applyInventoryAction(db, req.body || {}, actorOf(req));
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Action failed' });
    }
  });

  app.get('/api/me/items', handheldReady, (req, res) => {
    res.json(myItems(db, req.user.id));
  });

  app.get('/api/users', requirePerm('users.manage'), (_req, res) => {
    res.json({ users: listUsers(db), roles: listRoles(db), permissionCatalog: PERMISSIONS });
  });
  app.post('/api/users', requirePerm('users.manage'), (req, res) => {
    try {
      if (req.body?.password && String(req.body.username).toLowerCase() === 'admin') {
        clearBootstrapPassword(db);
      }
      res.status(201).json({ user: upsertUser(db, req.body || {}, actorOf(req)), users: listUsers(db) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid user' });
    }
  });
  app.post('/api/roles', requirePerm('permissions.manage'), (req, res) => {
    try {
      res.json({ role: saveRole(db, req.body || {}, actorOf(req)), roles: listRoles(db) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid role' });
    }
  });
  app.get('/api/users/:id/nfc', requirePerm('nfc.manage'), (req, res) => {
    res.json({ cards: listNfc(db, req.params.id) });
  });
  app.post('/api/users/:id/nfc', requirePerm('nfc.manage'), (req, res) => {
    try {
      res.status(201).json({ cards: assignNfc(db, { userId: req.params.id, uid: req.body?.uid, label: req.body?.label }, actorOf(req)) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Could not assign card' });
    }
  });
  app.post('/api/nfc/:id/revoke', requirePerm('nfc.manage'), (req, res) => {
    const card = db.prepare(`SELECT user_id as userId FROM nfc_credentials WHERE id = ?`).get(req.params.id);
    res.json({ cards: revokeNfc(db, { id: req.params.id, userId: card?.userId }, actorOf(req)) });
  });
  app.post('/api/users/:id/signout', requirePerm('users.manage'), (req, res) => {
    logoutUser(db, { userId: req.params.id }, actorOf(req));
    res.json({ ok: true });
  });
  app.get('/api/users/:id/logins', requirePerm('users.manage'), (req, res) => {
    res.json({ events: loginHistory(db, req.params.id) });
  });

  app.get('/api/devices', requirePerm('devices.manage'), (_req, res) => {
    res.json({ devices: listDevices(db), pairing: listPairing(db) });
  });
  app.post('/api/pairing/start', requirePerm('pairing.manage'), async (req, res) => {
    try {
      const QRCode = (await import('qrcode')).default;
      const { pickPrimaryLanIp, getLanIPv4Addresses } = await import('./network.js');
      const created = createPairingCode(db, actorOf(req), Number(req.body?.ttlMinutes || 15));
      const primary = pickPrimaryLanIp();
      const port = config.port;
      const payload = {
        v: 2,
        type: 'dtm-inventory-pair',
        baseUrl: `http://${primary}:${port}`,
        lanIps: getLanIPv4Addresses().map((ip) => `http://${ip}:${port}`),
        port,
        code: created.code,
        pairingId: created.id,
        masterId: String(getMasterSecret(db) || '').slice(0, 8),
      };
      const qrText = JSON.stringify(payload);
      const qrDataUrl = await QRCode.toDataURL(qrText, { errorCorrectionLevel: 'M', margin: 1, width: 360 });
      res.status(201).json({ ...created, ...payload, qrText, qrDataUrl });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Could not start pairing' });
    }
  });
  app.post('/api/pairing/:id/decide', requirePerm('pairing.manage'), (req, res) => {
    try {
      res.json(decidePairing(db, { requestId: req.params.id, approve: Boolean(req.body?.approve), name: req.body?.name }, actorOf(req)));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Could not decide pairing' });
    }
  });
  app.post('/api/devices/:id/revoke', requirePerm('devices.manage'), (req, res) => {
    revokeDevice(db, req.params.id, actorOf(req));
    res.json({ devices: listDevices(db) });
  });
  app.post('/api/devices/:id/rename', requirePerm('devices.manage'), (req, res) => {
    renameDevice(db, req.params.id, req.body?.name, actorOf(req));
    res.json({ devices: listDevices(db) });
  });

  app.get('/api/transactions', requireDeviceOrMaster, (req, res) => {
    if (!req.masterLocal && !hasPermission(req.user?.permissions || [], 'audit.view') && !hasPermission(req.user?.permissions || [], 'reports.view')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    res.json({ transactions: listTransactions(db, { q: String(req.query.q || ''), limit: Number(req.query.limit || 300) }) });
  });

  app.get('/api/audit', requirePerm('audit.view'), (req, res) => {
    const rows = db
      .prepare(
        `SELECT a.id, a.at, a.action, a.entity_type as entityType, a.entity_id as entityId, a.payload_json as payload,
                u.display_name as userName, d.name as deviceName
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN devices d ON d.id = a.device_id
         ORDER BY a.at DESC LIMIT 400`,
      )
      .all();
    res.json({ logs: rows });
  });

  app.get('/api/reports/:kind', requirePerm('reports.view'), (req, res) => {
    const kind = req.params.kind;
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    let rows = [];
    if (kind === 'stock') {
      rows = db.prepare(`SELECT name, inventory_type as type, qty, min_qty as minQty, unit FROM products WHERE archived = 0 ORDER BY name`).all();
    } else if (kind === 'low-stock') {
      rows = db.prepare(`SELECT name, qty, min_qty as minQty, unit FROM products WHERE archived = 0 AND inventory_type = 'consumable' AND qty <= min_qty AND min_qty > 0`).all();
    } else if (kind === 'tools-out') {
      rows = db.prepare(`SELECT t.tool_code as toolCode, t.status, t.issued_at as issuedAt, u.display_name as holder, p.name as product FROM tools t JOIN products p ON p.id = t.product_id LEFT JOIN users u ON u.id = t.holder_user_id WHERE t.status IN ('checked_out','overdue','reserved')`).all();
    } else if (kind === 'overdue') {
      rows = db.prepare(`SELECT t.tool_code as toolCode, t.expected_return_at as expectedReturnAt, u.display_name as holder, p.name as product FROM tools t JOIN products p ON p.id = t.product_id LEFT JOIN users u ON u.id = t.holder_user_id WHERE t.status = 'overdue'`).all();
    } else if (kind === 'awaiting') {
      rows = db.prepare(`SELECT r.asset_code as assetCode, r.status, p.name as product FROM rotational_assets r JOIN products p ON p.id = r.product_id WHERE r.status = 'awaiting_collection'`).all();
    } else if (kind === 'damaged') {
      rows = db.prepare(`SELECT 'rotational' as kind, asset_code as code, status FROM rotational_assets WHERE status IN ('damaged','missing') UNION ALL SELECT 'tool', tool_code, status FROM tools WHERE status IN ('damaged','missing')`).all();
    } else if (kind === 'issued-by-user') {
      rows = db.prepare(`SELECT u.display_name as user, COUNT(*) as count FROM transactions t JOIN users u ON u.id = t.user_id WHERE t.action LIKE '%issue%' OR t.action LIKE '%checkout%' OR t.action LIKE '%take%' GROUP BY u.id ORDER BY count DESC`).all();
    } else if (kind === 'usage') {
      rows = db.prepare(`SELECT p.name as product, SUM(CASE WHEN t.action = 'consumable.take' THEN t.qty ELSE 0 END) as taken FROM transactions t JOIN products p ON p.id = t.product_id WHERE (? = '' OR t.created_at >= ?) AND (? = '' OR t.created_at <= ?) GROUP BY p.id ORDER BY taken DESC`).all(from, from, to, to);
    } else if (kind === 'activity') {
      rows = db.prepare(`SELECT u.display_name as user, COUNT(*) as actions FROM audit_logs a JOIN users u ON u.id = a.user_id GROUP BY u.id ORDER BY actions DESC`).all();
    } else if (kind === 'transactions') {
      rows = listTransactions(db, { limit: 1000 });
    } else {
      res.status(404).json({ error: 'Unknown report' });
      return;
    }
    res.json({ kind, rows });
  });

  app.post('/api/sync/fail', requireDeviceOrMaster, (req, res) => {
    writeAudit(db, {
      ...actorOf(req),
      action: 'sync.fail',
      entityType: 'device',
      entityId: req.device?.id || '',
      payload: { detail: req.body?.detail || '' },
    });
    db.prepare(
      `INSERT INTO alerts (id, type, severity, title, body, entity_type, entity_id, created_at)
       VALUES (?, 'sync_failed', 'warning', 'Handheld sync failed', ?, 'device', ?, ?)`,
    ).run(
      cryptoRandom(),
      String(req.body?.detail || 'A queued transaction could not be synchronised'),
      req.device?.id || '',
      new Date().toISOString(),
    );
    res.json({ ok: true });
  });

  // Compatibility catalogue endpoints for existing handheld builds during migration.
  app.get('/api/catalog', requireDeviceOrMaster, (_req, res) => {
    res.json({ groups: listGroupedCatalog(db), names: listNames(db) });
  });
  app.get('/api/names', requireDeviceOrMaster, (_req, res) => {
    res.json({ names: listNames(db) });
  });
  app.post('/api/names', requireDeviceOrMaster, (req, res) => {
    try {
      const name = ensureName(db, req.body?.name);
      res.status(201).json({ name, names: listNames(db) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid name' });
    }
  });
  app.post('/api/scan/bulk', handheldReady, (req, res) => {
    if (!req.masterLocal && !hasPermission(req.user?.permissions || [], 'inventory.add')) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    try {
      res.json(applyBulkScan(db, req.body || {}));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Bulk scan failed' });
    }
  });
  app.delete('/api/items/:id', requirePerm('products.manage'), (req, res) => {
    res.json(deleteItem(db, req.params.id));
  });
  app.delete('/api/groups/:id', requirePerm('products.manage'), (req, res) => {
    res.json(deleteGroup(db, req.params.id));
  });

  app.get('/api/master/pins', requireDeviceOrMaster, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT id, target_type as targetType, target_id as targetId, label, barcode, notes, created_at as createdAt
         FROM dashboard_pins ORDER BY created_at DESC, id DESC`,
      )
      .all();
    res.json({ pins: rows });
  });
  app.post('/api/master/pins/toggle', requireDeviceOrMaster, (req, res) => {
    const targetType = String(req.body?.targetType || 'item').trim() || 'item';
    const targetId = String(req.body?.targetId || req.body?.id || '').trim();
    if (!targetId) {
      res.status(400).json({ error: 'targetId is required' });
      return;
    }
    const existing = db.prepare(`SELECT id FROM dashboard_pins WHERE target_type = ? AND target_id = ?`).get(targetType, targetId);
    if (existing) {
      db.prepare(`DELETE FROM dashboard_pins WHERE id = ?`).run(existing.id);
      res.json({ pinned: false, targetType, targetId });
      return;
    }
    db.prepare(
      `INSERT INTO dashboard_pins (target_type, target_id, label, barcode, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(targetType, targetId, req.body?.label || null, req.body?.barcode || null, req.body?.notes || null, nowIso());
    res.json({ pinned: true, targetType, targetId });
  });

  app.post('/api/master/login-codes', requirePerm('pairing.manage'), (req, res) => {
    const code = makeLoginCode();
    const createdAt = nowIso();
    const ttlMinutes = Math.min(Math.max(Number(req.body?.ttlMinutes || 30), 5), 24 * 60);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    const label = String(req.body?.label || '').trim();
    db.prepare(`INSERT INTO login_codes (code, created_at, expires_at, label) VALUES (?, ?, ?, ?)`).run(
      code,
      createdAt,
      expiresAt,
      label,
    );
    res.status(201).json({ code, createdAt, expiresAt, label, ttlMinutes });
  });
  app.get('/api/master/login-codes', requirePerm('pairing.manage'), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT code, created_at as createdAt, expires_at as expiresAt, used_at as usedAt, label FROM login_codes ORDER BY created_at DESC LIMIT 50`,
      )
      .all();
    res.json({ codes: rows });
  });
  app.post('/api/master/config', requirePerm('settings.manage'), (req, res) => {
    try {
      const next = saveConfig({ port: req.body?.port, dbPath: req.body?.dbPath, host: req.body?.host });
      res.json({ ok: true, config: next, note: 'Database path / port changes apply on next master restart.' });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid config' });
    }
  });
}

function cryptoRandom() {
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}
