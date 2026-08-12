#!/usr/bin/env node
/**
 * Run a .ps1 with whichever PowerShell is available.
 * Prefer Windows PowerShell 5.1 (powershell.exe), then pwsh.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const scriptArg = process.argv[2];
const extraArgs = process.argv.slice(3);
if (!scriptArg) {
  console.error('Usage: node scripts/run-ps1.mjs <script.ps1> [args...]');
  process.exit(1);
}

const scriptPath = path.resolve(scriptArg);
if (!fs.existsSync(scriptPath)) {
  console.error('Script not found:', scriptPath);
  process.exit(1);
}

const candidates =
  process.platform === 'win32'
    ? [
        path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        'powershell.exe',
        'pwsh.exe',
        'pwsh',
      ]
    : ['pwsh', 'powershell'];

let shell = null;
for (const c of candidates) {
  const probe = spawnSync(c, ['-NoProfile', '-Command', 'exit 0'], {
    encoding: 'utf8',
    shell: false,
  });
  if (!probe.error && probe.status === 0) {
    shell = c;
    break;
  }
}

if (!shell) {
  console.error('No PowerShell found (powershell.exe / pwsh).');
  process.exit(1);
}

const result = spawnSync(
  shell,
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...extraArgs],
  { stdio: 'inherit', shell: false, env: process.env },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
