#!/usr/bin/env node
/**
 * Build standalone desktop apps with embedded Electron + DTM icon.
 * Same UI path as `pnpm master:dev` / `pnpm setup:dev`.
 *
 * Windows outputs:
 *   dist/desktop/DTM Inventory Master-win32-x64/DTMInventoryMaster.exe
 *   dist/desktop/DTM Inventory Setup-win32-x64/DTMInventorySetup.exe
 *   dist/installer/*.zip + copied .exe
 *   dist/downloads/  (served by Master download page)
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');
const distDir = path.join(pkgRoot, 'dist');
const desktopDir = path.join(distDir, 'desktop');
const installerDir = path.join(distDir, 'installer');
const downloadsDir = path.join(distDir, 'downloads');
const iconIco = path.join(pkgRoot, 'src/gui/shared/brand/app.ico');
const require = createRequire(path.join(pkgRoot, 'package.json'));

const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const rm = (p) => { if (exists(p)) fs.rmSync(p, { recursive: true, force: true }); };

function copyDir(src, dest, ignore = new Set(['node_modules', 'dist', '.git', '.expo'])) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (ignore.has(name)) continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d, ignore);
    else fs.copyFileSync(s, d);
  }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || pkgRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...(opts.env || {}) },
    timeout: opts.timeout || 20 * 60 * 1000,
  });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
  return r;
}
function loadPackager() {
  try { return require('@electron/packager'); }
  catch {
    try { return require('electron-packager'); }
    catch { return null; }
  }
}
function zipDir(srcDir, zipPath) {
  rm(zipPath);
  if (process.platform === 'win32') {
    const ps = `Compress-Archive -Path '${srcDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`;
    const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], {
      stdio: 'inherit', windowsHide: true, timeout: 5 * 60 * 1000,
    });
    if (r.status !== 0) throw new Error('Compress-Archive failed');
    return;
  }
  const py = `
import zipfile, pathlib
src=pathlib.Path(${JSON.stringify(srcDir)})
out=pathlib.Path(${JSON.stringify(zipPath)})
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
  for p in src.rglob('*'):
    if p.is_file():
      z.write(p, p.relative_to(src).as_posix())
print('zip', out, out.stat().st_size)
`;
  const r = spawnSync('python3', ['-c', py], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('python zip failed');
}

async function packageApp({ productName, entryRelative, outName }) {
  const packager = loadPackager();
  if (!packager) {
    throw new Error('Missing @electron/packager. Run: pnpm install');
  }

  const stage = path.join(distDir, `stage-${outName}`);
  rm(stage);
  fs.mkdirSync(stage, { recursive: true });

  // Electron 33 supports native ESM main — use the same entry as dev.
  const rootPkg = require(path.join(pkgRoot, 'package.json'));
  // Keep CJS bridge as fallback for older electron runtimes.
  fs.copyFileSync(path.join(pkgRoot, 'scripts/package-main.cjs'), path.join(stage, 'package-main.cjs'));
  fs.writeFileSync(
    path.join(stage, 'main.cjs'),
    `process.env.DTM_ENTRY = ${JSON.stringify(entryRelative)};\nrequire('./package-main.cjs');\n`,
  );
  writeJson(path.join(stage, 'package.json'), {
    name: outName.toLowerCase(),
    productName,
    version: rootPkg.version || '1.2.0',
    private: true,
    type: 'module',
    main: entryRelative, // same path as pnpm master:dev / setup:dev
    dependencies: {
      'better-sqlite3': rootPkg.dependencies['better-sqlite3'],
      cors: rootPkg.dependencies.cors,
      express: rootPkg.dependencies.express,
      qrcode: rootPkg.dependencies.qrcode,
    },
  });

  // Full source tree needed by ESM imports
  copyDir(path.join(pkgRoot, 'src'), path.join(stage, 'src'));
  // Public download page assets
  if (exists(path.join(pkgRoot, 'src/public'))) {
    copyDir(path.join(pkgRoot, 'src/public'), path.join(stage, 'public'));
  }
  if (exists(iconIco)) fs.copyFileSync(iconIco, path.join(stage, 'app.ico'));

  // Install runtime deps into stage
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  let install = spawnSync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: stage, stdio: 'inherit', shell: process.platform === 'win32',
    timeout: 10 * 60 * 1000, env: process.env,
  });
  if (install.status !== 0) {
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    run(pnpm, ['install', '--prod'], { cwd: stage });
  }

  // Rebuild better-sqlite3 for Electron ABI (packaged Master uses in-process API)
  try {
    const { rebuild } = require('@electron/rebuild');
    const electronVersion = require('electron/package.json').version;
    console.log(`Rebuilding better-sqlite3 for Electron ${electronVersion}...`);
    await rebuild({
      buildPath: stage,
      electronVersion,
      force: true,
      onlyModules: ['better-sqlite3'],
    });
  } catch (err) {
    console.warn('Electron native rebuild warning:', err.message || err);
  }

  const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

  const outputPaths = await packager({
    dir: stage,
    name: productName,
    productName,
    platform,
    arch,
    out: desktopDir,
    overwrite: true,
    asar: false,
    prune: true,
    icon: exists(iconIco) ? iconIco : undefined,
    appCopyright: 'DTM',
    executableName: outName,
    win32metadata: {
      CompanyName: 'DTM',
      FileDescription: productName,
      OriginalFilename: `${outName}.exe`,
      ProductName: productName,
      InternalName: outName,
    },
  });

  const appDir = outputPaths[0];
  console.log('Packaged', productName, '->', appDir);

  // Friendly launcher that keeps a console log if the GUI fails
  if (platform === 'win32') {
    fs.writeFileSync(
      path.join(appDir, `Start ${productName}.cmd`),
      [
        '@echo off',
        'cd /d "%~dp0"',
        `start "" "%~dp0${outName}.exe"`,
        '',
      ].join('\r\n'),
    );
    fs.writeFileSync(
      path.join(appDir, `Debug ${productName}.cmd`),
      [
        '@echo off',
        'cd /d "%~dp0"',
        `echo Launching ${outName}.exe ...`,
        `"%~dp0${outName}.exe"`,
        'echo.',
        'echo Exit code: %ERRORLEVEL%',
        'pause',
        '',
      ].join('\r\n'),
    );
  }
  if (exists(iconIco)) fs.copyFileSync(iconIco, path.join(appDir, 'app.ico'));
  fs.writeFileSync(
    path.join(appDir, 'README.txt'),
    `${productName}\n\nDouble-click ${outName}.exe\nIf nothing opens, run "Debug ${productName}.cmd" and send the error text.\n`,
  );
  return appDir;
}

function findExe(dir, base) {
  if (!dir || !exists(dir)) return null;
  const direct = path.join(dir, `${base}.exe`);
  if (exists(direct)) return direct;
  for (const name of fs.readdirSync(dir)) {
    if (name.toLowerCase().endsWith('.exe')) return path.join(dir, name);
  }
  return null;
}

fs.mkdirSync(desktopDir, { recursive: true });
fs.mkdirSync(installerDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

// Ensure API bundle exists (best effort)
console.log('Building API bundle/payload...');
try {
  run(process.execPath, [path.join(pkgRoot, 'scripts/build-exe.mjs')], { timeout: 3 * 60 * 1000 });
} catch (err) {
  const bundle = path.join(distDir, 'dtm-inventory-master.cjs');
  if (exists(bundle)) console.warn('API bundle build warning (using existing):', err.message || err);
  else console.warn('API bundle missing; continuing desktop packaging');
}

const masterDir = await packageApp({
  productName: 'DTM Inventory Master',
  entryRelative: 'src/gui/master/main.mjs',
  outName: 'DTMInventoryMaster',
});
const setupDir = await packageApp({
  productName: 'DTM Inventory Setup',
  entryRelative: 'src/gui/setup/main.mjs',
  outName: 'DTMInventorySetup',
});

const masterExe = findExe(masterDir, 'DTMInventoryMaster');
const setupExe = findExe(setupDir, 'DTMInventorySetup');
if (masterExe) fs.copyFileSync(masterExe, path.join(installerDir, 'DTMInventoryMaster.exe'));
if (setupExe) fs.copyFileSync(setupExe, path.join(installerDir, 'DTMInventorySetup.exe'));

// Non-master Windows installer package (Setup app zip) for download page
if (exists(setupDir)) {
  const setupZip = path.join(installerDir, 'DTMInventorySetup-App-Win64.zip');
  zipDir(setupDir, setupZip);
  fs.copyFileSync(setupZip, path.join(downloadsDir, 'DTMInventory-Setup-Windows.zip'));
  // Also expose bare exe if present
  if (setupExe) fs.copyFileSync(setupExe, path.join(downloadsDir, 'DTMInventorySetup.exe'));
}
if (exists(masterDir)) {
  const masterZip = path.join(installerDir, 'DTMInventoryMaster-App-Win64.zip');
  zipDir(masterDir, masterZip);
  fs.copyFileSync(masterZip, path.join(downloadsDir, 'DTMInventory-Master-Windows.zip'));
  if (masterExe) fs.copyFileSync(masterExe, path.join(downloadsDir, 'DTMInventoryMaster.exe'));
}

// Placeholder APK note until built
const apkNote = path.join(downloadsDir, 'ANDROID-APK.txt');
if (!exists(path.join(downloadsDir, 'DTMInventory.apk'))) {
  fs.writeFileSync(
    apkNote,
    'Place DTMInventory.apk here after building:\n  pnpm android:apk\n\nThen restart Master. The download page QR will point at /downloads/DTMInventory.apk\n',
  );
}

// Copy icon for download page branding
if (exists(path.join(pkgRoot, 'src/gui/shared/brand/icon-256.png'))) {
  fs.copyFileSync(
    path.join(pkgRoot, 'src/gui/shared/brand/icon-256.png'),
    path.join(downloadsDir, 'icon.png'),
  );
}

console.log('\nDone.');
console.log('Desktop apps:', desktopDir);
console.log('Installer outputs:', installerDir);
console.log('Download page files:', downloadsDir);
if (!masterExe) {
  console.log('Note: .exe is produced on Windows. Build there with: pnpm master:app');
}
