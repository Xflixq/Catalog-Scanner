#!/usr/bin/env node
/**
 * Build DTM Inventory Android APK and publish it to Master downloads.
 *
 * Strategies (first that works):
 *  1) Local Gradle: android/gradlew assembleRelease (needs Android SDK)
 *  2) EAS local: eas build -p android --profile local-apk --local
 *  3) EAS cloud: eas build -p android --profile preview --non-interactive
 *
 * Output:
 *  artifacts/catalog-scanner-android/dist/DTMInventory.apk
 *  artifacts/master-server/dist/downloads/DTMInventory.apk
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '../..');
const outDir = path.join(appRoot, 'dist');
const masterDownloads = path.join(repoRoot, 'artifacts/master-server/dist/downloads');
const dataDownloadsCandidates = [];

const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || appRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...(opts.env || {}) },
    timeout: opts.timeout || 60 * 60 * 1000,
  });
  return r.status === 0;
}
function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('Copied', dest);
}
function findApk(dir) {
  if (!exists(dir)) return null;
  const stack = [dir];
  const hits = [];
  while (stack.length) {
    const d = stack.pop();
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (name.toLowerCase().endsWith('.apk')) hits.push(p);
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return hits[0];
}

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(masterDownloads, { recursive: true });

const finalApk = path.join(outDir, 'DTMInventory.apk');
let built = null;

// 1) Gradle local release/debug
const gradlew = process.platform === 'win32'
  ? path.join(appRoot, 'android', 'gradlew.bat')
  : path.join(appRoot, 'android', 'gradlew');
if (exists(gradlew)) {
  console.log('Trying local Gradle APK build...');
  // Prefer release; fall back to debug
  const okRelease = run(
    gradlew,
    ['assembleRelease', '--no-daemon'],
    { cwd: path.join(appRoot, 'android'), timeout: 60 * 60 * 1000 },
  );
  built = findApk(path.join(appRoot, 'android', 'app', 'build', 'outputs', 'apk'));
  if (!built) {
    const okDebug = run(
      gradlew,
      ['assembleDebug', '--no-daemon'],
      { cwd: path.join(appRoot, 'android'), timeout: 60 * 60 * 1000 },
    );
    built = findApk(path.join(appRoot, 'android', 'app', 'build', 'outputs', 'apk'));
  }
}

// 2) EAS local
if (!built) {
  console.log('Trying EAS local APK build (requires eas-cli + Android SDK)...');
  const easCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const ok = run(easCmd, ['eas-cli', 'build', '-p', 'android', '--profile', 'local-apk', '--local', '--non-interactive'], {
    cwd: appRoot,
    timeout: 90 * 60 * 1000,
  });
  if (ok) built = findApk(appRoot) || findApk(outDir);
}

// 3) EAS cloud (user must be logged in)
if (!built) {
  console.log('Trying EAS cloud APK build (requires `eas login`)...');
  const easCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const ok = run(easCmd, ['eas-cli', 'build', '-p', 'android', '--profile', 'preview', '--non-interactive'], {
    cwd: appRoot,
    timeout: 90 * 60 * 1000,
  });
  if (ok) {
    console.log('Cloud build started. When finished, download the APK and re-run:');
    console.log('  pnpm android:publish-apk -- path/to/app.apk');
  }
}

if (!built) {
  console.error('\nCould not produce an APK in this environment.');
  console.error('On a machine with Android Studio / SDK:');
  console.error('  cd artifacts/catalog-scanner-android');
  console.error('  pnpm install');
  console.error('  pnpm apk');
  console.error('\nOr with EAS:');
  console.error('  npx eas-cli login');
  console.error('  npx eas-cli build -p android --profile preview');
  process.exit(2);
}

copy(built, finalApk);
copy(finalApk, path.join(masterDownloads, 'DTMInventory.apk'));

// Also drop into common Windows ProgramData downloads if present via env
const dataDir = process.env.DTM_INVENTORY_DATA_DIR || process.env.CATALOG_SCANNER_DATA_DIR;
if (dataDir) {
  copy(finalApk, path.join(dataDir, 'downloads', 'DTMInventory.apk'));
}

// Brand icon for download page
const icon = path.join(repoRoot, 'artifacts/master-server/src/gui/shared/brand/icon-256.png');
if (exists(icon)) copy(icon, path.join(masterDownloads, 'icon.png'));

console.log('\nAPK ready:');
console.log(' ', finalApk);
console.log('Published to Master downloads:');
console.log(' ', path.join(masterDownloads, 'DTMInventory.apk'));
console.log('\nStart Master, then open http://<lan-ip>:<port>/ on a phone to scan the APK QR.');
