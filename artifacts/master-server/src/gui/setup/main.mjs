import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { DEFAULT_TIMEOUT_MS, withTimeout } from '../../lib/timeout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
nativeTheme.themeSource = 'light';

/** @type {BrowserWindow | null} */
let mainWindow = null;

function sendProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('setup:progress', payload);
  }
}

function log(line, pct, message) {
  const payload = { log: line };
  if (typeof pct === 'number') payload.pct = pct;
  if (message) payload.message = message;
  sendProgress(payload);
}

function defaultInstallDir() {
  // User-writable default so Setup does not require Administrator.
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'Programs', 'DTM Inventory');
  }
  return path.join(os.homedir(), 'DTM Inventory');
}

function defaultDataDir() {
  if (process.platform === 'win32') {
    // Prefer ProgramData; fall back to LocalAppData if blocked.
    const programData = process.env.PROGRAMDATA || 'C:\\ProgramData';
    const preferred = path.join(programData, 'DTMInventory');
    try {
      fs.mkdirSync(preferred, { recursive: true });
      fs.accessSync(preferred, fs.constants.W_OK);
      return preferred;
    } catch {
      const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      return path.join(local, 'DTMInventory');
    }
  }
  return path.join(os.homedir(), '.dtm-inventory');
}

function resolvePayloadDir() {
  const candidates = [
    path.join(process.resourcesPath || '', 'payload'),
    path.resolve(__dirname, '../../../dist/payload'),
    path.resolve(__dirname, '../../../dist'),
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (
      fs.existsSync(path.join(c, 'dtm-inventory-master.cjs')) ||
      fs.existsSync(path.join(c, 'catalog-scanner-master.cjs')) ||
      fs.existsSync(path.join(c, 'src', 'gui', 'master', 'main.mjs'))
    ) {
      return c;
    }
  }
  return path.resolve(__dirname, '../../../dist');
}

function ensureWritableDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.dtm-write-test-${process.pid}`);
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name === 'node_modules' || name === '.git') continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function writeSilentMasterLauncher(installDir, dataDir) {
  if (process.platform === 'win32') {
    const vbs = [
      'Set sh = CreateObject("WScript.Shell")',
      `sh.CurrentDirectory = "${installDir.replace(/\\/g, '\\\\')}"`,
      `sh.Environment("Process")("DTM_INVENTORY_DATA_DIR") = "${dataDir.replace(/\\/g, '\\\\')}"`,
      `sh.Environment("Process")("CATALOG_SCANNER_DATA_DIR") = "${dataDir.replace(/\\/g, '\\\\')}"`,
      'Set fso = CreateObject("Scripting.FileSystemObject")',
      'exe = sh.CurrentDirectory & "\\DTMInventoryMaster.exe"',
      'If fso.FileExists(exe) Then',
      '  sh.Run """" & exe & """", 1, False',
      '  WScript.Quit 0',
      'End If',
      'entry = sh.CurrentDirectory & "\\src\\gui\\master\\main.mjs"',
      'If fso.FileExists(entry) Then',
      '  localElectron = sh.CurrentDirectory & "\\node_modules\\electron\\cli.js"',
      '  If fso.FileExists(localElectron) Then',
      '    sh.Run "node """ & localElectron & """ """ & entry & """", 0, False',
      '  Else',
      '    sh.Run "cmd /c npx --yes electron@33.2.1 """ & entry & """", 0, False',
      '  End If',
      '  WScript.Quit 0',
      'End If',
      'bundle = sh.CurrentDirectory & "\\dtm-inventory-master.cjs"',
      'If fso.FileExists(bundle) Then',
      '  sh.Run "node """ & bundle & """", 0, False',
      '  WScript.Quit 0',
      'End If',
      'MsgBox "DTM Inventory Master files are missing.", 16, "DTM Inventory"',
    ].join('\r\n');
    fs.writeFileSync(path.join(installDir, 'Launch Master.vbs'), vbs, 'utf8');
    fs.writeFileSync(
      path.join(installDir, 'run-master.cmd'),
      '@echo off\r\nwscript //B "%~dp0Launch Master.vbs"\r\n',
      'utf8',
    );
    return path.join(installDir, 'Launch Master.vbs');
  }

  const sh = `#!/usr/bin/env bash
