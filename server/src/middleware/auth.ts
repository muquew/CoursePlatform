// src/middleware/auth.ts
import { Elysia, t } from 'elysia';
import jwt from '@elysiajs/jwt';
import { bearer } from '@elysiajs/bearer';
import { httpError } from '../lib/http-error.ts';
import { userRoleEnum } from '../db/schema.ts';
import type { UserRole } from '../db/schema.ts';
import { normalizeBearer } from '../lib/token.ts';
import { getConfig } from '../config/index.ts';

// NOTE: tests may set JWT_SECRET after importing modules.
// Avoid capturing env at import-time.

const roleLiterals = userRoleEnum.map((r) => t.Literal(r)) as unknown as [
  ReturnType<typeof t.Literal>,
  ...ReturnType<typeof t.Literal>[]
];

const UserRoleSchema = t.Union(roleLiterals);

export const AuthPayload = t.Object({
  id: t.Number(),
  role: UserRoleSchema,
  username: t.String(),
});

export type AuthUser = { id: number; role: UserRole; username: string };

const runtimeJwtSecret = () => {
  const cfg = getConfig();
  return cfg.security.jwt.secret || process.env.JWT_SECRET || 'test-secret';
};

const runtimeJwtExp = () => {
  const cfg = getConfig();
  return cfg.security.jwt.exp || '7d';
};

export const createJwtPlugin = () =>
  jwt({
    name: 'jwt',
    secret: runtimeJwtSecret(),
    exp: runtimeJwtExp(),
    schema: AuthPayload,
  });

const isUserRole = (x: unknown): x is UserRole =>
  typeof x === 'string' && (userRoleEnum as readonly string[]).includes(x);

// 把 verify 的返回统一做一次“安全解析”
const parseAuthPayload = (payload: unknown): AuthUser | null => {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as { id?: unknown; role?: unknown; username?: unknown };

  if (typeof p.id !== 'number' || !Number.isFinite(p.id)) return null;
  if (!isUserRole(p.role)) return null;
  if (typeof p.username !== 'string' || p.username.length === 0) return null;

  return { id: p.id, role: p.role, username: p.username };
};

/**
 * Auth extraction middleware.
 *
 * IMPORTANT (for tests):
 * - Missing token should NOT immediately 401.
 * - Invalid token MUST 401.
 *
 * Protected handlers should call `authorize()` (from accessControl) or other
 * role guards to enforce login.
 */
export const authGuard = (app: Elysia) =>
  app
    .use(createJwtPlugin())
    .use(bearer())
    .derive(async ({ jwt, bearer }) => {
      if (!bearer) return { user: null };
      const token = normalizeBearer(bearer);
      if (!token) return { user: null };

      let raw: unknown;
      try {
        raw = await jwt.verify(token);
      } catch {
        throw httpError.unauthorized('Invalid token');
      }

      const user = parseAuthPayload(raw);
      if (!user) throw httpError.unauthorized('Invalid token payload');
      return { user };
    });

/** Backward-compatible alias: optional auth extraction */
export const optionalAuthGuard = authGuard;