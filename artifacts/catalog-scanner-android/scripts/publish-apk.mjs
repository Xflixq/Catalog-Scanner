#!/usr/bin/env node
/** Copy an existing APK into Master downloads as DTMInventory.apk */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '../..');
const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error('Usage: node scripts/publish-apk.mjs <path-to.apk>');
  process.exit(1);
}
const targets = [
  path.join(appRoot, 'dist', 'DTMInventory.apk'),
  path.join(repoRoot, 'artifacts/master-server/dist/downloads', 'DTMInventory.apk'),
];
const dataDir = process.env.DTM_INVENTORY_DATA_DIR || process.env.CATALOG_SCANNER_DATA_DIR;
if (dataDir) targets.push(path.join(dataDir, 'downloads', 'DTMInventory.apk'));

for (const dest of targets) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('Published', dest);
}
console.log('Restart/open Master and visit http://<lan-ip>:<port>/ for the QR download page.');
