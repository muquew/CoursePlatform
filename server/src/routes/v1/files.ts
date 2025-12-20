import { Elysia } from 'elysia';
import { and, eq, isNull } from 'drizzle-orm';
import { httpError } from '../../lib/http-error.ts';
import { makeDownloadName } from '../../lib/file-storage.ts';
import { asNumber, assertClassReadable, assertClassWritable, getClassById, requireUser } from '../_helpers.ts';
import { STORAGE_ROOT } from './_constants.ts';
import { createFileRows, parseUploads } from './_uploads.ts';

export const filesRoutes = new Elysia({ name: 'filesRoutes' })
/* =========================================================
   * Files
   * ========================================================= */
  .get('/files/:fileId/download', async (ctx) => {
    const id = asNumber((ctx.params as any).fileId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const file = await db
      .select()
      .from(schema.files)
      .where(and(eq(schema.files.id, id), isNull(schema.files.deletedAt)))
      .get();
    if (!file) throw httpError.notFound('File not found');
    await assertClassReadable(ctx as any, file.classId);
    const cls = await getClassById(ctx as any, file.classId);
    if (cls.status === 'archived' && me.role === 'student' && !cls.allowStudentDownloadAfterArchived) {
      throw httpError.forbidden('Downloads disabled for archived classes');
    }
    const fullPath = `${STORAGE_ROOT}/${file.storagePath}`;
    const bunFile = Bun.file(fullPath);
    if (!(await bunFile.exists())) throw httpError.notFound('File not found on disk');
    return new Response(bunFile, {
      headers: {
        'content-type': file.mime || 'application/octet-stream',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(makeDownloadName(file.originalName))}`,
      },
    });
  })
  .post('/classes/:classId/upload', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    const me = requireUser((ctx as any).user);
    await assertClassReadable(ctx as any, classId);
    const cls = await getClassById(ctx as any, classId);
    assertClassWritable(cls);
    
    const { request } = ctx as any;
    const { files: webFiles } = await parseUploads(request);
    if (webFiles.length === 0) throw httpError.badRequest('No files uploaded');

    const fileRows = await createFileRows(ctx as any, classId, me.id, webFiles);
    return fileRows;
  });
