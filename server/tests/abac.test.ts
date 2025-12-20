import { register, evaluate, clear, disableRule, enableRule } from '../src/access-control';

test('abac rule allow then disable', async () => {
  clear();
  register('classes:read', async () => true);
  const ok1 = await evaluate('classes', 'read', { db: {} as any, schema: {} as any, user: { id: 1, role: 'student', username: 'x' } as any });
  expect(ok1).toBe(true);
  disableRule('classes:read');
  const ok2 = await evaluate('classes', 'read', { db: {} as any, schema: {} as any, user: { id: 1, role: 'student', username: 'x' } as any });
  expect(ok2).toBe(true);
  enableRule('classes:read');
  const ok3 = await evaluate('classes', 'read', { db: {} as any, schema: {} as any, user: { id: 1, role: 'student', username: 'x' } as any });
  expect(ok3).toBe(true);
});
