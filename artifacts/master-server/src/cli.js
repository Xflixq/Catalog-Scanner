#!/usr/bin/env node
import { createApp } from './app.js';
import { loadConfig } from './lib/config.js';
import { pickPrimaryLanIp, getLanIPv4Addresses } from './lib/network.js';

const config = loadConfig();
const { app } = createApp(config);

const server = app.listen(config.port, config.host, () => {
  const primary = pickPrimaryLanIp();
  const ips = getLanIPv4Addresses();
  console.log('');
  console.log('Catalog Scanner Master');
  console.log('----------------------');
  console.log(`Console:  http://127.0.0.1:${config.port}`);
  console.log(`LAN:      http://${primary}:${config.port}`);
  if (ips.length > 1) {
    for (const ip of ips) console.log(`          http://${ip}:${config.port}`);
  }
  console.log(`Database: ${config.dbPath}`);
  console.log(`Data dir: ${config.dataDir}`);
  console.log('');
  console.log('Open the console URL on this PC to show the tether QR code.');
  console.log('Android devices scan that QR on first boot.');
  console.log('Other PCs connect with a login code generated in the console.');
  console.log('');
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
