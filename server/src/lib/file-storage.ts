import { createHash } from 'crypto';
import { randomId } from './crypto.ts';
import { nowIso } from './time.ts';

/**
 * File storage helpers aligning with REQUIRE.md 5.3:
 * - Physical file name must be UUID/timestamp-based
 * - Never use user-provided originalName as storagePath
 */

export type FileMeta = {
  storagePath: string;
  originalName: string;
  mime?: string;
  size?: number;
  sha256?: string;
};

/**
 * Build a storage path like:
 *   files/2025/12/17/<randomId>
 */
export function makeStoragePath(prefix = 'files'): string {
  const d = new Date();
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${prefix}/${yyyy}/${mm}/${dd}/${randomId()}`;
}

export function sha256HexOfBytes(bytes: ArrayBuffer | Uint8Array | Buffer): string {
  const buf = bytes instanceof ArrayBuffer ? Buffer.from(bytes) : Buffer.from(bytes as any);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Create FileMeta for DB insertion.
 */
export function buildFileMeta(input: {
  originalName: string;
  bytes?: ArrayBuffer | Uint8Array | Buffer;
  mime?: string;
  size?: number;
  storagePrefix?: string;
}): FileMeta {
  const storagePath = makeStoragePath(input.storagePrefix);
  const sha256 = input.bytes ? sha256HexOfBytes(input.bytes) : undefined;
  return {
    storagePath,
    originalName: input.originalName,
    mime: input.mime,
    size: input.size,
    sha256,
  };
}

/**
 * Convenience: tag file names for downloads (non-physical), keeping the original name.
 */
export function makeDownloadName(originalName: string): string {
  // Some clients choke on empty names.
  const name = (originalName ?? '').trim();
  if (name) return name;
  return `file-${nowIso()}`;
}
