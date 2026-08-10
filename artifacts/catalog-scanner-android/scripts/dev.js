#!/usr/bin/env node
/**
 * Cross-platform Expo launcher.
 * Avoids Unix-only `VAR=value command` syntax that breaks on Windows cmd.exe.
 * Also ensures monorepo package-local node_modules links exist so web can load
 * /node_modules/expo-router/entry.bundle under pnpm hoisting.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '../..');
const args = process.argv.slice(2);
const port = process.env.PORT || '18900';
const domain = process.env.EXPO_PUBLIC_DOMAIN || 'localhost';

function ensureLinkedPackage(packageName) {
  const target = path.resolve(workspaceRoot, 'node_modules', packageName);
  const linkPath = path.resolve(projectRoot, 'node_modules', packageName);

  if (!fs.existsSync(target)) {
    return;
  }

  fs.mkdirSync(path.dirname(linkPath), { recursive: true });

  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink() || stat.isDirectory() || stat.isFile()) {
      // Already present (pnpm link, real install, or previous run).
      return;
    }
  } catch {
    // missing — create below
  }

  try {
    // Junctions work without admin rights on Windows.
    const type = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(target, linkPath, type);
  } catch (error) {
    // Non-fatal: index.js entry still boots web even if this link fails.
    console.warn(`Could not link ${packageName}:`, error.message);
  }
}

// These make the browser's default Expo web entry path resolve under pnpm.
ensureLinkedPackage('expo-router');
ensureLinkedPackage('@expo/metro-runtime');
ensureLinkedPackage('whatwg-fetch');

const expoArgs = ['expo', 'start', '--port', String(port), ...args];

const env = {
  ...process.env,
  EXPO_NO_METRO_WORKSPACE_ROOT: process.env.EXPO_NO_METRO_WORKSPACE_ROOT || '1',
  EXPO_PUBLIC_DOMAIN: domain,
  PORT: String(port),
};

const child = spawn(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', ...expoArgs],
  {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    shell: true,
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
