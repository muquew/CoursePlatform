import { Elysia } from 'elysia';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { httpError } from '../../lib/http-error.ts';
import { nowIso } from '../../lib/time.ts';
import { asNumber, parseJsonOr, requireUser } from '../_helpers.ts';

export const notificationsRoutes = new Elysia({ name: 'notificationsRoutes' })
/* =========================================================
   * Notifications
   * ========================================================= */
  .get('/me/notifications', async (ctx) => {
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, me.id), isNull(schema.notifications.deletedAt)))
      .orderBy(desc(schema.notifications.id))
      .all();
    return rows.map((n: any) => ({ ...n, payload: parseJsonOr(n.payloadJson, {}) }));
  })
  .patch('/me/notifications/:notificationId', async (ctx) => {
    const me = requireUser((ctx as any).user);
    const id = asNumber((ctx.params as any).notificationId);
    const { db, schema } = ctx as any;
    const row = await db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.id, id), isNull(schema.notifications.deletedAt)))
      .get();
    if (!row) throw httpError.notFound('Notification not found');
    if (row.userId !== me.id) throw httpError.forbidden('Access denied');
    const readAt = (ctx.body as any)?.readAt ?? nowIso();
    await db.update(schema.notifications).set({ readAt }).where(eq(schema.notifications.id, id));
    return { ok: true, readAt };
  });
