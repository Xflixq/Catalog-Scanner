#!/usr/bin/env node
/**
 * Headless pairing API only (for advanced / service use).
 * Normal users should launch the Master desktop GUI.
 */
import { startMasterService } from './service.js';

async function main() {
  const svc = await startMasterService();
  console.log('');
  console.log('DTM Inventory Master API (headless)');
  console.log('-------------------------------------');
  console.log(`LAN:      ${svc.baseUrl}`);
  console.log(`Local:    http://127.0.0.1:${svc.config.port}`);
  console.log(`Database: ${svc.config.dbPath}`);
  console.log('');
  console.log('Tip: run the Master desktop app for the normal GUI.');
  console.log('');

  function shutdown() {
    svc.close().then(() => process.exit(0));
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
