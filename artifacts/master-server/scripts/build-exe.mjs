#!/usr/bin/env node
/**
 * Build Master packaging artifacts:
 * - API bundle (dtm-inventory-master.cjs) for headless/service
 * - Copy GUI sources into dist/gui-payload for Setup app
 * - Prefer electron-packager when available for Master + Setup EXEs
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '../..');
const distDir = path.join(root, 'dist');
const bundlePath = path.join(distDir, 'dtm-inventory-master.cjs');

fs.mkdirSync(distDir, { recursive: true });

function loadEsbuild() {
  const tries = [
    () => createRequire(path.join(root, 'package.json'))('esbuild'),
    () => createRequire(path.join(repoRoot, 'package.json'))('esbuild'),
    () => createRequire(import.meta.url)('esbuild'),
  ];
  let dir = root;
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, 'node_modules', 'esbuild', 'package.json');
    if (fs.existsSync(pkg)) {
      tries.push(() => createRequire(pkg)('.'));
      tries.push(() => createRequire(path.join(dir, 'package.json'))('esbuild'));
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const errors = [];
  for (const fn of tries) {
    try {
      const mod = fn();
      if (mod && typeof mod.build === 'function') return mod;
    } catch (err) {
      errors.push(String(err && err.message ? err.message : err));
    }
  }
  throw new Error(`Could not load esbuild.\n  - ${errors.slice(0, 5).join('\n  - ')}\nRun: pnpm install`);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

console.log('Bundling headless API with esbuild JS API...');
const esbuild = loadEsbuild();
await esbuild.build({
  entryPoints: [path.join(root, 'src/cli.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: bundlePath,
  external: ['better-sqlite3', 'electron'],
  logLevel: 'info',
});

let bundled = fs.readFileSync(bundlePath, 'utf8');
const banner = 'var __dirname = require("path").dirname(__filename);\n';
if (!bundled.startsWith('var __dirname = require("path").dirname(__filename);')) {
  bundled = banner + bundled;
}
bundled = bundled.replace(
  /path\.dirname\(\s*fileURLToPath\(\s*import\.meta\.url\s*\)\s*\)/g,
  '__dirname',
);
fs.writeFileSync(bundlePath, bundled);

// Payload for Setup app: API bundle + full src (GUI)
const payloadDir = path.join(distDir, 'payload');
if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });
fs.mkdirSync(payloadDir, { recursive: true });
fs.copyFileSync(bundlePath, path.join(payloadDir, 'dtm-inventory-master.cjs'));
copyDir(path.join(root, 'src'), path.join(payloadDir, 'src'));
fs.writeFileSync(
  path.join(payloadDir, 'package.json'),
  JSON.stringify(
    {
      name: 'dtm-inventory-master-payload',
      private: true,
      type: 'module',
      main: 'src/gui/master/main.mjs',
    },
    null,
    2,
  ),
);

// Keep legacy public folder empty marker (API-only now)
const publicDest = path.join(distDir, 'public');
fs.mkdirSync(publicDest, { recursive: true });
fs.writeFileSync(
  path.join(publicDest, 'README.txt'),
  'Master UI is the desktop app. This folder is intentionally empty.\n',
);

// Try electron-packager for Master + Setup if available
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
function hasBin(name) {
  const r = spawnSync(pnpmCmd, ['exec', name, '--version'], {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    env: process.env,
  });
  return r.status === 0;
}

if (hasBin('electron-packager')) {
  const out = path.join(distDir, 'desktop');
  if (fs.existsSync(out)) fs.rmSync(out, { recursive: true, force: true });
  const common = [
    'exec',
    'electron-packager',
    root,
    '--overwrite',
    '--out',
    out,
    '--platform',
    process.platform === 'win32' ? 'win32' : process.platform,
    '--arch',
    'x64',
    '--prune=true',
    '--ignore=dist',
    '--ignore=installer',
  ];
  console.log('Packaging Master desktop app...');
  let r = spawnSync(
    pnpmCmd,
    [...common, '--name', 'DTMInventoryMaster', '--electron-version', '33.2.1'],
    { cwd: root, stdio: 'inherit', shell: true, env: process.env },
  );
  if (r.status !== 0) console.warn('Master electron-packager failed (optional)');

  console.log('Packaging Setup desktop app...');
  // Temporary package.json main swap is hard; package whole module and document setup entry.
  r = spawnSync(
    pnpmCmd,
    [...common, '--name', 'DTMInventorySetup', '--electron-version', '33.2.1'],
    { cwd: root, stdio: 'inherit', shell: true, env: process.env },
  );
  if (r.status !== 0) console.warn('Setup electron-packager failed (optional)');
} else {
  console.log('electron-packager not installed. Desktop EXEs skipped.');
  console.log('Dev GUI: pnpm master:dev   /   pnpm --filter @workspace/master-server setup:dev');
}

// Optional pkg for headless API exe
const pkgCheck = spawnSync(pnpmCmd, ['exec', 'pkg', '--version'], {
  cwd: root,
  shell: true,
  encoding: 'utf8',
  env: process.env,
});
if (pkgCheck.status === 0) {
  const pkg = spawnSync(
    pnpmCmd,
    [
      'exec',
      'pkg',
      bundlePath,
      '--targets',
      'node18-win-x64',
      '--output',
      path.join(distDir, 'DTMInventoryMaster-API.exe'),
    ],
    { cwd: root, stdio: 'inherit', shell: true, env: process.env },
  );
  if (pkg.status !== 0) {
    console.warn('pkg failed; Node API bundle still available');
  }
} else {
  console.log('pkg not installed. Headless API bundle at dist/dtm-inventory-master.cjs');
}

console.log('Master build artifacts are in', distDir);
