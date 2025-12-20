import { Elysia } from 'elysia';
import { errorHandler } from '../src/middleware/error-handler';
import { requestId } from '../src/middleware/request-id';

const app = new Elysia().use(requestId).use(errorHandler).get('/boom', () => {
  throw new Error('class archived: write blocked');
});

test('maps trigger abort to 403', async () => {
  const res = await app.handle(new Request('http://localhost/boom'));
  expect(res.status).toBe(403);
  expect(res.headers.get('x-request-id')).toBeTruthy();
  const body = await res.json();
  expect(body.error.code).toBe('FORBIDDEN');
});
