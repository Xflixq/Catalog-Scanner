import crypto from 'node:crypto';

export function nowIso() {
  return new Date().toISOString();
}

export function makeId() {
  return crypto.randomUUID();
}

export function makeLoginCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
