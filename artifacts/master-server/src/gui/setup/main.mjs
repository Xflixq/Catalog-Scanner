import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

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
  if (process.platform === 'win32') {
    return path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'CatalogScannerMaster');
  }
  return path.join(os.homedir(), 'CatalogScannerMaster');
}

function defaultDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'CatalogScanner');
  }
  return path.join(os.homedir(), '.catalog-scanner');
}

function resolvePayloadDir() {
  const candidates = [
    path.join(process.resourcesPath || '', 'payload'),
    path.resolve(__dirname, '../../../dist/payload'),
    path.resolve(__dirname, '../../../dist'),
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (fs.existsSync(path.join(c, 'catalog-scanner-master.cjs'))) return c;
    if (fs.existsSync(path.join(c, 'src', 'gui', 'master', 'main.mjs'))) return c;
  }
  return path.resolve(__dirname, '../../../dist');
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
  // VBS launcher: no console window.
  if (process.platform === 'win32') {
    const vbs = [
      'Set sh = CreateObject("WScript.Shell")',
      `sh.CurrentDirectory = "${installDir.replace(/\\/g, '\\\\')}"`,
      `sh.Environment("Process")("CATALOG_SCANNER_DATA_DIR") = "${dataDir.replace(/\\/g, '\\\\')}"`,
      'exe = sh.CurrentDirectory & "\\CatalogScannerMaster.exe"',
      'Set fso = CreateObject("Scripting.FileSystemObject")',
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
      'bundle = sh.CurrentDirectory & "\\catalog-scanner-master.cjs"',
      'If fso.FileExists(bundle) Then',
      '  sh.Run "node """ & bundle & """", 0, False',
      '  WScript.Quit 0',
      'End If',
      'MsgBox "Catalog Scanner Master files are missing.", 16, "Catalog Scanner"',
    ].join('\r\n');
    fs.writeFileSync(path.join(installDir, 'Launch Master.vbs'), vbs, 'utf8');

    // Optional hidden helper cmd for advanced users only (not used by UI)
    const cmd = [
      '@echo off',
      'setlocal EnableExtensions',
      `set "CATALOG_SCANNER_DATA_DIR=${dataDir}"`,
      'cd /d "%~dp0"',
      'if exist "%~dp0CatalogScannerMaster.exe" (',
      '  start "" "%~dp0CatalogScannerMaster.exe"',
      '  exit /b 0',
      ')',
      'wscript //B "%~dp0Launch Master.vbs"',
      'exit /b 0',
    ].join('\r\n');
    fs.writeFileSync(path.join(installDir, 'run-master.cmd'), cmd, 'utf8');
    return path.join(installDir, 'Launch Master.vbs');
  }

  const sh = `#!/usr/bin/env bash
cd "$(dirname "$0")"
export CATALOG_SCANNER_DATA_DIR="${dataDir}"
if [ -f ./CatalogScannerMaster ]; then
  exec ./CatalogScannerMaster
fi
if [ -f src/gui/master/main.mjs ]; then
  if command -v electron >/dev/null 2>&1; then
    exec electron src/gui/master/main.mjs
  fi
  exec npx --yes electron@33.2.1 src/gui/master/main.mjs
fi
if [ -f catalog-scanner-master.cjs ]; then
  exec node catalog-scanner-master.cjs
fi
echo Master files missing
exit 1
`;
  const p = path.join(installDir, 'run-master.sh');
  fs.writeFileSync(p, sh, 'utf8');
  fs.chmodSync(p, 0o755);
  return p;
}

