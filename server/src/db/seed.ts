import { and, eq, isNull } from 'drizzle-orm';

import { db } from './index.ts';
import * as schema from './schema.ts';

import { hashPassword, verifyPassword } from '../lib/password.ts';
import { nowIso } from '../lib/time.ts';
import { STAGE_KEYS, STAGE_ORDER } from '../lib/stages.ts';

const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || 'Passw0rd!';

async function getUserByUsername(username: string) {
  return await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.username, username), isNull(schema.users.deletedAt)))
    .get();
}

async function ensureUser(opts: { username: string; role: schema.UserRole; realName: string; studentNo?: string; teacherNo?: string }) {
  const existing = await getUserByUsername(opts.username);

  // If the user already exists (common in local dev), keep the seed idempotent but
  // also make tests deterministic by ensuring:
  // - role matches
  // - password matches DEFAULT_PASSWORD
  // - corresponding profile row exists
  if (existing) {
    let u = existing as any;

    const patch: Record<string, any> = {};
    if (u.role !== opts.role) patch.role = opts.role;

    // If the stored hash doesn't match, overwrite it so "seed password" remains stable.
    const storedHash = typeof u.passwordHash === 'string' ? u.passwordHash : '';
    if (!verifyPassword(DEFAULT_PASSWORD, storedHash)) {
      patch.passwordHash = hashPassword(DEFAULT_PASSWORD);
      patch.mustChangePassword = true;
    }

    if (Object.keys(patch).length > 0) {
      const updated = await db
        .update(schema.users)
        .set(patch)
        .where(eq(schema.users.id, u.id))
        .returning()
        .get();
      if (updated) u = updated as any;
    }

    if (opts.role === 'student') {
      await db
        .insert(schema.studentProfiles)
        .values({ userId: u.id, studentNo: opts.studentNo || opts.username, realName: opts.realName })
        .onConflictDoNothing();
    } else if (opts.role === 'teacher') {
      await db
        .insert(schema.teacherProfiles)
        .values({ userId: u.id, teacherNo: opts.teacherNo || opts.username, realName: opts.realName })
        .onConflictDoNothing();
    } else {
      await db.insert(schema.adminProfiles).values({ userId: u.id }).onConflictDoNothing();
    }

    return u;
  }

  const u = await db
    .insert(schema.users)
    .values({
      username: opts.username,
      role: opts.role,
      passwordHash: hashPassword(DEFAULT_PASSWORD),
      mustChangePassword: true,
    })
    .returning()
    .get();
  if (!u) throw new Error(`failed to create user: ${opts.username}`);

  if (opts.role === 'student') {
    await db
      .insert(schema.studentProfiles)
      .values({ userId: u.id, studentNo: opts.studentNo || opts.username, realName: opts.realName })
      .onConflictDoNothing();
  } else if (opts.role === 'teacher') {
    await db
      .insert(schema.teacherProfiles)
      .values({ userId: u.id, teacherNo: opts.teacherNo || opts.username, realName: opts.realName })
      .onConflictDoNothing();
  } else {
    await db.insert(schema.adminProfiles).values({ userId: u.id }).onConflictDoNothing();
  }

  return u;
}

async function ensureClass(courseName: string, term: string) {
  const existing = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.courseName, courseName), eq(schema.classes.term, term), isNull(schema.classes.deletedAt)))
    .get();
  if (existing) return existing;

  const c = await db
    .insert(schema.classes)
    .values({ courseName, term, status: 'active', configJson: JSON.stringify({ teamSizeMin: 3, teamSizeMax: 5 }) })
    .returning()
    .get();
  if (!c) throw new Error('failed to create class');
  return c;
}


async function ensureCase(opts: { classId: number; createdBy: number; title: string; description?: string; tags?: string }) {
  const existing = await db
    .select()
    .from(schema.caseLibrary)
    .where(
      and(
        eq(schema.caseLibrary.classId, opts.classId),
        eq(schema.caseLibrary.title, opts.title),
        isNull(schema.caseLibrary.deletedAt),
      ),
    )
    .get();
  if (existing) return existing;

  const c = await db
    .insert(schema.caseLibrary)
    .values({
      classId: opts.classId,
      createdBy: opts.createdBy,
      title: opts.title,
      description: opts.description ?? null,
      tags: opts.tags ?? null,
      attachmentsJson: '[]',
    })
    .returning()
    .get();
  if (!c) throw new Error('failed to create case');
  return c;
}


async function ensureTeam(opts: { classId: number; name: string; leaderId: number; description?: string }) {
  const existing = await db
    .select()
    .from(schema.teams)
    .where(and(eq(schema.teams.classId, opts.classId), eq(schema.teams.name, opts.name), isNull(schema.teams.deletedAt)))
    .get();
  if (existing) return existing;

  const team = await db
    .insert(schema.teams)
    .values({
      classId: opts.classId,
      name: opts.name,
      description: opts.description ?? null,
      leaderId: opts.leaderId,
      status: 'recruiting',
      isLocked: false,
    })
    .returning()
    .get();
  if (!team) throw new Error('failed to create team');
  return team;
}

async function ensureTeamMember(teamId: number, classId: number, studentId: number) {
  await db
    .insert(schema.teamMembers)
    .values({ teamId, classId, studentId, isActive: true, joinedAt: nowIso() })
    .onConflictDoNothing();
}

