import { beforeAll, expect, test } from 'bun:test';
import app from '../src/index';

import { seed } from '../src/db/seed.ts';
import { db } from '../src/db/index.ts';
import * as schema from '../src/db/schema.ts';
import { and, eq, isNull } from 'drizzle-orm';

type MaybeFn<T> = T | (() => T);

type Smoke = {
  name: string;
  method: string;
  path: MaybeFn<string>;
  body?: MaybeFn<unknown>;
  headers?: Record<string, string>;
  auth?: boolean; // attach Bearer token
};

const BASE = 'http://localhost';

let tokenAdmin = '';
let seededAdmin = 'admin';
let seededPassword = 'Passw0rd!';

const ids: Record<string, number> = {
  userId: 1,
  studentId: 1,
  classId: 1,
  teamId: 1,
  projectId: 1,
  assignmentId: 1,
  caseId: 1,
};

function resolve<T>(x: MaybeFn<T>): T {
  return typeof x === 'function' ? (x as any)() : x;
}

async function login(username: string, password: string): Promise<string> {
  const res = await app.handle(
    new Request(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  );
  const body = (await res.json()) as any;
  expect(res.status).toBe(200);
  expect(body?.token).toBeTruthy();
  return body.token as string;
}

beforeAll(async () => {
  const seeded = await seed();
  seededAdmin = seeded.admin;
  seededPassword = seeded.defaultPassword;

  // Resolve stable IDs from the seeded DB
  ids.classId = seeded.classId;

  try {
    const adminRow = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.username, seeded.admin), isNull(schema.users.deletedAt)))
      .limit(1)
      .get();
    if (adminRow?.id) ids.userId = adminRow.id;
  } catch {}


  try {
    const u0 = seeded.students?.[0] as string | undefined;
    if (u0) {
      const s0 = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.username, u0), isNull(schema.users.deletedAt)))
        .limit(1)
        .get();
      if (s0?.id) ids.studentId = s0.id;
    }
  } catch {}
  try {
    const team = await db
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .where(and(eq(schema.teams.classId, ids.classId), isNull(schema.teams.deletedAt)))
      .limit(1)
      .get();
    if (team?.id) ids.teamId = team.id;
  } catch {}

  try {
    const proj = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.classId, ids.classId), isNull(schema.projects.deletedAt)))
      .limit(1)
      .get();
    if (proj?.id) ids.projectId = proj.id;
  } catch {}

  try {
    const asg = await db
      .select({ id: schema.assignments.id })
      .from(schema.assignments)
      .where(and(eq(schema.assignments.classId, ids.classId), isNull(schema.assignments.deletedAt)))
      .limit(1)
      .get();
    if (asg?.id) ids.assignmentId = asg.id;
  } catch {}

  try {
    const c = await db
      .select({ id: schema.caseLibrary.id })
      .from(schema.caseLibrary)
      .where(and(eq(schema.caseLibrary.classId, ids.classId), isNull(schema.caseLibrary.deletedAt)))
      .limit(1)
      .get();
    if (c?.id) ids.caseId = c.id;
  } catch {}

  tokenAdmin = await login(seededAdmin, seededPassword);
});

