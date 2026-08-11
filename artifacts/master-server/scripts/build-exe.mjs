#!/usr/bin/env node
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire as createRequireFromPath } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '../..');
const distDir = path.join(root, 'dist');
const bundlePath = path.join(distDir, 'catalog-scanner-master.cjs');

fs.mkdirSync(distDir, { recursive: true });

function loadEsbuild() {
  const tries = [
    () => createRequire(path.join(root, 'package.json'))('esbuild'),
    () => createRequire(path.join(repoRoot, 'package.json'))('esbuild'),
    () => createRequire(import.meta.url)('esbuild'),
  ];
  // Also walk up from this file looking for node_modules/esbuild
  let dir = root;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'node_modules', 'esbuild', 'lib', 'main.js');
    const pkg = path.join(dir, 'node_modules', 'esbuild', 'package.json');
    if (fs.existsSync(pkg)) {
      tries.push(() => createRequire(pkg)('.'));
      tries.push(() => createRequire(path.join(dir, 'package.json'))('esbuild'));
    }
    if (fs.existsSync(candidate)) {
      tries.push(() => createRequire(candidate));
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
  const detail = errors.slice(0, 5).join('\n  - ');
  throw new Error(
    `Could not load esbuild JS API.\n  Tried package roots under master-server and repo.\n  - ${detail || 'no details'}\n` +
      `Run from repo root: pnpm install`,
  );
}

async function runEsbuild() {
  const esbuild = loadEsbuild();
  console.log('Bundling master server with esbuild JS API...');
  await esbuild.build({
    entryPoints: [path.join(root, 'src/cli.js')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outfile: bundlePath,
    external: ['better-sqlite3'],
    logLevel: 'info',
  });
}

try {
  await runEsbuild();
} catch (err) {
  console.error('[build-exe] esbuild failed:');
  console.error(err);
  process.exit(1);
}

if (!fs.existsSync(bundlePath)) {
  console.error('[build-exe] Bundle was not written:', bundlePath);
  process.exit(1);
}

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

const publicSrc = path.join(root, 'src', 'public');
const publicDest = path.join(distDir, 'public');
if (!fs.existsSync(publicSrc)) {
  console.error('[build-exe] Missing public UI folder:', publicSrc);
  process.exit(1);
}
fs.cpSync(publicSrc, publicDest, { recursive: true });

// Optional standalone .exe via pkg when available. Never fail the build if missing.
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
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
      'node20-win-x64',
      '--output',
      path.join(distDir, 'CatalogScannerMaster.exe'),
    ],
    { cwd: root, stdio: 'inherit', shell: true, env: process.env },
  );
  if (pkg.status !== 0) {
    console.warn(
      'pkg failed; Node bundle is still available at dist/catalog-scanner-master.cjs',
    );
  }
} else {
  console.log('pkg not installed. Node bundle written to dist/catalog-scanner-master.cjs');
  console.log('Install pkg (`pnpm add -D pkg`) and re-run build:exe for a standalone .exe.');
}

console.log('Master build artifacts are in', distDir);
void createRequireFromPath;