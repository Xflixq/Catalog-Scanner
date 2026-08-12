/**
 * Packaged desktop entry.
 * Loads the same ESM GUI entry used by `pnpm master:dev` / `pnpm setup:dev`.
 *
 * Set DTM_ENTRY before requiring this file, e.g.:
 *   process.env.DTM_ENTRY = 'src/gui/master/main.mjs'
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

process.chdir(__dirname);

const entryRel = process.env.DTM_ENTRY || 'src/gui/master/main.mjs';
const entry = path.join(__dirname, entryRel);
if (!fs.existsSync(entry)) {
  console.error('Missing app entry:', entry);
  process.exit(1);
}

import(pathToFileURL(entry).href).catch((error) => {
  console.error(error);
  process.exit(1);
});
