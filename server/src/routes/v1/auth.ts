import { Elysia, t } from 'elysia';
import { and, eq, isNull } from 'drizzle-orm';
import { verifyPassword } from '../../lib/password.ts';
import { httpError } from '../../lib/http-error.ts';
import { parseJsonOr, requireUser } from '../_helpers.ts';
import { userRoleEnum } from '../../db/schema';

export const authRoutes = new Elysia({ name: 'authRoutes' })
/* =========================================================
   * Auth
   * ========================================================= */
  .post(
    '/auth/login',
    async (ctx) => {
      const { db, schema, jwt } = ctx as any;
      const { username, password } = ctx.body as any;
      const userRow = await db
        .select({
          id: schema.users.id,
          username: schema.users.username,
          role: schema.users.role,
          passwordHash: schema.users.passwordHash,
          mustChangePassword: schema.users.mustChangePassword,
        })
        .from(schema.users)
        .where(and(eq(schema.users.username, username), isNull(schema.users.deletedAt)))
        .get();
      if (!userRow) throw httpError.unauthorized('Invalid username or password');

      const ok = verifyPassword(password, userRow.passwordHash);
      if (!ok) throw httpError.unauthorized('Invalid username or password');

      const token = await jwt.sign({ id: userRow.id, role: userRow.role, username: userRow.username });
      return {
        token,
        user: {
          id: userRow.id,
          username: userRow.username,
          role: userRow.role,
          mustChangePassword: !!userRow.mustChangePassword,
        },
      };
    },
    {
      body: t.Object({ username: t.String(), password: t.String() }),
    },
  )
  .get('/auth/me', async (ctx) => {
    const u = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;

    const userRow = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        role: schema.users.role,
        mustChangePassword: schema.users.mustChangePassword,
      })
      .from(schema.users)
      .where(and(eq(schema.users.id, u.id), isNull(schema.users.deletedAt)))
      .get();
    if (!userRow) throw httpError.unauthorized('User not found');

    if (!userRoleEnum.includes(userRow.role)) throw httpError.unauthorized('Invalid role');
    
    const profileRow = `${userRow.role}Profiles`;
    const [settings, profile] = await Promise.all([
      db
        .select()
        .from(schema.userSettings)
        .where(and(eq(schema.userSettings.userId, u.id), isNull(schema.userSettings.deletedAt)))
        .get(),
      db
        .select()
        .from(schema[profileRow])
        .where(and(eq(schema[profileRow].userId, u.id), isNull(schema[profileRow].deletedAt)))
        .get(),
    ]);

    return {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role,
      mustChangePassword: !!userRow.mustChangePassword,
      profile: profile|| null,
      settings: settings ? { activeClassId: settings.activeClassId, prefs: parseJsonOr(settings.prefsJson, {}) } : null,
    };
  })
  .post('/auth/logout', async () => ({ ok: true }));
