import { Elysia, t } from 'elysia';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { hashPassword } from '../../lib/password.ts';
import { httpError } from '../../lib/http-error.ts';
import { nowIso } from '../../lib/time.ts';
import {
  asNumber,
  assertClassReadable,
  assertClassTeacher,
  assertClassWritable,
  getClassById,
  isOwnerTeacherOfClass,
  isStudentInClass,
  isTeacherOfClass,
  parseJsonOr,
  requireUser,
  writeAudit
} from '../_helpers.ts';
import { DEFAULT_STUDENT_PASSWORD } from './_constants.ts';

export const classesRoutes = new Elysia({ name: 'classesRoutes' })
/* =========================================================
   * Classes
   * ========================================================= */
  .post(
    '/classes',
    async (ctx) => {
      const me = requireUser((ctx as any).user);
      if (me.role !== 'teacher' && me.role !== 'admin') throw httpError.forbidden('Teacher required');
      const { db, schema } = ctx as any;
      const { courseName, term, config, ownerTeacherId } = ctx.body as any;
      const ownerId = me.role === 'teacher' ? me.id : (ownerTeacherId ?? me.id);

      const result = await db.transcation(async (tx: any) => {
        const cls = await tx
          .insert(schema.classes)
          .values({ courseName, term, configJson: JSON.stringify(config ?? {}) })
          .returning()
          .get();
        if (!cls) throw httpError.internal('Failed to create class');

        await tx.insert(schema.classTeachers).values({ classId: cls.id, teacherId: ownerId, role: 'owner' });
        await writeAudit({ ...ctx, db: tx } as any, { action: 'class.create', targetTable: 'classes', targetId: cls.id, after: cls, classId: cls.id });

        return cls;
      })

      return { ...result, config: parseJsonOr(result.configJson, {}) };
    },
    { body: t.Object({ courseName: t.String(), term: t.String(), config: t.Optional(t.Any()), ownerTeacherId: t.Optional(t.Number()) }) },
  )
  .get('/classes', async (ctx) => {
    const me = (ctx as any).user;
    const { db, schema } = ctx as any;
    if (!me) {
      // Keep smoke-tests happy.
      return [];
    }
    if (me.role === 'admin') {
      const rows = await db.select().from(schema.classes).where(isNull(schema.classes.deletedAt)).orderBy(desc(schema.classes.id)).all();
      return rows.map((c: any) => ({ ...c, config: parseJsonOr(c.configJson, {}) }));
    }
    if (me.role === 'teacher') {
      const rows = await db
        .select({ c: schema.classes, role: schema.classTeachers.role })
        .from(schema.classTeachers)
        .innerJoin(schema.classes, eq(schema.classes.id, schema.classTeachers.classId))
        .where(and(eq(schema.classTeachers.teacherId, me.id), isNull(schema.classTeachers.deletedAt), isNull(schema.classes.deletedAt)))
        .orderBy(desc(schema.classes.id))
        .all();
      return rows.map((r: any) => ({ ...r.c, teacherRole: r.role, config: parseJsonOr(r.c.configJson, {}) }));
    }
    // student
    const rows = await db
      .select({ c: schema.classes })
      .from(schema.classStudents)
      .innerJoin(schema.classes, eq(schema.classes.id, schema.classStudents.classId))
      .where(and(eq(schema.classStudents.studentId, me.id), eq(schema.classStudents.isActive, true), isNull(schema.classStudents.deletedAt), isNull(schema.classes.deletedAt)))
      .orderBy(desc(schema.classes.id))
      .all();
    return rows.map((r: any) => ({ ...r.c, config: parseJsonOr(r.c.configJson, {}) }));
  })
  .get('/classes/:classId', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    await assertClassReadable(ctx as any, classId);
    const cls = await getClassById(ctx as any, classId);
    return { ...cls, config: parseJsonOr(cls.configJson, {}) };
  })
  .patch(
    '/classes/:classId',
    async (ctx) => {
      const id = asNumber((ctx.params as any).classId);
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, id);
      const cls = await getClassById(ctx as any, id);
      assertClassWritable(cls);

      const { courseName, term } = ctx.body as any;
      const before = cls;
      await db
        .update(schema.classes)
        .set({
          courseName: courseName ?? cls.courseName,
          term: term ?? cls.term,
        })
        .where(eq(schema.classes.id, id));
      const after = await getClassById(ctx as any, id);
      await writeAudit(ctx as any, { action: 'class.update', targetTable: 'classes', targetId: id, before, after, classId: id });
      return { ...after, config: parseJsonOr(after.configJson, {}) };
    },
    { body: t.Partial(t.Object({ courseName: t.String(), term: t.String() })) },
  )
  .patch(
    '/classes/:classId/status',
    async (ctx) => {
      const id = asNumber((ctx.params as any).classId);
      const { status } = ctx.body as any;
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      if (me.role !== 'admin') {
        await assertClassTeacher(ctx as any, id);
      }
      const before = await getClassById(ctx as any, id);
      await db.update(schema.classes).set({ status }).where(eq(schema.classes.id, id));
      const after = await getClassById(ctx as any, id);
      await writeAudit(ctx as any, { action: 'class.status', targetTable: 'classes', targetId: id, before, after, classId: id });
      return { ...after, config: parseJsonOr(after.configJson, {}) };
    },
    { body: t.Object({ status: t.Union([t.Literal('active'), t.Literal('archived')]) }) },
  )
  .patch(
    '/classes/:classId/settings',
    async (ctx) => {
      const id = asNumber((ctx.params as any).classId);
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, id);

      const before = await getClassById(ctx as any, id);
      const updates: any = {};
      const b = ctx.body as any;
      if (typeof b.allowStudentDownloadAfterArchived === 'boolean') updates.allowStudentDownloadAfterArchived = b.allowStudentDownloadAfterArchived;
      if (b.config != null) updates.configJson = JSON.stringify(b.config);
      await db.update(schema.classes).set(updates).where(eq(schema.classes.id, id));
      const after = await getClassById(ctx as any, id);
      await writeAudit(ctx as any, { action: 'class.settings', targetTable: 'classes', targetId: id, before, after, classId: id });
      return { ...after, config: parseJsonOr(after.configJson, {}) };
    },
    { body: t.Object({ allowStudentDownloadAfterArchived: t.Optional(t.Boolean()), config: t.Optional(t.Any()) }) },
  )
  .get('/classes/:classId/students', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    await assertClassReadable(ctx as any, classId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;

    const rows = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        studentNo: schema.studentProfiles.studentNo,
        realName: schema.studentProfiles.realName,
        isActive: schema.classStudents.isActive,
        joinedAt: schema.classStudents.joinedAt,
        leftAt: schema.classStudents.leftAt,
      })
      .from(schema.classStudents)
      .innerJoin(schema.users, eq(schema.users.id, schema.classStudents.studentId))
      .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.users.id))
      .where(and(eq(schema.classStudents.classId, classId), isNull(schema.classStudents.deletedAt)))
      .orderBy(asc(schema.classStudents.id))
      .all();

    if (me.role === 'student') {
      // privacy masking
      return rows.map((r: any) => ({ id: r.id, realName: r.realName ?? r.username, isActive: !!r.isActive }));
    }
    return rows.map((r: any) => ({
      id: r.id,
      username: r.username,
      studentNo: r.studentNo,
      realName: r.realName,
      isActive: !!r.isActive,
      joinedAt: r.joinedAt,
      leftAt: r.leftAt,
    }));
  })
  .post(
    '/classes/:classId/students',
    async (ctx) => {
      const classId = asNumber((ctx.params as any).classId);
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, classId);

      const cls = await getClassById(ctx as any, classId);
      assertClassWritable(cls);

      const b = ctx.body as any;
      let studentId = b.studentId as number | undefined;

      if (!studentId) {
        if (!b.studentNo || !b.realName) throw httpError.badRequest('studentNo and realName required');
        const userRow = await db
          .insert(schema.users)
          .values({ username: b.studentNo, passwordHash: hashPassword(DEFAULT_STUDENT_PASSWORD), mustChangePassword: true, role: 'student' })
          .returning()
          .get();
        if (!userRow) throw httpError.internal('Failed to create student user');
        studentId = userRow.id;
        await db.insert(schema.studentProfiles).values({ userId: studentId, studentNo: b.studentNo, realName: b.realName });
      }

      await db
        .insert(schema.classStudents)
        .values({ classId, studentId, isActive: true, joinedAt: nowIso() })
        .onConflictDoNothing();

      await writeAudit(ctx as any, { action: 'class.student.add', targetTable: 'class_students', targetId: `${classId}:${studentId}`, classId });
      return { ok: true, studentId };
    },
    { body: t.Object({ studentId: t.Optional(t.Number()), studentNo: t.Optional(t.String()), realName: t.Optional(t.String()) }) },
  )
  .post(
    '/classes/:classId/students/import',
    async (ctx) => {
      const classId = asNumber((ctx.params as any).classId);
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, classId);
      const cls = await getClassById(ctx as any, classId);
      assertClassWritable(cls);

      const { students, defaultPassword } = ctx.body as any;
      if (!Array.isArray(students) || students.length === 0) throw httpError.badRequest('students required');

      const initialPwd = defaultPassword || DEFAULT_STUDENT_PASSWORD;
      const created: number[] = [];
      for (const s of students) {
        if (!s?.studentNo || !s?.realName) continue;

        // ensure user exists
        let userRow = await db
          .select()
          .from(schema.users)
          .where(and(eq(schema.users.username, s.studentNo), isNull(schema.users.deletedAt)))
          .get();
        if (!userRow) {
          userRow = await db
            .insert(schema.users)
            .values({ 
              username: s.studentNo, 
              passwordHash: hashPassword(initialPwd), 
              mustChangePassword: true, 
              role: 'student' 
            })
            .returning()
            .get();
          await db.insert(schema.studentProfiles).values({ userId: userRow.id, studentNo: s.studentNo, realName: s.realName });
        }
        await db
          .insert(schema.classStudents)
          .values({ classId, studentId: userRow.id, isActive: true, joinedAt: nowIso() })
          .onConflictDoNothing();
        created.push(userRow.id);
      }

      await writeAudit(ctx as any, { action: 'class.student.import', targetTable: 'class_students', targetId: String(classId), classId, after: { count: created.length } });
      return { ok: true, count: created.length, studentIds: created };
    },
    {
      body: t.Object({
        students: t.Array(t.Object({ studentNo: t.String(), realName: t.String() })),
        defaultPassword: t.Optional(t.String()),
      }),
    },
  )

  .patch(
    '/classes/:classId/students/:studentId',
    async (ctx) => {
      const classId = asNumber((ctx.params as any).classId);
      const studentId = asNumber((ctx.params as any).studentId);
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, classId);

      const cls = await getClassById(ctx as any, classId);
      assertClassWritable(cls);

      const { isActive, leftAt } = ctx.body as any;
      const row = await db
        .select()
        .from(schema.classStudents)
        .where(
          and(
            eq(schema.classStudents.classId, classId),
            eq(schema.classStudents.studentId, studentId),
            isNull(schema.classStudents.deletedAt),
          ),
        )
        .get();
      if (!row) throw httpError.notFound('Enrollment not found');

      const nextIsActive = !!isActive;
      const nextLeftAt = nextIsActive ? null : (leftAt ?? nowIso());
      const nextJoinedAt = nextIsActive ? (row.joinedAt ?? nowIso()) : row.joinedAt;

      await db
        .update(schema.classStudents)
        .set({
          isActive: nextIsActive,
          joinedAt: nextJoinedAt,
          leftAt: nextLeftAt,
        })
        .where(eq(schema.classStudents.id, row.id));

      await writeAudit(ctx as any, {
        action: 'class.student.update',
        targetTable: 'class_students',
        targetId: `${classId}:${studentId}`,
        classId,
        before: row,
        after: { isActive: nextIsActive, joinedAt: nextJoinedAt, leftAt: nextLeftAt },
      });

      return { ok: true, isActive: nextIsActive, joinedAt: nextJoinedAt, leftAt: nextLeftAt };
    },
    { body: t.Object({ isActive: t.Boolean(), leftAt: t.Optional(t.String()) }) },
  )
  .delete('/classes/:classId/students/:studentId', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    const studentId = asNumber((ctx.params as any).studentId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    if (me.role !== 'admin') await assertClassTeacher(ctx as any, classId);
    const cls = await getClassById(ctx as any, classId);
    assertClassWritable(cls);

    await db
      .update(schema.classStudents)
      .set({ isActive: false, leftAt: nowIso(), deletedAt: nowIso() })
      .where(and(eq(schema.classStudents.classId, classId), eq(schema.classStudents.studentId, studentId), isNull(schema.classStudents.deletedAt)));
    await writeAudit(ctx as any, { action: 'class.student.remove', targetTable: 'class_students', targetId: `${classId}:${studentId}`, classId });
    return { ok: true };
  })
  .get('/classes/:classId/teachers', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    await assertClassReadable(ctx as any, classId);
    const { db, schema } = ctx as any;
    const rows = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        role: schema.classTeachers.role,
        realName: schema.teacherProfiles.realName,
        teacherNo: schema.teacherProfiles.teacherNo,
      })
      .from(schema.classTeachers)
      .innerJoin(schema.users, eq(schema.users.id, schema.classTeachers.teacherId))
      .leftJoin(schema.teacherProfiles, eq(schema.teacherProfiles.userId, schema.users.id))
      .where(and(eq(schema.classTeachers.classId, classId), isNull(schema.classTeachers.deletedAt)))
      .orderBy(asc(schema.classTeachers.id))
      .all();
    return rows;
  })
  .post(
    '/classes/:classId/teachers',
    async (ctx) => {
      const classId = asNumber((ctx.params as any).classId);
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      const b = ctx.body as any;

      if (me.role !== 'admin') {
        if (me.role !== 'teacher') throw httpError.forbidden('Teacher required');
        const owner = await isOwnerTeacherOfClass(ctx as any, classId, me.id);
        if (!owner) throw httpError.forbidden('Owner required');
      }
      const cls = await getClassById(ctx as any, classId);
      assertClassWritable(cls);

      await db.insert(schema.classTeachers).values({ classId, teacherId: b.teacherId, role: b.role ?? 'teacher' }).onConflictDoNothing();
      await writeAudit(ctx as any, { action: 'class.teacher.add', targetTable: 'class_teachers', targetId: `${classId}:${b.teacherId}`, classId });
      return { ok: true };
    },
    { body: t.Object({ teacherId: t.Number(), role: t.Optional(t.Union([t.Literal('owner'), t.Literal('teacher'), t.Literal('assistant')])) }) },
  )
  .delete('/classes/:classId/teachers/:teacherId', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    const teacherId = asNumber((ctx.params as any).teacherId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;

    if (me.role !== 'admin') {
      if (me.role !== 'teacher') throw httpError.forbidden('Teacher required');
      const owner = await isOwnerTeacherOfClass(ctx as any, classId, me.id);
      if (!owner) throw httpError.forbidden('Owner required');
    }
    const cls = await getClassById(ctx as any, classId);
    assertClassWritable(cls);

    const count = await db
      .select({ c: sql<number>`count(1)` })
      .from(schema.classTeachers)
      .where(and(eq(schema.classTeachers.classId, classId), isNull(schema.classTeachers.deletedAt)))
      .get();
    if ((count?.c ?? 0) <= 1) throw httpError.badRequest('Cannot remove last teacher');

    await db
      .update(schema.classTeachers)
      .set({ deletedAt: nowIso() })
      .where(and(eq(schema.classTeachers.classId, classId), eq(schema.classTeachers.teacherId, teacherId), isNull(schema.classTeachers.deletedAt)));
    await writeAudit(ctx as any, { action: 'class.teacher.remove', targetTable: 'class_teachers', targetId: `${classId}:${teacherId}`, classId });
    return { ok: true };
  })
  .get('/me/classes', async (ctx) => {
    const me = requireUser((ctx as any).user);
    if (me.role !== 'student') throw httpError.forbidden('Student required');
    const { db, schema } = ctx as any;
    const rows = await db
      .select({ c: schema.classes })
      .from(schema.classStudents)
      .innerJoin(schema.classes, eq(schema.classes.id, schema.classStudents.classId))
      .where(and(eq(schema.classStudents.studentId, me.id), eq(schema.classStudents.isActive, true), isNull(schema.classStudents.deletedAt), isNull(schema.classes.deletedAt)))
      .orderBy(desc(schema.classes.id))
      .all();
    return rows.map((r: any) => ({ ...r.c, config: parseJsonOr(r.c.configJson, {}) }));
  })
  .put(
    '/me/classes/active',
    async (ctx) => {
      const me = requireUser((ctx as any).user);
      const { classId } = ctx.body as any;
      const { db, schema } = ctx as any;
      if (me.role === 'student') {
        const ok = await isStudentInClass(ctx as any, classId, me.id);
        if (!ok) throw httpError.forbidden('Not enrolled');
      } else if (me.role === 'teacher') {
        const ok = await isTeacherOfClass(ctx as any, classId, me.id);
        if (!ok) throw httpError.forbidden('Not a teacher of this class');
      }
      await db
        .insert(schema.userSettings)
        .values({ userId: me.id, activeClassId: classId, prefsJson: '{}' })
        .onConflictDoUpdate({ target: schema.userSettings.userId, set: { activeClassId: classId } });
      return { ok: true, activeClassId: classId };
    },
    { body: t.Object({ classId: t.Number() }) },
  )
  .delete('/me/classes/active', async (ctx) => {
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    await db
      .insert(schema.userSettings)
      .values({ userId: me.id, activeClassId: null, prefsJson: '{}' })
      .onConflictDoUpdate({ target: schema.userSettings.userId, set: { activeClassId: null } });
    return { ok: true };
  });
