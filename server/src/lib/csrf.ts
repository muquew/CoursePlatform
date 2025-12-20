import { sha256Hex, timingSafeEqualHex } from './crypto.ts';

/**
 * CSRF helper described in ROUTES.md:
 * when CSRF_ENABLED=1, require `x-csrf-token=sha256(<bearer-token>)` for writes.
 */

export function makeCsrfToken(bearerToken: string): string {
  return sha256Hex(bearerToken);
}

export function verifyCsrfToken(bearerToken: string, csrfHeader: string | undefined | null): boolean {
  if (!bearerToken) return false;
  const expected = makeCsrfToken(bearerToken);
  const got = (csrfHeader ?? '').trim();
  if (!got) return false;
  // timing-safe
  return timingSafeEqualHex(expected, got);
}
