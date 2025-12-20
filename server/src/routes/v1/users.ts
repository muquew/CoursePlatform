import { Elysia, t } from 'elysia';
import { and, asc, eq, inArray, isNull, like, or } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../../lib/password.ts';
import { httpError } from '../../lib/http-error.ts';
import {
  asNumber,
  assertClassWritable,
  getClassById,
  isStudentInClass,
  isTeacherOfClass,
  requireUser,
  writeAudit
} from '../_helpers.ts';
import { DEFAULT_STUDENT_PASSWORD } from './_constants.ts';


async function assertTeacherCanAccessUser(ctx: any, teacherId: number, userId: number) {
  const { db, schema } = ctx as any;
  const classIds = (await db
    .select({ classId: schema.classTeachers.classId })
    .from(schema.classTeachers)
    .where(and(eq(schema.classTeachers.teacherId, teacherId), isNull(schema.classTeachers.deletedAt)))
    .all()).map((r: any) => r.classId);

  if (classIds.length === 0) throw httpError.forbidden('Access denied');

  const [asStudent, asTeacher] = await Promise.all([
    db
      .select({ id: schema.classStudents.id })
      .from(schema.classStudents)
      .where(
        and(
          inArray(schema.classStudents.classId, classIds),
          eq(schema.classStudents.studentId, userId),
          eq(schema.classStudents.isActive, true),
          isNull(schema.classStudents.deletedAt),
        ),
      )
      .get(),
    db
      .select({ id: schema.classTeachers.id })
      .from(schema.classTeachers)
      .where(and(inArray(schema.classTeachers.classId, classIds), eq(schema.classTeachers.teacherId, userId), isNull(schema.classTeachers.deletedAt)))
      .get(),
  ]);

  if (!asStudent && !asTeacher) throw httpError.forbidden('Access denied');
}

