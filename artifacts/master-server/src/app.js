import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { loadConfig, saveConfig } from './lib/config.js';
import { openDb, makeLoginCode, makeToken, nowIso } from './lib/db.js';
import { getLanIPv4Addresses, pickPrimaryLanIp } from './lib/network.js';
import {
  applyBulkScan,
  deleteGroup,
  deleteItem,
  listGroupedCatalog,
  listNames,
  ensureName,
} from './lib/catalog.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
// When running from src/: public is ./public
// When running packaged bundle from dist/: public is sibling ./public
const publicDirCandidates = [
  path.join(moduleDir, 'public'),
  path.join(moduleDir, '../public'),
  path.join(process.cwd(), 'public'),
];
function resolvePublicDir() {
  for (const candidate of publicDirCandidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) return candidate;
  }
  return publicDirCandidates[0];
}

/**
 * @param {{ dbPath: string, port: number, host: string, dataDir: string }} config
 */
export function createApp(config) {
  const db = openDb(config.dbPath);
  const app = express();
  const publicDir = resolvePublicDir();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(publicDir));

  function getMasterSecret() {
    return db.prepare(`SELECT value FROM meta WHERE key = 'master_secret'`).get()?.value;
  }

  function auth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : String(req.headers['x-session-token'] || '');
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const session = db.prepare(`SELECT token, device_name as deviceName FROM sessions WHERE token = ?`).get(token);
    if (!session) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }
    db.prepare(`UPDATE sessions SET last_seen_at = ? WHERE token = ?`).run(nowIso(), token);
    req.session = session;
    next();
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'catalog-scanner-master',
      time: nowIso(),
      lanIps: getLanIPv4Addresses(),
      port: config.port,
    });
  });

  app.get('/api/master/status', (_req, res) => {
    const primary = pickPrimaryLanIp();
    const baseUrl = `http://${primary}:${config.port}`;
    res.json({
      role: 'master',
      baseUrl,
      lanIps: getLanIPv4Addresses(),
      port: config.port,
      dbPath: config.dbPath,
      dataDir: config.dataDir,
      sessions: db.prepare(`SELECT COUNT(*) as count FROM sessions`).get().count,
      items: db.prepare(`SELECT COUNT(*) as count FROM items`).get().count,
      names: db.prepare(`SELECT COUNT(*) as count FROM product_names`).get().count,
    });
  });

  app.get('/api/master/tether', async (_req, res) => {
    const primary = pickPrimaryLanIp();
    const baseUrl = `http://${primary}:${config.port}`;
    const payload = {
      v: 1,
      type: 'catalog-scanner-tether',
      baseUrl,
      lanIps: getLanIPv4Addresses().map((ip) => `http://${ip}:${config.port}`),
      port: config.port,
      masterId: getMasterSecret().slice(0, 8),
    };
    const qrText = JSON.stringify(payload);
    const qrDataUrl = await QRCode.toDataURL(qrText, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 360,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    res.json({ ...payload, qrText, qrDataUrl });
  });

  app.post('/api/master/login-codes', (req, res) => {
    const code = makeLoginCode();
    const createdAt = nowIso();
    const ttlMinutes = Math.min(Math.max(Number(req.body?.ttlMinutes || 30), 5), 24 * 60);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    const label = String(req.body?.label || '').trim();
    db.prepare(
      `INSERT INTO login_codes (code, created_at, expires_at, label) VALUES (?, ?, ?, ?)`,
    ).run(code, createdAt, expiresAt, label);
    res.status(201).json({ code, createdAt, expiresAt, label, ttlMinutes });
  });

  app.get('/api/master/login-codes', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT code, created_at as createdAt, expires_at as expiresAt, used_at as usedAt, label
         FROM login_codes
         ORDER BY created_at DESC
         LIMIT 50`,
      )
      .all();
    res.json({ codes: rows });
  });

  app.post('/api/master/config', (req, res) => {
    try {
      const next = saveConfig({
        port: req.body?.port,
        dbPath: req.body?.dbPath,
        host: req.body?.host,
      });
      res.json({
        ok: true,
        config: next,
        note: 'Database path / port changes apply on next master restart.',
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid config' });
    }
  });

  app.post('/api/auth/tether', (req, res) => {
    const baseUrl = String(req.body?.baseUrl || '').trim();
    const deviceName = String(req.body?.deviceName || 'Android device').trim() || 'Android device';
    if (!baseUrl) {
      res.status(400).json({ error: 'baseUrl is required from tether QR' });
      return;
    }
    // Trust LAN tether QR for first-boot pairing.
    const token = makeToken();
    const createdAt = nowIso();
    db.prepare(
      `INSERT INTO sessions (token, device_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)`,
    ).run(token, deviceName, createdAt, createdAt);
    res.status(201).json({
      token,
      deviceName,
      baseUrl,
      createdAt,
    });
  });

  app.post('/api/auth/login-code', (req, res) => {
    const code = String(req.body?.code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const deviceName = String(req.body?.deviceName || 'Workstation').trim() || 'Workstation';
    if (code.length < 4) {
      res.status(400).json({ error: 'Login code is required' });
      return;
    }
    const row = db
      .prepare(
        `SELECT code, expires_at as expiresAt, used_at as usedAt FROM login_codes WHERE code = ?`,
      )
      .get(code);
    if (!row) {
      res.status(401).json({ error: 'Invalid login code' });
      return;
    }
    if (row.usedAt) {
      res.status(401).json({ error: 'Login code already used' });
      return;
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      res.status(401).json({ error: 'Login code expired' });
      return;
    }
    const token = makeToken();
    const createdAt = nowIso();
    const tx = db.transaction(() => {
      db.prepare(`UPDATE login_codes SET used_at = ? WHERE code = ?`).run(createdAt, code);
      db.prepare(
        `INSERT INTO sessions (token, device_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)`,
      ).run(token, deviceName, createdAt, createdAt);
    });
    tx();
    const primary = pickPrimaryLanIp();
    res.status(201).json({
      token,
      deviceName,
      baseUrl: `http://${primary}:${config.port}`,
      createdAt,
    });
  });

  app.get('/api/session', auth, (req, res) => {
    res.json({ ok: true, session: req.session });
  });

  app.get('/api/catalog', auth, (_req, res) => {
    res.json({
      groups: listGroupedCatalog(db),
      names: listNames(db),
    });
  });

  app.get('/api/names', auth, (_req, res) => {
    res.json({ names: listNames(db) });
  });

  app.post('/api/names', auth, (req, res) => {
    try {
      const name = ensureName(db, req.body?.name);
      res.status(201).json({ name, names: listNames(db) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid name' });
    }
  });

  app.post('/api/scan/bulk', auth, (req, res) => {
    try {
      const result = applyBulkScan(db, {
        name: req.body?.name,
        barcodes: req.body?.barcodes || [],
        notes: req.body?.notes || '',
        scannedAt: req.body?.scannedAt || undefined,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Bulk scan failed' });
    }
  });

  app.delete('/api/items/:id', auth, (req, res) => {
    res.json(deleteItem(db, req.params.id));
  });

  app.delete('/api/groups/:id', auth, (req, res) => {
    res.json(deleteGroup(db, req.params.id));
  });

  // SPA fallback for master console (Express 5-safe)
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return { app, db };
}
