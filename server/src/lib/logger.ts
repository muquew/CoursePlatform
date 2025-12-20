type LogLevel = 'info' | 'warn' | 'error';

export type LogContext = {
  service?: string;
  reqId?: string;
  route?: string;
  userId?: string;
};

function normalizeData(data: unknown): unknown {
  if (!data) return data;
  if (data instanceof Error) {
    return { name: data.name, message: data.message, stack: data.stack };
  }
  return data;
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_k, v) => {
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v as object)) return '[Circular]';
      seen.add(v as object);
    }
    return v;
  });
}

function write(level: LogLevel, msg: string, data?: unknown, ctx?: LogContext) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
    data: normalizeData(data),
  };

  const line = safeStringify(entry);
  const fn = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  // eslint-disable-next-line no-console
  (console as any)[fn](line);
}

export function logError(msg: string, data?: unknown, ctx?: LogContext) {
  write('error', msg, data, ctx);
}

export function logInfo(msg: string, data?: unknown, ctx?: LogContext) {
  write('info', msg, data, ctx);
}

export function logWarn(msg: string, data?: unknown, ctx?: LogContext) {
  write('warn', msg, data, ctx);
}

export function createLogger(baseCtx: LogContext) {
  return {
    info: (msg: string, data?: unknown) => logInfo(msg, data, baseCtx),
    warn: (msg: string, data?: unknown) => logWarn(msg, data, baseCtx),
    error: (msg: string, data?: unknown) => logError(msg, data, baseCtx),
  };
}
