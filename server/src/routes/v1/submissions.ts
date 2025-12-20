import { Elysia } from 'elysia';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { httpError } from '../../lib/http-error.ts';
import { nowIso } from '../../lib/time.ts';
import {
  asNumber,
  assertClassReadable,
  assertClassWritable,
  getActiveTeamInClassForStudent,
  getClassById,
  getTeamById,
  isTeacherOfClass,
  parseIsoToMs,
  requireUser,
  writeAudit
} from '../_helpers.ts';
import { parseUploads, createFileRows } from './_uploads.ts';

export const submissionsRoutes = new Elysia({ name: 'submissionsRoutes' })
/* =========================================================
   * Submissions
   * ========================================================= */
  .post('/assignments/:assignmentId/submissions', async (ctx) => {
    const assignmentId = asNumber((ctx.params as any).assignmentId);
    const me = requireUser((ctx as any).user);
    const { db, schema, request } = ctx as any;

    const assignment = await db
      .select()
      .from(schema.assignments)
      .where(and(eq(schema.assignments.id, assignmentId), isNull(schema.assignments.deletedAt)))
      .get();
    if (!assignment) throw httpError.notFound('Assignment not found');

    await assertClassReadable(ctx as any, assignment.classId);
    const cls = await getClassById(ctx as any, assignment.classId);
    assertClassWritable(cls);

    const activeTeamId = await getActiveTeamInClassForStudent(ctx as any, assignment.classId, me.id);
    if (!activeTeamId) throw httpError.badRequest('Not in a team');
    const team = await getTeamById(ctx as any, activeTeamId);

    if (assignment.type === 'team' && me.id !== team.leaderId) throw httpError.forbidden('Leader required');

    const project = await db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.teamId, team.id), isNull(schema.projects.deletedAt)))
      .get();
    if (!project || project.status !== 'active') throw httpError.badRequest('Project not active');

    const stage = await db
      .select()
      .from(schema.projectStages)
      .where(and(eq(schema.projectStages.projectId, project.id), eq(schema.projectStages.key, assignment.stageKey), isNull(schema.projectStages.deletedAt)))
      .get();
    if (!stage) throw httpError.badRequest('Stage not initialized');
    if (stage.status !== 'open') throw httpError.badRequest('Stage is not open');

    const late = parseIsoToMs(nowIso()) > parseIsoToMs(assignment.deadline);

    const logicalTeamId = assignment.type === 'team' ? team.id : null;
    const submitterId = me.id;

    const latest = await db
      .select({ v: sql<number>`max(version)` })
      .from(schema.submissions)
      .where(
        and(
          eq(schema.submissions.assignmentId, assignmentId),
          eq(schema.submissions.stageId, stage.id),
          eq(schema.submissions.projectId, project.id),
          logicalTeamId ? eq(schema.submissions.teamId, logicalTeamId) : sql`${schema.submissions.teamId} IS NULL`,
          eq(schema.submissions.submitterId, submitterId),
          isNull(schema.submissions.deletedAt),
        ),
      )
      .get();
    const nextVersion = (latest?.v ?? 0) + 1;

    const { files: webFiles, fields } = await parseUploads(request);
    const fileRows = await createFileRows(ctx as any, assignment.classId, submitterId, webFiles);
    const mainFileId = fileRows[0]?.id ?? null;

    const sub = await db
      .insert(schema.submissions)
      .values({
        assignmentId,
        stageId: stage.id,
        submitterId,
        teamId: logicalTeamId,
        classId: assignment.classId,
        projectId: project.id,
        version: nextVersion,
        isLate: late,
        fileId: mainFileId,
      })
      .returning()
      .get();
    if (!sub) throw httpError.internal('Failed');

    for (const fr of fileRows) {
      await db.insert(schema.submissionFiles).values({ submissionId: sub.id, fileId: fr.id, role: null });
    }

    await writeAudit(ctx as any, { action: 'submission.create', targetTable: 'submissions', targetId: sub.id, classId: assignment.classId, teamId: team.id, projectId: project.id, after: { ...sub, fields } });
    return { ...sub, files: fileRows };
  })
  .get('/assignments/:assignmentId/submissions', async (ctx) => {
    const assignmentId = asNumber((ctx.params as any).assignmentId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;

    const assignment = await db
      .select()
      .from(schema.assignments)
      .where(and(eq(schema.assignments.id, assignmentId), isNull(schema.assignments.deletedAt)))
      .get();
    if (!assignment) throw httpError.notFound('Assignment not found');

    await assertClassReadable(ctx as any, assignment.classId);

    let rows: any[] = [];

    // teacher: full access (but must be teacher of this class)
    if (me.role === 'teacher') {
      const ok = await isTeacherOfClass(ctx as any, assignment.classId, me.id);
      if (!ok) throw httpError.forbidden('Not a teacher of this class');

      rows = await db
        .select()
        .from(schema.submissions)
        .where(and(eq(schema.submissions.assignmentId, assignmentId), isNull(schema.submissions.deletedAt)))
        .orderBy(desc(schema.submissions.id))
        .all();
    } else if (me.role === 'admin') {
      rows = await db
        .select()
        .from(schema.submissions)
        .where(and(eq(schema.submissions.assignmentId, assignmentId), isNull(schema.submissions.deletedAt)))
        .orderBy(desc(schema.submissions.id))
        .all();
    } else {
      // student: if leader => team rows OR self rows; else self rows only
      const teamId = await getActiveTeamInClassForStudent(ctx as any, assignment.classId, me.id);
      
      const where: any[] = [eq(schema.submissions.assignmentId, assignmentId), isNull(schema.submissions.deletedAt)];
      if (teamId) {
        const team = await getTeamById(ctx as any, teamId);
        if (team.leaderId === me.id) {
          where.push(or(eq(schema.submissions.teamId, teamId), eq(schema.submissions.submitterId, me.id)));
        } else {
          where.push(eq(schema.submissions.submitterId, me.id));
        }
      } else {
        where.push(eq(schema.submissions.submitterId, me.id));
      }

      rows = await db
        .select()
        .from(schema.submissions)
        .where(and(...where))
        .orderBy(desc(schema.submissions.id))
        .all();
    }

    if (rows.length === 0) return [];

    const subIds = rows.map((r: any) => r.id);
    
    // Fetch Files
    const files = await db
      .select({
        submissionId: schema.submissionFiles.submissionId,
        file: schema.files,
      })
      .from(schema.submissionFiles)
      .innerJoin(schema.files, eq(schema.files.id, schema.submissionFiles.fileId))
      .where(and(inArray(schema.submissionFiles.submissionId, subIds), isNull(schema.submissionFiles.deletedAt), isNull(schema.files.deletedAt)))
      .all();

    // Fetch Grades
    const grades = await db
      .select()
      .from(schema.grades)
      .where(and(inArray(schema.grades.submissionId, subIds), isNull(schema.grades.deletedAt)))
      .all();

    // Map back
    return rows.map((r: any) => ({
      ...r,
      files: files.filter((f: any) => f.submissionId === r.id).map((f: any) => f.file),
      grade: grades.find((g: any) => g.submissionId === r.id) || null,
    }));
  })
  .get('/submissions/:submissionId', async (ctx) => {
    const subId = asNumber((ctx.params as any).submissionId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const sub = await db
      .select()
      .from(schema.submissions)
      .where(and(eq(schema.submissions.id, subId), isNull(schema.submissions.deletedAt)))
      .get();
    if (!sub) throw httpError.notFound('Submission not found');
    await assertClassReadable(ctx as any, sub.classId);

    if (me.role === 'student') {
      if (sub.submitterId !== me.id) {
        // allow team view if leader
        const teamId = sub.teamId;
        if (!teamId) throw httpError.forbidden('Access denied');
        const team = await getTeamById(ctx as any, teamId);
        if (team.leaderId !== me.id) throw httpError.forbidden('Access denied');
      }
    }

    const files = await db
      .select({ f: schema.files })
      .from(schema.submissionFiles)
      .innerJoin(schema.files, eq(schema.files.id, schema.submissionFiles.fileId))
      .where(and(eq(schema.submissionFiles.submissionId, subId), isNull(schema.submissionFiles.deletedAt), isNull(schema.files.deletedAt)))
      .all();
    const grade = await db
      .select()
      .from(schema.grades)
      .where(and(eq(schema.grades.submissionId, subId), isNull(schema.grades.deletedAt)))
      .get();
    return { ...sub, files: files.map((x: any) => x.f), grade: grade ?? null };
  })
  .get('/submissions/:submissionId/versions', async (ctx) => {
    const subId = asNumber((ctx.params as any).submissionId);
    const { db, schema } = ctx as any;
    const sub = await db
      .select()
      .from(schema.submissions)
      .where(and(eq(schema.submissions.id, subId), isNull(schema.submissions.deletedAt)))
      .get();
    if (!sub) throw httpError.notFound('Submission not found');
    await assertClassReadable(ctx as any, sub.classId);
    const logical = await db
      .select()
      .from(schema.submissions)
      .where(
        and(
          eq(schema.submissions.assignmentId, sub.assignmentId),
          eq(schema.submissions.stageId, sub.stageId),
          eq(schema.submissions.projectId, sub.projectId),
          sub.teamId ? eq(schema.submissions.teamId, sub.teamId) : sql`${schema.submissions.teamId} IS NULL`,
          eq(schema.submissions.submitterId, sub.submitterId),
          isNull(schema.submissions.deletedAt),
        ),
      )
      .orderBy(asc(schema.submissions.version))
      .all();
    return logical;
  });
