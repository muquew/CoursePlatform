import { Elysia, t } from 'elysia';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { httpError } from '../../lib/http-error.ts';
import { nowIso } from '../../lib/time.ts';
import {
  asNumber,
  assertClassReadable,
  assertClassTeacher,
  assertClassWritable,
  assertProjectReadable,
  assertTeamLeader,
  getActiveTeamInClassForStudent,
  getClassById,
  getProjectById,
  getTeamById,
  notify,
  requireUser,
  writeAudit
} from '../_helpers.ts';

export const projectsRoutes = new Elysia({ name: 'projectsRoutes' })
/* =========================================================
   * Projects
   * ========================================================= */
  .post(
    '/teams/:teamId/projects',
    async (ctx) => {
      // Team-scoped project draft creation.
      const teamId = asNumber((ctx.params as any).teamId);
      const team = await assertTeamLeader(ctx as any, teamId);
      const cls = await getClassById(ctx as any, team.classId);
      assertClassWritable(cls);
      const { sourceType, caseId, name, background, techStack } = ctx.body as any;
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;

      const existing = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(and(eq(schema.projects.teamId, teamId), isNull(schema.projects.deletedAt)))
        .get();
      if (existing) throw httpError.badRequest('Project already exists for this team');

      const p = await db
        .insert(schema.projects)
        .values({
          teamId,
          classId: team.classId,
          sourceType,
          caseId: caseId ?? null,
          name,
          background: background ?? null,
          techStack: techStack ?? null,
          status: 'draft',
          createdBy: me.id,
        })
        .returning()
        .get();
      if (!p) throw httpError.internal('Failed');
      await writeAudit(ctx as any, { action: 'project.create', targetTable: 'projects', targetId: p.id, after: p, classId: team.classId, teamId, projectId: p.id });
      return p;
    },
    {
      body: t.Object({
        sourceType: t.Union([t.Literal('case_library'), t.Literal('custom')]),
        caseId: t.Optional(t.Number()),
        name: t.String(),
        background: t.Optional(t.String()),
        techStack: t.Optional(t.String()),
      }),
    },
  )
  .get('/classes/:classId/projects', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    await assertClassReadable(ctx as any, classId);

    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const q = ctx.query as any;

    const where: any[] = [eq(schema.projects.classId, classId), isNull(schema.projects.deletedAt)];
    if (q?.status) where.push(eq(schema.projects.status, q.status));

    // Students can only see their own team project in the class
    if (me.role === 'student') {
      const teamId = await getActiveTeamInClassForStudent(ctx as any, classId, me.id);
      if (!teamId) return [];
      where.push(eq(schema.projects.teamId, teamId));
    } else if (q?.teamId) {
      where.push(eq(schema.projects.teamId, Number(q.teamId)));
    }

    return await db
      .select()
      .from(schema.projects)
      .where(and(...where))
      .orderBy(desc(schema.projects.id))
      .all();
  })
  .get('/projects/:projectId', async (ctx) => {
    const projectId = asNumber((ctx.params as any).projectId);
    const p = await assertProjectReadable(ctx as any, projectId);
    const { db, schema } = ctx as any;
    const stages = await db
      .select()
      .from(schema.projectStages)
      .where(and(eq(schema.projectStages.projectId, projectId), isNull(schema.projectStages.deletedAt)))
      .orderBy(asc(schema.projectStages.order))
      .all();
    return { ...p, stages };
  })
  .patch(
    '/projects/:projectId',
    async (ctx) => {
      const projectId = asNumber((ctx.params as any).projectId);
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      const p = await getProjectById(ctx as any, projectId);
      await assertClassReadable(ctx as any, p.classId);

      const team = await getTeamById(ctx as any, p.teamId);
      if (me.role !== 'admin') {
        if (me.role !== 'student' || team.leaderId !== me.id) throw httpError.forbidden('Leader required');
      }
      if (p.status !== 'draft' && p.status !== 'rejected') throw httpError.badRequest('Only draft or rejected can be edited');

      const b = ctx.body as any;
      const before = p;
      await db
        .update(schema.projects)
        .set({
          name: b.name ?? p.name,
          background: b.background ?? p.background,
          techStack: b.techStack ?? p.techStack,
          sourceType: b.sourceType ?? p.sourceType,
          caseId: b.caseId ?? p.caseId,
        })
        .where(eq(schema.projects.id, projectId));
      const after = await getProjectById(ctx as any, projectId);
      await writeAudit(ctx as any, { action: 'project.update', targetTable: 'projects', targetId: projectId, before, after, classId: p.classId, teamId: p.teamId, projectId });
      return after;
    },
    { body: t.Partial(t.Object({ sourceType: t.Union([t.Literal('case_library'), t.Literal('custom')]), caseId: t.Number(), name: t.String(), background: t.String(), techStack: t.String() })) },
  )
  .post('/projects/:projectId/submit', async (ctx) => {
    const projectId = asNumber((ctx.params as any).projectId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const p = await getProjectById(ctx as any, projectId);
    await assertClassReadable(ctx as any, p.classId);
    const team = await getTeamById(ctx as any, p.teamId);
    if (me.role !== 'admin') {
      if (me.role !== 'student' || team.leaderId !== me.id) throw httpError.forbidden('Leader required');
    }
    const cls = await getClassById(ctx as any, p.classId);
    assertClassWritable(cls);
    if (p.status !== 'draft' && p.status !== 'rejected') throw httpError.badRequest('Cannot submit');
    const before = p;
    await db.update(schema.projects).set({ status: 'submitted', submittedAt: nowIso() }).where(eq(schema.projects.id, projectId));
    const after = await getProjectById(ctx as any, projectId);
    await writeAudit(ctx as any, { action: 'project.submit', targetTable: 'projects', targetId: projectId, before, after, classId: p.classId, teamId: p.teamId, projectId });
    return after;
  })
  .post(
    '/projects/:projectId/reviews',
    async (ctx) => {
      const projectId = asNumber((ctx.params as any).projectId);
      const me = requireUser((ctx as any).user);
      const { decision, feedback } = ctx.body as any;
      const { db, schema } = ctx as any;
      const p = await getProjectById(ctx as any, projectId);
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, p.classId);
      const cls = await getClassById(ctx as any, p.classId);
      assertClassWritable(cls);
      if (p.status !== 'submitted') throw httpError.badRequest('Project is not submitted');

      const before = p;
      const nextStatus = decision === 'approved' ? 'active' : 'rejected';
      await db
        .update(schema.projects)
        .set({
          status: nextStatus,
          reviewedAt: nowIso(),
          reviewedBy: me.id,
          reviewFeedback: feedback ?? null,
        })
        .where(eq(schema.projects.id, projectId));
      const after = await getProjectById(ctx as any, projectId);
      await writeAudit(ctx as any, { action: `project.review.${decision}`, targetTable: 'projects', targetId: projectId, before, after, classId: p.classId, teamId: p.teamId, projectId });

      // Notify team members
      const members = await db
        .select({ userId: schema.teamMembers.studentId })
        .from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.teamId, p.teamId), eq(schema.teamMembers.isActive, true), isNull(schema.teamMembers.deletedAt)))
        .all();
      for (const m of members) {
        await notify(ctx as any, m.userId, {
          type: 'project.review',
          title: `Project ${decision}`,
          message: feedback ?? null,
          payload: { projectId, decision },
        });
      }
      return after;
    },
    { body: t.Object({ decision: t.Union([t.Literal('approved'), t.Literal('rejected')]), feedback: t.Optional(t.String()) }) },
  );
