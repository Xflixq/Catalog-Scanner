#!/usr/bin/env node
/** Sync dist/downloads into the live Master dataDir/downloads folder. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');
const srcDir = path.join(pkgRoot, 'dist', 'downloads');

function dataDir() {
  if (process.env.DTM_INVENTORY_DATA_DIR) return process.env.DTM_INVENTORY_DATA_DIR;
  if (process.env.CATALOG_SCANNER_DATA_DIR) return process.env.CATALOG_SCANNER_DATA_DIR;
  if (process.platform === 'win32') return path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'DTMInventory');
  return path.join(os.homedir(), '.dtm-inventory');
}

const dest = path.join(dataDir(), 'downloads');
fs.mkdirSync(dest, { recursive: true });
if (!fs.existsSync(srcDir)) {
  console.error('No dist/downloads yet. Run pnpm master:app and/or pnpm android:apk first.');
  process.exit(1);
}
for (const name of fs.readdirSync(srcDir)) {
  const s = path.join(srcDir, name);
  if (!fs.statSync(s).isFile()) continue;
  fs.copyFileSync(s, path.join(dest, name));
  console.log('->', path.join(dest, name));
}
console.log('Downloads published. Open http://<lan-ip>:<port>/');
