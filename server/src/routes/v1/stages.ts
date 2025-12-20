import { Elysia, t } from 'elysia';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { httpError } from '../../lib/http-error.ts';
import { nowIso } from '../../lib/time.ts';
import { STAGE_ORDER, isStageKey } from '../../lib/stages.ts';
import {
  asNumber,
  assertClassReadable,
  assertClassTeacher,
  assertClassWritable,
  assertProjectReadable,
  getClassById,
  getProjectById,
  getTeamById,
  isTeacherOfClass,
  requireUser,
  writeAudit
} from '../_helpers.ts';

export const stagesRoutes = new Elysia({ name: 'stagesRoutes' })
/* =========================================================
   * Stages
   * ========================================================= */
  .get('/projects/:projectId/stages', async (ctx) => {
    const projectId = asNumber((ctx.params as any).projectId);
    const p = await assertProjectReadable(ctx as any, projectId);
    const { db, schema } = ctx as any;
    const stages = await db
      .select()
      .from(schema.projectStages)
      .where(and(eq(schema.projectStages.projectId, projectId), isNull(schema.projectStages.deletedAt)))
      .orderBy(asc(schema.projectStages.order))
      .all();
    return { projectId, classId: p.classId, teamId: p.teamId, stages };
  })
  .patch(
    '/projects/:projectId/stages/:stageKey',
    async (ctx) => {
      const projectId = asNumber((ctx.params as any).projectId);
      const stageKey = (ctx.params as any).stageKey as string;
      if (!isStageKey(stageKey)) throw httpError.badRequest('Invalid stageKey');
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      const p = await getProjectById(ctx as any, projectId);
      await assertClassReadable(ctx as any, p.classId);
      const cls = await getClassById(ctx as any, p.classId);
      assertClassWritable(cls);

      const stage = await db
        .select()
        .from(schema.projectStages)
        .where(and(eq(schema.projectStages.projectId, projectId), eq(schema.projectStages.key, stageKey), isNull(schema.projectStages.deletedAt)))
        .get();
      if (!stage) throw httpError.notFound('Stage not found');

      const { status } = ctx.body as any;
      const allowed = ['locked', 'open', 'passed'];
      if (!allowed.includes(status)) throw httpError.badRequest('Invalid stage status');

      if (me.role === 'student') {
        const team = await getTeamById(ctx as any, p.teamId);
        if (team.leaderId !== me.id) throw httpError.forbidden('Leader required');
        // leader can only mark current open stage as passed
        if (status !== 'passed' || stage.status !== 'open') throw httpError.forbidden('Invalid transition');
      } else if (me.role === 'teacher') {
        const ok = await isTeacherOfClass(ctx as any, p.classId, me.id);
        if (!ok) throw httpError.forbidden('Not a teacher of this class');
      }

      const before = stage;
      const ts = nowIso();

      await db
        .update(schema.projectStages)
        .set({
          status,
          openedAt: status === 'open' ? ts : stage.openedAt,
          passedAt: status === 'passed' ? ts : stage.passedAt,
        })
        .where(eq(schema.projectStages.id, stage.id));

      // If a stage is passed, automatically open the next stage (if still locked)
      if (status === 'passed') {
        const next = await db
          .select()
          .from(schema.projectStages)
          .where(
            and(
              eq(schema.projectStages.projectId, projectId),
              eq(schema.projectStages.order, (stage as any).order + 1),
              isNull(schema.projectStages.deletedAt),
            ),
          )
          .get();
        if (next && (next as any).status === 'locked') {
          await db
            .update(schema.projectStages)
            .set({ status: 'open', openedAt: (next as any).openedAt ?? ts })
            .where(eq(schema.projectStages.id, (next as any).id));
        }
      }
      const after = await db
        .select()
        .from(schema.projectStages)
        .where(eq(schema.projectStages.id, stage.id))
        .get();
      await writeAudit(ctx as any, { action: 'stage.update', targetTable: 'project_stages', targetId: stage.id, before, after, classId: p.classId, teamId: p.teamId, projectId });
      return after;
    },
    { body: t.Object({ status: t.Union([t.Literal('locked'), t.Literal('open'), t.Literal('passed')]) }) },
  )
  .post(
    '/projects/:projectId/stages/:stageKey/rollback',
    async (ctx) => {
      const projectId = asNumber((ctx.params as any).projectId);
      const me = requireUser((ctx as any).user);
      const stageKey = (ctx.params as any).stageKey as string;
      if (!isStageKey(stageKey)) throw httpError.badRequest('Invalid stageKey');
      const { db, schema } = ctx as any;
      const p = await getProjectById(ctx as any, projectId);
      await assertClassReadable(ctx as any, p.classId);
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, p.classId);
      const cls = await getClassById(ctx as any, p.classId);
      assertClassWritable(cls);

      const targetOrder = STAGE_ORDER[stageKey];
      const stages = await db
        .select()
        .from(schema.projectStages)
        .where(and(eq(schema.projectStages.projectId, projectId), isNull(schema.projectStages.deletedAt)))
        .orderBy(asc(schema.projectStages.order))
        .all();
      if (stages.length === 0) throw httpError.badRequest('No stages');
      const target = stages.find((s: any) => s.key === stageKey);
      if (!target) throw httpError.notFound('Stage not found');

      // reset: < target => passed; target => open; > target => locked
      for (const s of stages) {
        const nextStatus = s.order < targetOrder ? 'passed' : s.order === targetOrder ? 'open' : 'locked';
        await db
          .update(schema.projectStages)
          .set({ status: nextStatus, lastRollbackAt: nowIso(), openedAt: nextStatus === 'open' ? nowIso() : s.openedAt, passedAt: nextStatus === 'passed' ? nowIso() : null })
          .where(eq(schema.projectStages.id, s.id));
      }
      await writeAudit(ctx as any, { action: 'stage.rollback', targetTable: 'projects', targetId: projectId, classId: p.classId, teamId: p.teamId, projectId, after: { stageKey } });
      const afterStages = await db
        .select()
        .from(schema.projectStages)
        .where(and(eq(schema.projectStages.projectId, projectId), isNull(schema.projectStages.deletedAt)))
        .orderBy(asc(schema.projectStages.order))
        .all();
      return { ok: true, stages: afterStages };
    },
  );
