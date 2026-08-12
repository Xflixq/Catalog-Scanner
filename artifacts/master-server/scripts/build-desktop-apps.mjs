#!/usr/bin/env node
/**
 * Build standalone desktop apps with embedded Electron runtime + DTM icon.
 * Same UI/boot path as `pnpm master:dev` and `pnpm setup:dev`.
 *
 * Outputs under:
 *   artifacts/master-server/dist/desktop/
 *   artifacts/master-server/dist/installer/
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
const iconIco = path.join(pkgRoot, 'src/gui/shared/brand/app.ico');
const require = createRequire(path.join(pkgRoot, 'package.json'));

const exists = (p) => {
  try { return fs.existsSync(p); } catch { return false; }
};
const rm = (p) => { if (exists(p)) fs.rmSync(p, { recursive: true, force: true }); };
function copyDir(src, dest, ignore = new Set(['node_modules', 'dist', '.git'])) {
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
    timeout: opts.timeout || 15 * 60 * 1000,
  });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
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
    throw new Error('Missing @electron/packager. Run pnpm install in the monorepo root.');
  }

  const stage = path.join(distDir, `stage-${outName}`);
  rm(stage);
  fs.mkdirSync(stage, { recursive: true });

  // Packaged CJS main -> dynamic import ESM GUI entry (same as dev)
  fs.copyFileSync(path.join(pkgRoot, 'scripts/package-main.cjs'), path.join(stage, 'package-main.cjs'));
  fs.writeFileSync(
    path.join(stage, 'main.cjs'),
    `process.env.DTM_ENTRY = ${JSON.stringify(entryRelative)};\nrequire('./package-main.cjs');\n`,
  );

  const rootPkg = require(path.join(pkgRoot, 'package.json'));
  writeJson(path.join(stage, 'package.json'), {
    name: outName.toLowerCase(),
    productName,
    version: '1.1.0',
    private: true,
    main: 'main.cjs',
    dependencies: {
      'better-sqlite3': rootPkg.dependencies['better-sqlite3'],
      cors: rootPkg.dependencies.cors,
      express: rootPkg.dependencies.express,
      qrcode: rootPkg.dependencies.qrcode,
    },
  });

  copyDir(path.join(pkgRoot, 'src'), path.join(stage, 'src'));
  if (exists(iconIco)) fs.copyFileSync(iconIco, path.join(stage, 'app.ico'));

  // Install runtime deps into stage
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  let install = spawnSync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: stage, stdio: 'inherit', shell: process.platform === 'win32', timeout: 10 * 60 * 1000, env: process.env,
  });
  if (install.status !== 0) {
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    run(pnpm, ['install', '--prod'], { cwd: stage });
  }

  // Rebuild better-sqlite3 for Electron ABI (packaged in-process API)
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

  // Friendly launcher + readme
  if (platform === 'win32') {
    fs.writeFileSync(path.join(appDir, `Start ${productName}.cmd`), `@echo off\r\nstart "" "%~dp0${outName}.exe"\r\n`);
  }
  if (exists(iconIco)) fs.copyFileSync(iconIco, path.join(appDir, 'app.ico'));
  fs.writeFileSync(
    path.join(appDir, 'README.txt'),
    `${productName}\n\nDouble-click ${outName}.exe\n\nStandalone desktop app (Electron runtime embedded).\nSame experience as the dev command-prompt launcher.\n`,
  );
  return appDir;
}

fs.mkdirSync(desktopDir, { recursive: true });
fs.mkdirSync(installerDir, { recursive: true });

// Ensure API payload exists too
console.log('Building API bundle/payload...');
try {
  run(process.execPath, [path.join(pkgRoot, 'scripts/build-exe.mjs')], { timeout: 3 * 60 * 1000 });
} catch (err) {
  const bundle = path.join(distDir, 'dtm-inventory-master.cjs');
  if (exists(bundle)) {
    console.warn('API bundle build warning (using existing bundle):', err.message || err);
  } else {
    throw err;
  }
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

function findExe(dir, base) {
  if (!dir || !exists(dir)) return null;
  const direct = path.join(dir, `${base}.exe`);
  if (exists(direct)) return direct;
  for (const name of fs.readdirSync(dir)) {
    if (name.toLowerCase().endsWith('.exe')) return path.join(dir, name);
  }
  return null;
}

const masterExe = findExe(masterDir, 'DTMInventoryMaster');
const setupExe = findExe(setupDir, 'DTMInventorySetup');
if (masterExe) fs.copyFileSync(masterExe, path.join(installerDir, 'DTMInventoryMaster.exe'));
if (setupExe) fs.copyFileSync(setupExe, path.join(installerDir, 'DTMInventorySetup.exe'));

if (exists(masterDir)) zipDir(masterDir, path.join(installerDir, 'DTMInventoryMaster-App-Win64.zip'));
if (exists(setupDir)) zipDir(setupDir, path.join(installerDir, 'DTMInventorySetup-App-Win64.zip'));

console.log('\nDone.');
console.log('Desktop apps:', desktopDir);
console.log('Installer outputs:', installerDir);
if (!masterExe) {
  console.log('Note: .exe is produced on Windows. On Linux/mac this build creates the platform binary.');
}
