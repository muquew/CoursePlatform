import { Elysia, t } from 'elysia';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { hashPassword } from '../../lib/password.ts';
import { httpError } from '../../lib/http-error.ts';
import { getRecentHttpErrors } from '../../lib/err-monitor.ts';
import { asNumber, getProjectById, parseJsonOr, requireUser, writeAudit } from '../_helpers.ts';
import { DEFAULT_STUDENT_PASSWORD } from './_constants.ts';

export const adminRoutes = new Elysia({ name: 'adminRoutes' })
/* =========================================================
   * Audit logs & Admin
   * ========================================================= */
  .get('/admin/audit-logs', async (ctx) => {
    const me = requireUser((ctx as any).user);
    if (me.role !== 'admin') throw httpError.forbidden('Admin required');
    const q = ctx.query as any;
    const { db, schema } = ctx as any;
    const conds: any[] = [isNull(schema.auditLogs.deletedAt)];
    if (q.classId) conds.push(eq(schema.auditLogs.classId, Number(q.classId)));
    if (q.teamId) conds.push(eq(schema.auditLogs.teamId, Number(q.teamId)));
    if (q.projectId) conds.push(eq(schema.auditLogs.projectId, Number(q.projectId)));
    if (q.actorId) conds.push(eq(schema.auditLogs.actorId, Number(q.actorId)));
    if (q.action) conds.push(eq(schema.auditLogs.action, String(q.action)));
    if (q.from) conds.push(sql`${schema.auditLogs.createdAt} >= ${String(q.from)}`);
    if (q.to) conds.push(sql`${schema.auditLogs.createdAt} <= ${String(q.to)}`);
    const rows = await db
      .select()
      .from(schema.auditLogs)
      .where(and(...conds))
      .orderBy(desc(schema.auditLogs.id))
      .limit(200)
      .all();
    return rows.map((r: any) => ({
      ...r,
      before: parseJsonOr(r.beforeJson ?? r.before_json, null),
      after: parseJsonOr(r.afterJson ?? r.after_json, null),
    }));
  })
  .post(
    '/admin/users',
    async (ctx) => {
      const me = requireUser((ctx as any).user);
      if (me.role !== 'admin') throw httpError.forbidden('Admin required');
      const { db, schema } = ctx as any;
      const b = ctx.body as any;
      const pass = b.password || DEFAULT_STUDENT_PASSWORD;
      const user = await db
        .insert(schema.users)
        .values({ username: b.username, passwordHash: hashPassword(pass), mustChangePassword: true, role: b.role })
        .returning()
        .get();
      if (!user) throw httpError.internal('Failed');
      if (b.role === 'teacher') {
        const p = b.profile || {};
        await db.insert(schema.teacherProfiles).values({ userId: user.id, realName: p.realName || b.username, teacherNo: p.teacherNo ?? null, email: p.email ?? null });
      }
      if (b.role === 'student') {
        const p = b.profile || {};
        await db.insert(schema.studentProfiles).values({ userId: user.id, realName: p.realName || b.username, studentNo: p.studentNo || b.username, email: p.email ?? null });
      }
      if (b.role === 'admin') {
        await db.insert(schema.adminProfiles).values({ userId: user.id, adminLevel: 1 });
      }
      await writeAudit(ctx as any, { action: 'admin.user.create', targetTable: 'users', targetId: user.id, after: { ...user, tempPassword: pass } });
      return { ...user, tempPassword: pass };
    },
    {
      body: t.Object({
        role: t.Union([t.Literal('teacher'), t.Literal('admin'), t.Literal('student')]),
        username: t.String(),
        password: t.Optional(t.String()),
        profile: t.Optional(t.Any()),
      }),
    },
  )
  .patch(
    '/admin/users/:userId/role',
    async (ctx) => {
      const me = requireUser((ctx as any).user);
      if (me.role !== 'admin') throw httpError.forbidden('Admin required');
      const id = asNumber((ctx.params as any).userId);
      const { role } = ctx.body as any;
      const { db, schema } = ctx as any;
      const before = await db.select().from(schema.users).where(eq(schema.users.id, id)).get();
      if (!before) throw httpError.notFound('User not found');
      await db.update(schema.users).set({ role }).where(eq(schema.users.id, id));
      const after = await db.select().from(schema.users).where(eq(schema.users.id, id)).get();
      await writeAudit(ctx as any, { action: 'admin.user.role', targetTable: 'users', targetId: id, before, after });
      return after;
    },
    { body: t.Object({ role: t.Union([t.Literal('admin'), t.Literal('teacher'), t.Literal('student')]) }) },
  )
  .get('/admin/roles/matrix', async (ctx) => {
    const me = requireUser((ctx as any).user);
    if (me.role !== 'admin') throw httpError.forbidden('Admin required');

    // keep simple, derived from canByRole in access-control.ts
    return {
      note: 'This matrix is derived from server RBAC; ABAC may further restrict access.',
      roles: ['admin', 'teacher', 'student'],
      resources: [
        'users',
        'classes',
        'class_students',
        'teams',
        'team_join_requests',
        'projects',
        'project_stages',
        'assignments',
        'submissions',
        'grades',
        'peer_reviews',
        'peer_review_windows',
        'notifications',
        'audit_logs',
        'admin',
      ],
    };
  })
  .get('/admin/abac/rules', async (ctx) => {
    const me = requireUser((ctx as any).user);
    if (me.role !== 'admin') throw httpError.forbidden('Admin required');
    const { db, schema } = ctx as any;
    const rows = await db.select().from(schema.abacRules).where(isNull(schema.abacRules.deletedAt)).orderBy(asc(schema.abacRules.key)).all();
    return rows.map((r: any) => ({ ...r, config: parseJsonOr(r.configJson, {}) }));
  })
  .patch(
    '/admin/abac/rules/:key',
    async (ctx) => {
      const me = requireUser((ctx as any).user);
      if (me.role !== 'admin') throw httpError.forbidden('Admin required');
      const key = (ctx.params as any).key as string;
      const { enabled } = ctx.body as any;
      const { db, schema } = ctx as any;
      await db
        .insert(schema.abacRules)
        .values({ key, enabled: !!enabled, description: null, configJson: '{}' })
        .onConflictDoUpdate({ target: schema.abacRules.key, set: { enabled: !!enabled } });
      await writeAudit(ctx as any, { action: 'admin.abac.toggle', targetTable: 'abac_rules', targetId: key, after: { enabled: !!enabled } });
      return { ok: true, key, enabled: !!enabled };
    },
    { body: t.Object({ enabled: t.Boolean() }) },
  )
  .get('/admin/errors', async (ctx) => {
    const me = requireUser((ctx as any).user);
    if (me.role !== 'admin') throw httpError.forbidden('Admin required');
    // use in-memory buffer as DB table is not written to by current error handler
    const rows = getRecentHttpErrors(50);
    return rows.map(e => ({
       level: 'error',
       code: e.code,
       message: e.message,
       stack: (e as any).stack,
       createdAt: new Date().toISOString(), // approximate
       details: e.details
    }));
  })
  .post('/admin/fixes/project/:projectId', async (ctx) => {
    const me = requireUser((ctx as any).user);
    if (me.role !== 'admin') throw httpError.forbidden('Admin required');
    const projectId = asNumber((ctx.params as any).projectId);
    const { db, schema } = ctx as any;
    const p = await getProjectById(ctx as any, projectId);
    // ensure triggers run: re-set status
    await db.update(schema.projects).set({ status: p.status }).where(eq(schema.projects.id, projectId));
    await writeAudit(ctx as any, { action: 'admin.fix.project', targetTable: 'projects', targetId: projectId, classId: p.classId, teamId: p.teamId, projectId });
    return { ok: true };
  })
  .post('/admin/fixes/enrollment', async (ctx) => {
    const me = requireUser((ctx as any).user);
    if (me.role !== 'admin') throw httpError.forbidden('Admin required');
    await writeAudit(ctx as any, { action: 'admin.fix.enrollment', targetTable: 'class_students', targetId: 'bulk' });
    return { ok: true };
  });
