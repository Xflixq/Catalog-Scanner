import os from 'node:os';

export function getLanIPv4Addresses() {
  const nets = os.networkInterfaces();
  /** @type {string[]} */
  const out = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        out.push(entry.address);
      }
    }
  }
  return out;
}

export function pickPrimaryLanIp() {
  const ips = getLanIPv4Addresses();
  // Prefer common private ranges
  const preferred =
    ips.find((ip) => ip.startsWith('192.168.')) ||
    ips.find((ip) => ip.startsWith('10.')) ||
    ips.find((ip) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) ||
    ips[0] ||
    '127.0.0.1';
  return preferred;
}
