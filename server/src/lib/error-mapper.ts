import { HttpError, httpError, isHttpError, toHttpError } from './http-error.ts';
import { JwtError } from './jwt.ts';

/**
 * Convert low-level errors into consistent HttpError.
 *
 * Notes:
 * - SQLite triggers in schema.ts raise specific ABORT codes via message text.
 * - ROUTES.md requires consistent JSON error envelope; see `toErrorEnvelope()`.
 */

export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function toErrorEnvelope(e: HttpError): ErrorEnvelope {
  return { error: { code: e.code, message: e.message, details: e.details } };
}

/**
 * Map known SQLite trigger abort codes to HttpError.
 *
 * SQLite will throw errors whose message often includes the string passed to
 * SELECT RAISE(ABORT, '...'). We rely on that contract.
 */
export function mapSqliteAbortToHttpError(e: unknown): HttpError | null {
  const msg = (e as any)?.message as string | undefined;
  if (!msg) return null;

  // Archived class hard rule (ROUTES.md 0.4)
  if (msg.includes('CLASS_ARCHIVED_READONLY')) {
    return httpError.forbidden('Class is archived (read-only).');
  }

  // Team locked hard rule (REQUIRE.md 3.2)
  if (msg.includes('TEAM_LOCKED')) {
    return httpError.forbidden('Team is locked.');
  }

  // Data isolation / consistency
  if (msg.includes('TEAM_MEMBER_CLASS_MISMATCH') || msg.includes('TEAM_JOIN_REQ_CLASS_MISMATCH')) {
    return httpError.badRequest('Class/team mismatch.');
  }
  if (msg.includes('PROJECT_CLASS_MISMATCH')) {
    return httpError.badRequest('Project/team class mismatch.');
  }

  // Immutable audit log (REQUIRE.md 7.3)
  if (msg.includes('AUDIT_LOG_IMMUTABLE')) {
    return httpError.forbidden('Audit logs are immutable.');
  }

  return null;
}

export function mapJwtErrorToHttpError(e: unknown): HttpError | null {
  if (!(e instanceof JwtError)) return null;
  if (e.code === 'JWT_EXPIRED' || e.code === 'JWT_INVALID_SIGNATURE' || e.code === 'JWT_MALFORMED') {
    return httpError.unauthorized('Invalid or expired token.');
  }
  return httpError.unauthorized('Unauthorized.');
}

/**
 * Main conversion entrypoint.
 */
export function toDomainHttpError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  if (isHttpError(e)) return toHttpError(e);

  const sqlite = mapSqliteAbortToHttpError(e);
  if (sqlite) return sqlite;

  const jwt = mapJwtErrorToHttpError(e);
  if (jwt) return jwt;

  return toHttpError(e);
}
