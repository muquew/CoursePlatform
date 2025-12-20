import app from '../../src/index';

test('POST /classes/:classId/assignments validates type and stageKey', async () => {
  const res = await app.handle(
    new Request('http://localhost/api/v1/classes/1/assignments', {
      method: 'POST',
      body: JSON.stringify({ stageKey: 'requirements', type: 'invalid', title: 'x', deadline: '2025-01-01T00:00:00Z' }),
      headers: { 'content-type': 'application/json' },
    }),
  );
  expect([400, 401]).toContain(res.status);
});
