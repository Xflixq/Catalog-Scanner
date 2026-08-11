import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_PORT = 47821;

export function getDataDir() {
  if (process.env.CATALOG_SCANNER_DATA_DIR) {
    return path.resolve(process.env.CATALOG_SCANNER_DATA_DIR);
  }
  if (process.platform === 'win32') {
    const base = process.env.PROGRAMDATA || 'C:\\ProgramData';
    return path.join(base, 'CatalogScanner');
  }
  return path.join(os.homedir(), '.catalog-scanner');
}

export function loadConfig() {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const configPath = path.join(dataDir, 'config.json');
  /** @type {{ port: number, dbPath: string, host: string }} */
  let config = {
    port: Number(process.env.PORT || DEFAULT_PORT),
    dbPath: path.join(dataDir, 'catalog.sqlite'),
    host: '0.0.0.0',
  };
  if (fs.existsSync(configPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...config, ...saved };
    } catch {
      // keep defaults
    }
  }
  if (process.env.CATALOG_SCANNER_DB_PATH) {
    config.dbPath = path.resolve(process.env.CATALOG_SCANNER_DB_PATH);
  }
  if (process.env.PORT) {
    config.port = Number(process.env.PORT);
  }
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return { ...config, dataDir, configPath };
}

export function saveConfig(partial) {
  const current = loadConfig();
  const next = {
    port: partial.port ?? current.port,
    dbPath: partial.dbPath ?? current.dbPath,
    host: partial.host ?? current.host,
  };
  fs.writeFileSync(current.configPath, JSON.stringify(next, null, 2));
  return { ...next, dataDir: current.dataDir, configPath: current.configPath };
}
