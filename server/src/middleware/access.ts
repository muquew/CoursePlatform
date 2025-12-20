import { Elysia } from 'elysia';

import { httpError } from '../lib/http-error.ts';
import { canByRole, evaluate } from '../access-control.ts';
import type { AuthUser } from './auth.ts';

export type AuthorizeArgs = {
  resource: string;
  action: string;
  // optional extra context passed to ABAC rules
  context?: Record<string, unknown>;
};

/**
 * Access control middleware.
 *
 * Adds `authorize({resource, action})` to context.
 *
 * Behavior:
 * - Requires authentication for any authorize() call
 * - Checks RBAC first (role-based)
 * - Then checks ABAC rules (optional constraints)
 */
export const accessControl = (app: Elysia) =>
  app.derive((ctx) => {
    const { user, db, schema } = ctx as any as { user: AuthUser | null; db: unknown; schema: unknown };
    const authorize = async ({ resource, action, context }: AuthorizeArgs) => {
      if (!user) throw httpError.unauthorized('Login required');

      if (!canByRole(user, action, resource)) {
        throw httpError.forbidden('Insufficient permissions');
      }

      const ok = await evaluate(resource, action, { db, schema, user, ...(context ?? {}) } as any);
      if (!ok) throw httpError.forbidden('Access denied');
    };

    return { authorize };
  });
