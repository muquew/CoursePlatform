// lib/http-error.ts
export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL';

export type HttpErrorShape = {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
};

export class HttpError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown, opts?: { cause?: unknown }) {
    super(message, opts as any);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const isHttpError = (e: unknown): e is HttpError =>
  typeof e === 'object' &&
  e !== null &&
  (e as any).name === 'HttpError' &&
  typeof (e as any).status === 'number' &&
  typeof (e as any).code === 'string';

export function toHttpError(e: unknown, fallbackMessage = 'Internal Server Error'): HttpError {
  if (e instanceof HttpError) return e;
  if (isHttpError(e)) {
    // 某些情况下跨包/跨 realm，instanceof 可能失效，做一次兜底包装
    return new HttpError((e as any).status, (e as any).code, (e as any).message ?? fallbackMessage, (e as any).details);
  }
  if (e instanceof Error) return new HttpError(500, 'INTERNAL', e.message || fallbackMessage, undefined, { cause: e });
  return new HttpError(500, 'INTERNAL', fallbackMessage, { original: e });
}

export function serializeHttpError(e: HttpError): HttpErrorShape {
  return { status: e.status, code: e.code, message: e.message, details: e.details };
}

export const httpError = {
  unauthorized: (message = 'Unauthorized', details?: unknown) =>
    new HttpError(401, 'UNAUTHORIZED', message, details),
  forbidden: (message = 'Forbidden', details?: unknown) =>
    new HttpError(403, 'FORBIDDEN', message, details),
  badRequest: (message = 'Bad Request', details?: unknown) =>
    new HttpError(400, 'BAD_REQUEST', message, details),
  notFound: (message = 'Not Found', details?: unknown) =>
    new HttpError(404, 'NOT_FOUND', message, details),
  conflict: (message = 'Conflict', details?: unknown) =>
    new HttpError(409, 'CONFLICT', message, details),
  tooManyRequests: (message = 'Too Many Requests', details?: unknown) =>
    new HttpError(429, 'TOO_MANY_REQUESTS', message, details),
  internal: (message = 'Internal Server Error', details?: unknown) =>
    new HttpError(500, 'INTERNAL', message, details),
};
