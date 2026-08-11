#!/usr/bin/env node
/**
 * Launch Electron from the monorepo without requiring `electron` on PATH.
 * Works even when package-local node_modules/.bin is missing on Windows.
 *
 * Usage:
 *   node ../../scripts/run-electron.mjs src/gui/master/main.mjs
 *   node ../../scripts/run-electron.mjs src/gui/setup/main.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const entry = process.argv[2];
const extraArgs = process.argv.slice(3);

if (!entry) {
  console.error('Usage: node scripts/run-electron.mjs <entry.mjs> [args...]');
  process.exit(2);
}

const cwd = process.cwd();
const entryPath = path.resolve(cwd, entry);
if (!fs.existsSync(entryPath)) {
  console.error(`Electron entry not found: ${entryPath}`);
  process.exit(1);
}

function exists(p) {
  try {
    return Boolean(p) && fs.existsSync(p);
  } catch {
    return false;
  }
}

function resolveElectronBinary() {
  const roots = [
    cwd,
    path.resolve(cwd, '..'),
    path.resolve(cwd, '../..'),
    path.resolve(cwd, '../../..'),
    path.resolve(__dirname, '..'),
  ];

  // 1) Prefer electron package resolution from likely package roots.
  for (const root of roots) {
    const pkgJson = path.join(root, 'package.json');
    if (!exists(pkgJson)) continue;
    try {
      const require = createRequire(pkgJson);
      const electronPkg = require.resolve('electron/package.json');
      const electronDir = path.dirname(electronPkg);
      const pathFile = path.join(electronDir, 'path.txt');
      if (exists(pathFile)) {
        const rel = fs.readFileSync(pathFile, 'utf8').trim();
        const abs = path.join(electronDir, 'dist', rel);
        if (exists(abs)) return abs;
      }
      // Fallback executable names
      for (const name of ['electron.exe', 'Electron.app/Contents/MacOS/Electron', 'electron']) {
        const abs = path.join(electronDir, 'dist', name);
        if (exists(abs)) return abs;
      }
    } catch {
      // keep searching
    }
  }

  // 2) Look for node_modules/.bin shims
  for (const root of roots) {
    for (const rel of [
      'node_modules/electron/dist/electron.exe',
      'node_modules/electron/dist/electron',
      'node_modules/.bin/electron.cmd',
      'node_modules/.bin/electron',
      'artifacts/master-server/node_modules/electron/dist/electron.exe',
      'artifacts/master-server/node_modules/.bin/electron.cmd',
    ]) {
      const abs = path.join(root, rel);
      if (exists(abs)) return abs;
    }
  }

  // 3) pnpm exec as last resort (needs electron installed in workspace)
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const probe = spawnSync(pnpm, ['exec', 'electron', '--version'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32',
    timeout: 20000,
  });
  if (probe.status === 0) {
    return { pnpmExec: true, pnpm };
  }

  return null;
}

const resolved = resolveElectronBinary();
if (!resolved) {
  console.error(`
Electron is not installed in this workspace.

Fix:
  cd ${path.resolve(__dirname, '..')}
  pnpm install
  pnpm doctor
  pnpm master:dev

If it still fails:
  pnpm install --filter @workspace/master-server...
`);
  process.exit(1);
}

let child;
if (resolved.pnpmExec) {
  child = spawn(resolved.pnpm, ['exec', 'electron', entryPath, ...extraArgs], {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
    windowsHide: false,
  });
} else {
  child = spawn(resolved, [entryPath, ...extraArgs], {
    cwd,
    stdio: 'inherit',
    shell: false,
    env: process.env,
    windowsHide: false,
  });
}

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
