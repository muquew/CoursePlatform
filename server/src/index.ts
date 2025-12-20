import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';

import { getConfig } from './config/index.ts';

import { appContext } from './plugins/app.ts';
import { authGuard } from './middleware/auth.ts';
import { csrfGuard } from './middleware/csrf.ts';
import { accessControl } from './middleware/access.ts';
import { requestId } from './middleware/request-id.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { rateLimit } from './middleware/rate-limit.ts';

import { nowIso } from './lib/time.ts';
import { v1Routes } from './routes/v1/index.ts';

const cfg = getConfig();
const PORT = cfg.server.port;
const corsOrigin = new RegExp(cfg.server.cors.originRegex);

/**
 * Root app (no global prefix).
 *
 * Tests expect:
 * - GET / returns running message
 * - GET /about returns service info
 */
const app = new Elysia()
  .use(cors({ origin: corsOrigin }))
  .use(rateLimit)
  .use(requestId)
  .use(errorHandler)
  .get('/', () => ({ message: 'Course Management Platform API is running' }))
  .get('/about', () => ({
    name: cfg.service.name,
    version: cfg.service.version,
    description: cfg.service.description,
  }));

/**
 * API v1 group.
 */
app.group('/api/v1', (v1) => {
  // OpenAPI docs mounted at /api/v1/swagger
  try {
    v1.use(
      swagger({
        path: '/swagger',
        documentation: {
          info: { title: `${cfg.service.name} API (v1)`, version: cfg.service.version },
          components: {
            securitySchemes: {
              BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
          },
        },
      }),
    );
  } catch {}

  // Context + security
  v1.use(appContext).use(authGuard).use(csrfGuard).use(accessControl);

  // --- Base
  v1.get('/', () => ({ ok: true, ts: nowIso() }));

  // New v1 business routes (ROUTES.md)
  v1.use(v1Routes);


  return v1;
});

// Start server only when this file is the entrypoint (avoid side-effects in tests)
const isDirectRun = (() => {
  try {
    const argvUrl = new URL(`file://${process.argv[1]}`).href;
    return import.meta.url === argvUrl;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  app.listen(PORT, () => {
    console.log(`[Elysia] \uD83D\uDE80 Server running at http://localhost:${PORT}`);
    console.log(`[Docs] \uD83D\uDCDC OpenAPI at http://localhost:${PORT}/api/v1/swagger`);
  });
}

export type App = typeof app;
export default app;
