import { createApp } from './app.js';
import { loadConfig } from './lib/config.js';
import { pickPrimaryLanIp, getLanIPv4Addresses } from './lib/network.js';

/**
 * Start the pairing API in-process (no browser UI).
 * @returns {Promise<{ server: import('http').Server, config: any, baseUrl: string, close: () => Promise<void> }>}
 */
export async function startMasterService(overrides = {}) {
  const config = { ...loadConfig(), ...overrides };
  const { app, db } = createApp(config);

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(config.port, config.host, () => resolve(s));
    s.on('error', reject);
  });

  const primary = pickPrimaryLanIp();
  const baseUrl = `http://${primary}:${config.port}`;

  return {
    server,
    db,
    config,
    baseUrl,
    lanIps: getLanIPv4Addresses(),
    close: () =>
      new Promise((resolve) => {
        try {
          db.close();
        } catch {
          // ignore
        }
        server.close(() => resolve());
      }),
  };
}
