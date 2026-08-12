#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  return r.status === 0;
}

console.log('DTM Inventory repair');
console.log('Root:', root);

// Remove broken npm "node" package if present
const nodePkg = path.join(root, 'node_modules', 'node');
if (fs.existsSync(nodePkg)) {
  console.log('Removing broken npm package "node"...');
  run(pnpm, ['remove', 'node', '-r']);
}

// Clean install
const nm = path.join(root, 'node_modules');
if (fs.existsSync(nm)) {
  console.log('Removing node_modules...');
  fs.rmSync(nm, { recursive: true, force: true });
}

// Also remove nested package locks pollution
for (const rel of ['package-lock.json', 'artifacts/master-server/package-lock.json']) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

if (!run(pnpm, ['install'])) {
  console.error('\nRepair failed at pnpm install');
  process.exit(1);
}

if (!run(pnpm, ['doctor'])) {
  console.error('\nDoctor still reports issues.');
  process.exit(1);
}

console.log('\nRepair complete. Run: pnpm master:dev');
