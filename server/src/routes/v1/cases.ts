import { Elysia, t } from 'elysia';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { httpError } from '../../lib/http-error.ts';
import { nowIso } from '../../lib/time.ts';
import {
  asNumber,
  assertClassReadable,
  assertClassTeacher,
  assertClassWritable,
  getClassById,
  requireUser,
  writeAudit
} from '../_helpers.ts';

export const casesRoutes = new Elysia({ name: 'casesRoutes' })
/* =========================================================
   * Case Library
   * ========================================================= */
  .post(
    '/classes/:classId/cases',
    async (ctx) => {
      const classId = asNumber((ctx.params as any).classId);
      const me = requireUser((ctx as any).user);
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, classId);
      const cls = await getClassById(ctx as any, classId);
      assertClassWritable(cls);
      const { title, description, tags, attachmentFileIds } = ctx.body as any;
      const { db, schema } = ctx as any;
      const c = await db
        .insert(schema.caseLibrary)
        .values({ classId, createdBy: me.id, title, description: description ?? null, tags: tags ?? null, attachmentsJson: JSON.stringify(attachmentFileIds ?? []) })
        .returning()
        .get();
      if (!c) throw httpError.internal('Failed');
      await writeAudit(ctx as any, { action: 'case.create', targetTable: 'case_library', targetId: c.id, classId, after: c });
      return c;
    },
    { body: t.Object({ title: t.String(), description: t.Optional(t.String()), tags: t.Optional(t.String()), attachmentFileIds: t.Optional(t.Array(t.Number())) }) },
  )
  .get('/classes/:classId/cases', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    await assertClassReadable(ctx as any, classId);
    const { db, schema } = ctx as any;
    const rows = await db
      .select()
      .from(schema.caseLibrary)
      .where(and(eq(schema.caseLibrary.classId, classId), isNull(schema.caseLibrary.deletedAt)))
      .orderBy(desc(schema.caseLibrary.id))
      .all();
    return rows;
  })
  .get('/cases/:caseId', async (ctx) => {
    // Require login before revealing whether a case exists
    requireUser((ctx as any).user);
    const id = asNumber((ctx.params as any).caseId);
    const { db, schema } = ctx as any;
    const row = await db
      .select()
      .from(schema.caseLibrary)
      .where(and(eq(schema.caseLibrary.id, id), isNull(schema.caseLibrary.deletedAt)))
      .get();
    if (!row) throw httpError.notFound('Case not found');
    await assertClassReadable(ctx as any, row.classId);
    return row;
  })
  .patch(
    '/cases/:caseId',
    async (ctx) => {
      const id = asNumber((ctx.params as any).caseId);
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      const before = await db
        .select()
        .from(schema.caseLibrary)
        .where(and(eq(schema.caseLibrary.id, id), isNull(schema.caseLibrary.deletedAt)))
        .get();
      if (!before) throw httpError.notFound('Case not found');
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, before.classId);
      const cls = await getClassById(ctx as any, before.classId);
      assertClassWritable(cls);
      const b = ctx.body as any;
      await db
        .update(schema.caseLibrary)
        .set({
          title: b.title ?? before.title,
          description: b.description ?? before.description,
          tags: b.tags ?? before.tags,
          attachmentsJson: b.attachmentFileIds ? JSON.stringify(b.attachmentFileIds) : before.attachmentsJson,
        })
        .where(eq(schema.caseLibrary.id, id));
      const after = await db
        .select()
        .from(schema.caseLibrary)
        .where(eq(schema.caseLibrary.id, id))
        .get();
      await writeAudit(ctx as any, { action: 'case.update', targetTable: 'case_library', targetId: id, before, after, classId: before.classId });
      return after;
    },
    { body: t.Partial(t.Object({ title: t.String(), description: t.String(), tags: t.String(), attachmentFileIds: t.Array(t.Number()) })) },
  )
  .delete('/cases/:caseId', async (ctx) => {
    const id = asNumber((ctx.params as any).caseId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const before = await db
      .select()
      .from(schema.caseLibrary)
      .where(and(eq(schema.caseLibrary.id, id), isNull(schema.caseLibrary.deletedAt)))
      .get();
    if (!before) throw httpError.notFound('Case not found');
    if (me.role !== 'admin') await assertClassTeacher(ctx as any, before.classId);
    const cls = await getClassById(ctx as any, before.classId);
    assertClassWritable(cls);
    await db.update(schema.caseLibrary).set({ deletedAt: nowIso() }).where(eq(schema.caseLibrary.id, id));
    await writeAudit(ctx as any, { action: 'case.delete', targetTable: 'case_library', targetId: id, before, classId: before.classId });
    return { ok: true };
  });
