import { Elysia } from 'elysia';
import { httpError } from '../lib/http-error.ts';
import { sha256Hex } from '../lib/crypto.ts';
import { normalizeBearer } from '../lib/token.ts';

const METHODS_REQUIRING_CSRF = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const csrfGuard = (app: Elysia) =>
  app.derive(({ request }) => {
    const checkCsrf = () => {
      if (process.env.CSRF_ENABLED !== '1') return;
      if (!METHODS_REQUIRING_CSRF.has(request.method)) return;
      const token = request.headers.get('x-csrf-token');
      if (!token) throw httpError.forbidden('CSRF token required');
      // simple double-submit: token must equal sha256(bearer)
      const authHeader = request.headers.get('authorization') ?? '';
      const bearerToken = normalizeBearer(authHeader);
      if (!bearerToken) throw httpError.forbidden('CSRF check failed');
      const expected = sha256Hex(bearerToken);
      if (token !== expected) throw httpError.forbidden('CSRF check failed');
    };
    return { checkCsrf };
  });