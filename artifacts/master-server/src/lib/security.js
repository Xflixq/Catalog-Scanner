import crypto from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 32 };

/** @type {Map<string, { count: number, resetAt: number }>} */
const rateBuckets = new Map();

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keyLen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts[0] !== 'scrypt' || parts.length !== 6) return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], 'hex');
    const expected = Buffer.from(parts[5], 'hex');
    const actual = crypto.scryptSync(String(password), salt, expected.length, { N, r, p });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function hashToken(value, pepper) {
  return crypto.createHmac('sha256', String(pepper || 'dtm')).update(String(value)).digest('hex');
}

export function hashNfcUid(uid, pepper) {
  const normalized = String(uid || '')
    .replace(/[^0-9a-fA-F]/g, '')
    .toLowerCase();
  if (normalized.length < 6) throw new Error('NFC identifier is too short');
  return hashToken(`nfc:${normalized}`, pepper);
}

export function randomCode(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function isLoopback(req) {
  const raw = String(req.socket?.remoteAddress || req.ip || '');
  return raw === '127.0.0.1' || raw === '::1' || raw === '::ffff:127.0.0.1' || raw.endsWith('127.0.0.1');
}

export function rateLimit(key, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export function hasPermission(rolePermissions, permission) {
  const list = Array.isArray(rolePermissions) ? rolePermissions : [];
  return list.includes(permission) || list.includes('*');
}
