import { Elysia, t } from 'elysia';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { httpError } from '../../lib/http-error.ts';
import { nowIso } from '../../lib/time.ts';
import { STAGE_KEYS, isStageKey } from '../../lib/stages.ts';
import {
  asNumber,
  assertClassReadable,
  assertClassTeacher,
  assertClassWritable,
  getClassById,
  getProjectById,
  getTeamById,
  isTeamMember,
  parseJsonOr,
  requireUser,
  writeAudit
} from '../_helpers.ts';

export const peerReviewRoutes = new Elysia({ name: 'peerReviewRoutes' })
/* =========================================================
   * Peer review
   * ========================================================= */
  .get('/classes/:classId/peer-review-windows', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    const me = requireUser((ctx as any).user);
    if (me.role !== 'admin') await assertClassTeacher(ctx as any, classId);
    const { db, schema } = ctx as any;
    const rows = await db
      .select()
      .from(schema.peerReviewWindows)
      .where(and(eq(schema.peerReviewWindows.classId, classId), isNull(schema.peerReviewWindows.deletedAt)))
      .orderBy(desc(schema.peerReviewWindows.id))
      .all();
    return rows;
  })
  .post(
    '/classes/:classId/peer-review-windows',
    async (ctx) => {
      const classId = asNumber((ctx.params as any).classId);
      const me = requireUser((ctx as any).user);
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, classId);
      const cls = await getClassById(ctx as any, classId);
      assertClassWritable(cls);
      const { stageKey, startsAt, endsAt } = ctx.body as any;
      if (!isStageKey(stageKey)) throw httpError.badRequest('Invalid stageKey');
      const { db, schema } = ctx as any;
      const w = await db
        .insert(schema.peerReviewWindows)
        .values({
          classId,
          stageKey,
          status: 'open',
          openAt: startsAt ?? nowIso(),
          closeAt: endsAt ?? null,
          createdBy: me.id,
        })
        .returning()
        .get();
      await writeAudit(ctx as any, { action: 'peer_review.window.open', targetTable: 'peer_review_windows', targetId: w?.id ?? '0', classId, after: w });
      return w;
    },
    { body: t.Object({ stageKey: t.String(), startsAt: t.Optional(t.String()), endsAt: t.Optional(t.String()) }) },
  )
  .post('/peer-review-windows/:windowId/close', async (ctx) => {
    const id = asNumber((ctx.params as any).windowId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const w = await db
      .select()
      .from(schema.peerReviewWindows)
      .where(and(eq(schema.peerReviewWindows.id, id), isNull(schema.peerReviewWindows.deletedAt)))
      .get();
    if (!w) throw httpError.notFound('Window not found');
    if (me.role !== 'admin') await assertClassTeacher(ctx as any, w.classId);
    const cls = await getClassById(ctx as any, w.classId);
    assertClassWritable(cls);
    if (w.status !== 'open') throw httpError.badRequest('Window not open');
    await db.update(schema.peerReviewWindows).set({ status: 'sealed', closeAt: nowIso(), sealedAt: nowIso() }).where(eq(schema.peerReviewWindows.id, id));
    const after = await db.select().from(schema.peerReviewWindows).where(eq(schema.peerReviewWindows.id, id)).get();
    await writeAudit(ctx as any, { action: 'peer_review.window.close', targetTable: 'peer_review_windows', targetId: id, before: w, after, classId: w.classId });
    return after;
  })
  .post('/peer-review-windows/:windowId/publish', async (ctx) => {
    const id = asNumber((ctx.params as any).windowId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const w = await db
      .select()
      .from(schema.peerReviewWindows)
      .where(and(eq(schema.peerReviewWindows.id, id), isNull(schema.peerReviewWindows.deletedAt)))
      .get();
    if (!w) throw httpError.notFound('Window not found');
    if (me.role !== 'admin') await assertClassTeacher(ctx as any, w.classId);
    const cls = await getClassById(ctx as any, w.classId);
    assertClassWritable(cls);
    if (w.status !== 'sealed') throw httpError.badRequest('Window not sealed');
    await db.update(schema.peerReviewWindows).set({ status: 'published', publishedAt: nowIso() }).where(eq(schema.peerReviewWindows.id, id));
    const after = await db.select().from(schema.peerReviewWindows).where(eq(schema.peerReviewWindows.id, id)).get();
    await writeAudit(ctx as any, { action: 'peer_review.window.publish', targetTable: 'peer_review_windows', targetId: id, before: w, after, classId: w.classId });
    return after;
  })
  .post('/projects/:projectId/peer-reviews', async (ctx) => {
    const projectId = asNumber((ctx.params as any).projectId);
    const me = requireUser((ctx as any).user);
    if (me.role !== 'student') throw httpError.forbidden('Student required');
    const { db, schema } = ctx as any;
    const p = await getProjectById(ctx as any, projectId);
    await assertClassReadable(ctx as any, p.classId);
    const team = await getTeamById(ctx as any, p.teamId);
    const member = await isTeamMember(ctx as any, team.id, me.id);
    if (!member) throw httpError.forbidden('Not a team member');
    const cls = await getClassById(ctx as any, p.classId);
    assertClassWritable(cls);

    const { revieweeId, payload } = ctx.body as any;
    if (revieweeId === me.id) throw httpError.badRequest('Cannot review yourself');
    const member2 = await isTeamMember(ctx as any, team.id, revieweeId);
    if (!member2) throw httpError.badRequest('Reviewee not in team');

    // choose open window for the project's current open stage (fallback: latest open)
    const openStage = await db
      .select()
      .from(schema.projectStages)
      .where(and(eq(schema.projectStages.projectId, projectId), eq(schema.projectStages.status, 'open'), isNull(schema.projectStages.deletedAt)))
      .orderBy(asc(schema.projectStages.order))
      .get();
    const stageKey = (openStage?.key ?? STAGE_KEYS[0]) as string;

    const w = await db
      .select()
      .from(schema.peerReviewWindows)
      .where(
        and(
          eq(schema.peerReviewWindows.classId, p.classId),
          eq(schema.peerReviewWindows.stageKey, stageKey),
          eq(schema.peerReviewWindows.status, 'open'),
          isNull(schema.peerReviewWindows.deletedAt),
        ),
      )
      .orderBy(desc(schema.peerReviewWindows.id))
      .get();
    if (!w) throw httpError.badRequest('No open peer review window');

    const pr = await db
      .insert(schema.peerReviews)
      .values({ windowId: w.id, classId: p.classId, teamId: team.id, reviewerId: me.id, revieweeId, payloadJson: JSON.stringify(payload ?? {}) })
      .returning()
      .get();
    await writeAudit(ctx as any, { action: 'peer_review.submit', targetTable: 'peer_reviews', targetId: pr?.id ?? '0', classId: p.classId, teamId: team.id, projectId });
    return pr;
  }, { body: t.Object({ revieweeId: t.Number(), payload: t.Optional(t.Any()) }) })
  .get('/projects/:projectId/peer-reviews', async (ctx) => {
    const projectId = asNumber((ctx.params as any).projectId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const p = await getProjectById(ctx as any, projectId);
    await assertClassReadable(ctx as any, p.classId);
    const team = await getTeamById(ctx as any, p.teamId);

    if (me.role === 'student') {
      const member = await isTeamMember(ctx as any, team.id, me.id);
      if (!member) throw httpError.forbidden('Not a team member');
    }

    // Only show to students after publish.
    const windows = await db
      .select()
      .from(schema.peerReviewWindows)
      .where(and(eq(schema.peerReviewWindows.classId, p.classId), isNull(schema.peerReviewWindows.deletedAt)))
      .orderBy(desc(schema.peerReviewWindows.id))
      .all();
    const publishedIds = new Set(windows.filter((w: any) => w.status === 'published').map((w: any) => w.id));
    const allowedWindowIds = me.role === 'student' ? [...publishedIds] : windows.map((w: any) => w.id);
    if (allowedWindowIds.length === 0) return [];

    const reviews = await db
      .select()
      .from(schema.peerReviews)
      .where(and(inArray(schema.peerReviews.windowId, allowedWindowIds), eq(schema.peerReviews.teamId, team.id), isNull(schema.peerReviews.deletedAt)))
      .orderBy(desc(schema.peerReviews.id))
      .all();

    if (me.role === 'student') {
      return reviews.map((r: any) => ({ id: r.id, windowId: r.windowId, revieweeId: r.revieweeId, payload: parseJsonOr(r.payloadJson, {}) }));
    }
    return reviews.map((r: any) => ({ ...r, payload: parseJsonOr(r.payloadJson, {}) }));
  })
  .post(
    '/projects/:projectId/peer-reviews/decision',
    async (ctx) => {
      const projectId = asNumber((ctx.params as any).projectId);
      const me = requireUser((ctx as any).user);
      const { db, schema } = ctx as any;
      const p = await getProjectById(ctx as any, projectId);
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, p.classId);
      const cls = await getClassById(ctx as any, p.classId);
      assertClassWritable(cls);

      // choose latest sealed/published window
      const w = await db
        .select()
        .from(schema.peerReviewWindows)
        .where(and(eq(schema.peerReviewWindows.classId, p.classId), isNull(schema.peerReviewWindows.deletedAt)))
        .orderBy(desc(schema.peerReviewWindows.id))
        .get();
      if (!w) throw httpError.badRequest('No window');

      const { adopt, forcedCoefficient, reason } = ctx.body as any;
      await db
        .insert(schema.peerReviewAdoptions)
        .values({
          windowId: w.id,
          teamId: p.teamId,
          adopted: !!adopt,
          forcedCoefficient: adopt ? null : (forcedCoefficient ?? 1),
          decidedBy: me.id,
          decidedAt: nowIso(),
          reason: reason ?? null,
        })
        .onConflictDoUpdate({
          target: [schema.peerReviewAdoptions.windowId, schema.peerReviewAdoptions.teamId] as any,
          set: { adopted: !!adopt, forcedCoefficient: adopt ? null : (forcedCoefficient ?? 1), decidedBy: me.id, decidedAt: nowIso(), reason: reason ?? null, deletedAt: null },
        });
      await writeAudit(ctx as any, { action: 'peer_review.decision', targetTable: 'peer_review_adoptions', targetId: `${w.id}:${p.teamId}`, classId: p.classId, teamId: p.teamId, projectId, after: { adopt, forcedCoefficient, reason } });
      return { ok: true };
    },
    { body: t.Object({ adopt: t.Boolean(), forcedCoefficient: t.Optional(t.Number()), reason: t.Optional(t.String()) }) },
  );
