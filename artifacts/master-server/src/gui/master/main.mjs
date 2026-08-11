import { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMasterService } from '../../service.js';
import { saveConfig, loadConfig } from '../../lib/config.js';
import QRCode from 'qrcode';
import { makeLoginCode, nowIso } from '../../lib/db.js';
import { listGroupedCatalog } from '../../lib/catalog.js';
import { pickPrimaryLanIp } from '../../lib/network.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
nativeTheme.themeSource = 'light';

/** @type {import('http').Server | null} */
let service = null;
/** @type {import('better-sqlite3').Database | null} */
let db = null;
/** @type {any} */
let config = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#ffffff',
    title: 'DTM Inventory Master',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  return win;
}

async function bootService() {
  const started = await startMasterService();
  service = started;
  db = started.db;
  config = started.config;
  return started;
}

function getStatus() {
  const primary = pickPrimaryLanIp();
  const items = db.prepare('SELECT COUNT(*) as c FROM items').get().c;
  const names = db.prepare('SELECT COUNT(*) as c FROM product_names').get().c;
  const sessions = db.prepare('SELECT COUNT(*) as c FROM sessions').get().c;
  return {
    baseUrl: `http://${primary}:${config.port}`,
    port: config.port,
    dbPath: config.dbPath,
    dataDir: config.dataDir,
    items,
    names,
    sessions,
    host: config.host,
  };
}

async function getTether() {
  const status = getStatus();
  const payload = JSON.stringify({
    v: 1,
    kind: 'dtm-inventory-tether',
    baseUrl: status.baseUrl,
  });
  const qrDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: { dark: '#000000', light: '#ffffff' },
  });
  return { baseUrl: status.baseUrl, qrDataUrl, payload };
}

function listCodes() {
  return db
    .prepare(
      `SELECT code, label, created_at as createdAt, expires_at as expiresAt, used_at as usedAt
       FROM login_codes ORDER BY created_at DESC LIMIT 30`,
    )
    .all();
}

function createCode(label = '', ttlMinutes = 60) {
  const code = makeLoginCode();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO login_codes (code, created_at, expires_at, used_at, label)
     VALUES (?, ?, ?, NULL, ?)`,
  ).run(code, createdAt, expiresAt, String(label || '').trim());
  return { code, expiresAt, label };
}

function getCatalog() {
  return listGroupedCatalog(db);
}

function wireIpc() {
  ipcMain.handle('master:status', () => getStatus());
  ipcMain.handle('master:tether', () => getTether());
  ipcMain.handle('master:codes', () => ({ codes: listCodes() }));
  ipcMain.handle('master:createCode', (_e, { label, ttlMinutes } = {}) =>
    createCode(label, ttlMinutes || 60),
  );
  ipcMain.handle('master:catalog', () => getCatalog());
  ipcMain.handle('master:saveConfig', (_e, partial) => {
    const next = saveConfig(partial || {});
    return {
      ...next,
      note: 'Saved. Restart DTM Inventory Master for port or database path changes.',
    };
  });
  ipcMain.handle('master:pickDbPath', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Catalog database location',
      defaultPath: config.dbPath,
      filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });
  ipcMain.handle('master:openExternal', (_e, url) => {
    if (typeof url === 'string' && url.startsWith('http')) shell.openExternal(url);
  });
}

app.whenReady().then(async () => {
  try {
    await bootService();
  } catch (err) {
    dialog.showErrorBox(
      'DTM Inventory Master',
      err instanceof Error ? err.message : String(err),
    );
    app.quit();
    return;
  }
  wireIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (service) await service.close();
  if (process.platform !== 'darwin') app.quit();
});
