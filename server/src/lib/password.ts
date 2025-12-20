import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Password hashing utilities.
 *
 * Why scrypt:
 * - Available in Node/Bun without extra deps
 * - Memory-hard; suitable for password storage
 *
 * Stored format (string):
 *   scrypt$N$r$p$saltB64$hashB64
 */

export type ScryptParams = {
  N: number;
  r: number;
  p: number;
  dkLen: number;
  saltLen: number;
};

export const DEFAULT_SCRYPT: ScryptParams = {
  // Reasonable baseline for server-side login.
  // You can tune via env in your route/service layer.
  N: 1 << 15, // 32768
  r: 8,
  p: 1,
  dkLen: 32,
  saltLen: 16,
};

function b64(s: Buffer) {
  return s.toString('base64');
}

function unb64(s: string) {
  return Buffer.from(s, 'base64');
}

export function hashPassword(plain: string, params: Partial<ScryptParams> = {}): string {
  if (typeof plain !== 'string' || plain.length === 0) throw new Error('password must be non-empty');
  const p = { ...DEFAULT_SCRYPT, ...params };
  const salt = randomBytes(p.saltLen);
  const hash = scryptSync(plain, salt, p.dkLen, { N: p.N, r: p.r, p: p.p, maxmem: 256 * 1024 * 1024 });
  return `scrypt$${p.N}$${p.r}$${p.p}$${b64(salt)}$${b64(hash)}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  try {
    if (!stored || typeof stored !== 'string') return false;
    const parts = stored.split('$');
    const algo = parts[0];
    const nStr = parts[1];
    const rStr = parts[2];
    const pStr = parts[3];
    const saltB64 = parts[4];
    const hashB64 = parts[5];
    if (!algo || !nStr || !rStr || !pStr || !saltB64 || !hashB64 || parts.length !== 6) return false;
    if (algo !== 'scrypt') return false;

    const N = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

    const salt = unb64(saltB64);
    const expected = unb64(hashB64);
    const actual = scryptSync(plain, salt, expected.length, { N, r, p, maxmem: 256 * 1024 * 1024 });

    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function isPasswordHash(value: string): boolean {
  return typeof value === 'string' && value.startsWith('scrypt$');
}

/**
 * Decide whether an existing stored hash should be rehashed using `target` params.
 * - Useful for gradually increasing N/r/p over time.
 */
export function needsPasswordRehash(stored: string, target: Partial<ScryptParams> = {}): boolean {
  if (!isPasswordHash(stored)) return true;
  const p = { ...DEFAULT_SCRYPT, ...target };
  const parts = stored.split('$');
  const nStr = parts[1];
  const rStr = parts[2];
  const pStr = parts[3];
  if (!nStr || !rStr || !pStr || parts.length !== 6) return true;
  const N = Number(nStr);
  const r = Number(rStr);
  const pp = Number(pStr);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(pp)) return true;
  return N !== p.N || r !== p.r || pp !== p.p;
}
