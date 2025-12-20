import { sql, type SQL } from 'drizzle-orm';

/**
 * Helpers for the REQUIRE.md soft-delete convention: core tables have `deleted_at`.
 *
 * Usage:
 *   .where(and(eq(t.classId, id), notDeleted(t.deletedAt)))
 */

export function notDeleted(deletedAtCol: unknown): SQL {
  return sql`${deletedAtCol} IS NULL`;
}

export function softDeleted(deletedAtCol: unknown): SQL {
  return sql`${deletedAtCol} IS NOT NULL`;
}

export function isTrue(booleanIntCol: unknown): SQL {
  return sql`${booleanIntCol} = 1`;
}

export function isFalse(booleanIntCol: unknown): SQL {
  return sql`${booleanIntCol} = 0`;
}
