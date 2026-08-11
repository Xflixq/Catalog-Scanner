#!/usr/bin/env node
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '../..');
const distDir = path.join(root, 'dist');
const bundlePath = path.join(distDir, 'catalog-scanner-master.cjs');

fs.mkdirSync(distDir, { recursive: true });

function tryRequire(moduleName, fromDir) {
  try {
    const req = createRequire(path.join(fromDir, 'package.json'));
    return req(moduleName);
  } catch {
    return null;
  }
}

async function runEsbuild() {
  // Prefer the JS API so Windows does not need to spawn esbuild.cmd.
  const esbuild =
    tryRequire('esbuild', root) ||
    tryRequire('esbuild', repoRoot);

  if (esbuild?.build) {
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
    return;
  }

  // Fallback: CLI binary (Linux/macOS or when esbuild package is only on PATH).
  const binNames =
    process.platform === 'win32'
      ? ['esbuild.cmd', 'esbuild.exe', 'esbuild']
      : ['esbuild'];
  const candidates = [];
  for (const base of [repoRoot, root]) {
    for (const name of binNames) {
      candidates.push(path.join(base, 'node_modules', '.bin', name));
    }
  }

  let esbuildBin = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      esbuildBin = c;
      break;
    }
  }
  if (!esbuildBin) esbuildBin = 'esbuild';

  const build = spawnSync(
    esbuildBin,
    [
      path.join(root, 'src/cli.js'),
      '--bundle',
      '--platform=node',
      '--format=cjs',
      '--target=node20',
      `--outfile=${bundlePath}`,
      '--external:better-sqlite3',
    ],
    {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    },
  );
  if (build.error) {
    console.error(build.error);
    process.exit(1);
  }
  if (build.status !== 0) process.exit(build.status || 1);
}

await runEsbuild();

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
// Keep pathToFileURL import used for tooling consistency on some bundlers.
void pathToFileURL;