import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';

/**
 * sha256 -> hex string
 */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * sha256 -> base64url (no padding)
 */
export function sha256Base64Url(input: string): string {
  const b64 = createHash('sha256').update(input).digest('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Random id for request / trace correlation.
 * - Prefer crypto.randomUUID when available
 * - Fallback to 16-byte hex
 */
export function randomId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return typeof randomUUID === 'function' ? randomUUID() : randomBytes(16).toString('hex');
  } catch {
    return randomBytes(16).toString('hex');
  }
}

/**
 * timing-safe compare for hex strings (same length required).
 */
export function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  if (aHex.length !== bHex.length) return false;
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
