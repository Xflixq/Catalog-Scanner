/**
 * Packaged desktop entry for DTM Inventory Master / Setup.
 * Loads the same ESM GUI entry used by `pnpm master:dev` / `pnpm setup:dev`.
 *
 * main.cjs sets process.env.DTM_ENTRY before requiring this file.
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Always run relative to the app root (where package.json / src live).
process.chdir(__dirname);

// Make sure Electron can resolve modules from this app root.
const Module = require('module');
const prev = Module._nodeModulePaths;
Module._nodeModulePaths = function (from) {
  const paths = prev.call(this, from);
  const extra = path.join(__dirname, 'node_modules');
  if (!paths.includes(extra)) paths.unshift(extra);
  return paths;
};

const entryRel = process.env.DTM_ENTRY || 'src/gui/master/main.mjs';
const entry = path.join(__dirname, entryRel);

function fail(err) {
  const msg = err && err.stack ? err.stack : String(err);
  console.error('[DTM Inventory] failed to start:', msg);
  try {
    // Best-effort native dialog if electron is available.
    const { app, dialog } = require('electron');
    const show = () => {
      try {
        dialog.showErrorBox('DTM Inventory failed to start', msg.slice(0, 4000));
      } catch {}
      try { app.quit(); } catch { process.exit(1); }
    };
    if (app.isReady()) show();
    else app.whenReady().then(show).catch(() => process.exit(1));
  } catch {
    process.exit(1);
  }
}

if (!fs.existsSync(entry)) {
  fail(new Error('Missing app entry: ' + entry));
} else {
  import(pathToFileURL(entry).href).catch(fail);
}
