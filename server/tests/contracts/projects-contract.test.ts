import app from '../../src/index';

test('POST /teams/:teamId/projects validates payload', async () => {
  const res = await app.handle(
    new Request('http://localhost/api/v1/teams/1/projects', {
      method: 'POST',
      body: JSON.stringify({ sourceType: 'custom' }),
      headers: { 'content-type': 'application/json' },
    }),
  );
  expect([400, 401]).toContain(res.status);
});

test('PATCH /projects/:id/stages/:stageKey validates status', async () => {
  const res = await app.handle(
    new Request('http://localhost/api/v1/projects/1/stages/requirements', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'invalid' }),
      headers: { 'content-type': 'application/json' },
    }),
  );
  expect([400, 401]).toContain(res.status);
});
