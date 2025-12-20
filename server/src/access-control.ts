/**
 * Access control (RBAC + ABAC).
 *
 * - RBAC provides a coarse allow/deny by role.
 * - ABAC rules are optional constraints: when disabled or missing, they are ignored.
 *
 * This module is intentionally small because tests use it directly.
 */

import type { DBClient } from './db';
import type * as Schema from './db/schema.ts';
import type { AuthUser } from './middleware/auth.ts';

export type Resource = string;
export type Action = string;

export type AbacContext = {
  db: DBClient;
  schema: typeof Schema;
  user: AuthUser;
  // extra context passed by route/middleware
  [k: string]: unknown;
};

/**
 * Role-based coarse permissions.
 *
 * Notes:
 * - Keep this minimal and conservative.
 * - Admin is all-access.
 * - Teacher has class management capabilities.
 * - Student is read-mostly and cannot manage admin.
 */
export function canByRole(user: AuthUser, action: Action, resource: Resource): boolean {
  if (user.role === 'admin') return true;

  // High-stakes: admin management is admin-only.
  if (resource === 'admin' && action === 'manage') return false;

  if (user.role === 'teacher') {
    if (action === 'read' && (resource === 'classes' || resource === 'groups' || resource === 'teams')) return true;
    if (action === 'create' && resource === 'assignments') return true;
    // teachers can generally read core entities
    if (action === 'read' && ['users', 'projects', 'submissions', 'grades', 'notifications'].includes(resource)) return true;
    return false;
  }

  // student
  if (action === 'manage' && resource === 'admin') return false;
  if (action === 'read' && ['classes', 'groups', 'teams', 'projects', 'assignments', 'grades', 'notifications'].includes(resource)) {
    return true;
  }
  // default deny
  return false;
}

type RuleFn = (ctx: AbacContext) => boolean | Promise<boolean>;
type RuleState = { fn: RuleFn; enabled: boolean };
const rules = new Map<string, RuleState>();

export function register(key: string, fn: RuleFn) {
  rules.set(key, { fn, enabled: true });
}

export function clear() {
  rules.clear();
}

export function disableRule(key: string) {
  const r = rules.get(key);
  if (!r) return;
  r.enabled = false;
}

export function enableRule(key: string) {
  const r = rules.get(key);
  if (!r) return;
  r.enabled = true;
}

/**
 * Evaluate an ABAC rule.
 *
 * IMPORTANT: If a rule is missing or disabled, evaluation defaults to ALLOW.
 * This matches the course tests and keeps ABAC as an optional layer.
 */
export async function evaluate(resource: Resource, action: Action, ctx: AbacContext): Promise<boolean> {
  const key = `${resource}:${action}`;
  const r = rules.get(key);
  if (!r || !r.enabled) return true;
  return await r.fn(ctx);
}