const cases: Smoke[] = [
  { name: 'v1 base', method: 'GET', path: '/api/v1', auth: true },

  // Auth
  { name: 'auth login', method: 'POST', path: '/api/v1/auth/login', body: () => ({ username: seededAdmin, password: seededPassword }), auth: false },
  { name: 'auth logout', method: 'POST', path: '/api/v1/auth/logout', body: {}, auth: true },
  { name: 'auth me', method: 'GET', path: '/api/v1/auth/me', auth: true },

  // Users
  { name: 'users list', method: 'GET', path: '/api/v1/users', auth: true },
  { name: 'users detail', method: 'GET', path: () => `/api/v1/users/${ids.userId}`, auth: true },

  // Classes
  { name: 'classes list', method: 'GET', path: '/api/v1/classes', auth: true },
  { name: 'class detail', method: 'GET', path: () => `/api/v1/classes/${ids.classId}`, auth: true },
  { name: 'class roster list', method: 'GET', path: () => `/api/v1/classes/${ids.classId}/students`, auth: true },
  { name: 'class roster import', method: 'POST', path: () => `/api/v1/classes/${ids.classId}/students/import`, body: { students: [] }, auth: true },
  { name: 'class roster patch', method: 'PATCH', path: () => `/api/v1/classes/${ids.classId}/students/${ids.studentId}`, body: { isActive: false }, auth: true },
  { name: 'class teachers list', method: 'GET', path: () => `/api/v1/classes/${ids.classId}/teachers`, auth: true },

  // Teams
  { name: 'teams list', method: 'GET', path: () => `/api/v1/classes/${ids.classId}/teams`, auth: true },
  { name: 'team detail', method: 'GET', path: () => `/api/v1/teams/${ids.teamId}`, auth: true },
  { name: 'team join request create', method: 'POST', path: () => `/api/v1/teams/${ids.teamId}/join-requests`, body: {}, auth: true },
  { name: 'team join request decision', method: 'PATCH', path: () => `/api/v1/teams/${ids.teamId}/join-requests/1`, body: { decision: 'approved' }, auth: true },

  // Cases & Projects
  { name: 'case list', method: 'GET', path: () => `/api/v1/classes/${ids.classId}/cases`, auth: true },
  { name: 'case detail', method: 'GET', path: () => `/api/v1/cases/${ids.caseId}`, auth: true },
  { name: 'project create', method: 'POST', path: () => `/api/v1/teams/${ids.teamId}/projects`, body: { sourceType: 'custom', name: 'x' }, auth: true },
  { name: 'projects list', method: 'GET', path: () => `/api/v1/classes/${ids.classId}/projects`, auth: true },
  { name: 'project detail', method: 'GET', path: () => `/api/v1/projects/${ids.projectId}`, auth: true },

  // Stages
  { name: 'project stages list', method: 'GET', path: () => `/api/v1/projects/${ids.projectId}/stages`, auth: true },
  { name: 'project stage patch', method: 'PATCH', path: () => `/api/v1/projects/${ids.projectId}/stages/requirements`, body: { status: 'passed' }, auth: true },
  { name: 'project stage rollback', method: 'POST', path: () => `/api/v1/projects/${ids.projectId}/stages/requirements/rollback`, auth: true },

  // Assignments & Submissions
  {
    name: 'assignment create',
    method: 'POST',
    path: () => `/api/v1/classes/${ids.classId}/assignments`,
    body: { stageKey: 'requirements', type: 'team', title: 'x', deadline: new Date().toISOString() },
    auth: true,
  },
  { name: 'assignments list', method: 'GET', path: () => `/api/v1/classes/${ids.classId}/assignments`, auth: true },
  { name: 'assignment detail', method: 'GET', path: () => `/api/v1/assignments/${ids.assignmentId}`, auth: true },
  { name: 'submission create', method: 'POST', path: () => `/api/v1/assignments/${ids.assignmentId}/submissions`, body: {}, auth: true },

  // Notifications
  { name: 'notifications', method: 'GET', path: '/api/v1/me/notifications', auth: true },
];

for (const c of cases) {
  test(`route exists (authed): ${c.name}`, async () => {
    const body = c.body === undefined ? undefined : resolve(c.body);

    const headers: Record<string, string> = {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(c.headers ?? {}),
    };
    if (c.auth) headers.authorization = `Bearer ${tokenAdmin}`;

    const res = await app.handle(
      new Request(`${BASE}${resolve(c.path)}`, {
        method: c.method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }),
    );

    // In authed mode, we want to avoid UNAUTHORIZED noise (401),
    // while still only asserting "route is registered".
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(401);
  });
}
