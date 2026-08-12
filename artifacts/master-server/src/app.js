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

function resolveModuleDir() {
  // Prefer CJS __dirname (injected by the bundle banner). Fall back for ESM src.
  try {
    // eslint-disable-next-line no-undef
    if (typeof __dirname === 'string' && __dirname) return __dirname;
  } catch {
    // ignore
  }
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
}

function resolvePublicDir() {
  const moduleDir = resolveModuleDir();
  // When running from src/: public is ./public
  // When running packaged bundle from dist/: public is sibling ./public
  const publicDirCandidates = [
    path.join(moduleDir, 'public'),
    path.join(moduleDir, '../public'),
    path.join(process.cwd(), 'public'),
    path.join(process.cwd(), 'dist', 'public'),
  ];
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
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  // API only - Master UI is the native desktop GUI, not a browser page.

  function resolveDownloadsDir() {
    const moduleDir = resolveModuleDir();
    const candidates = [
      path.join(config.dataDir || '', 'downloads'),
      path.join(process.cwd(), 'dist', 'downloads'),
      path.join(process.cwd(), 'downloads'),
      path.join(moduleDir, '../dist/downloads'),
      path.join(moduleDir, '../../dist/downloads'),
      path.join(moduleDir, 'downloads'),
      path.join(moduleDir, '../downloads'),
    ];
    for (const c of candidates) {
      try {
        if (c && fs.existsSync(c)) return c;
      } catch {}
    }
    // Prefer dataDir/downloads and create it
    const preferred = path.join(config.dataDir || process.cwd(), 'downloads');
    try { fs.mkdirSync(preferred, { recursive: true }); } catch {}
    return preferred;
  }

  function listDownloadFiles(dir) {
    const wanted = [
      { key: 'windowsSetup', names: ['DTMInventorySetup.msi', 'DTM-Inventory-Setup.msi', 'DTMInventory-Setup.msi', 'DTMInventorySetup.exe'], label: 'Windows Setup (non-Master)' },
      { key: 'windowsMaster', names: ['DTMInventoryMaster.msi', 'DTM-Inventory-Master.msi', 'DTMInventory-Master.msi', 'DTMInventoryMaster.exe'], label: 'Windows Master' },
      { key: 'androidApk', names: ['DTMInventory.apk', 'dtm-inventory.apk', 'app-release.apk', 'app-preview.apk'], label: 'Android APK' },
    ];
    /** @type {Record<string, any>} */
    const out = {};
    if (!dir || !fs.existsSync(dir)) return out;
    const files = fs.readdirSync(dir);
    for (const item of wanted) {
      for (const name of item.names) {
        if (files.includes(name)) {
          const full = path.join(dir, name);
          const st = fs.statSync(full);
          out[item.key] = {
            key: item.key,
            label: item.label,
            fileName: name,
            size: st.size,
            url: `/downloads/${encodeURIComponent(name)}`,
            mtime: st.mtime.toISOString(),
          };
          break;
        }
      }
    }
    return out;
  }

  const downloadsDir = resolveDownloadsDir();
  // Serve installer/APK binaries
  app.use('/downloads', express.static(downloadsDir, {
    fallthrough: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.apk')) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      } else if (filePath.endsWith('.zip') || filePath.endsWith('.exe')) {
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      }
    },
  }));

  app.get('/api/downloads', async (req, res) => {
    const primary = pickPrimaryLanIp();
    const host = String(req.headers.host || `${primary}:${config.port}`);
    const proto = req.protocol || 'http';
    const origin = `${proto}://${host}`;
    const files = listDownloadFiles(downloadsDir);
    const android = files.androidApk || null;
    const windows = files.windowsSetup || files.windowsMaster || null;
    let androidQr = null;
    let pageQr = null;
    try {
      pageQr = await QRCode.toDataURL(`${origin}/`, { margin: 1, width: 280 });
      if (android) {
        androidQr = await QRCode.toDataURL(`${origin}${android.url}`, { margin: 1, width: 280 });
      }
    } catch {
      // ignore qr failures
    }
    res.json({
      origin,
      downloadsDir,
      files,
      android,
      windows,
      qrs: {
        page: pageQr,
        androidApk: androidQr,
      },
    });
  });



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


  app.get('/api/master/pins', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT id, target_type as targetType, target_id as targetId, label, barcode, notes, created_at as createdAt
         FROM dashboard_pins
         ORDER BY created_at DESC, id DESC`,
      )
      .all();
    res.json({ pins: rows });
  });

  app.post('/api/master/pins/toggle', (req, res) => {
    const targetType = String(req.body?.targetType || req.body?.target_type || 'item').trim() || 'item';
    const targetId = String(req.body?.targetId || req.body?.target_id || req.body?.id || '').trim();
    const label = req.body?.label != null ? String(req.body.label) : null;
    const barcode = req.body?.barcode != null ? String(req.body.barcode) : null;
    const notes = req.body?.notes != null ? String(req.body.notes) : null;
    if (!targetId) {
      res.status(400).json({ error: 'targetId is required' });
      return;
    }
    const existing = db
      .prepare(`SELECT id FROM dashboard_pins WHERE target_type = ? AND target_id = ?`)
      .get(targetType, targetId);
    if (existing) {
      db.prepare(`DELETE FROM dashboard_pins WHERE id = ?`).run(existing.id);
      res.json({ pinned: false, targetType, targetId });
      return;
    }
    db.prepare(
      `INSERT INTO dashboard_pins (target_type, target_id, label, barcode, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(targetType, targetId, label, barcode, notes, nowIso());
    res.json({ pinned: true, targetType, targetId });
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
      type: 'dtm-inventory-tether',
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

  app.get('/api', (_req, res) => {
    res.json({
      name: 'DTM Inventory Master API',
      note: 'Open / for the device install page. Use the Master desktop app for administration.',
    });
  });

  // Small LAN download page: Windows non-master installer + Android APK QR
  app.get('/', async (req, res) => {
    const primary = pickPrimaryLanIp();
    const host = String(req.headers.host || `${primary}:${config.port}`);
    const origin = `${req.protocol || 'http'}://${host}`;
    const files = listDownloadFiles(downloadsDir);
    const android = files.androidApk || null;
    const windows = files.windowsSetup || null;
    const windowsMaster = files.windowsMaster || null;

    let androidQr = '';
    let pageQr = '';
    try {
      pageQr = await QRCode.toDataURL(`${origin}/`, { margin: 1, width: 240 });
      if (android) androidQr = await QRCode.toDataURL(`${origin}${android.url}`, { margin: 1, width: 280 });
    } catch {}

    const fmtSize = (n) => {
      if (!n && n !== 0) return '';
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    };

    const winCard = windows
      ? `<a class="card action" href="${windows.url}">
          <div class="badge">Windows</div>
          <h2>Setup installer (MSI)</h2>
          <p>Non-master Windows MSI for warehouse PCs.</p>
          <div class="meta">${windows.fileName} · ${fmtSize(windows.size)}</div>
          <div class="btn">Download MSI</div>
        </a>`
      : `<div class="card muted">
          <div class="badge">Windows</div>
          <h2>Setup installer</h2>
          <p>Not published yet. On the Master PC run <code>pnpm master:app</code> then copy the Setup zip into the downloads folder.</p>
        </div>`;

    const apkCard = android
      ? `<div class="card">
          <div class="badge">Android</div>
          <h2>Phone app (APK)</h2>
          <p>Scan the QR code on your phone, or tap download.</p>
          <img class="qr" alt="Android APK QR" src="${androidQr}" />
          <div class="meta">${android.fileName} · ${fmtSize(android.size)}</div>
          <a class="btn" href="${android.url}">Download APK</a>
        </div>`
      : `<div class="card muted">
          <div class="badge">Android</div>
          <h2>Phone app (APK)</h2>
          <p>APK not published yet. Build with <code>pnpm android:apk</code> and place <code>DTMInventory.apk</code> in the Master downloads folder.</p>
        </div>`;

    const masterCard = windowsMaster
      ? `<a class="card subtle" href="${windowsMaster.url}">
          <div class="badge">Optional</div>
          <h2>Master app</h2>
          <p>${windowsMaster.fileName} · ${fmtSize(windowsMaster.size)}</p>
        </a>`
      : '';

    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DTM Inventory · Install</title>
  <link rel="icon" href="/downloads/icon.png" />
  <style>
    :root {
      --brand: #293588;
      --brand-2: #1f2a6b;
      --bg: #f4f6fb;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --line: #e2e8f0;
      --shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(1200px 500px at 10% -10%, rgba(41,53,136,0.16), transparent 60%),
        radial-gradient(900px 400px at 100% 0%, rgba(41,53,136,0.10), transparent 55%),
        var(--bg);
      min-height: 100vh;
    }
    .wrap { max-width: 980px; margin: 0 auto; padding: 28px 18px 48px; }
    header { display:flex; gap:16px; align-items:center; margin-bottom: 22px; }
    .logo {
      width: 56px; height: 56px; border-radius: 16px; background: white;
      box-shadow: var(--shadow); object-fit: contain; border: 1px solid var(--line);
    }
    h1 { margin: 0; font-size: 1.55rem; letter-spacing: -0.03em; }
    .sub { margin: 4px 0 0; color: var(--muted); font-size: 0.95rem; }
    .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .card {
      background: var(--card); border: 1px solid var(--line); border-radius: 22px;
      padding: 20px; box-shadow: var(--shadow); text-decoration: none; color: inherit;
      display:flex; flex-direction:column; gap: 10px; min-height: 100%;
    }
    .card.action:hover { border-color: #c7d2fe; transform: translateY(-1px); }
    .card.muted { opacity: 0.95; }
    .card.subtle { background: #f8fafc; box-shadow: none; }
    .badge {
      display:inline-flex; width:max-content; font-size: 0.72rem; font-weight: 700;
      letter-spacing: 0.06em; text-transform: uppercase; color: var(--brand);
      background: rgba(41,53,136,0.08); border-radius: 999px; padding: 5px 10px;
    }
    h2 { margin: 0; font-size: 1.2rem; letter-spacing: -0.02em; }
    p { margin: 0; color: var(--muted); line-height: 1.45; }
    .meta { color: #334155; font-size: 0.86rem; }
    .btn {
      margin-top: auto; display:inline-flex; justify-content:center; align-items:center;
      background: linear-gradient(180deg, var(--brand), var(--brand-2)); color: white !important;
      text-decoration: none; border-radius: 14px; padding: 12px 14px; font-weight: 700;
      box-shadow: 0 10px 24px rgba(41,53,136,0.28);
    }
    .qr { width: min(100%, 220px); height: auto; align-self: center; border-radius: 16px; border: 1px solid var(--line); background: white; padding: 10px; }
    footer { margin-top: 22px; color: var(--muted); font-size: 0.86rem; display:flex; gap: 14px; flex-wrap: wrap; align-items:center; }
    code { background: #eef2ff; color: #1e293b; padding: 1px 6px; border-radius: 6px; font-size: 0.86em; }
    .tiny-qr { width: 72px; height: 72px; border-radius: 12px; border: 1px solid var(--line); background: white; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <img class="logo" src="/downloads/icon.png" alt="DTM" onerror="this.style.display='none'" />
      <div>
        <h1>DTM Inventory</h1>
        <p class="sub">Install apps for this Master · ${origin}</p>
      </div>
    </header>
    <div class="grid">
      ${winCard}
      ${apkCard}
      ${masterCard}
    </div>
    <footer>
      ${pageQr ? `<img class="tiny-qr" alt="Page QR" src="${pageQr}" />` : ''}
      <div>
        Pairing API is on this same address. Public downloads also at <a href="https://dtmsuite.xflixq.com/downloads" style="color:var(--brand)">dtmsuite.xflixq.com/downloads</a>.
        <div>LAN IP: <strong>${primary}</strong> · Port <strong>${config.port}</strong></div>
      </div>
    </footer>
  </div>
</body>
</html>`);
  });

  return { app, db };
}
