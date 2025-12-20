import { Elysia } from 'elysia';
import { HttpError } from '../lib/http-error.ts';
import { recordError } from '../lib/err-monitor.ts';
import { logError } from '../lib/logger.ts';

type AnyErr = { code?: unknown; all?: unknown; message?: unknown };

export const errorHandler = (app: Elysia) =>
  app.onError(({ error, set }) => {
    const reqId = (set.headers as any)?.['x-request-id'];
    const route = (error as any)?.route;
    if (error instanceof HttpError) {
      set.status = error.status;
      const payload = { error: { code: error.code, message: error.message, details: error.details } };
      recordError({
        ts: new Date().toISOString(),
        reqId,
        route,
        status: error.status,
        code: error.code,
        message: error.message,
        stack: undefined,
        context: error.details,
      });
      logError(error.message, payload);
      return payload;
    }
    const e = error as AnyErr;
    if ((e as any)?.code === 'VALIDATION') {
      set.status = 400;
      const payload = {
        error: {
          code: 'BAD_REQUEST',
          message: 'Validation Error',
          details: (e as any).all ?? (e as any).message ?? error,
        },
      };
      recordError({
        ts: new Date().toISOString(),
        reqId,
        route,
        status: 400,
        code: 'BAD_REQUEST',
        message: 'Validation Error',
        stack: undefined,
        context: (e as any).all ?? (e as any).message ?? error,
      });
      logError('Validation Error', payload);
      return payload;
    }
    const msg = String((error as any)?.message ?? 'Internal Server Error');
    const mapped = classifyUnknown(msg);
    set.status = mapped.status;
    const payload = { error: { code: mapped.code, message: mapped.message } };
    recordError({
      ts: new Date().toISOString(),
      reqId,
      route,
      status: mapped.status,
      code: mapped.code,
      message: mapped.message,
      stack: (error as any)?.stack,
      context: undefined,
    });
    logError(mapped.message, payload);
    return payload;
  });

function classifyUnknown(message: string): { status: number; code: string; message: string } {
  const m = message.toLowerCase();
  if (m.includes('write blocked') || m.includes('locked')) return { status: 403, code: 'FORBIDDEN', message };
  if (m.includes('not found')) return { status: 404, code: 'NOT_FOUND', message };
  if (m.includes('bad request') || m.includes('invalid')) return { status: 400, code: 'BAD_REQUEST', message };
  return { status: 500, code: 'INTERNAL', message: 'Internal Server Error' };
}