async function ensureEnrollment(classId: number, studentId: number) {
  await db
    .insert(schema.classStudents)
    .values({ classId, studentId, isActive: true, joinedAt: nowIso() })
    .onConflictDoNothing();
}

async function ensureTeacherOfClass(classId: number, teacherId: number, role: schema.ClassTeacherRole) {
  await db
    .insert(schema.classTeachers)
    .values({ classId, teacherId, role })
    .onConflictDoNothing();
}

async function ensureProject(teamId: number, classId: number, createdBy: number, name: string, status: schema.ProjectStatus) {
  const existing = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.teamId, teamId), isNull(schema.projects.deletedAt)))
    .get();
  if (existing) return existing;

  const p = await db
    .insert(schema.projects)
    .values({
      teamId,
      classId,
      sourceType: 'custom',
      caseId: null,
      name,
      background: 'Seed project background',
      techStack: 'TypeScript, Bun, SQLite',
      status,
      createdBy,
      submittedAt: status === 'submitted' ? nowIso() : null,
    })
    .returning()
    .get();
  if (!p) throw new Error('failed to create project');
  return p;
}

async function ensureProjectStages(projectId: number) {
  for (const key of STAGE_KEYS) {
    const existing = await db
      .select()
      .from(schema.projectStages)
      .where(and(eq(schema.projectStages.projectId, projectId), eq(schema.projectStages.key, key), isNull(schema.projectStages.deletedAt)))
      .get();
    if (existing) continue;

    const order = STAGE_ORDER[key];
    const status = key === 'requirements' ? 'open' : 'locked';
    await db
      .insert(schema.projectStages)
      .values({
        projectId,
        key,
        order,
        status,
        openedAt: status === 'open' ? nowIso() : null,
        passedAt: null,
      })
      .onConflictDoNothing();
  }
}

export async function seed() {
  // Users
  const admin = await ensureUser({ username: 'admin', role: 'admin', realName: 'Admin' });
  const teacher1 = await ensureUser({ username: 't001', role: 'teacher', realName: 'Teacher One', teacherNo: 'T001' });
  const teacher2 = await ensureUser({ username: 't002', role: 'teacher', realName: 'Teacher Two', teacherNo: 'T002' });

  const students = [] as Array<{ id: number; username: string }>;
  for (let i = 1; i <= 12; i++) {
    const no = `S${String(i).padStart(3, '0')}`;
    const u = await ensureUser({ username: no, role: 'student', realName: `Student ${i}`, studentNo: no });
    students.push({ id: u.id, username: u.username });
  }

  // Class
  const cls = await ensureClass('Software Engineering Case Practice', '2025-Fall');
  await ensureTeacherOfClass(cls.id, teacher1.id, 'owner');
  await ensureTeacherOfClass(cls.id, teacher2.id, 'assistant');

  for (const s of students) await ensureEnrollment(cls.id, s.id);

  // Teams
  const teamA = await ensureTeam({ classId: cls.id, name: 'Team Alpha', leaderId: students[0]!.id, description: 'Seed team Alpha' });
  const teamB = await ensureTeam({ classId: cls.id, name: 'Team Beta', leaderId: students[5]!.id, description: 'Seed team Beta' });

  for (const s of students.slice(0, 5)) await ensureTeamMember(teamA.id, cls.id, s.id);
  for (const s of students.slice(5, 10)) await ensureTeamMember(teamB.id, cls.id, s.id);

  // Projects (one active, one draft)
  const projectA = await ensureProject(teamA.id, cls.id, students[0]!.id, 'Seed Project Alpha', 'active');
  await ensureProjectStages(projectA.id);

  const projectB = await ensureProject(teamB.id, cls.id, students[5]!.id, 'Seed Project Beta', 'draft');
  await ensureProjectStages(projectB.id);

  // A seed assignment bound to the first stage
  const existingAssignment = await db
    .select()
    .from(schema.assignments)
    .where(and(eq(schema.assignments.classId, cls.id), eq(schema.assignments.stageKey, 'requirements'), isNull(schema.assignments.deletedAt)))
    .get();
  if (!existingAssignment) {
    await db
      .insert(schema.assignments)
      .values({
        classId: cls.id,
        stageKey: 'requirements',
        type: 'team',
        title: 'Requirements Document',
        description: 'Upload your requirements document (seed).',
        deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        createdBy: teacher1.id,
      })
      .onConflictDoNothing();
  }



  // Case Library (at least one record so tests can resolve a real caseId)
  const case1 = await ensureCase({
    classId: cls.id,
    createdBy: teacher1.id,
    title: 'Seed Case: Hotel Booking System',
    description: 'A seed case for testing and demo purposes.',
    tags: 'seed,demo',
  });
  return {
    ok: true,
    defaultPassword: DEFAULT_PASSWORD,
    classId: cls.id,
    admin: admin.username,
    teachers: [teacher1.username, teacher2.username],
    students: students.map((s) => s.username),
    teams: [teamA.name, teamB.name],
    projects: [projectA.name, projectB.name],
    caseId: case1.id,
    cases: [case1.title],
  };
}

// Bun entrypoint
if (import.meta.main) {
  seed()
    .then((r) => {
      console.log('Seed complete:', r);
    })
    .catch((e) => {
      console.error('Seed failed:', e);
      process.exitCode = 1;
    });
}
