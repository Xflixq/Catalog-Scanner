#!/usr/bin/env node
/**
 * Cross-platform Vite launcher for the web app.
 * Avoids Unix-only `VAR=value command` syntax that breaks on Windows cmd.exe.
 */
const { spawn } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'dev'; // dev | build | serve
const port = process.env.PORT || '20003';
const basePath = process.env.BASE_PATH || '/';

const viteArgsByMode = {
  dev: ['vite', '--config', 'vite.config.ts', '--host', '0.0.0.0'],
  build: ['vite', 'build', '--config', 'vite.config.ts'],
  serve: ['vite', 'preview', '--config', 'vite.config.ts', '--host', '0.0.0.0'],
};

const viteArgs = viteArgsByMode[mode];
if (!viteArgs) {
  console.error(`Unknown mode: ${mode}. Use dev, build, or serve.`);
  process.exit(1);
}

const env = {
  ...process.env,
  PORT: String(port),
  BASE_PATH: basePath,
};

const child = spawn('pnpm', ['exec', ...viteArgs], {
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
