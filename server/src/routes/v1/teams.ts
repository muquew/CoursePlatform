import { Elysia, t } from 'elysia';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { httpError } from '../../lib/http-error.ts';
import { nowIso } from '../../lib/time.ts';
import {
  asNumber,
  assertClassReadable,
  assertClassTeacher,
  assertClassWritable,
  assertNotLocked,
  assertTeamLeader,
  assertTeamReadable,
  getActiveTeamInClassForStudent,
  getClassById,
  getTeamById,
  isStudentInClass,
  isTeamMember,
  notify,
  parseJsonOr,
  requireUser,
  writeAudit
} from '../_helpers.ts';

export const teamsRoutes = new Elysia({ name: 'teamsRoutes' })
/* =========================================================
   * Teams
   * ========================================================= */
  .post(
    '/classes/:classId/teams',
    async (ctx) => {
      const me = requireUser((ctx as any).user);
      if (me.role !== 'student') throw httpError.forbidden('Student required');
      const classId = asNumber((ctx.params as any).classId);
      await assertClassReadable(ctx as any, classId);
      const cls = await getClassById(ctx as any, classId);
      assertClassWritable(cls);

      const activeTeamId = await getActiveTeamInClassForStudent(ctx as any, classId, me.id);
      if (activeTeamId) throw httpError.badRequest('Already in a team');

      const config = parseJsonOr(cls.configJson, {} as any);
      const minSize = Number(config?.teamSizeMin ?? config?.minTeamSize ?? 1);
      const maxSize = Number(config?.teamSizeMax ?? config?.maxTeamSize ?? 99);
      if (minSize > 1 && minSize > maxSize) {
        // invalid config
      }

      const { name, description } = ctx.body as any;
      const { db, schema } = ctx as any;
      const team = await db
        .insert(schema.teams)
        .values({ classId, name, description: description ?? null, leaderId: me.id })
        .returning()
        .get();
      if (!team) throw httpError.internal('Failed to create team');
      await db.insert(schema.teamMembers).values({ teamId: team.id, classId, studentId: me.id, isActive: true, joinedAt: nowIso() });
      await writeAudit(ctx as any, { action: 'team.create', targetTable: 'teams', targetId: team.id, after: team, classId, teamId: team.id });
      return team;
    },
    { body: t.Object({ name: t.String(), description: t.Optional(t.String()) }) },
  )
  .get('/classes/:classId/teams', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    await assertClassReadable(ctx as any, classId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const teams = await db
      .select()
      .from(schema.teams)
      .where(and(eq(schema.teams.classId, classId), isNull(schema.teams.deletedAt)))
      .orderBy(asc(schema.teams.id))
      .all();

    const teamIds = teams.map((t: any) => t.id);
    const members = teamIds.length
      ? await db
          .select({
            teamId: schema.teamMembers.teamId,
            userId: schema.users.id,
            realName: schema.studentProfiles.realName,
            studentNo: schema.studentProfiles.studentNo,
            isActive: schema.teamMembers.isActive,
          })
          .from(schema.teamMembers)
          .innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.studentId))
          .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.users.id))
          .where(and(inArray(schema.teamMembers.teamId, teamIds), isNull(schema.teamMembers.deletedAt)))
          .all()
      : [];

    const byTeam = new Map<number, any[]>();
    for (const m of members) {
      const arr = byTeam.get(m.teamId) || [];
      arr.push(m);
      byTeam.set(m.teamId, arr);
    }

    return teams.map((t: any) => {
      const ms = (byTeam.get(t.id) || []).filter((m) => m.isActive);
      return {
        ...t,
        members:
          me.role === 'student'
            ? ms.map((m) => ({ userId: m.userId, realName: m.realName ?? String(m.userId) }))
            : ms.map((m) => ({ userId: m.userId, realName: m.realName, studentNo: m.studentNo })),
        memberCount: ms.length,
      };
    });
  })
  .get('/teams/:teamId', async (ctx) => {
    const teamId = asNumber((ctx.params as any).teamId);
    const team = await assertTeamReadable(ctx as any, teamId);
    const me = requireUser((ctx as any).user);
    const { db, schema } = ctx as any;
    const canSeeMembers = me.role !== 'student' || (await isTeamMember(ctx as any, teamId, me.id));

    const members = await db
      .select({
        userId: schema.users.id,
        realName: schema.studentProfiles.realName,
        studentNo: schema.studentProfiles.studentNo,
        isActive: schema.teamMembers.isActive,
      })
      .from(schema.teamMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.studentId))
      .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.users.id))
      .where(and(eq(schema.teamMembers.teamId, teamId), isNull(schema.teamMembers.deletedAt)))
      .all();

    return {
      ...team,
      members: canSeeMembers
        ? (members as any[])
            .filter((m: any) => m.isActive)
            .map((m: any) => (me.role === 'student' ? { userId: m.userId, realName: m.realName ?? String(m.userId) } : m))
        : [],
    };
  })
  .post('/teams/:teamId/join-requests', async (ctx) => {
    const me = requireUser((ctx as any).user);
    if (me.role !== 'student') throw httpError.forbidden('Student required');
    const teamId = asNumber((ctx.params as any).teamId);
    const team = await getTeamById(ctx as any, teamId);
    await assertClassReadable(ctx as any, team.classId);
    const cls = await getClassById(ctx as any, team.classId);
    assertClassWritable(cls);
    assertNotLocked(team);

    const inClass = await isStudentInClass(ctx as any, team.classId, me.id);
    if (!inClass) throw httpError.forbidden('Not enrolled');
    const activeTeamId = await getActiveTeamInClassForStudent(ctx as any, team.classId, me.id);
    if (activeTeamId) throw httpError.badRequest('Already in a team');

    const { db, schema } = ctx as any;
    const req = await db
      .insert(schema.teamJoinRequests)
      .values({ teamId, classId: team.classId, studentId: me.id, status: 'pending' })
      .returning()
      .get();
    await writeAudit(ctx as any, { action: 'team.join_request.create', targetTable: 'team_join_requests', targetId: req?.id ?? '0', classId: team.classId, teamId });

    await notify(ctx as any, team.leaderId, {
        title: 'Team Join Request',
        message: `Student ${me.username} requested to join your team ${team.name}`,
        type: 'team',
        payload: { refId: teamId }
      });

    return req;
  })
  .get('/teams/:teamId/join-requests', async (ctx) => {
    const teamId = asNumber((ctx.params as any).teamId);
    const team = await getTeamById(ctx as any, teamId);
    const me = requireUser((ctx as any).user);
    await assertClassReadable(ctx as any, team.classId);
    if (me.role === 'student' && me.id !== team.leaderId) throw httpError.forbidden('Leader required');

    const { db, schema } = ctx as any;
    const rows = await db
      .select({
        id: schema.teamJoinRequests.id,
        studentId: schema.teamJoinRequests.studentId,
        status: schema.teamJoinRequests.status,
        reason: schema.teamJoinRequests.reason,
        createdAt: schema.teamJoinRequests.createdAt,
        realName: schema.studentProfiles.realName,
        studentNo: schema.studentProfiles.studentNo,
      })
      .from(schema.teamJoinRequests)
      .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.teamJoinRequests.studentId))
      .where(and(eq(schema.teamJoinRequests.teamId, teamId), isNull(schema.teamJoinRequests.deletedAt)))
      .orderBy(desc(schema.teamJoinRequests.id))
      .all();
    return rows;
  })
  .patch(
    '/teams/:teamId/join-requests/:requestId',
    async (ctx) => {
      const teamId = asNumber((ctx.params as any).teamId);
      const requestId = asNumber((ctx.params as any).requestId);
      const { decision, reason } = ctx.body as any;
      const team = await assertTeamLeader(ctx as any, teamId);
      const cls = await getClassById(ctx as any, team.classId);
      assertClassWritable(cls);
      assertNotLocked(team);

      const { db, schema } = ctx as any;
      const jr = await db
        .select()
        .from(schema.teamJoinRequests)
        .where(and(eq(schema.teamJoinRequests.id, requestId), eq(schema.teamJoinRequests.teamId, teamId), isNull(schema.teamJoinRequests.deletedAt)))
        .get();
      if (!jr) throw httpError.notFound('Join request not found');
      if (jr.status !== 'pending') throw httpError.badRequest('Request is not pending');

      if (decision === 'approved') {
        const activeTeamId = await getActiveTeamInClassForStudent(ctx as any, team.classId, jr.studentId);
        if (activeTeamId) throw httpError.badRequest('Student already in a team');
        await db.insert(schema.teamMembers).values({ teamId, classId: team.classId, studentId: jr.studentId, isActive: true, joinedAt: nowIso() });
      }

      await db
        .update(schema.teamJoinRequests)
        .set({
          status: decision,
          reviewerId: team.leaderId,
          reviewedAt: nowIso(),
          reason: reason ?? null,
        })
        .where(eq(schema.teamJoinRequests.id, requestId));

      await writeAudit(ctx as any, { action: 'team.join_request.review', targetTable: 'team_join_requests', targetId: requestId, classId: team.classId, teamId });
      
      await notify(ctx as any, jr.studentId, {
        title: 'Join Request Update',
        message: `Your request to join team ${team.name} was ${decision}`,
        type: 'team',
        payload: { refId: teamId }
      });

      return { ok: true };
    },
    {
      body: t.Object({ decision: t.Union([t.Literal('approved'), t.Literal('rejected')]), reason: t.Optional(t.String()) }),
    },
  )
  .delete('/teams/:teamId/join-requests/:requestId', async (ctx) => {
    const teamId = asNumber((ctx.params as any).teamId);
    const requestId = asNumber((ctx.params as any).requestId);
    const me = requireUser((ctx as any).user);
    if (me.role !== 'student') throw httpError.forbidden('Student required');
    const { db, schema } = ctx as any;
    const jr = await db
      .select()
      .from(schema.teamJoinRequests)
      .where(and(eq(schema.teamJoinRequests.id, requestId), eq(schema.teamJoinRequests.teamId, teamId), isNull(schema.teamJoinRequests.deletedAt)))
      .get();
    if (!jr) throw httpError.notFound('Join request not found');
    if (jr.studentId !== me.id) throw httpError.forbidden('Not your request');
    if (jr.status !== 'pending') throw httpError.badRequest('Request is not pending');
    const team = await getTeamById(ctx as any, teamId);
    const cls = await getClassById(ctx as any, team.classId);
    assertClassWritable(cls);

    await db.update(schema.teamJoinRequests).set({ status: 'cancelled' }).where(eq(schema.teamJoinRequests.id, requestId));
    await writeAudit(ctx as any, { action: 'team.join_request.cancel', targetTable: 'team_join_requests', targetId: requestId, classId: team.classId, teamId });
    return { ok: true };
  })
  .post('/teams/:teamId/leave', async (ctx) => {
    const teamId = asNumber((ctx.params as any).teamId);
    const me = requireUser((ctx as any).user);
    if (me.role !== 'student') throw httpError.forbidden('Student required');
    const team = await getTeamById(ctx as any, teamId);
    await assertClassReadable(ctx as any, team.classId);
    const cls = await getClassById(ctx as any, team.classId);
    assertClassWritable(cls);
    assertNotLocked(team);
    if (me.id === team.leaderId) throw httpError.badRequest('Leader cannot leave; transfer leadership first');

    const { db, schema } = ctx as any;
    await db
      .update(schema.teamMembers)
      .set({ isActive: false, leftAt: nowIso() })
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.studentId, me.id), eq(schema.teamMembers.isActive, true), isNull(schema.teamMembers.deletedAt)));
    await writeAudit(ctx as any, { action: 'team.member.leave', targetTable: 'team_members', targetId: `${teamId}:${me.id}`, classId: team.classId, teamId });
    return { ok: true };
  })
  .delete('/teams/:teamId/members/:userId', async (ctx) => {
    const teamId = asNumber((ctx.params as any).teamId);
    const userId = asNumber((ctx.params as any).userId);
    const team = await assertTeamLeader(ctx as any, teamId);
    const cls = await getClassById(ctx as any, team.classId);
    assertClassWritable(cls);
    assertNotLocked(team);
    if (userId === team.leaderId) throw httpError.badRequest('Cannot remove leader');
    const { db, schema } = ctx as any;
    await db
      .update(schema.teamMembers)
      .set({ isActive: false, leftAt: nowIso() })
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.studentId, userId), eq(schema.teamMembers.isActive, true), isNull(schema.teamMembers.deletedAt)));
    await writeAudit(ctx as any, { action: 'team.member.remove', targetTable: 'team_members', targetId: `${teamId}:${userId}`, classId: team.classId, teamId });
    return { ok: true };
  })
  .post(
    '/teams/:teamId/leader-transfer',
    async (ctx) => {
      const teamId = asNumber((ctx.params as any).teamId);
      const team = await assertTeamLeader(ctx as any, teamId);
      const { toUserId } = ctx.body as any;
      const cls = await getClassById(ctx as any, team.classId);
      assertClassWritable(cls);
      assertNotLocked(team);
      const ok = await isTeamMember(ctx as any, teamId, toUserId);
      if (!ok) throw httpError.badRequest('Target is not a member');
      const { db, schema } = ctx as any;
      const before = team;
      await db.update(schema.teams).set({ leaderId: toUserId }).where(eq(schema.teams.id, teamId));
      const after = await getTeamById(ctx as any, teamId);
      await writeAudit(ctx as any, { action: 'team.leader.transfer', targetTable: 'teams', targetId: teamId, before, after, classId: team.classId, teamId });
      return after;
    },
    { body: t.Object({ toUserId: t.Number() }) },
  )
  .post(
    '/teams/:teamId/leader-force',
    async (ctx) => {
      const teamId = asNumber((ctx.params as any).teamId);
      const me = requireUser((ctx as any).user);
      const { toUserId, reason } = ctx.body as any;
      const team = await getTeamById(ctx as any, teamId);
      await assertClassReadable(ctx as any, team.classId);
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, team.classId);
      const cls = await getClassById(ctx as any, team.classId);
      assertClassWritable(cls);
      const ok = await isTeamMember(ctx as any, teamId, toUserId);
      if (!ok) throw httpError.badRequest('Target is not a member');
      const { db, schema } = ctx as any;
      const before = team;
      await db.update(schema.teams).set({ leaderId: toUserId }).where(eq(schema.teams.id, teamId));
      const after = await getTeamById(ctx as any, teamId);
      const afterAudit = reason ? { ...(after as any), reason } : after;
      await writeAudit(ctx as any, {
        action: 'team.leader.force',
        targetTable: 'teams',
        targetId: teamId,
        before,
        after: afterAudit,
        classId: team.classId,
        teamId,
      });
      return after;
    },
    { body: t.Object({ toUserId: t.Number(), reason: t.Optional(t.String()) }) },
  )
  .get('/classes/:classId/students/unassigned', async (ctx) => {
    const classId = asNumber((ctx.params as any).classId);
    const me = requireUser((ctx as any).user);
    if (me.role !== 'admin') await assertClassTeacher(ctx as any, classId);
    const { db, schema } = ctx as any;

    const students = await db
      .select({
        id: schema.users.id,
        studentNo: schema.studentProfiles.studentNo,
        realName: schema.studentProfiles.realName,
      })
      .from(schema.classStudents)
      .innerJoin(schema.users, eq(schema.users.id, schema.classStudents.studentId))
      .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.users.id))
      .where(and(eq(schema.classStudents.classId, classId), eq(schema.classStudents.isActive, true), isNull(schema.classStudents.deletedAt)))
      .all();

    const memberIds = await db
      .select({ studentId: schema.teamMembers.studentId })
      .from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.classId, classId), eq(schema.teamMembers.isActive, true), isNull(schema.teamMembers.deletedAt)))
      .all();
    const inTeam = new Set(memberIds.map((r: any) => r.studentId));
    return students.filter((s: any) => !inTeam.has(s.id));
  })
  .post(
    '/classes/:classId/teams/assign',
    async (ctx) => {
      const classId = asNumber((ctx.params as any).classId);
      const me = requireUser((ctx as any).user);
      if (me.role !== 'admin') await assertClassTeacher(ctx as any, classId);
      const cls = await getClassById(ctx as any, classId);
      assertClassWritable(cls);
      const { studentId, teamId, teamName } = ctx.body as any;
      const { db, schema } = ctx as any;

      const enrolled = await isStudentInClass(ctx as any, classId, studentId);
      if (!enrolled) throw httpError.badRequest('Student not enrolled');
      const activeTeamId = await getActiveTeamInClassForStudent(ctx as any, classId, studentId);
      if (activeTeamId) throw httpError.badRequest('Student already in a team');

      let targetTeamId = teamId as number | null;
      if (targetTeamId) {
        const team = await getTeamById(ctx as any, targetTeamId);
        if (team.classId !== classId) throw httpError.badRequest('Class mismatch');
        assertNotLocked(team);
      } else {
        const team = await db
          .insert(schema.teams)
          .values({ classId, name: teamName || `Team-${studentId}`, leaderId: studentId })
          .returning()
          .get();
        if (!team) throw httpError.internal('Failed to create team');
        targetTeamId = team.id;
        const tid = targetTeamId as number;
        await db.insert(schema.teamMembers).values({ teamId: tid, classId, studentId, isActive: true, joinedAt: nowIso() });
        await writeAudit(ctx as any, { action: 'team.force.create', targetTable: 'teams', targetId: tid, classId, teamId: tid });
        return { ok: true, teamId: tid, created: true };
      }

      const tid = targetTeamId as number;
      await db.insert(schema.teamMembers).values({ teamId: tid, classId, studentId, isActive: true, joinedAt: nowIso() });
      await writeAudit(ctx as any, { action: 'team.force.assign', targetTable: 'team_members', targetId: `${tid}:${studentId}`, classId, teamId: tid });
      
      await notify(ctx as any, studentId, {
        title: 'Team Assigned',
        message: `You have been assigned to team ID ${tid}`,
        type: 'team',
        payload: { refId: tid }
      });

      return { ok: true, teamId: tid, created: false };
    },
    { body: t.Object({ studentId: t.Number(), teamId: t.Optional(t.Number()), teamName: t.Optional(t.String()) }) },
  );
