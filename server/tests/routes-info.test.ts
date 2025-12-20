import app from '../src/index';

test('GET / returns running message', async () => {
  const res = await app.handle(new Request('http://localhost/'));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.message).toMatch(/API is running/);
});

test('GET /about returns info', async () => {
  const res = await app.handle(new Request('http://localhost/about'));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.name).toBe('Course Management Platform');
});
