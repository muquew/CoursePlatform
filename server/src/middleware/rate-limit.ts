import { Elysia } from 'elysia';
import { httpError } from '../lib/http-error.ts';
import { getConfig } from '../config/index.ts';

type Bucket = { resetAt: number; count: number };
const buckets = new Map<string, Bucket>();

const runtimeRateLimit = () => {
  const cfg = getConfig();
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? cfg.rateLimit.windowMs ?? 60_000);
  const limit = Number(process.env.RATE_LIMIT_LIMIT ?? cfg.rateLimit.limit ?? 120);
  return { windowMs, limit };
};

function keyFromRequest(req: Request) {
  const first = (req.headers.get('x-forwarded-for') ?? '').split(',')[0] ?? '';
  const ip = first.trim();
  return ip || 'local';
}

export const rateLimit = (app: Elysia) =>
  app.onRequest(({ request }) => {
    const key = keyFromRequest(request);
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now >= b.resetAt) {
      const rl = runtimeRateLimit();
      buckets.set(key, { count: 1, resetAt: now + rl.windowMs });
      return;
    }
    b.count += 1;
    const rl = runtimeRateLimit();
    if (b.count > rl.limit) {
      throw httpError.tooManyRequests('Rate limit exceeded');
    }
  });