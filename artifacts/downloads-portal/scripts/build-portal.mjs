#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portalRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(portalRoot, '../..');
const outDir = path.join(repoRoot, 'dist/downloads-portal');

fs.mkdirSync(outDir, { recursive: true });
fs.cpSync(path.join(portalRoot, 'public'), path.join(outDir, 'public'), { recursive: true });
fs.copyFileSync(path.join(portalRoot, 'server.mjs'), path.join(outDir, 'server.mjs'));
fs.writeFileSync(
  path.join(outDir, 'README.txt'),
  'Start with: node server.mjs\nDefault URL: http://127.0.0.1:47880\n',
);
console.log(`Downloads portal copied to ${outDir}`);