cd "$(dirname "$0")"
export DTM_INVENTORY_DATA_DIR="${dataDir}"
export CATALOG_SCANNER_DATA_DIR="${dataDir}"
if [ -f ./DTMInventoryMaster ]; then exec ./DTMInventoryMaster; fi
if [ -f src/gui/master/main.mjs ]; then
  if command -v electron >/dev/null 2>&1; then exec electron src/gui/master/main.mjs; fi
  exec npx --yes electron@33.2.1 src/gui/master/main.mjs
fi
if [ -f dtm-inventory-master.cjs ]; then exec node dtm-inventory-master.cjs; fi
echo Master files missing
exit 1
`;
  const p = path.join(installDir, 'run-master.sh');
  fs.writeFileSync(p, sh, 'utf8');
  fs.chmodSync(p, 0o755);
  return p;
}

function createShortcutWindows(targetPath, shortcutPath, workDir, description) {
  const ps = [
    `$ws = New-Object -ComObject WScript.Shell`,
    `$s = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')`,
    `$s.TargetPath = 'wscript.exe'`,
    `$s.Arguments = '//B "${targetPath.replace(/'/g, "''")}"'`,
    `$s.WorkingDirectory = '${workDir.replace(/'/g, "''")}'`,
    `$s.Description = '${(description || 'DTM Inventory Master').replace(/'/g, "''")}'`,
    `$s.WindowStyle = 7`,
    `$s.Save()`,
  ].join('; ');
  spawnSync(
    'powershell.exe',
    ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps],
    { windowsHide: true, stdio: 'ignore', timeout: DEFAULT_TIMEOUT_MS, killSignal: 'SIGKILL' },
  );
}

function writeStartMenuShortcut(installDir, launchPath) {
  if (process.platform !== 'win32') return;
  const programs = path.join(
    process.env.APPDATA || '',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'DTM Inventory',
  );
  fs.mkdirSync(programs, { recursive: true });
  createShortcutWindows(
    launchPath,
    path.join(programs, 'DTM Inventory Master.lnk'),
    installDir,
    'DTM Inventory Master',
  );
}

