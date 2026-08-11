#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '../..');
const distDir = path.join(root, 'dist');
const bundlePath = path.join(distDir, 'catalog-scanner-master.cjs');

fs.mkdirSync(distDir, { recursive: true });

function resolveEsbuild() {
  const candidates = [
    path.join(repoRoot, 'node_modules/.bin/esbuild'),
    path.join(root, 'node_modules/.bin/esbuild'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'esbuild';
}

const esbuild = resolveEsbuild();
const build = spawnSync(
  esbuild,
  [
    path.join(root, 'src/cli.js'),
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--target=node20',
    `--outfile=${bundlePath}`,
    '--external:better-sqlite3',
  ],
  { cwd: root, stdio: 'inherit' },
);
if (build.status !== 0) process.exit(build.status || 1);

let bundled = fs.readFileSync(bundlePath, 'utf8');
const banner = 'var __dirname = require("path").dirname(__filename);\n';
if (!bundled.startsWith(banner.trim())) {
  bundled = banner + bundled;
}
bundled = bundled.replace(
  /path\.dirname\(\s*fileURLToPath\(\s*import\.meta\.url\s*\)\s*\)/g,
  '__dirname',
);
fs.writeFileSync(bundlePath, bundled);

const publicSrc = path.join(root, 'src', 'public');
const publicDest = path.join(distDir, 'public');
fs.cpSync(publicSrc, publicDest, { recursive: true });

const pkgCheck = spawnSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'pkg', '--version'],
  { cwd: root, shell: true, encoding: 'utf8' },
);

if (pkgCheck.status === 0) {
  const pkg = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    [
      'exec',
      'pkg',
      bundlePath,
      '--targets',
      'node20-win-x64',
      '--output',
      path.join(distDir, 'CatalogScannerMaster.exe'),
    ],
    { cwd: root, stdio: 'inherit', shell: true },
  );
  if (pkg.status !== 0) {
    console.warn('pkg failed; Node bundle is still available at dist/catalog-scanner-master.cjs');
  }
} else {
  console.log('pkg not installed. Node bundle written to dist/catalog-scanner-master.cjs');
  console.log('Install pkg (`pnpm add -D pkg`) and re-run build:exe for a standalone .exe.');
}

console.log('Master build artifacts are in', distDir);
