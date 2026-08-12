#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];
const ok = (m) => console.log(`OK   ${m}`);
const bad = (m) => { console.log(`MISS ${m}`); issues.push(m); };

console.log('DTM Inventory doctor');
console.log('Root:', root);
console.log('Node:', process.version, process.execPath);

if (fs.existsSync(path.join(root, 'package.json'))) ok('package.json');
else bad('package.json missing');

const brokenNodePkg = path.join(root, 'node_modules', 'node', 'package.json');
if (fs.existsSync(brokenNodePkg)) {
  bad('Broken npm package "node" is installed (NOT Node.js). Remove it.');
} else {
  ok('no broken npm "node" package');
}

const masterMain = path.join(root, 'artifacts/master-server/src/gui/master/main.mjs');
if (fs.existsSync(masterMain)) ok('master UI source');
else bad('master UI source missing');

// desktop runtime
let runtimeOk = false;
try {
  const require = createRequire(path.join(root, 'artifacts/master-server/package.json'));
  const electronPkg = require.resolve('electron/package.json');
  const dir = path.dirname(electronPkg);
  const pathFile = path.join(dir, 'path.txt');
  if (fs.existsSync(pathFile)) {
    const rel = fs.readFileSync(pathFile, 'utf8').trim();
    const bin = path.join(dir, 'dist', rel);
    if (fs.existsSync(bin)) {
      ok(`desktop runtime -> ${bin}`);
      runtimeOk = true;
    }
  }
  if (!runtimeOk) {
    const exe = path.join(dir, 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
    if (fs.existsSync(exe)) {
      ok(`desktop runtime -> ${exe}`);
      runtimeOk = true;
    } else {
      bad('desktop runtime package present but binary missing (install incomplete)');
    }
  }
} catch (e) {
  bad(`desktop runtime not installed (${e.message})`);
}

// sqlite
try {
  const require = createRequire(path.join(root, 'artifacts/master-server/package.json'));
  require('better-sqlite3');
  ok(`better-sqlite3 loads on ${process.version}`);
} catch (e) {
  try {
    const require = createRequire(path.join(root, 'package.json'));
    require('better-sqlite3');
    ok(`better-sqlite3 loads on ${process.version}`);
  } catch (e2) {
    bad(`better-sqlite3 failed: ${e2.message}`);
  }
}

if (issues.length) {
  console.log('\nRepair:');
  console.log('  # if doctor mentioned broken npm package "node":');
  console.log('  pnpm remove node -r');
  console.log('  Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue');
  console.log('  pnpm install');
  console.log('  pnpm doctor');
  console.log('  pnpm master:dev');
  process.exit(1);
}
console.log('\nAll good. Run: pnpm master:dev');
