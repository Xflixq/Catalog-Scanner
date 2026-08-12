#!/usr/bin/env node
/**
 * Create/update a GitHub release from local dist/downloads MSI+APK files.
 *
 * Usage:
 *   set GH_TOKEN=ghp_...
 *   node scripts/publish-github-release.mjs v1.3.2
 *
 * Or with gh CLI:
 *   gh release create v1.3.2 ./artifacts/master-server/dist/downloads/*.msi ...
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const tag = process.argv[2] || `v${JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version}`;
const downloads = path.join(root, 'artifacts/master-server/dist/downloads');
const owner = process.env.GITHUB_OWNER || 'Xflixq';
const repo = process.env.GITHUB_REPO || 'Catalog-Scanner';

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }

const files = exists(downloads)
  ? fs.readdirSync(downloads)
      .filter((n) => /\.(msi|apk|exe)$/i.test(n))
      .map((n) => path.join(downloads, n))
  : [];

if (!files.length) {
  console.error('No MSI/APK/EXE in', downloads);
  console.error('Build first: pnpm master:setup && pnpm android:apk');
  process.exit(1);
}

// Prefer gh CLI
const gh = spawnSync('gh', ['--version'], { encoding: 'utf8' });
if (gh.status === 0) {
  const args = ['release', 'create', tag, ...files, '--title', `DTM Inventory ${tag}`, '--generate-notes', '--repo', `${owner}/${repo}`];
  // if exists, upload assets instead
  const check = spawnSync('gh', ['release', 'view', tag, '--repo', `${owner}/${repo}`], { encoding: 'utf8' });
  const cmd = check.status === 0
    ? ['release', 'upload', tag, ...files, '--clobber', '--repo', `${owner}/${repo}`]
    : args;
  console.log('$ gh', cmd.join(' '));
  const r = spawnSync('gh', cmd, { stdio: 'inherit' });
  process.exit(r.status || 0);
}

console.error('GitHub CLI (gh) not found. Install gh, or push a version tag to trigger .github/workflows/release.yml');
console.error('Files ready:');
for (const f of files) console.error(' -', f);
process.exit(2);