export const usersRoutes = new Elysia({ name: 'usersRoutes' })
/* =========================================================
   * Users
   * ========================================================= */
  .get('/users', async (ctx) => {
    const u = requireUser((ctx as any).user);
    if (u.role === 'student') throw httpError.forbidden('Insufficient permissions');

    const { db, schema } = ctx as any;

    // Teacher scope: return users in classes the teacher participates in, OR any teacher (for adding colleagues)
    let scopeIds: number[] | null = null;
    if (u.role === 'teacher') {
      const classIds = (await db
        .select({ classId: schema.classTeachers.classId })
        .from(schema.classTeachers)
        .where(and(eq(schema.classTeachers.teacherId, u.id), isNull(schema.classTeachers.deletedAt)))
        .all()).map((r: any) => r.classId);
      
      const teacherIds = (await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.role, 'teacher'), isNull(schema.users.deletedAt)))
        .all()).map((r: any) => r.id);

      if (classIds.length > 0) {
        const [studentIdsRows, teacherIdsRows] = await Promise.all([
          db
            .select({ studentId: schema.classStudents.studentId })
            .from(schema.classStudents)
            .where(
              and(
                inArray(schema.classStudents.classId, classIds),
                eq(schema.classStudents.isActive, true),
                isNull(schema.classStudents.deletedAt),
              ),
            )
            .all(),
          db
            .select({ teacherId: schema.classTeachers.teacherId })
            .from(schema.classTeachers)
            .where(and(inArray(schema.classTeachers.classId, classIds), isNull(schema.classTeachers.deletedAt)))
            .all(),
        ]);

        scopeIds = Array.from(
          new Set<number>([
            ...studentIdsRows.map((r: any) => r.studentId),
            ...teacherIdsRows.map((r: any) => r.teacherId),
            ...teacherIds,
            u.id,
          ]),
        );
      } else {
        // Teacher with no classes can still see other teachers
        scopeIds = Array.from(new Set<number>([...teacherIds, u.id]));
      }
    }

    // 条件查询
    const q = ((ctx.query as any)?.q?.trim?.() ?? '').replaceAll('"', '').replaceAll("'", "");
    const whereConds: any[] = [isNull(schema.users.deletedAt)];
    if (scopeIds) whereConds.push(inArray(schema.users.id, scopeIds));
    if (q) {
      whereConds.push(
        or(
          like(schema.users.username, `%${q}%`),
          like(schema.studentProfiles.studentNo, `%${q}%`),
          like(schema.studentProfiles.realName, `%${q}%`),
          like(schema.teacherProfiles.teacherNo, `%${q}%`),
          like(schema.teacherProfiles.realName, `%${q}%`),
        ),
      );
    }

    const rows = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        role: schema.users.role,
        mustChangePassword: schema.users.mustChangePassword,
        studentNo: schema.studentProfiles.studentNo,
        realNameStudent: schema.studentProfiles.realName,
        teacherNo: schema.teacherProfiles.teacherNo,
        realNameTeacher: schema.teacherProfiles.realName,
      })
      .from(schema.users)
      .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.users.id))
      .leftJoin(schema.teacherProfiles, eq(schema.teacherProfiles.userId, schema.users.id))
      .where(and(...whereConds))
      .orderBy(asc(schema.users.id))
      .all();

    return rows.map((r: any) => ({
      id: r.id,
      username: r.username,
      role: r.role,
      realName: r.realNameStudent ?? r.realNameTeacher ?? null,
      studentNo: r.studentNo ?? null,
      teacherNo: r.teacherNo ?? null,
      mustChangePassword: !!r.mustChangePassword,
    }));
  })
  .get('/users/:userId', async (ctx) => {
    const me = requireUser((ctx as any).user);
    const userId = asNumber((ctx.params as any).userId);
    const { db, schema } = ctx as any;

    if (me.role !== 'admin' && me.id !== userId && me.role !== 'teacher') {
      throw httpError.forbidden('Insufficient permissions');
    }

    const row = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        role: schema.users.role,
        mustChangePassword: schema.users.mustChangePassword,
        studentNo: schema.studentProfiles.studentNo,
        realNameStudent: schema.studentProfiles.realName,
        teacherNo: schema.teacherProfiles.teacherNo,
        realNameTeacher: schema.teacherProfiles.realName,
      })
      .from(schema.users)
      .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.users.id))
      .leftJoin(schema.teacherProfiles, eq(schema.teacherProfiles.userId, schema.users.id))
      .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
      .get();
    if (!row) throw httpError.notFound('User not found');

    // If teacher asks for another user, enforce same-class association (student or co-teacher).
    if (me.role === 'teacher' && me.id !== userId) {
      await assertTeacherCanAccessUser(ctx as any, me.id, userId);
    }

    return {
      id: row.id,
      username: row.username,
      role: row.role,
      mustChangePassword: !!row.mustChangePassword,
      realName: row.realNameStudent ?? row.realNameTeacher ?? null,
      studentNo: row.studentNo ?? null,
      teacherNo: row.teacherNo ?? null,
    };
  })
  .get('/users/:userId/profile', async (ctx) => {
    const me = requireUser((ctx as any).user);
    const userId = asNumber((ctx.params as any).userId);
    const { db, schema } = ctx as any;

    if (me.role !== 'admin' && me.id !== userId && me.role !== 'teacher') {
      throw httpError.forbidden('Insufficient permissions');
    }

    // Return whichever profile exists
    const [student, teacher, admin] = await Promise.all([
      db
        .select()
        .from(schema.studentProfiles)
        .where(and(eq(schema.studentProfiles.userId, userId), isNull(schema.studentProfiles.deletedAt)))
        .get(),
      db
        .select()
        .from(schema.teacherProfiles)
        .where(and(eq(schema.teacherProfiles.userId, userId), isNull(schema.teacherProfiles.deletedAt)))
        .get(),
      db
        .select()
        .from(schema.adminProfiles)
        .where(and(eq(schema.adminProfiles.userId, userId), isNull(schema.adminProfiles.deletedAt)))
        .get(),
    ]);

    const profile = student || teacher || admin;
    if (!profile) throw httpError.notFound('Profile not found');

    // Teacher can only read profiles for users in their classes (student or co-teacher).
    if (me.role === 'teacher' && me.id !== userId) {
      await assertTeacherCanAccessUser(ctx as any, me.id, userId);
    }
    return profile;
  })
  .patch(
    '/users/me/password',
    async (ctx) => {
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      const { currentPassword, newPassword } = ctx.body as any;

      const row = await db
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.id, me.id), isNull(schema.users.deletedAt)))
        .get();
      if (!row) throw httpError.unauthorized('User not found');
      if (!verifyPassword(currentPassword, row.passwordHash)) throw httpError.unauthorized('Invalid password');

      const nextHash = hashPassword(newPassword);
      await db
        .update(schema.users)
        .set({ passwordHash: nextHash, mustChangePassword: false })
        .where(eq(schema.users.id, me.id));
      return { ok: true };
    },
    { body: t.Object({ currentPassword: t.String(), newPassword: t.String({ minLength: 6 }) }) },
  )
  .post('/classes/:classId/students/:studentId/password-reset', async (ctx) => {
    const me = requireUser((ctx as any).user);
    const classId = asNumber((ctx.params as any).classId);
    const studentId = asNumber((ctx.params as any).studentId);
    const { db, schema } = ctx as any;

    if (me.role !== 'admin') {
      if (me.role !== 'teacher') throw httpError.forbidden('Teacher required');
      const ok = await isTeacherOfClass(ctx as any, classId, me.id);
      if (!ok) throw httpError.forbidden('Not a teacher of this class');
    }
    const cls = await getClassById(ctx as any, classId);
    assertClassWritable(cls);
    const enrolled = await isStudentInClass(ctx as any, classId, studentId);
    if (!enrolled) throw httpError.badRequest('Student not enrolled in this class');

    await db
      .update(schema.users)
      .set({ passwordHash: hashPassword(DEFAULT_STUDENT_PASSWORD), mustChangePassword: true })
      .where(eq(schema.users.id, studentId));
    await writeAudit(ctx as any, {
      action: 'student.password_reset',
      targetTable: 'users',
      targetId: studentId,
      classId,
    });
    return { ok: true, tempPassword: DEFAULT_STUDENT_PASSWORD };
  });
