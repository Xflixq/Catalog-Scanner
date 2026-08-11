import { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadConfig, saveConfig } from '../../lib/config.js';
import { DEFAULT_TIMEOUT_MS, withTimeout } from '../../lib/timeout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
nativeTheme.themeSource = 'light';

/** @type {import('node:child_process').ChildProcess | null} */
let apiChild = null;
/** @type {any} */
let config = null;
/** @type {string} */
let baseUrl = '';
/** @type {string} */
let masterToken = '';

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

function resolveNodeBinary() {
  // Prefer system Node so better-sqlite3 matches the installed Node ABI,
  // not Electron's NODE_MODULE_VERSION.
  if (process.env.DTM_NODE_PATH && fs.existsSync(process.env.DTM_NODE_PATH)) {
    return process.env.DTM_NODE_PATH;
  }
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c;
    }
    return 'node.exe';
  }
  return 'node';
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, baseUrl);
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: {
          Accept: 'application/json',
          ...(masterToken ? { Authorization: `Bearer ${masterToken}` } : {}),
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
        },
        timeout: DEFAULT_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data = {};
          try {
            data = text ? JSON.parse(text) : {};
          } catch {
            data = { raw: text };
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(data.error || `Request failed (${res.statusCode})`));
            return;
          }
          resolve(data);
        });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out after 30s'));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${baseUrl}/api/master/status`, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve(true);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error('Master API did not become ready within 30s'));
          return;
        }
        setTimeout(tick, 200);
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error('Master API did not become ready within 30s'));
          return;
        }
        setTimeout(tick, 200);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    tick();
  });
}

async function bootService() {
  config = loadConfig();
  baseUrl = `http://127.0.0.1:${config.port}`;

  const nodeBin = resolveNodeBinary();
  const cliPath = path.resolve(__dirname, '../../cli.js');
  if (!fs.existsSync(cliPath)) {
    throw new Error(`API entry missing: ${cliPath}`);
  }

  apiChild = spawn(nodeBin, [cliPath], {
    cwd: path.resolve(__dirname, '../../..'),
    env: {
      ...process.env,
      PORT: String(config.port),
      HOST: '127.0.0.1',
      DTM_INVENTORY_DATA_DIR: config.dataDir,
      CATALOG_SCANNER_DATA_DIR: config.dataDir,
      ELECTRON_RUN_AS_NODE: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let bootLog = '';
  apiChild.stdout?.on('data', (d) => {
    bootLog += d.toString();
  });
  apiChild.stderr?.on('data', (d) => {
    bootLog += d.toString();
  });
  apiChild.on('exit', (code) => {
    if (code && code !== 0) {
      console.error('Master API exited', code, bootLog.slice(-1000));
    }
  });

  try {
    await waitForHealth(DEFAULT_TIMEOUT_MS);
  } catch (err) {
    const detail = bootLog.trim().slice(-800);
    throw new Error(
      `${err instanceof Error ? err.message : String(err)}${detail ? `\n\n${detail}` : ''}\n\nTip: run "pnpm install" so better-sqlite3 matches your system Node.`,
    );
  }

  // Create a short-lived tether session so authenticated catalog calls work.
  try {
    const tether = await requestJson('GET', '/api/master/tether');
    const session = await requestJson('POST', '/api/auth/tether', {
      baseUrl: tether.baseUrl || baseUrl,
      deviceName: 'DTM Inventory Master',
    });
    masterToken = session.token || '';
  } catch {
    masterToken = '';
  }

  return { baseUrl, config };
}

async function getStatus() {
  const status = await requestJson('GET', '/api/master/status');
  return {
    baseUrl: status.baseUrl || baseUrl,
    port: status.port || config.port,
    dbPath: status.dbPath || config.dbPath,
    dataDir: status.dataDir || config.dataDir,
    items: status.items || 0,
    names: status.names || 0,
    sessions: status.sessions || 0,
    host: status.host || config.host,
  };
}

async function getTether() {
  return requestJson('GET', '/api/master/tether');
}

async function listCodes() {
  const data = await requestJson('GET', '/api/master/login-codes');
  return { codes: data.codes || [] };
}

async function createCode(label = '', ttlMinutes = 60) {
  return requestJson('POST', '/api/master/login-codes', { label, ttlMinutes });
}

async function getCatalog() {
  if (!masterToken) {
    const tether = await requestJson('GET', '/api/master/tether');
    const session = await requestJson('POST', '/api/auth/tether', {
      baseUrl: tether.baseUrl || baseUrl,
      deviceName: 'DTM Inventory Master',
    });
    masterToken = session.token || '';
  }
  return requestJson('GET', '/api/catalog');
}

function wireIpc() {
  ipcMain.handle('master:status', () => getStatus());
  ipcMain.handle('master:tether', () => getTether());
  ipcMain.handle('master:codes', () => listCodes());
  ipcMain.handle('master:createCode', (_e, { label, ttlMinutes } = {}) =>
    createCode(label, ttlMinutes || 60),
  );
  ipcMain.handle('master:catalog', () => getCatalog());
  ipcMain.handle('master:saveConfig', async (_e, partial) => {
    const next = saveConfig(partial || {});
    await requestJson('POST', '/api/master/config', {
      dbPath: next.dbPath,
      port: next.port,
    }).catch(() => null);
    return {
      ...next,
      note: 'Saved. Restart DTM Inventory Master for port or database path changes.',
    };
  });
  ipcMain.handle('master:pickDbPath', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Inventory database location',
      defaultPath: config?.dbPath,
      filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });
  ipcMain.handle('master:openExternal', (_e, url) => {
    if (typeof url === 'string' && url.startsWith('http')) shell.openExternal(url);
  });
}

function stopApiChild() {
  if (!apiChild || apiChild.killed) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(apiChild.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      apiChild.kill('SIGTERM');
    }
  } catch {
    // ignore
  }
  apiChild = null;
}

app.whenReady().then(async () => {
  try {
    await withTimeout(bootService(), DEFAULT_TIMEOUT_MS, 'Master startup');
  } catch (err) {
    dialog.showErrorBox(
      'DTM Inventory Master',
      err instanceof Error ? err.message : String(err),
    );
    stopApiChild();
    app.quit();
    return;
  }
  wireIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopApiChild();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopApiChild();
});
