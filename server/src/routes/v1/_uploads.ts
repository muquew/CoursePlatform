import { buildFileMeta } from '../../lib/file-storage.ts';
import { STORAGE_ROOT } from './_constants.ts';

async function ensureDir(path: string) {
  // Bun: mkdir -p
  await Bun.$`mkdir -p ${path}`.quiet();
}

export async function saveWebFileToStorage(
  file: File,
  storagePath: string,
): Promise<{ bytes: Uint8Array; size: number }> {
  const ab = await file.arrayBuffer();
  const bytes = new Uint8Array(ab);
  const fullPath = `${STORAGE_ROOT}/${storagePath}`;
  const dir = fullPath.split('/').slice(0, -1).join('/');
  await ensureDir(dir);
  await Bun.write(fullPath, bytes);
  return { bytes, size: bytes.byteLength };
}

export async function parseUploads(request: Request): Promise<{ files: File[]; fields: Record<string, string> }> {
  const ct = request.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('multipart/form-data')) return { files: [], fields: {} };
  const fd = await request.formData();
  const files: File[] = [];
  const fields: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (v instanceof File) {
      // accept any file field name; common: file/files
      files.push(v);
    } else {
      fields[k] = String(v);
    }
  }
  return { files, fields };
}

export async function createFileRows(ctx: any, classId: number, uploadedBy: number, webFiles: File[]) {
  const { db, schema } = ctx;
  const rows: any[] = [];
  for (const f of webFiles) {
    const meta = buildFileMeta({ originalName: f.name, mime: f.type });
    const saved = await saveWebFileToStorage(f, meta.storagePath);
    meta.size = saved.size;
    meta.sha256 = buildFileMeta({ originalName: f.name, bytes: saved.bytes }).sha256;

    const inserted = await db
      .insert(schema.files)
      .values({
        storagePath: meta.storagePath,
        originalName: meta.originalName,
        mime: meta.mime ?? null,
        size: meta.size ?? null,
        sha256: meta.sha256 ?? null,
        uploadedBy,
        classId,
      })
      .returning()
      .get();
    if (inserted) rows.push(inserted);
  }
  return rows;
}
