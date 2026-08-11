import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
nativeTheme.themeSource = 'light';

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
  // Packaged next to setup app, or monorepo dist during dev
  const candidates = [
    path.join(process.resourcesPath || '', 'payload'),
    path.join(__dirname, '../../../dist'),
    path.join(__dirname, '../../../../master-server/dist'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, 'catalog-scanner-master.cjs'))) return c;
    if (c && fs.existsSync(path.join(c, 'public', 'index.html'))) return c;
  }
  // Dev: built dist under artifacts/master-server/dist
  const devDist = path.resolve(__dirname, '../../../dist');
  return devDist;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function writeLauncher(installDir) {
  if (process.platform === 'win32') {
    const cmd = `@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if exist "%~dp0CatalogScannerMaster.exe" (
  start "Catalog Scanner Master" "%~dp0CatalogScannerMaster.exe"
  exit /b 0
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required.
  pause
  exit /b 1
)
if exist "%~dp0src\\gui\\master\\main.mjs" (
  start "Catalog Scanner Master" cmd /c "npx --yes electron \"%~dp0src\\gui\\master\\main.mjs\""
  exit /b 0
)
if exist "%~dp0catalog-scanner-master.cjs" (
  start "Catalog Scanner Master" cmd /k node "%~dp0catalog-scanner-master.cjs"
  exit /b 0
)
echo Master files missing.
pause
exit /b 1
`;
    fs.writeFileSync(path.join(installDir, 'Catalog Scanner Master.cmd'), cmd, 'utf8');
    fs.writeFileSync(path.join(installDir, 'run-master.cmd'), cmd, 'utf8');
  } else {
    const sh = `#!/usr/bin/env bash
cd "$(dirname "$0")"
if command -v electron >/dev/null 2>&1 && [ -f src/gui/master/main.mjs ]; then
  exec electron src/gui/master/main.mjs
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
  }
}

function writeStartMenuShortcut(installDir) {
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
  // Use a .url / .lnk via powershell
  const target = path.join(installDir, 'Catalog Scanner Master.cmd');
  const lnk = path.join(programs, 'Catalog Scanner Master.lnk');
  const ps = `
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut('${lnk.replace(/'/g, "''")}')
$s.TargetPath = '${target.replace(/'/g, "''")}'
$s.WorkingDirectory = '${installDir.replace(/'/g, "''")}'
$s.Description = 'Catalog Scanner Master'
$s.Save()
`;
  try {
    spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true });
  } catch {
    // ignore shortcut failures
  }
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
  return win;
}

function wireIpc() {
  ipcMain.handle('setup:defaults', () => ({
    installDir: defaultInstallDir(),
    dataDir: defaultDataDir(),
    platform: process.platform,
  }));

  ipcMain.handle('setup:pickInstallDir', async (_e, current) => {
    const result = await dialog.showOpenDialog({
      title: 'Choose install folder',
      defaultPath: current || defaultInstallDir(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('setup:install', async (_e, opts = {}) => {
    const installDir = opts.installDir || defaultInstallDir();
    const dataDir = opts.dataDir || defaultDataDir();
    const payload = resolvePayloadDir();

    fs.mkdirSync(installDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });

    // Copy runtime payload
    const bundle = path.join(payload, 'catalog-scanner-master.cjs');
    const publicDir = path.join(payload, 'public');
    const guiSrc = path.resolve(__dirname, '..'); // src/gui
    const masterSrcRoot = path.resolve(__dirname, '../..'); // src

    if (fs.existsSync(bundle)) {
      fs.copyFileSync(bundle, path.join(installDir, 'catalog-scanner-master.cjs'));
    }
    if (fs.existsSync(publicDir)) {
      copyDir(publicDir, path.join(installDir, 'public'));
    }
    // Copy GUI + server source so Electron can run Master app
    copyDir(masterSrcRoot, path.join(installDir, 'src'));

    // package.json for electron resolution when using npx electron
    const pkg = {
      name: 'catalog-scanner-master-install',
      private: true,
      type: 'module',
      main: 'src/gui/master/main.mjs',
    };
    fs.writeFileSync(path.join(installDir, 'package.json'), JSON.stringify(pkg, null, 2));

    // Seed config pointing at chosen data dir
    const configPath = path.join(dataDir, 'config.json');
    const config = {
      port: 47821,
      host: '0.0.0.0',
      dbPath: path.join(dataDir, 'catalog.sqlite'),
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Env helper for Windows
    if (process.platform === 'win32') {
      const envCmd = `@echo off\r\nset CATALOG_SCANNER_DATA_DIR=${dataDir}\r\n`;
      fs.writeFileSync(path.join(installDir, 'env.cmd'), envCmd);
    }

    writeLauncher(installDir);
    if (opts.startMenu !== false) writeStartMenuShortcut(installDir);

    // Desktop shortcut optional
    if (opts.desktop && process.platform === 'win32') {
      const desktop = path.join(os.homedir(), 'Desktop');
      const target = path.join(installDir, 'Catalog Scanner Master.cmd');
      const lnk = path.join(desktop, 'Catalog Scanner Master.lnk');
      const ps = `
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut('${lnk.replace(/'/g, "''")}')
$s.TargetPath = '${target.replace(/'/g, "''")}'
$s.WorkingDirectory = '${installDir.replace(/'/g, "''")}'
$s.Save()
`;
      try {
        spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true });
      } catch {}
    }

    return {
      ok: true,
      installDir,
      dataDir,
      launchPath:
        process.platform === 'win32'
          ? path.join(installDir, 'Catalog Scanner Master.cmd')
          : path.join(installDir, 'run-master.sh'),
    };
  });

  ipcMain.handle('setup:launch', async (_e, launchPath) => {
    if (!launchPath || !fs.existsSync(launchPath)) {
      throw new Error('Launch path missing');
    }
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '', launchPath], {
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
