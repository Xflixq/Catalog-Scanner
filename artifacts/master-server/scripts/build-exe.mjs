import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const bundlePath = path.join(distDir, 'catalog-scanner-master.cjs');

fs.mkdirSync(distDir, { recursive: true });

// Bundle the server (except native better-sqlite3) into one CJS file.
const build = spawnSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  [
    'exec',
    'esbuild',
    'src/cli.js',
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--target=node20',
    `--outfile=${bundlePath}`,
    '--external:better-sqlite3',
    '--loader:.html=text',
    '--loader:.css=text',
  ],
  { cwd: root, stdio: 'inherit', shell: true },
);
if (build.status !== 0) process.exit(build.status || 1);

// Copy static console assets next to the bundle for packaged runs.
const publicSrc = path.join(root, 'src', 'public');
const publicDest = path.join(distDir, 'public');
fs.cpSync(publicSrc, publicDest, { recursive: true });

// Prefer pkg if available; otherwise leave the Node bundle for installer use.
const pkgCheck = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec', 'pkg', '--version'], {
  cwd: root,
  shell: true,
  encoding: 'utf8',
});

if (pkgCheck.status === 0) {
  const pkg = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'pkg', bundlePath, '--targets', 'node20-win-x64', '--output', path.join(distDir, 'CatalogScannerMaster.exe')],
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
