#!/usr/bin/env node
/**
 * Launch the DTM Inventory desktop runtime from the monorepo.
 * Does not require anything named "electron" on PATH.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const entry = process.argv[2];
const extraArgs = process.argv.slice(3);

if (!entry) {
  console.error('Usage: node scripts/run-electron.mjs <entry.mjs> [args...]');
  process.exit(2);
}

const cwd = process.cwd();
const entryPath = path.resolve(cwd, entry);
if (!fs.existsSync(entryPath)) {
  console.error(`App entry not found:\n  ${entryPath}`);
  console.error('\nYour folder is incomplete. Re-extract dtm-inventory-master-ready.zip');
  process.exit(1);
}

function exists(p) {
  try { return Boolean(p) && fs.existsSync(p); } catch { return false; }
}

function looksLikeBrokenNodePackage(rootDir) {
  // The npm package named "node" is NOT Node.js. It breaks installs.
  return exists(path.join(rootDir, 'node_modules', 'node', 'package.json'));
}

function resolveBinaryFromElectronPackage(electronPkgJson) {
  const electronDir = path.dirname(electronPkgJson);
  const pathFile = path.join(electronDir, 'path.txt');
  if (exists(pathFile)) {
    const rel = fs.readFileSync(pathFile, 'utf8').trim();
    const abs = path.join(electronDir, 'dist', rel);
    if (exists(abs)) return abs;
  }
  for (const name of ['electron.exe', 'Electron', 'electron']) {
    const abs = path.join(electronDir, 'dist', name);
    if (exists(abs)) return abs;
  }
  return null;
}

function resolveDesktopBinary() {
  const roots = [cwd, path.resolve(cwd, '../..'), repoRoot];
  for (const root of roots) {
    const pkgJson = path.join(root, 'package.json');
    if (!exists(pkgJson)) continue;
    try {
      const require = createRequire(pkgJson);
      const electronPkg = require.resolve('electron/package.json');
      const bin = resolveBinaryFromElectronPackage(electronPkg);
      if (bin) return bin;
    } catch {
      // continue
    }
  }

  // Direct filesystem fallbacks (hoisted installs)
  for (const root of roots) {
    for (const rel of [
      'node_modules/electron/dist/electron.exe',
      'node_modules/electron/dist/electron',
      'artifacts/master-server/node_modules/electron/dist/electron.exe',
    ]) {
      const abs = path.join(root, rel);
      if (exists(abs)) return abs;
    }
  }
  return null;
}

if (looksLikeBrokenNodePackage(repoRoot) || looksLikeBrokenNodePackage(cwd) || looksLikeBrokenNodePackage(path.resolve(cwd, '../..'))) {
  console.error(`
Broken dependency detected: npm package "node"
---------------------------------------------
Someone ran:  npm install node@...

That package is NOT Node.js. It corrupts this workspace and breaks the desktop runtime install.

Repair:
  1) Close this window
  2) Delete the whole folder node_modules
  3) Delete pnpm-lock.yaml if present
  4) Make sure Node.js itself is installed from https://nodejs.org (v20 LTS or v22 LTS)
  5) In this project folder run:

       pnpm remove node -r
       Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
       pnpm install
       pnpm doctor
       pnpm master:dev
`);
  process.exit(1);
}

const binary = resolveDesktopBinary();
if (!binary) {
  console.error(`
Desktop runtime is not installed in this workspace.

Repair:
  cd ${repoRoot}
  Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
  pnpm install
  pnpm doctor
  pnpm master:dev

If install fails mentioning package "node":
  pnpm remove node -r
  then re-run pnpm install
`);
  process.exit(1);
}

// Isolate Chromium cache to a writable project-local folder (avoids Access denied noise).
const cacheRoot = path.join(repoRoot, '.dtm-runtime-cache');
fs.mkdirSync(cacheRoot, { recursive: true });
const env = {
  ...process.env,
  ELECTRON_ENABLE_LOGGING: '0',
};
// Prefer project-local userData via CLI switch below.

const child = spawn(
  binary,
  [
    entryPath,
    ...extraArgs,
    `--user-data-dir=${path.join(cacheRoot, 'user-data')}`,
    '--disable-gpu-shader-disk-cache',
    '--disk-cache-size=1',
  ],
  {
    cwd,
    stdio: 'inherit',
    shell: false,
    env,
    windowsHide: false,
  },
);

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
