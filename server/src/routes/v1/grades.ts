import { Elysia, t } from 'elysia';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { httpError } from '../../lib/http-error.ts';
import { nowIso } from '../../lib/time.ts';
import {
  asNumber,
  assertClassTeacher,
  assertClassWritable,
  assertProjectReadable,
  getActiveTeamInClassForStudent,
  getClassById,
  notify,
  parseJsonOr,
  requireUser,
  writeAudit
} from '../_helpers.ts';

export const gradesRoutes = new Elysia({ name: 'gradesRoutes' })
/* =========================================================
   * Grades
   * ========================================================= */
  .put(
    '/submissions/:submissionId/grade',
    async (ctx) => {
      const subId = asNumber((ctx.params as any).submissionId);
      const me = requireUser((ctx as any).user);
      const { score, feedback, rubric } = ctx.body as any;
      const { db, schema } = ctx as any;
      const sub = await db
        .select()
        .from(schema.submissions)
        .where(and(eq(schema.submissions.id, subId), isNull(schema.submissions.deletedAt)))
        .get();
      if (!sub) throw httpError.notFound('Submission not found');
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, sub.classId);
      const cls = await getClassById(ctx as any, sub.classId);
      assertClassWritable(cls);

      const before = await db
        .select()
        .from(schema.grades)
        .where(and(eq(schema.grades.submissionId, subId), isNull(schema.grades.deletedAt)))
        .get();

      await db
        .insert(schema.grades)
        .values({ submissionId: subId, graderId: me.id, score, feedback: feedback ?? null, rubricJson: JSON.stringify(rubric ?? {}) })
        .onConflictDoUpdate({
          target: schema.grades.submissionId,
          set: { graderId: me.id, score, feedback: feedback ?? null, rubricJson: JSON.stringify(rubric ?? {}), gradedAt: nowIso(), deletedAt: null },
        });
      const after = await db.select().from(schema.grades).where(eq(schema.grades.submissionId, subId)).get();
      await writeAudit(ctx as any, { action: 'grade.upsert', targetTable: 'grades', targetId: subId, before, after, classId: sub.classId, teamId: sub.teamId, projectId: sub.projectId });
      
      // Notify students
      const targetUserIds: number[] = [];
      if (sub.teamId) {
        const members = await db
          .select({ id: schema.teamMembers.studentId })
          .from(schema.teamMembers)
          .where(and(eq(schema.teamMembers.teamId, sub.teamId), eq(schema.teamMembers.isActive, true)))
          .all();
        targetUserIds.push(...members.map((m: any) => m.id));
      } else {
        targetUserIds.push(sub.submitterId);
      }

      for (const uid of new Set(targetUserIds)) {
        await notify(ctx as any, uid, {
          title: 'New Grade',
          message: `You have received a new grade for submission ${subId}. Score: ${score}`,
          type: 'grade',
          payload: { refId: subId }
        });
      }

      return after;
    },
    { body: t.Object({ score: t.Number(), feedback: t.Optional(t.String()), rubric: t.Optional(t.Any()) }) },
  )
  .get('/me/grades', async (ctx) => {
    const me = requireUser((ctx as any).user);
    if (me.role !== 'student') throw httpError.forbidden('Student required');
    const { db, schema } = ctx as any;
    const teamIds = (await db
      .select({ teamId: schema.teamMembers.teamId })
      .from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.studentId, me.id), eq(schema.teamMembers.isActive, true), isNull(schema.teamMembers.deletedAt)))
      .all()).map((r: any) => r.teamId);

    const rows = await db
      .select({
        g: schema.grades,
        s: schema.submissions,
        a: schema.assignments,
      })
      .from(schema.grades)
      .innerJoin(schema.submissions, eq(schema.submissions.id, schema.grades.submissionId))
      .innerJoin(schema.assignments, eq(schema.assignments.id, schema.submissions.assignmentId))
      .where(
        and(
          isNull(schema.grades.deletedAt),
          isNull(schema.submissions.deletedAt),
          isNull(schema.assignments.deletedAt),
          or(
            eq(schema.submissions.submitterId, me.id),
            teamIds.length ? inArray(schema.submissions.teamId, teamIds) : undefined,
          ),
        ),
      )
      .orderBy(desc(schema.grades.gradedAt))
      .all();
    return rows.map((r: any) => ({ ...r.g, submission: r.s, assignment: r.a, rubric: parseJsonOr(r.g.rubricJson, {}) }));
  })
  .get('/projects/:projectId/grades', async (ctx) => {
    const projectId = asNumber((ctx.params as any).projectId);
    const p = await assertProjectReadable(ctx as any, projectId);
    const me = requireUser((ctx as any).user);
    if (me.role === 'student') {
      const teamId = await getActiveTeamInClassForStudent(ctx as any, p.classId, me.id);
      if (teamId !== p.teamId) throw httpError.forbidden('Access denied');
    }
    const { db, schema } = ctx as any;
    const rows = await db
      .select({
        g: schema.grades,
        s: schema.submissions,
        a: schema.assignments,
      })
      .from(schema.submissions)
      .leftJoin(schema.grades, eq(schema.grades.submissionId, schema.submissions.id))
      .innerJoin(schema.assignments, eq(schema.assignments.id, schema.submissions.assignmentId))
      .where(and(eq(schema.submissions.projectId, projectId), isNull(schema.submissions.deletedAt), isNull(schema.assignments.deletedAt)))
      .orderBy(desc(schema.submissions.id))
      .all();
    return rows.map((r: any) => ({ submission: r.s, assignment: r.a, grade: r.g ? { ...r.g, rubric: parseJsonOr(r.g.rubricJson, {}) } : null }));
  })
  .get('/assignments/:assignmentId/grades', async (ctx) => {
    const assignmentId = asNumber((ctx.params as any).assignmentId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const assignment = await db
      .select()
      .from(schema.assignments)
      .where(and(eq(schema.assignments.id, assignmentId), isNull(schema.assignments.deletedAt)))
      .get();
    if (!assignment) throw httpError.notFound('Assignment not found');
    if (me.role !== 'admin') await assertClassTeacher(ctx as any, assignment.classId);
    const rows = await db
      .select({
        g: schema.grades,
        s: schema.submissions,
      })
      .from(schema.submissions)
      .leftJoin(schema.grades, eq(schema.grades.submissionId, schema.submissions.id))
      .where(and(eq(schema.submissions.assignmentId, assignmentId), isNull(schema.submissions.deletedAt)))
      .orderBy(desc(schema.submissions.id))
      .all();
    return rows.map((r: any) => ({ submission: r.s, grade: r.g ? { ...r.g, rubric: parseJsonOr(r.g.rubricJson, {}) } : null }));
  });
