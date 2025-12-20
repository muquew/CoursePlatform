import { and, eq, isNull } from 'drizzle-orm';
import { httpError } from '../lib/http-error.ts';
import type { AuthUser } from '../middleware/auth.ts';
import { nowIso } from '../lib/time.ts';

export type CtxLike = {
  db: any;
  schema: any;
  user: AuthUser | null;
  request?: Request;
};

export function requireUser(user: AuthUser | null): AuthUser {
  if (!user) throw httpError.unauthorized('Login required');
  return user;
}

export async function getClassById(ctx: CtxLike, classId: number) {
  const { db, schema } = ctx;
  const row = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), isNull(schema.classes.deletedAt)))
    .get();
  if (!row) throw httpError.notFound('Class not found');
  return row;
}

export function assertClassWritable(cls: any) {
  if (cls.status === 'archived') throw httpError.forbidden('Class is archived (read-only).');
}

export async function isTeacherOfClass(ctx: CtxLike, classId: number, teacherId: number): Promise<boolean> {
  const { db, schema } = ctx;
  const row = await db
    .select({ id: schema.classTeachers.id })
    .from(schema.classTeachers)
    .where(
      and(
        eq(schema.classTeachers.classId, classId),
        eq(schema.classTeachers.teacherId, teacherId),
        isNull(schema.classTeachers.deletedAt),
      ),
    )
    .get();
  return !!row;
}

export async function isOwnerTeacherOfClass(ctx: CtxLike, classId: number, teacherId: number): Promise<boolean> {
  const { db, schema } = ctx;
  const row = await db
    .select({ id: schema.classTeachers.id, role: schema.classTeachers.role })
    .from(schema.classTeachers)
    .where(
      and(
        eq(schema.classTeachers.classId, classId),
        eq(schema.classTeachers.teacherId, teacherId),
        isNull(schema.classTeachers.deletedAt),
      ),
    )
    .get();
  return !!row && row.role === 'owner';
}

export async function isStudentInClass(ctx: CtxLike, classId: number, studentId: number): Promise<boolean> {
  const { db, schema } = ctx;
  const row = await db
    .select({ id: schema.classStudents.id })
    .from(schema.classStudents)
    .where(
      and(
        eq(schema.classStudents.classId, classId),
        eq(schema.classStudents.studentId, studentId),
        eq(schema.classStudents.isActive, true),
        isNull(schema.classStudents.deletedAt),
      ),
    )
    .get();
  return !!row;
}

export async function assertClassReadable(ctx: CtxLike, classId: number) {
  const u = requireUser(ctx.user);
  if (u.role === 'admin') return;
  if (u.role === 'teacher') {
    if (await isTeacherOfClass(ctx, classId, u.id)) return;
  }
  if (u.role === 'student') {
    if (await isStudentInClass(ctx, classId, u.id)) return;
  }
  throw httpError.forbidden('Not a member of this class');
}

export async function assertClassTeacher(ctx: CtxLike, classId: number) {
  const u = requireUser(ctx.user);
  if (u.role === 'admin') return;
  if (u.role !== 'teacher') throw httpError.forbidden('Teacher required');
  const ok = await isTeacherOfClass(ctx, classId, u.id);
  if (!ok) throw httpError.forbidden('Not a teacher of this class');
}

export async function getTeamById(ctx: CtxLike, teamId: number) {
  const { db, schema } = ctx;
  const row = await db
    .select()
    .from(schema.teams)
    .where(and(eq(schema.teams.id, teamId), isNull(schema.teams.deletedAt)))
    .get();
  if (!row) throw httpError.notFound('Team not found');
  return row;
}

export async function isTeamMember(ctx: CtxLike, teamId: number, userId: number): Promise<boolean> {
  const { db, schema } = ctx;
  const row = await db
    .select({ id: schema.teamMembers.id })
    .from(schema.teamMembers)
    .where(
      and(
        eq(schema.teamMembers.teamId, teamId),
        eq(schema.teamMembers.studentId, userId),
        eq(schema.teamMembers.isActive, true),
        isNull(schema.teamMembers.deletedAt),
      ),
    )
    .get();
  return !!row;
}

export async function assertTeamReadable(ctx: CtxLike, teamId: number) {
  const team = await getTeamById(ctx, teamId);
  await assertClassReadable(ctx, team.classId);
  return team;
}

export async function assertTeamLeader(ctx: CtxLike, teamId: number) {
  const u = requireUser(ctx.user);
  const team = await getTeamById(ctx, teamId);
  await assertClassReadable(ctx, team.classId);
  if (u.id !== team.leaderId) throw httpError.forbidden('Leader required');
  return team;
}

export async function getProjectById(ctx: CtxLike, projectId: number) {
  const { db, schema } = ctx;
  const row = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), isNull(schema.projects.deletedAt)))
    .get();
  if (!row) throw httpError.notFound('Project not found');
  return row;
}

export async function assertProjectReadable(ctx: CtxLike, projectId: number) {
  const p = await getProjectById(ctx, projectId);
  await assertClassReadable(ctx, p.classId);
  return p;
}

export async function getActiveTeamInClassForStudent(ctx: CtxLike, classId: number, studentId: number) {
  const { db, schema } = ctx;
  const row = await db
    .select({
      teamId: schema.teamMembers.teamId,
    })
    .from(schema.teamMembers)
    .where(
      and(
        eq(schema.teamMembers.classId, classId),
        eq(schema.teamMembers.studentId, studentId),
        eq(schema.teamMembers.isActive, true),
        isNull(schema.teamMembers.deletedAt),
      ),
    )
    .get();
  return row?.teamId ?? null;
}

export async function writeAudit(ctx: CtxLike, input: {
  action: string;
  targetTable: string;
  targetId: string | number;
  before?: unknown;
  after?: unknown;
  classId?: number | null;
  teamId?: number | null;
  projectId?: number | null;
}) {
  const u = requireUser(ctx.user);
  const { db, schema } = ctx;
  const req = ctx.request as any;
  const ip = req?.headers?.get?.('x-forwarded-for') ?? undefined;
  const ua = req?.headers?.get?.('user-agent') ?? undefined;

  await db.insert(schema.auditLogs).values({
    actorId: u.id,
    action: input.action,
    targetTable: input.targetTable,
    targetId: String(input.targetId),
    beforeJson: input.before ? JSON.stringify(input.before) : null,
    afterJson: input.after ? JSON.stringify(input.after) : null,
    classId: input.classId ?? null,
    teamId: input.teamId ?? null,
    projectId: input.projectId ?? null,
    ip: ip ?? null,
    userAgent: ua ?? null,
    createdAt: nowIso(),
  });
}

export async function notify(ctx: CtxLike, userId: number, n: { type: string; title?: string; message?: string; payload?: any }) {
  const { db, schema } = ctx;
  await db.insert(schema.notifications).values({
    userId,
    type: n.type,
    title: n.title ?? null,
    message: n.message ?? null,
    payloadJson: JSON.stringify(n.payload ?? {}),
  });
}

export function parseJsonOr<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function asNumber(x: unknown): number {
  const n = typeof x === 'string' ? Number(x) : (x as number);
  if (!Number.isFinite(n)) throw httpError.badRequest('Invalid id');
  return n;
}

export function assertNotLocked(team: any) {
  if (team.status === 'locked' || team.isLocked) throw httpError.forbidden('Team is locked.');
}

export function parseIsoToMs(iso: string): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) throw httpError.badRequest('Invalid datetime');
  return t;
}

export function nowMs(): number {
  return Date.now();
}