function createShortcutWindows(targetPath, shortcutPath, workDir, description) {
  // PowerShell hidden window
  const ps = [
    `$ws = New-Object -ComObject WScript.Shell`,
    `$s = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')`,
    `$s.TargetPath = 'wscript.exe'`,
    `$s.Arguments = '//B "${targetPath.replace(/'/g, "''")}"'`,
    `$s.WorkingDirectory = '${workDir.replace(/'/g, "''")}'`,
    `$s.Description = '${(description || 'Catalog Scanner Master').replace(/'/g, "''")}'`,
    `$s.WindowStyle = 7`,
    `$s.Save()`,
  ].join('; ');
  spawnSync(
    'powershell.exe',
    ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps],
    { windowsHide: true, stdio: 'ignore' },
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
    'Catalog Scanner Master',
  );
  fs.mkdirSync(programs, { recursive: true });
  createShortcutWindows(
    launchPath,
    path.join(programs, 'Catalog Scanner Master.lnk'),
    installDir,
    'Catalog Scanner Master',
  );
}

function writeDesktopShortcut(installDir, launchPath) {
  if (process.platform !== 'win32') return;
  const desktop = path.join(os.homedir(), 'Desktop');
  createShortcutWindows(
    launchPath,
    path.join(desktop, 'Catalog Scanner Master.lnk'),
    installDir,
    'Catalog Scanner Master',
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
    title: 'Catalog Scanner',
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
  const installDir = opts.installDir || defaultInstallDir();
  const dataDir = opts.dataDir || defaultDataDir();
  const payload = resolvePayloadDir();

  log(`Install folder: ${installDir}`, 8, 'Preparing...');
  log(`Data folder: ${dataDir}`, 12);
  log(`Payload: ${payload}`, 16);

  fs.mkdirSync(installDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  log('Folders ready', 22, 'Copying files...');

  const bundle = path.join(payload, 'catalog-scanner-master.cjs');
  const srcFromPayload = path.join(payload, 'src');
  const srcFromRepo = path.resolve(__dirname, '../..');

  if (fs.existsSync(bundle)) {
    fs.copyFileSync(bundle, path.join(installDir, 'catalog-scanner-master.cjs'));
    log('Copied service bundle', 40);
  } else {
    log('Service bundle not found in payload (ok if GUI-only)', 40);
  }

  const srcSource = fs.existsSync(srcFromPayload) ? srcFromPayload : srcFromRepo;
  if (!fs.existsSync(path.join(srcSource, 'gui', 'master', 'main.mjs'))) {
    throw new Error('Master app files were not found in the setup package.');
  }
  copyDir(srcSource, path.join(installDir, 'src'));
  log('Copied Master app', 62, 'Configuring...');

  // package marker
  fs.writeFileSync(
    path.join(installDir, 'package.json'),
    JSON.stringify(
      {
        name: 'catalog-scanner-master-install',
        private: true,
        type: 'module',
        main: 'src/gui/master/main.mjs',
      },
      null,
      2,
    ),
  );

  // Seed config
  const configPath = path.join(dataDir, 'config.json');
  const config = {
    port: 47821,
    host: '0.0.0.0',
    dbPath: path.join(dataDir, 'catalog.sqlite'),
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
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
  return {
    ok: true,
    installDir,
    dataDir,
    launchPath,
  };
}

function wireIpc() {
  ipcMain.handle('setup:defaults', () => ({
    installDir: defaultInstallDir(),
    dataDir: defaultDataDir(),
    platform: process.platform,
  }));

  ipcMain.handle('setup:pickInstallDir', async (_e, current) => {
    const result = await dialog.showOpenDialog(mainWindow || undefined, {
      title: 'Choose install folder',
      defaultPath: current || defaultInstallDir(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('setup:install', async (_e, opts = {}) => {
    try {
      return await performInstall(opts);
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
      // Launch VBS with no console
      spawn('wscript.exe', ['//B', launchPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
    } else {
      spawn(launchPath, [], { detached: true, stdio: 'ignore' }).unref();
    }
    return true;
  });

  ipcMain.handle('setup:openPath', (_e, p) => {
    if (p) shell.openPath(p);
  });
}

app.whenReady().then(() => {
  wireIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
