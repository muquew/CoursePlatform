import { Elysia } from 'elysia';
import { appContext } from '../src/plugins/app';
import { authGuard } from '../src/middleware/auth';
import { accessControl } from '../src/middleware/access';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const app = new Elysia().use(appContext).use(authGuard).use(accessControl).get('/secure', async ({ authorize }) => {
  await authorize({ resource: 'admin', action: 'manage' });
  return { ok: true };
});

test('deny student access to admin manage', async () => {
  // no token
  const res = await app.handle(new Request('http://localhost/secure'));
  expect(res.status).toBe(401);
});
