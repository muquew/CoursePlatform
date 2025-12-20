import { HttpError, serializeHttpError, toHttpError } from './http-error.ts';

export type ErrorEntry = {
  ts: string;
  reqId?: string;
  route?: string;
  status: number;
  code: string;
  message: string;
  stack?: string;
  context?: unknown;
};

const buffer: ErrorEntry[] = [];
let MAX = 100;

export function setErrorBufferLimit(max: number) {
  if (!Number.isFinite(max) || max <= 0) return;
  MAX = Math.floor(max);
  // trim
  while (buffer.length > MAX) buffer.shift();
}

export function recordError(e: ErrorEntry) {
  buffer.push(e);
  if (buffer.length > MAX) buffer.shift();
}

export function recordUnknownError(
  e: unknown,
  ctx?: { reqId?: string; route?: string; context?: unknown },
): HttpError {
  const he = toHttpError(e);
  recordError({
    ts: new Date().toISOString(),
    reqId: ctx?.reqId,
    route: ctx?.route,
    status: he.status,
    code: he.code,
    message: he.message,
    stack: he.stack,
    context: ctx?.context ?? he.details,
  });
  return he;
}

export function getRecentErrors(limit = 50) {
  return buffer.slice().reverse().slice(0, Math.max(0, limit));
}

export function getRecentHttpErrors(limit = 50) {
  return getRecentErrors(limit).map((x) =>
    serializeHttpError(new HttpError(x.status, x.code as any, x.message, x.context)),
  );
}

export function clearErrors() {
  buffer.length = 0;
}