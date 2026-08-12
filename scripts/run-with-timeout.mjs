#!/usr/bin/env node
import { spawn } from 'node:child_process';

const ms = Number(process.env.DTM_TIMEOUT_MS || process.argv[2] || 30000);
const cmd = process.argv[3];
const args = process.argv.slice(4);
if (!cmd) {
  console.error('Usage: node scripts/run-with-timeout.mjs <ms> <cmd> [args...]');
  process.exit(2);
}

const child = spawn(cmd, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

const timer = setTimeout(() => {
  console.error(`\nTimed out after ${Math.round(ms / 1000)}s: ${cmd} ${args.join(' ')}`);
  try { child.kill('SIGKILL'); } catch {}
  process.exit(124);
}, ms);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