function writeDesktopShortcut(installDir, launchPath) {
  if (process.platform !== 'win32') return;
  const desktop = path.join(os.homedir(), 'Desktop');
  createShortcutWindows(
    launchPath,
    path.join(desktop, 'DTM Inventory Master.lnk'),
    installDir,
    'DTM Inventory Master',
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 760,
    height: 640,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#ffffff',
    title: 'DTM Inventory',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  mainWindow = win;
  return win;
}

async function performInstall(opts = {}) {
  let installDir = opts.installDir || defaultInstallDir();
  let dataDir = opts.dataDir || defaultDataDir();
  const payload = resolvePayloadDir();

  log(`Install folder: ${installDir}`, 8, 'Preparing...');
  log(`Data folder: ${dataDir}`, 12);
  log(`Payload: ${payload}`, 16);

  try {
    ensureWritableDir(installDir);
  } catch (err) {
    // Auto-fallback away from Program Files when not elevated.
    const fallback = defaultInstallDir();
    if (path.resolve(installDir) !== path.resolve(fallback)) {
      log(`Install folder not writable, using ${fallback}`, 14, 'Preparing...');
      installDir = fallback;
      ensureWritableDir(installDir);
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Cannot write to install folder:\n${installDir}\n\n${msg}\n\nChoose a folder you can write to (for example your user folder), or run Setup as Administrator.`,
      );
    }
  }

  try {
    ensureWritableDir(dataDir);
  } catch {
    dataDir = defaultDataDir();
    ensureWritableDir(dataDir);
  }

  log('Folders ready', 22, 'Copying files...');

  const bundleCandidates = [
    path.join(payload, 'dtm-inventory-master.cjs'),
    path.join(payload, 'catalog-scanner-master.cjs'),
  ];
  const bundle = bundleCandidates.find((p) => fs.existsSync(p));
  const srcFromPayload = path.join(payload, 'src');
  const srcFromRepo = path.resolve(__dirname, '../..');

  if (bundle) {
    fs.copyFileSync(bundle, path.join(installDir, 'dtm-inventory-master.cjs'));
    log('Copied service bundle', 40);
  } else {
    log('Service bundle not found in payload (ok if GUI-only)', 40);
  }

  const srcSource = fs.existsSync(path.join(srcFromPayload, 'gui', 'master', 'main.mjs'))
    ? srcFromPayload
    : srcFromRepo;
  if (!fs.existsSync(path.join(srcSource, 'gui', 'master', 'main.mjs'))) {
    throw new Error('Master app files were not found in the setup package.');
  }
  copyDir(srcSource, path.join(installDir, 'src'));
  log('Copied Master app', 62, 'Configuring...');

  fs.writeFileSync(
    path.join(installDir, 'package.json'),
    JSON.stringify(
      {
        name: 'dtm-inventory-master-install',
        private: true,
        type: 'module',
        main: 'src/gui/master/main.mjs',
      },
      null,
      2,
    ),
  );

  const configPath = path.join(dataDir, 'config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        port: 47821,
        host: '0.0.0.0',
        dbPath: path.join(dataDir, 'catalog.sqlite'),
      },
      null,
      2,
    ),
  );
  log(`Wrote config ${configPath}`, 74);

  const launchPath = writeSilentMasterLauncher(installDir, dataDir);
  log('Created silent launcher', 82, 'Adding shortcuts...');

  if (opts.startMenu !== false) {
    writeStartMenuShortcut(installDir, launchPath);
    log('Start Menu shortcut ready', 90);
  }
  if (opts.desktop) {
    writeDesktopShortcut(installDir, launchPath);
    log('Desktop shortcut ready', 94);
  }

  log('Install complete', 100, 'Finished');
  return { ok: true, installDir, dataDir, launchPath };
}

function wireIpc() {
  ipcMain.handle('setup:defaults', () => ({
    installDir: defaultInstallDir(),
    dataDir: defaultDataDir(),
    platform: process.platform,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }));

  ipcMain.handle('setup:pickInstallDir', async (_e, current) => {
    const result = await withTimeout(
      dialog.showOpenDialog(mainWindow || undefined, {
        title: 'Choose install folder',
        defaultPath: current || defaultInstallDir(),
        properties: ['openDirectory', 'createDirectory'],
      }),
      DEFAULT_TIMEOUT_MS,
      'Folder picker',
    );
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('setup:install', async (_e, opts = {}) => {
    try {
      return await withTimeout(performInstall(opts), DEFAULT_TIMEOUT_MS, 'Install');
    } catch (err) {
      log(err instanceof Error ? err.message : String(err), undefined, 'Something went wrong');
      throw err;
    }
  });

  ipcMain.handle('setup:launch', async (_e, launchPath) => {
    if (!launchPath || !fs.existsSync(launchPath)) {
      throw new Error('Launch path missing');
    }
    if (process.platform === 'win32') {
      spawn('wscript.exe', ['//B', launchPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        timeout: DEFAULT_TIMEOUT_MS,
      }).unref();
    } else {
      spawn(launchPath, [], {
        detached: true,
        stdio: 'ignore',
        timeout: DEFAULT_TIMEOUT_MS,
      }).unref();
    }
    return true;
  });

  ipcMain.handle('setup:openPath', (_e, p) => {
    if (p) shell.openPath(p);
  });
}

app.whenReady().then(() => {
  const bootTimer = setTimeout(() => {
    dialog.showErrorBox('DTM Inventory Setup', 'Setup timed out while starting (30s).');
    app.quit();
  }, DEFAULT_TIMEOUT_MS);
  try {
    wireIpc();
    createWindow();
  } finally {
    clearTimeout(bootTimer);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
