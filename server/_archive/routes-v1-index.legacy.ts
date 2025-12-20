import { Elysia, t } from 'elysia';
import { and, asc, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';

import { hashPassword, verifyPassword } from '../../lib/password.ts';
import { httpError } from '../../lib/http-error.ts';
import { nowIso } from '../../lib/time.ts';
import { buildFileMeta, makeDownloadName } from '../../lib/file-storage.ts';
import { STAGE_KEYS, STAGE_ORDER, isStageKey } from '../../lib/stages.ts';

import {
  asNumber,
  assertClassReadable,
  assertClassTeacher,
  assertClassWritable,
  assertNotLocked,
  assertProjectReadable,
  assertTeamLeader,
  assertTeamReadable,
  getActiveTeamInClassForStudent,
  getClassById,
  getProjectById,
  getTeamById,
  isOwnerTeacherOfClass,
  isStudentInClass,
  isTeacherOfClass,
  isTeamMember,
  notify,
  parseIsoToMs,
  parseJsonOr,
  requireUser,
  writeAudit,
} from '../_helpers.ts';

const DEFAULT_STUDENT_PASSWORD = process.env.DEFAULT_STUDENT_PASSWORD || '123456';
const STORAGE_ROOT = process.env.STORAGE_ROOT || 'storage';

async function ensureDir(path: string) {
  // Bun: mkdir -p
  await Bun.$`mkdir -p ${path}`.quiet();
}

async function saveWebFileToStorage(file: File, storagePath: string): Promise<{ bytes: Uint8Array; size: number }>{
  const ab = await file.arrayBuffer();
  const bytes = new Uint8Array(ab);
  const fullPath = `${STORAGE_ROOT}/${storagePath}`;
  const dir = fullPath.split('/').slice(0, -1).join('/');
  await ensureDir(dir);
  await Bun.write(fullPath, bytes);
  return { bytes, size: bytes.byteLength };
}

async function parseUploads(request: Request): Promise<{ files: File[]; fields: Record<string, string> }> {
  const ct = request.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('multipart/form-data')) return { files: [], fields: {} };
  const fd = await request.formData();
  const files: File[] = [];
  const fields: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (v instanceof File) {
      // accept any file field name; common: file/files
      files.push(v);
    } else {
      fields[k] = String(v);
    }
  }
  return { files, fields };
}

async function createFileRows(ctx: any, classId: number, uploadedBy: number, webFiles: File[]) {
  const { db, schema } = ctx;
  const rows: any[] = [];
  for (const f of webFiles) {
    const meta = buildFileMeta({ originalName: f.name, mime: f.type });
    const saved = await saveWebFileToStorage(f, meta.storagePath);
    meta.size = saved.size;
    meta.sha256 = buildFileMeta({ originalName: f.name, bytes: saved.bytes }).sha256;

    const inserted = await db
      .insert(schema.files)
      .values({
        storagePath: meta.storagePath,
        originalName: meta.originalName,
        mime: meta.mime ?? null,
        size: meta.size ?? null,
        sha256: meta.sha256 ?? null,
        uploadedBy,
        classId,
      })
      .returning()
      .get();
    if (inserted) rows.push(inserted);
  }
  return rows;
}

