import { describe, expect, test, beforeAll } from 'bun:test';

import app from '../src/index.ts';
import { seed } from '../src/db/seed.ts';
import { db } from '../src/db/index.ts';
import * as schema from '../src/db/schema.ts';
import { eq, and, isNull } from 'drizzle-orm';

type RouteDef = { method: string; path: string };

const BASE = 'http://localhost';
const API_PREFIX = '/api/v1';

function parseRoutesMd(markdown: string): RouteDef[] {
  // Matches: `GET /path/:id`
  const rx = /`\s*(GET|POST|PUT|PATCH|DELETE)\s+([^`\s]+)\s*`/g;
  const out: RouteDef[] = [];
  for (const m of markdown.matchAll(rx)) {
    out.push({ method: m[1], path: m[2] });
  }
  // Deduplicate by method+path
  const seen = new Set<string>();
  return out.filter((r) => {
    const k = `${r.method} ${r.path}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function ensureApiPrefix(path: string): string {
  if (path.startsWith('/api/')) return path;
  // ROUTES.md only documents v1 API routes (no root /about etc)
  return `${API_PREFIX}${path.startsWith('/') ? '' : '/'}${path}`;
}

function materializePath(path: string, vars: Record<string, string | number>): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_full, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null) return '1';
    return String(v);
  });
}

async function jsonOrText(res: Response): Promise<any> {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  return await res.text();
}

async function login(username: string, password: string): Promise<string> {
  const res = await app.handle(
    new Request(`${BASE}${API_PREFIX}/auth/login`, {
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

async function requestRoute(method: string, path: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  // Provide a JSON body for mutation endpoints. If the payload is invalid, we still
  // accept non-404 errors as "route exists".
  const isMutation = method !== 'GET' && method !== 'DELETE';
  if (isMutation) headers['content-type'] = 'application/json';

  const req = new Request(`${BASE}${path}`, {
    method,
    headers,
    body: isMutation ? JSON.stringify({}) : undefined,
  });
  return await app.handle(req);
}

describe('routes coverage (documented in ROUTES.md)', () => {
  let tokenAdmin = '';

  const vars: Record<string, string | number> = {
    id: 1,
    classId: 1,
    studentId: 1,
    teacherId: 1,
    teamId: 1,
    projectId: 1,
    assignmentId: 1,
    caseId: 1,
    stageKey: 'proposal',
    key: 'demo',
  };

  beforeAll(async () => {
    // Ensure there is seed data. Seed uses an idempotent upsert strategy.
    const seeded = await seed();
    vars.classId = seeded.classId;

    // Try to resolve concrete IDs where possible.
    try {
      const team = await db
        .select({ id: schema.teams.id })
        .from(schema.teams)
        .where(and(eq(schema.teams.classId, seeded.classId), isNull(schema.teams.deletedAt)))
        .limit(1)
        .get();
      if (team?.id) vars.teamId = team.id;
    } catch {}

    try {
      const proj = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(isNull(schema.projects.deletedAt))
        .limit(1)
        .get();
      if (proj?.id) vars.projectId = proj.id;
    } catch {}

    try {
      const asg = await db
        .select({ id: schema.assignments.id })
        .from(schema.assignments)
        .where(isNull(schema.assignments.deletedAt))
        .limit(1)
        .get();
      if (asg?.id) vars.assignmentId = asg.id;
    } catch {}

    try {
      const c = await db
        .select({ id: schema.caseLibrary.id })
        .from(schema.caseLibrary)
        .where(isNull(schema.caseLibrary.deletedAt))
        .limit(1)
        .get();
      if (c?.id) vars.caseId = c.id;
    } catch {}

    // Seed prints defaultPassword; keep it in sync here.
    tokenAdmin = await login(seeded.admin, seeded.defaultPassword);
  });

  test('all documented routes are registered (no plain Not Found)', async () => {
    const routesMd = await Bun.file(new URL('../ROUTES.md', import.meta.url)).text();
    const defs = parseRoutesMd(routesMd);
    expect(defs.length).toBeGreaterThan(0);

    // Run sequentially to make debugging easier.
    for (const def of defs) {
      const fullPath = ensureApiPrefix(materializePath(def.path, vars));
      const res = await requestRoute(def.method, fullPath, tokenAdmin);

      if (res.status === 404) {
        const body = await jsonOrText(res);
        // If the route exists but the resource doesn't, our error handler returns JSON with NOT_FOUND.
        const okJsonNotFound = body?.error?.code === 'NOT_FOUND';
        if (!okJsonNotFound) {
          throw new Error(`Route missing? ${def.method} ${fullPath} returned plain 404: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
        }
      }

      // 405 usually indicates route mismatch (wrong method or missing route).
      if (res.status === 405) {
        const body = await jsonOrText(res);
        throw new Error(`Method not allowed: ${def.method} ${fullPath} -> 405 (${typeof body === 'string' ? body : JSON.stringify(body)})`);
      }
    }
  });
});
