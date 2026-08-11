#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

function ok(msg){ console.log(`OK   ${msg}`); }
function bad(msg){ console.log(`MISS ${msg}`); issues.push(msg); }

console.log('DTM Inventory doctor');
console.log('Root:', root);
console.log('Node:', process.version);

// package.json
if (fs.existsSync(path.join(root, 'package.json'))) ok('package.json');
else bad('package.json missing at repo root');

// workspace package
const masterPkg = path.join(root, 'artifacts/master-server/package.json');
if (fs.existsSync(masterPkg)) ok('artifacts/master-server/package.json');
else bad('master-server package missing');

// electron
let electronOk = false;
try {
  const require = createRequire(path.join(root, 'artifacts/master-server/package.json'));
  const electronPkg = require.resolve('electron/package.json');
  const electronDir = path.dirname(electronPkg);
  const pathFile = path.join(electronDir, 'path.txt');
  if (fs.existsSync(pathFile)) {
    const rel = fs.readFileSync(pathFile, 'utf8').trim();
    const bin = path.join(electronDir, 'dist', rel);
    if (fs.existsSync(bin)) {
      ok(`electron -> ${bin}`);
      electronOk = true;
    }
  }
  if (!electronOk) {
    // try root require
    const requireRoot = createRequire(path.join(root, 'package.json'));
    const ep = requireRoot.resolve('electron/package.json');
    ok(`electron package -> ${path.dirname(ep)}`);
    electronOk = true;
  }
} catch (e) {
  bad(`electron not installed (${e.message})`);
}

// better-sqlite3
try {
  const require = createRequire(path.join(root, 'artifacts/master-server/package.json'));
  require('better-sqlite3');
  ok(`better-sqlite3 loads on ${process.version}`);
} catch (e) {
  try {
    const requireRoot = createRequire(path.join(root, 'package.json'));
    requireRoot('better-sqlite3');
    ok(`better-sqlite3 loads on ${process.version} (hoisted)`);
  } catch (e2) {
    bad(`better-sqlite3 failed: ${e2.message}`);
  }
}

// master node_modules warning
const masterNm = path.join(root, 'artifacts/master-server/node_modules');
if (!fs.existsSync(masterNm)) {
  console.log('NOTE package-local artifacts/master-server/node_modules is missing (often normal with pnpm hoisting)');
}

if (issues.length) {
  console.log('\nFix:');
  console.log('  pnpm install');
  console.log('  pnpm install --filter @workspace/master-server...');
  console.log('  pnpm master:rebuild');
  process.exit(1);
}
console.log('\nAll good. Run: pnpm master:dev');