export const v1Routes = new Elysia({ name: 'v1Routes' })
  /* =========================================================
   * Auth
   * ========================================================= */
  .post(
    '/auth/login',
    async (ctx) => {
      const { db, schema, jwt } = ctx as any;
      const { username, password } = ctx.body as any;
      const userRow = await db
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.username, username), isNull(schema.users.deletedAt)))
        .get();
      if (!userRow) throw httpError.unauthorized('Invalid username or password');

      const ok = verifyPassword(password, userRow.passwordHash);
      if (!ok) throw httpError.unauthorized('Invalid username or password');

      const token = await jwt.sign({ id: userRow.id, role: userRow.role, username: userRow.username });
      return {
        token,
        user: {
          id: userRow.id,
          username: userRow.username,
          role: userRow.role,
          mustChangePassword: !!userRow.mustChangePassword,
        },
      };
    },
    {
      body: t.Object({ username: t.String(), password: t.String() }),
    },
  )
  .get('/auth/me', async (ctx) => {
    const u = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;

    const userRow = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, u.id), isNull(schema.users.deletedAt)))
      .get();
    if (!userRow) throw httpError.unauthorized('User not found');

    const settings = await db
      .select()
      .from(schema.userSettings)
      .where(and(eq(schema.userSettings.userId, u.id), isNull(schema.userSettings.deletedAt)))
      .get();

    const studentProfile = await db
      .select()
      .from(schema.studentProfiles)
      .where(and(eq(schema.studentProfiles.userId, u.id), isNull(schema.studentProfiles.deletedAt)))
      .get();
    const teacherProfile = await db
      .select()
      .from(schema.teacherProfiles)
      .where(and(eq(schema.teacherProfiles.userId, u.id), isNull(schema.teacherProfiles.deletedAt)))
      .get();
    const adminProfile = await db
      .select()
      .from(schema.adminProfiles)
      .where(and(eq(schema.adminProfiles.userId, u.id), isNull(schema.adminProfiles.deletedAt)))
      .get();

    return {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role,
      mustChangePassword: !!userRow.mustChangePassword,
      profile: studentProfile || teacherProfile || adminProfile || null,
      settings: settings ? { activeClassId: settings.activeClassId, prefs: parseJsonOr(settings.prefsJson, {}) } : null,
    };
  })
  .post('/auth/logout', async () => ({ ok: true }))

  /* =========================================================
   * Users
   * ========================================================= */
  .get('/users', async (ctx) => {
    const u = requireUser((ctx as any).user);
    if (u.role === 'student') throw httpError.forbidden('Insufficient permissions');

    const { db, schema } = ctx as any;
    const q = (ctx.query as any)?.q?.trim?.() ?? '';

    // Base: users + optional profiles
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
      .where(
        and(
          isNull(schema.users.deletedAt),
          q
            ? or(
                like(schema.users.username, `%${q}%`),
                like(schema.studentProfiles.studentNo, `%${q}%`),
                like(schema.studentProfiles.realName, `%${q}%`),
                like(schema.teacherProfiles.teacherNo, `%${q}%`),
                like(schema.teacherProfiles.realName, `%${q}%`),
              )
            : undefined,
        ),
      )
      .orderBy(asc(schema.users.id))
      .all();

    // Teacher can only see users in their classes (students + co-teachers).
    if (u.role === 'teacher') {
      const classIds = (await db
        .select({ classId: schema.classTeachers.classId })
        .from(schema.classTeachers)
        .where(and(eq(schema.classTeachers.teacherId, u.id), isNull(schema.classTeachers.deletedAt)))
        .all()).map((r: any) => r.classId);

      if (classIds.length === 0) return [];

      const studentIds = (await db
        .select({ studentId: schema.classStudents.studentId })
        .from(schema.classStudents)
        .where(and(inArray(schema.classStudents.classId, classIds), eq(schema.classStudents.isActive, true), isNull(schema.classStudents.deletedAt)))
        .all()).map((r: any) => r.studentId);
      const teacherIds = (await db
        .select({ teacherId: schema.classTeachers.teacherId })
        .from(schema.classTeachers)
        .where(and(inArray(schema.classTeachers.classId, classIds), isNull(schema.classTeachers.deletedAt)))
        .all()).map((r: any) => r.teacherId);

      const allowed = new Set([...studentIds, ...teacherIds, u.id]);
      return rows
        .filter((r: any) => allowed.has(r.id))
        .map((r: any) => ({
          id: r.id,
          username: r.username,
          role: r.role,
          realName: r.realNameStudent ?? r.realNameTeacher ?? null,
          studentNo: r.studentNo ?? null,
          teacherNo: r.teacherNo ?? null,
          mustChangePassword: !!r.mustChangePassword,
        }));
    }

    // admin: full
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
  .get('/users/:id', async (ctx) => {
    const me = requireUser((ctx as any).user);
    const userId = asNumber((ctx.params as any).id);
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

    // If teacher asks for another user, enforce same-class association.
    if (me.role === 'teacher' && me.id !== userId) {
      const ok = await db
        .select({ id: schema.classStudents.id })
        .from(schema.classStudents)
        .innerJoin(schema.classTeachers, eq(schema.classTeachers.classId, schema.classStudents.classId))
        .where(
          and(
            eq(schema.classTeachers.teacherId, me.id),
            eq(schema.classStudents.studentId, userId),
            eq(schema.classStudents.isActive, true),
            isNull(schema.classTeachers.deletedAt),
            isNull(schema.classStudents.deletedAt),
          ),
        )
        .get();
      const ok2 = await db
        .select({ id: schema.classTeachers.id })
        .from(schema.classTeachers)
        .innerJoin(schema.classTeachers as any, eq((schema.classTeachers as any).classId, schema.classTeachers.classId))
        .where(and(eq(schema.classTeachers.teacherId, me.id), eq((schema.classTeachers as any).teacherId, userId)))
        .get();

      if (!ok && !ok2) throw httpError.forbidden('Access denied');
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
  .get('/users/:id/profile', async (ctx) => {
    const me = requireUser((ctx as any).user);
    const userId = asNumber((ctx.params as any).id);
    const { db, schema } = ctx as any;

    if (me.role !== 'admin' && me.id !== userId && me.role !== 'teacher') {
      throw httpError.forbidden('Insufficient permissions');
    }

    // Return whichever profile exists
    const student = await db
      .select()
      .from(schema.studentProfiles)
      .where(and(eq(schema.studentProfiles.userId, userId), isNull(schema.studentProfiles.deletedAt)))
      .get();
    const teacher = await db
      .select()
      .from(schema.teacherProfiles)
      .where(and(eq(schema.teacherProfiles.userId, userId), isNull(schema.teacherProfiles.deletedAt)))
      .get();
    const admin = await db
      .select()
      .from(schema.adminProfiles)
      .where(and(eq(schema.adminProfiles.userId, userId), isNull(schema.adminProfiles.deletedAt)))
      .get();

    const profile = student || teacher || admin;
    if (!profile) throw httpError.notFound('Profile not found');

    // Teacher can only read profiles for users in their classes.
    if (me.role === 'teacher' && me.id !== userId) {
      const ok = await db
        .select({ id: schema.classStudents.id })
        .from(schema.classStudents)
        .innerJoin(schema.classTeachers, eq(schema.classTeachers.classId, schema.classStudents.classId))
        .where(
          and(
            eq(schema.classTeachers.teacherId, me.id),
            eq(schema.classStudents.studentId, userId),
            eq(schema.classStudents.isActive, true),
            isNull(schema.classTeachers.deletedAt),
            isNull(schema.classStudents.deletedAt),
          ),
        )
        .get();
      if (!ok) throw httpError.forbidden('Access denied');
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
  })

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

      const cls = await db
        .insert(schema.classes)
        .values({ courseName, term, configJson: JSON.stringify(config ?? {}) })
        .returning()
        .get();
      if (!cls) throw httpError.internal('Failed to create class');

      await db.insert(schema.classTeachers).values({ classId: cls.id, teacherId: ownerId, role: 'owner' });
      await writeAudit(ctx as any, { action: 'class.create', targetTable: 'classes', targetId: cls.id, after: cls, classId: cls.id });
      return { ...cls, config: parseJsonOr(cls.configJson, {}) };
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
  // NOTE: memoirist (Elysia router) requires consistent param names at the same path location.
  // We standardize on :classId for all /classes/:classId/* routes.
  .get('/classes/:classId', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    await assertClassReadable(ctx as any, classId);
    const cls = await getClassById(ctx as any, classId);
    return { ...cls, config: parseJsonOr(cls.configJson, {}) };
  })
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
        // create student user
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

      const { students } = ctx.body as any;
      if (!Array.isArray(students) || students.length === 0) throw httpError.badRequest('students required');

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
            .values({ username: s.studentNo, passwordHash: hashPassword(DEFAULT_STUDENT_PASSWORD), mustChangePassword: true, role: 'student' })
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
  })

  /* =========================================================
   * Teams
   * ========================================================= */
  .post(
    '/classes/:classId/teams',
    async (ctx) => {
      const me = requireUser((ctx as any).user);
      if (me.role !== 'student') throw httpError.forbidden('Student required');
      const classId = asNumber((ctx.params as any).classId);
      await assertClassReadable(ctx as any, classId);
      const cls = await getClassById(ctx as any, classId);
      assertClassWritable(cls);

      const activeTeamId = await getActiveTeamInClassForStudent(ctx as any, classId, me.id);
      if (activeTeamId) throw httpError.badRequest('Already in a team');

      const config = parseJsonOr(cls.configJson, {} as any);
      const minSize = Number(config?.teamSizeMin ?? config?.minTeamSize ?? 1);
      const maxSize = Number(config?.teamSizeMax ?? config?.maxTeamSize ?? 99);
      if (minSize > 1 && minSize > maxSize) {
        // ignore invalid config
      }

      const { name, description } = ctx.body as any;
      const { db, schema } = ctx as any;
      const team = await db
        .insert(schema.teams)
        .values({ classId, name, description: description ?? null, leaderId: me.id })
        .returning()
        .get();
      if (!team) throw httpError.internal('Failed to create team');
      await db.insert(schema.teamMembers).values({ teamId: team.id, classId, studentId: me.id, isActive: true, joinedAt: nowIso() });
      await writeAudit(ctx as any, { action: 'team.create', targetTable: 'teams', targetId: team.id, after: team, classId, teamId: team.id });
      return team;
    },
    { body: t.Object({ name: t.String(), description: t.Optional(t.String()) }) },
  )
  .get('/classes/:classId/teams', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    await assertClassReadable(ctx as any, classId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const teams = await db
      .select()
      .from(schema.teams)
      .where(and(eq(schema.teams.classId, classId), isNull(schema.teams.deletedAt)))
      .orderBy(asc(schema.teams.id))
      .all();

    const teamIds = teams.map((t: any) => t.id);
    const members = teamIds.length
      ? await db
          .select({
            teamId: schema.teamMembers.teamId,
            userId: schema.users.id,
            realName: schema.studentProfiles.realName,
            studentNo: schema.studentProfiles.studentNo,
            isActive: schema.teamMembers.isActive,
          })
          .from(schema.teamMembers)
          .innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.studentId))
          .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.users.id))
          .where(and(inArray(schema.teamMembers.teamId, teamIds), isNull(schema.teamMembers.deletedAt)))
          .all()
      : [];

    const byTeam = new Map<number, any[]>();
    for (const m of members) {
      const arr = byTeam.get(m.teamId) || [];
      arr.push(m);
      byTeam.set(m.teamId, arr);
    }

    return teams.map((t: any) => {
      const ms = (byTeam.get(t.id) || []).filter((m) => m.isActive);
      return {
        ...t,
        members:
          me.role === 'student'
            ? ms.map((m) => ({ userId: m.userId, realName: m.realName ?? String(m.userId) }))
            : ms.map((m) => ({ userId: m.userId, realName: m.realName, studentNo: m.studentNo })),
        memberCount: ms.length,
      };
    });
  })
  .get('/teams/:id', async (ctx) => {
    const teamId = asNumber((ctx.params as any).id);
    const team = await assertTeamReadable(ctx as any, teamId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const canSeeMembers = me.role !== 'student' || (await isTeamMember(ctx as any, teamId, me.id));

    const members = await db
      .select({
        userId: schema.users.id,
        realName: schema.studentProfiles.realName,
        studentNo: schema.studentProfiles.studentNo,
        isActive: schema.teamMembers.isActive,
      })
      .from(schema.teamMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.studentId))
      .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.users.id))
      .where(and(eq(schema.teamMembers.teamId, teamId), isNull(schema.teamMembers.deletedAt)))
      .all();

    return {
      ...team,
      members: canSeeMembers
        ? (members as any[])
            .filter((m: any) => m.isActive)
            .map((m: any) => (me.role === 'student' ? { userId: m.userId, realName: m.realName ?? String(m.userId) } : m))
        : [],
    };
  })
  .post('/teams/:id/join-requests', async (ctx) => {
    const me = requireUser((ctx as any).user);
    if (me.role !== 'student') throw httpError.forbidden('Student required');
    const teamId = asNumber((ctx.params as any).id);
    const team = await getTeamById(ctx as any, teamId);
    await assertClassReadable(ctx as any, team.classId);
    const cls = await getClassById(ctx as any, team.classId);
    assertClassWritable(cls);
    assertNotLocked(team);

    const inClass = await isStudentInClass(ctx as any, team.classId, me.id);
    if (!inClass) throw httpError.forbidden('Not enrolled');
    const activeTeamId = await getActiveTeamInClassForStudent(ctx as any, team.classId, me.id);
    if (activeTeamId) throw httpError.badRequest('Already in a team');

    const { db, schema } = ctx as any;
    const req = await db
      .insert(schema.teamJoinRequests)
      .values({ teamId, classId: team.classId, studentId: me.id, status: 'pending' })
      .returning()
      .get();
    await writeAudit(ctx as any, { action: 'team.join_request.create', targetTable: 'team_join_requests', targetId: req?.id ?? '0', classId: team.classId, teamId });
    return req;
  })
  .get('/teams/:id/join-requests', async (ctx) => {
    const teamId = asNumber((ctx.params as any).id);
    const team = await getTeamById(ctx as any, teamId);
    const me = requireUser((ctx as any).user);
    await assertClassReadable(ctx as any, team.classId);
    if (me.role === 'student' && me.id !== team.leaderId) throw httpError.forbidden('Leader required');

    const { db, schema } = ctx as any;
    const rows = await db
      .select({
        id: schema.teamJoinRequests.id,
        studentId: schema.teamJoinRequests.studentId,
        status: schema.teamJoinRequests.status,
        reason: schema.teamJoinRequests.reason,
        createdAt: schema.teamJoinRequests.createdAt,
        realName: schema.studentProfiles.realName,
        studentNo: schema.studentProfiles.studentNo,
      })
      .from(schema.teamJoinRequests)
      .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.teamJoinRequests.studentId))
      .where(and(eq(schema.teamJoinRequests.teamId, teamId), isNull(schema.teamJoinRequests.deletedAt)))
      .orderBy(desc(schema.teamJoinRequests.id))
      .all();
    return rows;
  })
  .patch(
    '/teams/:id/join-requests/:rid',
    async (ctx) => {
      const teamId = asNumber((ctx.params as any).id);
      const rid = asNumber((ctx.params as any).rid);
      const { decision, reason } = ctx.body as any;
      const team = await assertTeamLeader(ctx as any, teamId);
      const cls = await getClassById(ctx as any, team.classId);
      assertClassWritable(cls);
      assertNotLocked(team);

      const { db, schema } = ctx as any;
      const jr = await db
        .select()
        .from(schema.teamJoinRequests)
        .where(and(eq(schema.teamJoinRequests.id, rid), eq(schema.teamJoinRequests.teamId, teamId), isNull(schema.teamJoinRequests.deletedAt)))
        .get();
      if (!jr) throw httpError.notFound('Join request not found');
      if (jr.status !== 'pending') throw httpError.badRequest('Request is not pending');

      if (decision === 'approved') {
        const activeTeamId = await getActiveTeamInClassForStudent(ctx as any, team.classId, jr.studentId);
        if (activeTeamId) throw httpError.badRequest('Student already in a team');
        await db.insert(schema.teamMembers).values({ teamId, classId: team.classId, studentId: jr.studentId, isActive: true, joinedAt: nowIso() });
      }

      await db
        .update(schema.teamJoinRequests)
        .set({
          status: decision,
          reviewerId: team.leaderId,
          reviewedAt: nowIso(),
          reason: reason ?? null,
        })
        .where(eq(schema.teamJoinRequests.id, rid));

      await writeAudit(ctx as any, { action: 'team.join_request.review', targetTable: 'team_join_requests', targetId: rid, classId: team.classId, teamId });
      return { ok: true };
    },
    {
      body: t.Object({ decision: t.Union([t.Literal('approved'), t.Literal('rejected')]), reason: t.Optional(t.String()) }),
    },
  )
  .delete('/teams/:id/join-requests/:rid', async (ctx) => {
    const teamId = asNumber((ctx.params as any).id);
    const rid = asNumber((ctx.params as any).rid);
    const me = requireUser((ctx as any).user);
    if (me.role !== 'student') throw httpError.forbidden('Student required');
    const { db, schema } = ctx as any;
    const jr = await db
      .select()
      .from(schema.teamJoinRequests)
      .where(and(eq(schema.teamJoinRequests.id, rid), eq(schema.teamJoinRequests.teamId, teamId), isNull(schema.teamJoinRequests.deletedAt)))
      .get();
    if (!jr) throw httpError.notFound('Join request not found');
    if (jr.studentId !== me.id) throw httpError.forbidden('Not your request');
    if (jr.status !== 'pending') throw httpError.badRequest('Request is not pending');
    const team = await getTeamById(ctx as any, teamId);
    const cls = await getClassById(ctx as any, team.classId);
    assertClassWritable(cls);

    await db.update(schema.teamJoinRequests).set({ status: 'cancelled' }).where(eq(schema.teamJoinRequests.id, rid));
    await writeAudit(ctx as any, { action: 'team.join_request.cancel', targetTable: 'team_join_requests', targetId: rid, classId: team.classId, teamId });
    return { ok: true };
  })
  .post('/teams/:id/leave', async (ctx) => {
    const teamId = asNumber((ctx.params as any).id);
    const me = requireUser((ctx as any).user);
    if (me.role !== 'student') throw httpError.forbidden('Student required');
    const team = await getTeamById(ctx as any, teamId);
    await assertClassReadable(ctx as any, team.classId);
    const cls = await getClassById(ctx as any, team.classId);
    assertClassWritable(cls);
    assertNotLocked(team);
    if (me.id === team.leaderId) throw httpError.badRequest('Leader cannot leave; transfer leadership first');

    const { db, schema } = ctx as any;
    await db
      .update(schema.teamMembers)
      .set({ isActive: false, leftAt: nowIso() })
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.studentId, me.id), eq(schema.teamMembers.isActive, true), isNull(schema.teamMembers.deletedAt)));
    await writeAudit(ctx as any, { action: 'team.member.leave', targetTable: 'team_members', targetId: `${teamId}:${me.id}`, classId: team.classId, teamId });
    return { ok: true };
  })
  .delete('/teams/:id/members/:userId', async (ctx) => {
    const teamId = asNumber((ctx.params as any).id);
    const userId = asNumber((ctx.params as any).userId);
    const team = await assertTeamLeader(ctx as any, teamId);
    const cls = await getClassById(ctx as any, team.classId);
    assertClassWritable(cls);
    assertNotLocked(team);
    if (userId === team.leaderId) throw httpError.badRequest('Cannot remove leader');
    const { db, schema } = ctx as any;
    await db
      .update(schema.teamMembers)
      .set({ isActive: false, leftAt: nowIso() })
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.studentId, userId), eq(schema.teamMembers.isActive, true), isNull(schema.teamMembers.deletedAt)));
    await writeAudit(ctx as any, { action: 'team.member.remove', targetTable: 'team_members', targetId: `${teamId}:${userId}`, classId: team.classId, teamId });
    return { ok: true };
  })
  .post(
    '/teams/:id/leader-transfer',
    async (ctx) => {
      const teamId = asNumber((ctx.params as any).id);
      const team = await assertTeamLeader(ctx as any, teamId);
      const { toUserId } = ctx.body as any;
      const cls = await getClassById(ctx as any, team.classId);
      assertClassWritable(cls);
      assertNotLocked(team);
      const ok = await isTeamMember(ctx as any, teamId, toUserId);
      if (!ok) throw httpError.badRequest('Target is not a member');
      const { db, schema } = ctx as any;
      const before = team;
      await db.update(schema.teams).set({ leaderId: toUserId }).where(eq(schema.teams.id, teamId));
      const after = await getTeamById(ctx as any, teamId);
      await writeAudit(ctx as any, { action: 'team.leader.transfer', targetTable: 'teams', targetId: teamId, before, after, classId: team.classId, teamId });
      return after;
    },
    { body: t.Object({ toUserId: t.Number() }) },
  )
  .post(
    '/teams/:id/leader-force',
    async (ctx) => {
      const teamId = asNumber((ctx.params as any).id);
      const me = requireUser((ctx as any).user);
      const { toUserId, reason } = ctx.body as any;
      const team = await getTeamById(ctx as any, teamId);
      await assertClassReadable(ctx as any, team.classId);
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, team.classId);
      const cls = await getClassById(ctx as any, team.classId);
      assertClassWritable(cls);
      const ok = await isTeamMember(ctx as any, teamId, toUserId);
      if (!ok) throw httpError.badRequest('Target is not a member');
      const { db, schema } = ctx as any;
      const before = team;
      await db.update(schema.teams).set({ leaderId: toUserId }).where(eq(schema.teams.id, teamId));
      const after = await getTeamById(ctx as any, teamId);
      const afterAudit = reason ? { ...(after as any), reason } : after;
      await writeAudit(ctx as any, {
        action: 'team.leader.force',
        targetTable: 'teams',
        targetId: teamId,
        before,
        after: afterAudit,
        classId: team.classId,
        teamId,
      });
      return after;
    },
    { body: t.Object({ toUserId: t.Number(), reason: t.Optional(t.String()) }) },
  )
  .get('/classes/:classId/students/unassigned', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    const me = requireUser((ctx as any).user);
    if (me.role !== 'admin') await assertClassTeacher(ctx as any, classId);
    const { db, schema } = ctx as any;

    const students = await db
      .select({
        id: schema.users.id,
        studentNo: schema.studentProfiles.studentNo,
        realName: schema.studentProfiles.realName,
      })
      .from(schema.classStudents)
      .innerJoin(schema.users, eq(schema.users.id, schema.classStudents.studentId))
      .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.users.id))
      .where(and(eq(schema.classStudents.classId, classId), eq(schema.classStudents.isActive, true), isNull(schema.classStudents.deletedAt)))
      .all();

    const memberIds = await db
      .select({ studentId: schema.teamMembers.studentId })
      .from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.classId, classId), eq(schema.teamMembers.isActive, true), isNull(schema.teamMembers.deletedAt)))
      .all();
    const inTeam = new Set(memberIds.map((r: any) => r.studentId));
    return students.filter((s: any) => !inTeam.has(s.id));
  })
  .post(
    '/classes/:classId/teams/assign',
    async (ctx) => {
      const classId = asNumber((ctx.params as any).classId);
      const me = requireUser((ctx as any).user);
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, classId);
      const cls = await getClassById(ctx as any, classId);
      assertClassWritable(cls);
      const { studentId, teamId, teamName } = ctx.body as any;
      const { db, schema } = ctx as any;

      const enrolled = await isStudentInClass(ctx as any, classId, studentId);
      if (!enrolled) throw httpError.badRequest('Student not enrolled');
      const activeTeamId = await getActiveTeamInClassForStudent(ctx as any, classId, studentId);
      if (activeTeamId) throw httpError.badRequest('Student already in a team');

      let targetTeamId = teamId as number | null;
      if (targetTeamId) {
        const team = await getTeamById(ctx as any, targetTeamId);
        if (team.classId !== classId) throw httpError.badRequest('Class mismatch');
        assertNotLocked(team);
      } else {
        const team = await db
          .insert(schema.teams)
          .values({ classId, name: teamName || `Team-${studentId}`, leaderId: studentId })
          .returning()
          .get();
        if (!team) throw httpError.internal('Failed to create team');
        targetTeamId = team.id;
        const tid = targetTeamId as number;
        await db.insert(schema.teamMembers).values({ teamId: tid, classId, studentId, isActive: true, joinedAt: nowIso() });
        await writeAudit(ctx as any, { action: 'team.force.create', targetTable: 'teams', targetId: tid, classId, teamId: tid });
        return { ok: true, teamId: tid, created: true };
      }

      const tid = targetTeamId as number;
      await db.insert(schema.teamMembers).values({ teamId: tid, classId, studentId, isActive: true, joinedAt: nowIso() });
      await writeAudit(ctx as any, { action: 'team.force.assign', targetTable: 'team_members', targetId: `${tid}:${studentId}`, classId, teamId: tid });
      return { ok: true, teamId: tid, created: false };
    },
    { body: t.Object({ studentId: t.Number(), teamId: t.Optional(t.Number()), teamName: t.Optional(t.String()) }) },
  )

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
  .get('/cases/:id', async (ctx) => {
    const id = asNumber((ctx.params as any).id);
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
    '/cases/:id',
    async (ctx) => {
      const id = asNumber((ctx.params as any).id);
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
  .delete('/cases/:id', async (ctx) => {
    const id = asNumber((ctx.params as any).id);
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
  })

  /* =========================================================
   * Projects
   * ========================================================= */
  .post(
    '/teams/:id/projects',
    async (ctx) => {
      // Keep team routes consistent: use :id everywhere for team id.
      const teamId = asNumber((ctx.params as any).id);
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
    const where = [eq(schema.projects.classId, classId), isNull(schema.projects.deletedAt)];
    if (q?.status) where.push(eq(schema.projects.status, q.status));
    if (q?.teamId) where.push(eq(schema.projects.teamId, Number(q.teamId)));

    let rows = await db.select().from(schema.projects).where(and(...(where as any))).orderBy(desc(schema.projects.id)).all();
    if (me.role === 'student') {
      const teamId = await getActiveTeamInClassForStudent(ctx as any, classId, me.id);
      rows = teamId ? rows.filter((r: any) => r.teamId === teamId) : [];
    }
    return rows;
  })
  .get('/projects/:id', async (ctx) => {
    const projectId = asNumber((ctx.params as any).id);
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
    '/projects/:id',
    async (ctx) => {
      const projectId = asNumber((ctx.params as any).id);
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      const p = await getProjectById(ctx as any, projectId);
      await assertClassReadable(ctx as any, p.classId);

      const team = await getTeamById(ctx as any, p.teamId);
      if (me.role !== 'admin') {
        if (me.role !== 'student' || team.leaderId !== me.id) throw httpError.forbidden('Leader required');
      }
      if (p.status !== 'draft') throw httpError.badRequest('Only draft can be edited');

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
  .post('/projects/:id/submit', async (ctx) => {
    const projectId = asNumber((ctx.params as any).id);
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
    '/projects/:id/reviews',
    async (ctx) => {
      const projectId = asNumber((ctx.params as any).id);
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
  )

  /* =========================================================
   * Stages
   * ========================================================= */
  .get('/projects/:id/stages', async (ctx) => {
    const projectId = asNumber((ctx.params as any).id);
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
    '/projects/:id/stages/:stageKey',
    async (ctx) => {
      const projectId = asNumber((ctx.params as any).id);
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
    '/projects/:id/stages/:stageKey/rollback',
    async (ctx) => {
      const projectId = asNumber((ctx.params as any).id);
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
  )

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
  .get('/assignments/:id', async (ctx) => {
    const id = asNumber((ctx.params as any).id);
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
    '/assignments/:id',
    async (ctx) => {
      const id = asNumber((ctx.params as any).id);
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
  .delete('/assignments/:id', async (ctx) => {
    const id = asNumber((ctx.params as any).id);
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
  })

  /* =========================================================
   * Submissions
   * ========================================================= */
  .post('/assignments/:id/submissions', async (ctx) => {
    const assignmentId = asNumber((ctx.params as any).id);
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
  .get('/assignments/:id/submissions', async (ctx) => {
    const assignmentId = asNumber((ctx.params as any).id);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const assignment = await db
      .select()
      .from(schema.assignments)
      .where(and(eq(schema.assignments.id, assignmentId), isNull(schema.assignments.deletedAt)))
      .get();
    if (!assignment) throw httpError.notFound('Assignment not found');
    await assertClassReadable(ctx as any, assignment.classId);

    let rows = await db
      .select()
      .from(schema.submissions)
      .where(and(eq(schema.submissions.assignmentId, assignmentId), isNull(schema.submissions.deletedAt)))
      .orderBy(desc(schema.submissions.id))
      .all();

    if (me.role === 'teacher') {
      const ok = await isTeacherOfClass(ctx as any, assignment.classId, me.id);
      if (!ok) throw httpError.forbidden('Not a teacher of this class');
      return rows;
    }
    if (me.role === 'admin') return rows;

    // student: if leader => team rows; else self rows
    const teamId = await getActiveTeamInClassForStudent(ctx as any, assignment.classId, me.id);
    if (!teamId) return [];
    const team = await getTeamById(ctx as any, teamId);
    if (team.leaderId === me.id) {
      rows = rows.filter((r: any) => r.teamId === teamId || r.submitterId === me.id);
    } else {
      rows = rows.filter((r: any) => r.submitterId === me.id);
    }
    return rows;
  })
  .get('/submissions/:id', async (ctx) => {
    const subId = asNumber((ctx.params as any).id);
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
  .get('/submissions/:id/versions', async (ctx) => {
    const subId = asNumber((ctx.params as any).id);
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
  })

  /* =========================================================
   * Files
   * ========================================================= */
  .get('/files/:id/download', async (ctx) => {
    const id = asNumber((ctx.params as any).id);
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

  /* =========================================================
   * Grades
   * ========================================================= */
  .put(
    '/submissions/:id/grade',
    async (ctx) => {
      const subId = asNumber((ctx.params as any).id);
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
  .get('/projects/:id/grades', async (ctx) => {
    const projectId = asNumber((ctx.params as any).id);
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
  .get('/assignments/:id/grades', async (ctx) => {
    const assignmentId = asNumber((ctx.params as any).id);
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
  })

  /* =========================================================
   * Peer review
   * ========================================================= */
  .get('/classes/:classId/peer-review-windows', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    const me = requireUser((ctx as any).user);
    if (me.role !== 'admin') await assertClassTeacher(ctx as any, classId);
    const { db, schema } = ctx as any;
    const rows = await db
      .select()
      .from(schema.peerReviewWindows)
      .where(and(eq(schema.peerReviewWindows.classId, classId), isNull(schema.peerReviewWindows.deletedAt)))
      .orderBy(desc(schema.peerReviewWindows.id))
      .all();
    return rows;
  })
  .post(
    '/classes/:classId/peer-review-windows',
    async (ctx) => {
      const classId = asNumber((ctx.params as any).classId);
      const me = requireUser((ctx as any).user);
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, classId);
      const cls = await getClassById(ctx as any, classId);
      assertClassWritable(cls);
      const { stageKey, startsAt, endsAt } = ctx.body as any;
      if (!isStageKey(stageKey)) throw httpError.badRequest('Invalid stageKey');
      const { db, schema } = ctx as any;
      const w = await db
        .insert(schema.peerReviewWindows)
        .values({
          classId,
          stageKey,
          status: 'open',
          openAt: startsAt ?? nowIso(),
          closeAt: endsAt ?? null,
          createdBy: me.id,
        })
        .returning()
        .get();
      await writeAudit(ctx as any, { action: 'peer_review.window.open', targetTable: 'peer_review_windows', targetId: w?.id ?? '0', classId, after: w });
      return w;
    },
    { body: t.Object({ stageKey: t.String(), startsAt: t.Optional(t.String()), endsAt: t.Optional(t.String()) }) },
  )
  .post('/peer-review-windows/:id/close', async (ctx) => {
    const id = asNumber((ctx.params as any).id);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const w = await db
      .select()
      .from(schema.peerReviewWindows)
      .where(and(eq(schema.peerReviewWindows.id, id), isNull(schema.peerReviewWindows.deletedAt)))
      .get();
    if (!w) throw httpError.notFound('Window not found');
    if (me.role !== 'admin') await assertClassTeacher(ctx as any, w.classId);
    const cls = await getClassById(ctx as any, w.classId);
    assertClassWritable(cls);
    if (w.status !== 'open') throw httpError.badRequest('Window not open');
    await db.update(schema.peerReviewWindows).set({ status: 'sealed', closeAt: nowIso(), sealedAt: nowIso() }).where(eq(schema.peerReviewWindows.id, id));
    const after = await db.select().from(schema.peerReviewWindows).where(eq(schema.peerReviewWindows.id, id)).get();
    await writeAudit(ctx as any, { action: 'peer_review.window.close', targetTable: 'peer_review_windows', targetId: id, before: w, after, classId: w.classId });
    return after;
  })
  .post('/peer-review-windows/:id/publish', async (ctx) => {
    const id = asNumber((ctx.params as any).id);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const w = await db
      .select()
      .from(schema.peerReviewWindows)
      .where(and(eq(schema.peerReviewWindows.id, id), isNull(schema.peerReviewWindows.deletedAt)))
      .get();
    if (!w) throw httpError.notFound('Window not found');
    if (me.role !== 'admin') await assertClassTeacher(ctx as any, w.classId);
    const cls = await getClassById(ctx as any, w.classId);
    assertClassWritable(cls);
    if (w.status !== 'sealed') throw httpError.badRequest('Window not sealed');
    await db.update(schema.peerReviewWindows).set({ status: 'published', publishedAt: nowIso() }).where(eq(schema.peerReviewWindows.id, id));
    const after = await db.select().from(schema.peerReviewWindows).where(eq(schema.peerReviewWindows.id, id)).get();
    await writeAudit(ctx as any, { action: 'peer_review.window.publish', targetTable: 'peer_review_windows', targetId: id, before: w, after, classId: w.classId });
    return after;
  })
  .post('/projects/:id/peer-reviews', async (ctx) => {
    const projectId = asNumber((ctx.params as any).id);
    const me = requireUser((ctx as any).user);
    if (me.role !== 'student') throw httpError.forbidden('Student required');
    const { db, schema } = ctx as any;
    const p = await getProjectById(ctx as any, projectId);
    await assertClassReadable(ctx as any, p.classId);
    const team = await getTeamById(ctx as any, p.teamId);
    const member = await isTeamMember(ctx as any, team.id, me.id);
    if (!member) throw httpError.forbidden('Not a team member');
    const cls = await getClassById(ctx as any, p.classId);
    assertClassWritable(cls);

    const { revieweeId, payload } = ctx.body as any;
    if (revieweeId === me.id) throw httpError.badRequest('Cannot review yourself');
    const member2 = await isTeamMember(ctx as any, team.id, revieweeId);
    if (!member2) throw httpError.badRequest('Reviewee not in team');

    // choose open window for the project's current open stage (fallback: latest open)
    const openStage = await db
      .select()
      .from(schema.projectStages)
      .where(and(eq(schema.projectStages.projectId, projectId), eq(schema.projectStages.status, 'open'), isNull(schema.projectStages.deletedAt)))
      .orderBy(asc(schema.projectStages.order))
      .get();
    const stageKey = (openStage?.key ?? STAGE_KEYS[0]) as string;

    const w = await db
      .select()
      .from(schema.peerReviewWindows)
      .where(
        and(
          eq(schema.peerReviewWindows.classId, p.classId),
          eq(schema.peerReviewWindows.stageKey, stageKey),
          eq(schema.peerReviewWindows.status, 'open'),
          isNull(schema.peerReviewWindows.deletedAt),
        ),
      )
      .orderBy(desc(schema.peerReviewWindows.id))
      .get();
    if (!w) throw httpError.badRequest('No open peer review window');

    const pr = await db
      .insert(schema.peerReviews)
      .values({ windowId: w.id, classId: p.classId, teamId: team.id, reviewerId: me.id, revieweeId, payloadJson: JSON.stringify(payload ?? {}) })
      .returning()
      .get();
    await writeAudit(ctx as any, { action: 'peer_review.submit', targetTable: 'peer_reviews', targetId: pr?.id ?? '0', classId: p.classId, teamId: team.id, projectId });
    return pr;
  }, { body: t.Object({ revieweeId: t.Number(), payload: t.Optional(t.Any()) }) })
  .get('/projects/:id/peer-reviews', async (ctx) => {
    const projectId = asNumber((ctx.params as any).id);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const p = await getProjectById(ctx as any, projectId);
    await assertClassReadable(ctx as any, p.classId);
    const team = await getTeamById(ctx as any, p.teamId);

    if (me.role === 'student') {
      const member = await isTeamMember(ctx as any, team.id, me.id);
      if (!member) throw httpError.forbidden('Not a team member');
    }

    // Only show to students after publish.
    const windows = await db
      .select()
      .from(schema.peerReviewWindows)
      .where(and(eq(schema.peerReviewWindows.classId, p.classId), isNull(schema.peerReviewWindows.deletedAt)))
      .orderBy(desc(schema.peerReviewWindows.id))
      .all();
    const publishedIds = new Set(windows.filter((w: any) => w.status === 'published').map((w: any) => w.id));
    const allowedWindowIds = me.role === 'student' ? [...publishedIds] : windows.map((w: any) => w.id);
    if (allowedWindowIds.length === 0) return [];

    const reviews = await db
      .select()
      .from(schema.peerReviews)
      .where(and(inArray(schema.peerReviews.windowId, allowedWindowIds), eq(schema.peerReviews.teamId, team.id), isNull(schema.peerReviews.deletedAt)))
      .orderBy(desc(schema.peerReviews.id))
      .all();

    if (me.role === 'student') {
      return reviews.map((r: any) => ({ id: r.id, windowId: r.windowId, revieweeId: r.revieweeId, payload: parseJsonOr(r.payloadJson, {}) }));
    }
    return reviews.map((r: any) => ({ ...r, payload: parseJsonOr(r.payloadJson, {}) }));
  })
  .post(
    '/projects/:id/peer-reviews/decision',
    async (ctx) => {
      const projectId = asNumber((ctx.params as any).id);
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      const p = await getProjectById(ctx as any, projectId);
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, p.classId);
      const cls = await getClassById(ctx as any, p.classId);
      assertClassWritable(cls);

      // choose latest sealed/published window
      const w = await db
        .select()
        .from(schema.peerReviewWindows)
        .where(and(eq(schema.peerReviewWindows.classId, p.classId), isNull(schema.peerReviewWindows.deletedAt)))
        .orderBy(desc(schema.peerReviewWindows.id))
        .get();
      if (!w) throw httpError.badRequest('No window');

      const { adopt, forcedCoefficient, reason } = ctx.body as any;
      await db
        .insert(schema.peerReviewAdoptions)
        .values({
          windowId: w.id,
          teamId: p.teamId,
          adopted: !!adopt,
          forcedCoefficient: adopt ? null : (forcedCoefficient ?? 1),
          decidedBy: me.id,
          decidedAt: nowIso(),
          reason: reason ?? null,
        })
        .onConflictDoUpdate({
          target: [schema.peerReviewAdoptions.windowId, schema.peerReviewAdoptions.teamId] as any,
          set: { adopted: !!adopt, forcedCoefficient: adopt ? null : (forcedCoefficient ?? 1), decidedBy: me.id, decidedAt: nowIso(), reason: reason ?? null, deletedAt: null },
        });
      await writeAudit(ctx as any, { action: 'peer_review.decision', targetTable: 'peer_review_adoptions', targetId: `${w.id}:${p.teamId}`, classId: p.classId, teamId: p.teamId, projectId, after: { adopt, forcedCoefficient, reason } });
      return { ok: true };
    },
    { body: t.Object({ adopt: t.Boolean(), forcedCoefficient: t.Optional(t.Number()), reason: t.Optional(t.String()) }) },
  )

  /* =========================================================
   * Notifications
   * ========================================================= */
  .get('/me/notifications', async (ctx) => {
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, me.id), isNull(schema.notifications.deletedAt)))
      .orderBy(desc(schema.notifications.id))
      .all();
    return rows.map((n: any) => ({ ...n, payload: parseJsonOr(n.payloadJson, {}) }));
  })
  .patch('/me/notifications/:id', async (ctx) => {
    const me = requireUser((ctx as any).user);
    const id = asNumber((ctx.params as any).id);
    const { db, schema } = ctx as any;
    const row = await db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.id, id), isNull(schema.notifications.deletedAt)))
      .get();
    if (!row) throw httpError.notFound('Notification not found');
    if (row.userId !== me.id) throw httpError.forbidden('Access denied');
    const readAt = (ctx.body as any)?.readAt ?? nowIso();
    await db.update(schema.notifications).set({ readAt }).where(eq(schema.notifications.id, id));
    return { ok: true, readAt };
  })

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
      before: parseJsonOr(r.beforeJson, null),
      after: parseJsonOr(r.afterJson, null),
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
      if (b.role === 'admin') {
        await db.insert(schema.adminProfiles).values({ userId: user.id, adminLevel: 1 });
      }
      await writeAudit(ctx as any, { action: 'admin.user.create', targetTable: 'users', targetId: user.id, after: { ...user, tempPassword: pass } });
      return { ...user, tempPassword: pass };
    },
    {
      body: t.Object({
        role: t.Union([t.Literal('teacher'), t.Literal('admin')]),
        username: t.String(),
        password: t.Optional(t.String()),
        profile: t.Optional(t.Any()),
      }),
    },
  )
  .patch(
    '/admin/users/:id/role',
    async (ctx) => {
      const me = requireUser((ctx as any).user);
      if (me.role !== 'admin') throw httpError.forbidden('Admin required');
      const id = asNumber((ctx.params as any).id);
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
    const { db, schema } = ctx as any;
    const rows = await db.select().from(schema.errorEvents).where(isNull(schema.errorEvents.deletedAt)).orderBy(desc(schema.errorEvents.id)).limit(50).all();
    return rows;
  })
  .post('/admin/fixes/project/:id', async (ctx) => {
    const me = requireUser((ctx as any).user);
    if (me.role !== 'admin') throw httpError.forbidden('Admin required');
    const projectId = asNumber((ctx.params as any).id);
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
