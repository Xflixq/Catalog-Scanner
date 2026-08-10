#!/usr/bin/env node
/**
 * Cross-platform Expo launcher.
 * Avoids Unix-only `VAR=value command` syntax that breaks on Windows cmd.exe.
 */
const { spawn } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const port = process.env.PORT || '18900';
const domain = process.env.EXPO_PUBLIC_DOMAIN || 'localhost';

const expoArgs = ['expo', 'start', '--port', String(port), ...args];

const env = {
  ...process.env,
  EXPO_NO_METRO_WORKSPACE_ROOT: process.env.EXPO_NO_METRO_WORKSPACE_ROOT || '1',
  EXPO_PUBLIC_DOMAIN: domain,
  PORT: String(port),
};

const child = spawn('pnpm', ['exec', ...expoArgs], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
  shell: true,
});

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
