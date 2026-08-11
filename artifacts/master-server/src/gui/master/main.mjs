import { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { loadConfig, saveConfig } from '../../lib/config.js';
import { DEFAULT_TIMEOUT_MS, withTimeout } from '../../lib/timeout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '../../..');
const repoRoot = path.resolve(packageRoot, '../..');
nativeTheme.themeSource = 'light';

/** @type {import('node:child_process').ChildProcess | null} */
let apiChild = null;
/** @type {any} */
let config = null;
/** @type {string} */
let baseUrl = '';
/** @type {string} */
let masterToken = '';
/** @type {string} */
let selectedNodeBin = '';

function createWindow() {
  const iconPath = path.join(__dirname, '../shared/brand/app.ico');
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#FAFBFE',
    title: 'DTM Inventory Master',
    icon: iconPath,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
  return win;
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function listNodeCandidates() {
  const out = [];
  if (process.env.DTM_NODE_PATH) out.push(process.env.DTM_NODE_PATH);
  if (process.platform === 'win32') {
    out.push(
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
      'node.exe',
      'node',
    );
    // nvm-windows versions
    const nvmHome = process.env.NVM_HOME || path.join(process.env.APPDATA || '', 'nvm');
    try {
      if (nvmHome && fs.existsSync(nvmHome)) {
        for (const name of fs.readdirSync(nvmHome)) {
          const candidate = path.join(nvmHome, name, 'node.exe');
          if (fs.existsSync(candidate)) out.push(candidate);
        }
      }
    } catch {
      // ignore
    }
  } else {
    out.push('node', '/usr/local/bin/node', '/usr/bin/node');
  }
  return unique(out);
}

function nodeCanLoadSqlite(nodeBin) {
  // Probe with the same module resolution path the API child will use.
  const probe = [
    `const path=require('path');`,
    `const roots=${JSON.stringify([packageRoot, repoRoot])};`,
    `let last=null;`,
    `for (const root of roots){`,
    `  try {`,
    `    const mod=require(require('module').createRequire(path.join(root,'package.json')).resolve('better-sqlite3'));`,
    `    const Database=mod.default||mod;`,
    `    const db=new Database(':memory:');`,
    `    db.close();`,
    `    process.stdout.write('OK');`,
    `    process.exit(0);`,
    `  } catch(e){ last=e; }`,
    `}`,
    `process.stderr.write(String(last&&last.message||last||'better-sqlite3 failed'));`,
    `process.exit(1);`,
  ].join('');

  const result = spawnSync(nodeBin, ['-e', probe], {
    cwd: packageRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
    env: process.env,
  });
  return {
    ok: result.status === 0 && String(result.stdout || '').includes('OK'),
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : '',
  };
}

function rebuildSqliteForNode(nodeBin) {
  // Rebuild better-sqlite3 for the selected Node binary (not Electron).
  const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const attempts = [
    {
      cmd: pnpmCmd,
      args: ['rebuild', 'better-sqlite3', '--filter', '@workspace/master-server'],
      cwd: repoRoot,
    },
    {
      cmd: pnpmCmd,
      args: ['rebuild', 'better-sqlite3'],
      cwd: packageRoot,
    },
    {
      cmd: nodeBin,
      args: [
        path.join(
          repoRoot,
          'node_modules',
          'pnpm',
          'bin',
          'pnpm.cjs',
        ),
        'rebuild',
        'better-sqlite3',
      ],
      cwd: repoRoot,
    },
  ];

  const logs = [];
  for (const attempt of attempts) {
    // Skip missing pnpm.cjs path quietly
    if (attempt.cmd === nodeBin && !fs.existsSync(attempt.args[0])) continue;
    const result = spawnSync(attempt.cmd, attempt.args, {
      cwd: attempt.cwd,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60000,
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        npm_config_runtime: 'node',
        npm_config_target: '',
        npm_config_disturl: '',
      },
    });
    logs.push(
      `$ ${attempt.cmd} ${attempt.args.join(' ')}\n` +
        `${result.stdout || ''}\n${result.stderr || ''}\nexit ${result.status}`,
    );
    if (result.status === 0) {
      const check = nodeCanLoadSqlite(nodeBin);
      if (check.ok) return { ok: true, log: logs.join('\n\n') };
    }
  }
  return { ok: false, log: logs.join('\n\n') };
}

function resolveWorkingNodeBinary() {
  const candidates = listNodeCandidates();
  const failures = [];

  for (const bin of candidates) {
    // Skip non-existing absolute paths; allow bare commands.
    if (bin.includes('\\') || bin.includes('/')) {
      if (!fs.existsSync(bin)) continue;
    }
    const check = nodeCanLoadSqlite(bin);
    if (check.ok) return { nodeBin: bin, note: 'native module already compatible' };
    failures.push(`${bin}: ${(check.stderr || check.error || 'failed').trim()}`);
  }

  // Prefer first existing/runnable candidate for rebuild.
  let rebuildTarget = null;
  for (const bin of candidates) {
    if (bin.includes('\\') || bin.includes('/')) {
      if (fs.existsSync(bin)) {
        rebuildTarget = bin;
        break;
      }
    } else {
      const ver = spawnSync(bin, ['-v'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5000,
      });
      if (ver.status === 0) {
        rebuildTarget = bin;
        break;
      }
    }
  }
  if (!rebuildTarget) {
    throw new Error(
      'No system Node.js found on PATH.\nInstall Node 20 LTS from https://nodejs.org then run:\n  pnpm install\n  pnpm master:dev',
    );
  }

  const rebuilt = rebuildSqliteForNode(rebuildTarget);
  const check = nodeCanLoadSqlite(rebuildTarget);
  if (check.ok) {
    return { nodeBin: rebuildTarget, note: 'rebuilt better-sqlite3 for system Node' };
  }

  throw new Error(
    [
      'better-sqlite3 does not match your system Node.js.',
      '',
      'Tried:',
      ...failures.slice(0, 6).map((f) => `- ${f}`),
      '',
      `Rebuild target: ${rebuildTarget}`,
      rebuilt.log ? `Rebuild log:\n${rebuilt.log.slice(-1200)}` : '',
      '',
      'Fix:',
      '  1) Install Node 20 LTS (recommended)',
      '  2) cd C:\\dev\\dtm-inventory-v2',
      '  3) pnpm install',
      '  4) pnpm --filter @workspace/master-server rebuild better-sqlite3',
      '  5) pnpm master:dev',
    ].join('\n'),
  );
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
    req.on('timeout', () => req.destroy(new Error('Request timed out after 30s')));
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

  const resolved = resolveWorkingNodeBinary();
  selectedNodeBin = resolved.nodeBin;

  const cliPath = path.resolve(__dirname, '../../cli.js');
  if (!fs.existsSync(cliPath)) {
    throw new Error(`API entry missing: ${cliPath}`);
  }

  apiChild = spawn(selectedNodeBin, [cliPath], {
    cwd: packageRoot,
    env: {
      ...process.env,
      PORT: String(config.port),
      HOST: '127.0.0.1',
      DTM_INVENTORY_DATA_DIR: config.dataDir,
      CATALOG_SCANNER_DATA_DIR: config.dataDir,
      // Ensure child is plain Node, never Electron-as-node.
      ELECTRON_RUN_AS_NODE: '',
      npm_config_runtime: 'node',
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
    const detail = bootLog.trim().slice(-900);
    throw new Error(
      [
        err instanceof Error ? err.message : String(err),
        `Node used: ${selectedNodeBin}`,
        resolved.note ? `Note: ${resolved.note}` : '',
        detail ? `\nAPI log:\n${detail}` : '',
        '',
        'If this mentions NODE_MODULE_VERSION, run:',
        '  pnpm --filter @workspace/master-server rebuild better-sqlite3',
        '  pnpm master:dev',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

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

  return { baseUrl, config, nodeBin: selectedNodeBin };
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
    nodeBin: selectedNodeBin,
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
  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });
  ipcMain.handle('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  ipcMain.handle('window:isMaximized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() || false;
  });

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
    // Allow one rebuild attempt inside the 30s window when possible.
    await withTimeout(bootService(), Math.max(DEFAULT_TIMEOUT_MS, 45000), 'Master startup');
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
