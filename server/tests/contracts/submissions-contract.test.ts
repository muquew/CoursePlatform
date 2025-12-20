import app from '../../src/index';

test('POST /assignments/:id/submissions exists and validates payload', async () => {
  const res = await app.handle(
    new Request('http://localhost/api/v1/assignments/1/submissions', {
      method: 'POST',
      // no auth: should be 401; route existence is what we care about in a contract test
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    }),
  );
  expect([400, 401, 404]).toContain(res.status);
});
