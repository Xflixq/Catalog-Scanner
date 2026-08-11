#!/usr/bin/env node
/**
 * Best-effort APK builder for DTM Inventory Android.
 *
 * Order:
 * 1) eas build --local --platform android --profile local-apk  (if eas-cli + Android SDK available)
 * 2) expo prebuild + gradle assembleRelease                   (if Android SDK / JDK available)
 * 3) expo export --platform android                           (JS bundle fallback for downloads portal)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '../..');
const outDir = path.resolve(repoRoot, 'dist/downloads');
const isWin = process.platform === 'win32';
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm';

fs.mkdirSync(outDir, { recursive: true });

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  return spawnSync(cmd, args, {
    cwd: opts.cwd || appRoot,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...(opts.env || {}) },
  });
}

function copyIfExists(src, destName) {
  if (!fs.existsSync(src)) return false;
  const dest = path.join(outDir, destName);
  fs.copyFileSync(src, dest);
  console.log(`Copied APK -> ${dest}`);
  return true;
}

function findApk(dir) {
  if (!fs.existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const name of fs.readdirSync(cur)) {
      const full = path.join(cur, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) stack.push(full);
      else if (name.endsWith('.apk')) return full;
    }
  }
  return null;
}

// 1) EAS local APK
const eas = run(pnpm, ['exec', 'eas', '--version']);
if (eas.status === 0) {
  const built = run(pnpm, [
    'exec',
    'eas',
    'build',
    '--local',
    '--platform',
    'android',
    '--profile',
    'local-apk',
    '--non-interactive',
  ]);
  if (built.status === 0) {
    const apk = findApk(appRoot) || findApk(path.join(repoRoot, 'dist'));
    if (apk && copyIfExists(apk, 'DTMInventory.apk')) process.exit(0);
  }
  console.warn('EAS local build did not produce an APK. Trying Gradle path...');
} else {
  console.warn('eas-cli not available. Trying Gradle path...');
}

// 2) Expo prebuild + Gradle
const prebuild = run(pnpm, ['exec', 'expo', 'prebuild', '--platform', 'android', '--no-install']);
if (prebuild.status === 0 && fs.existsSync(path.join(appRoot, 'android'))) {
  const gradlew = path.join(appRoot, 'android', isWin ? 'gradlew.bat' : 'gradlew');
  if (fs.existsSync(gradlew)) {
    const gradle = run(gradlew, ['assembleRelease'], { cwd: path.join(appRoot, 'android') });
    if (gradle.status === 0) {
      const apk =
        findApk(path.join(appRoot, 'android', 'app', 'build', 'outputs', 'apk')) ||
        findApk(path.join(appRoot, 'android'));
      if (apk && copyIfExists(apk, 'DTMInventory.apk')) process.exit(0);
    }
  }
}

// 3) Fallback: export JS bundle so the downloads portal still has an Android artifact
console.warn('Native APK tooling unavailable in this environment.');
console.warn('Exporting Android JS bundle as a development artifact instead.');
const exportDir = path.join(outDir, 'android-export');
if (fs.existsSync(exportDir)) fs.rmSync(exportDir, { recursive: true, force: true });
const exp = run(pnpm, ['exec', 'expo', 'export', '--platform', 'android', '--output-dir', exportDir], {
  env: { CI: '1' },
});
if (exp.status !== 0) {
  console.error('Android export failed.');
  process.exit(1);
}

// Write a small note next to the export
fs.writeFileSync(
  path.join(outDir, 'DTMInventory-android-README.txt'),
  [
    'Native APK was not built in this environment (Android SDK / EAS local build unavailable).',
    'An Expo Android export is available under android-export/.',
    '',
    'On a Windows machine with Android Studio + JDK installed, re-run:',
    '  pnpm android:apk',
    '',
    'Or use EAS:',
    '  cd artifacts/dtm-inventory-android',
    '  pnpm exec eas build -p android --profile preview',
    '',
  ].join('\n'),
);
console.log(`Android export ready at ${exportDir}`);
process.exit(0);
