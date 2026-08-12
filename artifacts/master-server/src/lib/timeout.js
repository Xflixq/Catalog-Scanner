/** Default hard timeout for user-facing operations (ms). */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Race a promise against a timeout.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} [ms]
 * @param {string} [label]
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms = DEFAULT_TIMEOUT_MS, label = 'Operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * spawnSync wrapper with a hard timeout (default 30s).
 * @param {string} command
 * @param {string[]} args
 * @param {import('node:child_process').SpawnSyncOptions} [options]
 */
export function spawnSyncTimed(command, args = [], options = {}) {
  const { spawnSync } = require('node:child_process');
  const ms = options.timeout ?? DEFAULT_TIMEOUT_MS;
  return spawnSync(command, args, {
    ...options,
    timeout: ms,
    killSignal: 'SIGKILL',
  });
}
