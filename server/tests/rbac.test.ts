import { canByRole } from '../src/access-control';

test('role hierarchy: admin inherits teacher and student', () => {
  const user = { id: 1, role: 'admin', username: 'a' } as any;
  expect(canByRole(user, 'read', 'users')).toBe(true);
  expect(canByRole(user, 'manage', 'admin')).toBe(true);
});

test('teacher can read classes and groups', () => {
  const user = { id: 2, role: 'teacher', username: 't' } as any;
  expect(canByRole(user, 'read', 'classes')).toBe(true);
  expect(canByRole(user, 'create', 'assignments')).toBe(true);
});

test('student cannot manage admin', () => {
  const user = { id: 3, role: 'student', username: 's' } as any;
  expect(canByRole(user, 'manage', 'admin')).toBe(false);
});
