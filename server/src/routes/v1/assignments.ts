import { Elysia, t } from 'elysia';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { httpError } from '../../lib/http-error.ts';
import { nowIso } from '../../lib/time.ts';
import { isStageKey } from '../../lib/stages.ts';
import {
  asNumber,
  assertClassReadable,
  assertClassTeacher,
  assertClassWritable,
  getClassById,
  requireUser,
  writeAudit
} from '../_helpers.ts';

export const assignmentsRoutes = new Elysia({ name: 'assignmentsRoutes' })
/* =========================================================
   * Assignments
   * ========================================================= */
  .post(
    '/classes/:classId/assignments',
    async (ctx) => {
      const classId = asNumber((ctx.params as any).classId);
      const me = requireUser((ctx as any).user);
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, classId);
      const cls = await getClassById(ctx as any, classId);
      assertClassWritable(cls);
      const { stageKey, type, title, description, deadline } = ctx.body as any;
      if (!isStageKey(stageKey)) throw httpError.badRequest('Invalid stageKey');
      const { db, schema } = ctx as any;
      const a = await db
        .insert(schema.assignments)
        .values({ classId, stageKey, type, title, description: description ?? null, deadline, createdBy: me.id })
        .returning()
        .get();
      await writeAudit(ctx as any, { action: 'assignment.create', targetTable: 'assignments', targetId: a?.id ?? '0', classId, after: a });
      return a;
    },
    {
      body: t.Object({
        stageKey: t.String(),
        type: t.Union([t.Literal('individual'), t.Literal('team')]),
        title: t.String(),
        description: t.Optional(t.String()),
        deadline: t.String(),
      }),
    },
  )
  .get('/classes/:classId/assignments', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    await assertClassReadable(ctx as any, classId);
    const { db, schema } = ctx as any;
    const rows = await db
      .select()
      .from(schema.assignments)
      .where(and(eq(schema.assignments.classId, classId), isNull(schema.assignments.deletedAt)))
      .orderBy(desc(schema.assignments.id))
      .all();
    return rows;
  })
  .get('/assignments/:assignmentId', async (ctx) => {
    const id = asNumber((ctx.params as any).assignmentId);
    const { db, schema } = ctx as any;
    const row = await db
      .select()
      .from(schema.assignments)
      .where(and(eq(schema.assignments.id, id), isNull(schema.assignments.deletedAt)))
      .get();
    if (!row) throw httpError.notFound('Assignment not found');
    await assertClassReadable(ctx as any, row.classId);
    return row;
  })
  .patch(
    '/assignments/:assignmentId',
    async (ctx) => {
      const id = asNumber((ctx.params as any).assignmentId);
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      const before = await db
        .select()
        .from(schema.assignments)
        .where(and(eq(schema.assignments.id, id), isNull(schema.assignments.deletedAt)))
        .get();
      if (!before) throw httpError.notFound('Assignment not found');
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, before.classId);
      const cls = await getClassById(ctx as any, before.classId);
      assertClassWritable(cls);
      const b = ctx.body as any;
      if (b.stageKey && !isStageKey(b.stageKey)) throw httpError.badRequest('Invalid stageKey');
      await db
        .update(schema.assignments)
        .set({
          stageKey: b.stageKey ?? before.stageKey,
          type: b.type ?? before.type,
          title: b.title ?? before.title,
          description: b.description ?? before.description,
          deadline: b.deadline ?? before.deadline,
        })
        .where(eq(schema.assignments.id, id));
      const after = await db.select().from(schema.assignments).where(eq(schema.assignments.id, id)).get();
      await writeAudit(ctx as any, { action: 'assignment.update', targetTable: 'assignments', targetId: id, before, after, classId: before.classId });
      return after;
    },
    { body: t.Partial(t.Object({ stageKey: t.String(), type: t.Union([t.Literal('individual'), t.Literal('team')]), title: t.String(), description: t.String(), deadline: t.String() })) },
  )
  .delete('/assignments/:assignmentId', async (ctx) => {
    const id = asNumber((ctx.params as any).assignmentId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const before = await db
      .select()
      .from(schema.assignments)
      .where(and(eq(schema.assignments.id, id), isNull(schema.assignments.deletedAt)))
      .get();
    if (!before) throw httpError.notFound('Assignment not found');
    if (me.role !== 'admin') await assertClassTeacher(ctx as any, before.classId);
    const cls = await getClassById(ctx as any, before.classId);
    assertClassWritable(cls);
    await db.update(schema.assignments).set({ deletedAt: nowIso() }).where(eq(schema.assignments.id, id));
    await writeAudit(ctx as any, { action: 'assignment.delete', targetTable: 'assignments', targetId: id, before, classId: before.classId });
    return { ok: true };
  });
