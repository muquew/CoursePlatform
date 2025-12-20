import { httpError } from './http-error.ts';

/**
 * Runtime guards to enforce REQUIRE.md + ROUTES.md hard rules.
 *
 * Even though schema.ts has SQLite triggers as a safety net, the API layer
 * should fail fast with a clear error message.
 */

export type ClassLike = { id?: number; status?: string; allowStudentDownloadAfterArchived?: boolean };
export type TeamLike = { id?: number; status?: string; isLocked?: boolean };

export function assertClassWritable(cls: ClassLike | null | undefined): asserts cls is ClassLike {
  if (!cls) throw httpError.notFound('Class not found.');
  if (String(cls.status).toLowerCase() === 'archived') {
    throw httpError.forbidden('Class is archived (read-only).');
  }
}

export function assertTeamNotLocked(team: TeamLike | null | undefined): asserts team is TeamLike {
  if (!team) throw httpError.notFound('Team not found.');
  if (team.isLocked || String(team.status).toLowerCase() === 'locked') {
    throw httpError.forbidden('Team is locked.');
  }
}

export function assertArchivedDownloadAllowed(cls: ClassLike | null | undefined) {
  if (!cls) throw httpError.notFound('Class not found.');
  if (String(cls.status).toLowerCase() !== 'archived') return;
  if (cls.allowStudentDownloadAfterArchived === false) {
    throw httpError.forbidden('Downloads are disabled after class archived.');
  }
}

export function assertId(id: unknown, name = 'id'): number {
  const n = typeof id === 'string' ? Number(id) : typeof id === 'number' ? id : NaN;
  if (!Number.isFinite(n) || n <= 0) throw httpError.badRequest(`Invalid ${name}.`);
  return Math.floor(n);
}