import { Elysia } from 'elysia';
import { appContext } from '../src/plugins/app';
import { authGuard } from '../src/middleware/auth';
import { csrfGuard } from '../src/middleware/csrf';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.CSRF_ENABLED = '1';

const app = new Elysia().use(appContext).use(authGuard).use(csrfGuard).post('/post', ({ checkCsrf }) => {
  checkCsrf();
  return { ok: true };
});

test('csrf blocks missing token', async () => {
  const res = await app.handle(new Request('http://localhost/post', { method: 'POST' }));
  expect(res.status).toBe(403);
});
