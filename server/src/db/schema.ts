import { relations, sql, type InferInsertModel, type InferSelectModel } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { nowIso } from '../lib/time.ts'

/* =========================================================
 * 0) Helpers
 * ========================================================= */

const bool = (name: string) => integer(name, { mode: 'boolean' });

/** Unified timestamps */
const timestamps = {
  createdAt: text('created_at').notNull().$defaultFn(nowIso),
  updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  deletedAt: text('deleted_at'),

  joinedAt: text('joined_at').notNull().$defaultFn(nowIso),
  leftAt: text('left_at'),

  decidedAt: text('decided_at'),
  gradedAt: text('graded_at').notNull().$defaultFn(nowIso),
};

const sqliteNow = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

const trg = (name: string, body: string) => `
CREATE TRIGGER IF NOT EXISTS ${name}
${body}
`;

const touchUpdatedAtSqlite = (table: string) =>
  trg(
    `trg_${table}_touch_updated_at`,
    `
AFTER UPDATE ON ${table}
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE ${table} SET updated_at = ${sqliteNow} WHERE rowid = NEW.rowid;
END;`
  );

/**
 * Archived class deny write guard.
 * Escape hatch (server-only): _ctx.allow_archived_write = 1
 */
const denyWriteIfClassArchived = (table: string, classIdExpr: string, op: 'INSERT' | 'UPDATE' | 'DELETE') =>
  trg(
    `trg_${table}_deny_${op.toLowerCase()}_when_class_archived`,
    `
BEFORE ${op} ON ${table}
FOR EACH ROW
WHEN
  (SELECT status FROM classes WHERE id = ${classIdExpr}) = 'archived'
  AND COALESCE((SELECT allow_archived_write FROM _ctx LIMIT 1), 0) = 0
BEGIN
  SELECT RAISE(ABORT, 'CLASS_ARCHIVED_READONLY');
END;`
  );

/**
 * Team locked deny write guard.
 * Escape hatch (server-only): _ctx.allow_locked_write = 1
 */
const denyWriteIfTeamLocked = (table: string, teamIdExpr: string, op: 'INSERT' | 'UPDATE' | 'DELETE') =>
  trg(
    `trg_${table}_deny_${op.toLowerCase()}_when_team_locked`,
    `
BEFORE ${op} ON ${table}
FOR EACH ROW
WHEN
  (SELECT status FROM teams WHERE id = ${teamIdExpr}) = 'locked'
  AND COALESCE((SELECT allow_locked_write FROM _ctx LIMIT 1), 0) = 0
BEGIN
  SELECT RAISE(ABORT, 'TEAM_LOCKED');
END;`
  );

/* =========================================================
 * 1) Users & Profiles
 * ========================================================= */

export const userRoleEnum = ['admin', 'teacher', 'student'] as const;
export type UserRole = (typeof userRoleEnum)[number];

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    mustChangePassword: bool('must_change_password').notNull().default(true),

    // 用户的主角色（能力上限，不直接用于权限判断）
    role: text('role', { enum: userRoleEnum }).notNull().default('student'),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    roleIdx: index('users_role_idx').on(t.role),
  })
);

export const teacherProfiles = sqliteTable(
  'teacher_profiles',
  {
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .primaryKey(),

    realName: text('real_name').notNull(),
    teacherNo: text('teacher_no').unique(),
    college: text('college'),
    title: text('title'),
    phone: text('phone'),
    email: text('email'),
    office: text('office'),
    bio: text('bio'),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    teacherNoIdx: index('teacher_profiles_teacher_no_idx').on(t.teacherNo),
  })
);

export const studentProfiles = sqliteTable(
  'student_profiles',
  {
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .primaryKey(),

    studentNo: text('student_no').notNull().unique(),
    realName: text('real_name').notNull(),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    studentNoIdx: index('student_profiles_student_no_idx').on(t.studentNo),
  })
);

export const adminProfiles = sqliteTable('admin_profiles', {
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .primaryKey(),

  adminLevel: integer('admin_level').notNull().default(1),

  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
  deletedAt: timestamps.deletedAt,
});

/* =========================================================
 * 2) Classes & Roster
 * ========================================================= */

export const classStatusEnum = ['active', 'archived'] as const;
export type ClassStatus = (typeof classStatusEnum)[number];

export const classes = sqliteTable(
  'classes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    courseName: text('course_name').notNull(),
    term: text('term').notNull(),
    configJson: text('config_json').notNull().default('{}'), // team size min/max etc.

    status: text('status', { enum: classStatusEnum }).notNull().default('active'),

    /** 结课后学生下载策略 */
    allowStudentDownloadAfterArchived: bool('allow_student_download_after_archived')
      .notNull()
      .default(true),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    statusIdx: index('classes_status_idx').on(t.status),
  })
);

/** 班级教师（支持多教师：owner / teacher / assistant） */
export const classTeacherRoleEnum = ['owner', 'teacher', 'assistant'] as const;
export type ClassTeacherRole = (typeof classTeacherRoleEnum)[number];

export const classTeachers = sqliteTable(
  'class_teachers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),

    teacherId: integer('teacher_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    role: text('role', { enum: classTeacherRoleEnum }).notNull().default('teacher'),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    uniqActiveTeacher: uniqueIndex('uniq_active_class_teacher')
      .on(t.classId, t.teacherId)
      .where(sql`deleted_at IS NULL`),
    classIdx: index('class_teachers_class_idx').on(t.classId),
    teacherIdx: index('class_teachers_teacher_idx').on(t.teacherId),
  })
);

/** 班级学生名单：导入/插班/退课 */
export const classStudents = sqliteTable(
  'class_students',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),

    studentId: integer('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    isActive: bool('is_active').notNull().default(true),

    joinedAt: timestamps.joinedAt,
    leftAt: timestamps.leftAt,

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    classStudentIdx: index('class_students_class_student_idx').on(t.classId, t.studentId),
    uniqActiveEnrollment: uniqueIndex('uniq_active_enrollment')
      .on(t.classId, t.studentId)
      .where(sql`is_active = 1 AND deleted_at IS NULL`),
  })
);


/** 用户偏好/上下文（如当前活跃班级），用于前端切换班级时服务端持久化 */
export const userSettings = sqliteTable(
  'user_settings',
  {
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .primaryKey(),

    /** 学生/教师当前激活的班级上下文（可为空） */
    activeClassId: integer('active_class_id').references(() => classes.id, { onDelete: 'set null' }),

    /** 可扩展的偏好设置 */
    prefsJson: text('prefs_json').notNull().default('{}'),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    activeClassIdx: index('user_settings_active_class_idx').on(t.activeClassId),
  })
);


/* =========================================================
 * 3) Teams & Members
 * ========================================================= */

export const teamStatusEnum = ['recruiting', 'locked'] as const;
export type TeamStatus = (typeof teamStatusEnum)[number];

export const teams = sqliteTable(
  'teams',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),

    name: text('name').notNull(),
    description: text('description'),

    leaderId: integer('leader_id')
      .references(() => users.id)
      .notNull(),

    status: text('status', { enum: teamStatusEnum }).notNull().default('recruiting'),


    /** 立项审核通过后自动锁定（需求：立项即锁定） */
    isLocked: bool('is_locked').notNull().default(false),
    lockedAt: text('locked_at'),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    classIdx: index('teams_class_idx').on(t.classId),
    leaderIdx: index('teams_leader_idx').on(t.leaderId),
    statusIdx: index('teams_status_idx').on(t.status),
    lockedIdx: index('teams_locked_idx').on(t.classId, t.isLocked),
  })
);

export const teamMembers = sqliteTable(
  'team_members',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    teamId: integer('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),

    /** 冗余：用于强隔离与高性能校验；触发器保证与 teams.classId 一致 */
    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),

    studentId: integer('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    isActive: bool('is_active').notNull().default(true),

    joinedAt: timestamps.joinedAt,
    leftAt: timestamps.leftAt,

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    teamIdx: index('team_members_team_idx').on(t.teamId),
    classIdx: index('team_members_class_idx').on(t.classId),
    studentIdx: index('team_members_student_idx').on(t.studentId),

    /** 同班同学同一时刻只能在一个 active team */
    uniqActiveInClass: uniqueIndex('uniq_active_member_in_class')
      .on(t.classId, t.studentId)
      .where(sql`is_active = 1 AND deleted_at IS NULL`),

    /** 同队同人只能一条 active */
    uniqActiveInTeam: uniqueIndex('uniq_active_member_in_team')
      .on(t.teamId, t.studentId)
      .where(sql`is_active = 1 AND deleted_at IS NULL`),
  })
);

export const teamJoinRequestStatusEnum = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type TeamJoinRequestStatus = (typeof teamJoinRequestStatusEnum)[number];

export const teamJoinRequests = sqliteTable(
  'team_join_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    teamId: integer('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),

    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),

    studentId: integer('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    status: text('status', { enum: teamJoinRequestStatusEnum }).notNull().default('pending'),
    reviewerId: integer('reviewer_id').references(() => users.id),
    reason: text('reason'),
    reviewedAt: text('reviewed_at'),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    uniqPending: uniqueIndex('uniq_team_join_req_pending')
      .on(t.teamId, t.studentId)
      .where(sql`status = 'pending' AND deleted_at IS NULL`),
    teamStatusIdx: index('team_join_req_team_status_idx').on(t.teamId, t.status),
    studentStatusIdx: index('team_join_req_student_status_idx').on(t.studentId, t.status),
  })
);

/* =========================================================
 * 4) Files
 * ========================================================= */

export const files = sqliteTable(
  'files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    /** 物理存储名必须是 UUID / timestamp（需求：禁止用原始名做物理名） */
    storagePath: text('storage_path').notNull(),
    originalName: text('original_name').notNull(),

    mime: text('mime'),
    size: integer('size'),
    sha256: text('sha256'),

    uploadedBy: integer('uploaded_by').references(() => users.id).notNull(),

    /** 归属班级：用于硬隔离/归档策略/审计 */
    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    classIdx: index('files_class_idx').on(t.classId),
    uploaderIdx: index('files_uploader_idx').on(t.uploadedBy),
    shaIdx: index('files_sha_idx').on(t.sha256),
  })
);

/* =========================================================
 * 5) Case Library
 * ========================================================= */

export const caseLibrary = sqliteTable(
  'case_library',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),

    createdBy: integer('created_by').references(() => users.id).notNull(),

    title: text('title').notNull(),
    description: text('description'),
    tags: text('tags'),
    attachmentsJson: text('attachments_json').notNull().default('[]'),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    classIdx: index('case_library_class_idx').on(t.classId),
    creatorIdx: index('case_library_creator_idx').on(t.createdBy),
  })
);

export const caseFiles = sqliteTable(
  'case_files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    caseId: integer('case_id')
      .references(() => caseLibrary.id, { onDelete: 'cascade' })
      .notNull(),

    fileId: integer('file_id')
      .references(() => files.id, { onDelete: 'cascade' })
      .notNull(),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    uniq: uniqueIndex('uniq_case_file').on(t.caseId, t.fileId).where(sql`deleted_at IS NULL`),
    caseIdx: index('case_files_case_idx').on(t.caseId),
  })
);

/* =========================================================
 * 6) Projects & Stages
 * ========================================================= */

export const projectSourceTypeEnum = ['case_library', 'custom'] as const;
export type ProjectSourceType = (typeof projectSourceTypeEnum)[number];

export const projectStatusEnum = ['draft', 'submitted', 'active', 'rejected'] as const;
export type ProjectStatus = (typeof projectStatusEnum)[number];

export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    teamId: integer('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),

    /** 冗余：触发器强一致性为 teams.classId */
    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),

    sourceType: text('source_type', { enum: projectSourceTypeEnum }).notNull(),
    caseId: integer('case_id').references(() => caseLibrary.id),

    name: text('name').notNull(),
    background: text('background'),
    techStack: text('tech_stack'),

    status: text('status', { enum: projectStatusEnum }).notNull().default('draft'),

    createdBy: integer('created_by').references(() => users.id).notNull(),

    submittedAt: text('submitted_at'),
    reviewedAt: text('reviewed_at'),
    reviewedBy: integer('reviewed_by').references(() => users.id),
    reviewFeedback: text('review_feedback'),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    /** 一个团队最多一个项目（强约束：简化业务与 ABAC） */
    uniqTeamProject: uniqueIndex('uniq_team_project').on(t.teamId).where(sql`deleted_at IS NULL`),
    classIdx: index('projects_class_idx').on(t.classId),
    statusIdx: index('projects_status_idx').on(t.status),
    caseIdx: index('projects_case_idx').on(t.caseId),
  })
);

export const stageKeyEnum = [
  'requirements',
  'high_level_design',
  'detailed_design',
  'software_testing',
  'acceptance',
] as const;
export type StageKey = (typeof stageKeyEnum)[number];

export const stageStatusEnum = ['locked', 'open', 'passed'] as const;
export type StageStatus = (typeof stageStatusEnum)[number];

export const projectStages = sqliteTable(
  'project_stages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),

    key: text('key', { enum: stageKeyEnum }).notNull(),
     order: integer('order').notNull(), // 1..5
    status: text('status', { enum: stageStatusEnum }).notNull().default('locked'),

    openedAt: text('opened_at'),
    passedAt: text('passed_at'),
    lastRollbackAt: text('last_rollback_at'),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    uniqProjectKey: uniqueIndex('uniq_project_stage_key').on(t.projectId, t.key).where(sql`deleted_at IS NULL`),
    uniqProjectOrder: uniqueIndex('uniq_project_stage_order').on(t.projectId, t.order).where(sql`deleted_at IS NULL`),
    projectOrderIdx: index('project_stage_project_order_idx').on(t.projectId, t.order),
    projectStatusIdx: index('project_stage_project_status_idx').on(t.projectId, t.status),
  })
);

/* =========================================================
 * 7) Assignments & Submissions & Grades
 * ========================================================= */

export const assignmentTypeEnum = ['individual', 'team'] as const;
export type AssignmentType = (typeof assignmentTypeEnum)[number];

export const assignments = sqliteTable(
  'assignments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),

    /** 作业绑定阶段（需求：作业必须绑定项目阶段） */
    stageKey: text('stage_key', { enum: stageKeyEnum }).notNull(),
    type: text('type', { enum: assignmentTypeEnum }).notNull(),

    title: text('title').notNull(),
    description: text('description'),
    deadline: text('deadline').notNull(),

    createdBy: integer('created_by').references(() => users.id).notNull(),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    classStageIdx: index('assignments_class_stage_idx').on(t.classId, t.stageKey),
    classTypeIdx: index('assignments_class_type_idx').on(t.classId, t.type),
  })
);

export const submissions = sqliteTable(
  'submissions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    assignmentId: integer('assignment_id')
      .references(() => assignments.id, { onDelete: 'cascade' })
      .notNull(),

    stageId: integer('stage_id')
      .references(() => projectStages.id, { onDelete: 'cascade' })
      .notNull(),

    submitterId: integer('submitter_id').references(() => users.id).notNull(),

    teamId: integer('team_id').references(() => teams.id, { onDelete: 'cascade' }),

    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),

    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),

    /** 版本控制：V1, V2, ...（需求：保留历史） */
    version: integer('version').notNull(),
    isLate: bool('is_late').notNull().default(false),

    /** optional "main file" (for quick UI); full mapping in submission_files */
    fileId: integer('file_id').references(() => files.id, { onDelete: 'set null' }),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    assignmentIdx: index('submissions_assignment_idx').on(t.assignmentId),
    stageIdx: index('submissions_stage_idx').on(t.stageId),
    projectIdx: index('submissions_project_idx').on(t.projectId),
    teamIdx: index('submissions_team_idx').on(t.teamId),
    classIdx: index('submissions_class_idx').on(t.classId),

    uniqVersion: uniqueIndex('uniq_submission_version')
      .on(t.assignmentId, t.stageId, t.projectId, t.teamId, t.submitterId, t.version)
      .where(sql`deleted_at IS NULL`),
  })
);

export const submissionFiles = sqliteTable(
  'submission_files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    submissionId: integer('submission_id')
      .references(() => submissions.id, { onDelete: 'cascade' })
      .notNull(),

    fileId: integer('file_id')
      .references(() => files.id, { onDelete: 'cascade' })
      .notNull(),

    role: text('role'),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    uniq: uniqueIndex('uniq_submission_file').on(t.submissionId, t.fileId).where(sql`deleted_at IS NULL`),
    submissionIdx: index('submission_files_submission_idx').on(t.submissionId),
  })
);

/** 教师评分：针对每个 submission（通常是团队成果） */
export const grades = sqliteTable(
  'grades',
  {
    submissionId: integer('submission_id')
      .references(() => submissions.id, { onDelete: 'cascade' })
      .primaryKey(),

    graderId: integer('grader_id').references(() => users.id).notNull(),

    score: real('score').notNull(),
    feedback: text('feedback'),
    rubricJson: text('rubric_json').notNull().default('{}'),

    gradedAt: timestamps.gradedAt,

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    graderTimeIdx: index('grades_grader_time_idx').on(t.graderId, t.gradedAt),
  })
);

/* =========================================================
 * 8) Peer Reviews
 * ========================================================= */

export const peerReviewWindowStatusEnum = ['draft', 'open', 'sealed', 'published'] as const;
export type PeerReviewWindowStatus = (typeof peerReviewWindowStatusEnum)[number];

export const peerReviewWindows = sqliteTable(
  'peer_review_windows',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),

    /** 互评通常按阶段开启 */
    stageKey: text('stage_key', { enum: stageKeyEnum }).notNull(),

    status: text('status', { enum: peerReviewWindowStatusEnum }).notNull().default('draft'),

    openAt: text('open_at'),
    closeAt: text('close_at'),
    sealedAt: text('sealed_at'),
    publishedAt: text('published_at'),

    createdBy: integer('created_by').references(() => users.id).notNull(),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    classStageIdx: index('peer_review_windows_class_stage_idx').on(t.classId, t.stageKey),
    statusIdx: index('peer_review_windows_status_idx').on(t.status),
  })
);

/**
 * 互评记录：按 reviewer -> reviewee
 * payloadJson 由前端定义（分项评分/评语等），系统只负责存储与裁决应用
 */
export const peerReviews = sqliteTable(
  'peer_reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    windowId: integer('window_id')
      .references(() => peerReviewWindows.id, { onDelete: 'cascade' })
      .notNull(),

    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),

    teamId: integer('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),

    reviewerId: integer('reviewer_id').references(() => users.id).notNull(),
    revieweeId: integer('reviewee_id').references(() => users.id).notNull(),

    payloadJson: text('payload_json').notNull().default('{}'),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    uniq: uniqueIndex('uniq_peer_review_once')
      .on(t.windowId, t.teamId, t.reviewerId, t.revieweeId)
      .where(sql`deleted_at IS NULL`),
    windowTeamIdx: index('peer_reviews_window_team_idx').on(t.windowId, t.teamId),
    reviewerIdx: index('peer_reviews_reviewer_idx').on(t.reviewerId),
    revieweeIdx: index('peer_reviews_reviewee_idx').on(t.revieweeId),
  })
);

/** 互评系数结果（计算可由服务端定时/按需） */
export const peerReviewCoefficients = sqliteTable(
  'peer_review_coefficients',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    windowId: integer('window_id')
      .references(() => peerReviewWindows.id, { onDelete: 'cascade' })
      .notNull(),

    teamId: integer('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),

    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    coefficient: real('coefficient').notNull().default(1),
    computedAt: text('computed_at').notNull().$defaultFn(nowIso),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    uniq: uniqueIndex('uniq_peer_review_coeff')
      .on(t.windowId, t.teamId, t.userId)
      .where(sql`deleted_at IS NULL`),
    windowTeamIdx: index('peer_review_coeff_window_team_idx').on(t.windowId, t.teamId),
  })
);

/** 教师裁决：是否采用互评；若不采用可强制系数=1 */
export const peerReviewAdoptions = sqliteTable(
  'peer_review_adoptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    windowId: integer('window_id')
      .references(() => peerReviewWindows.id, { onDelete: 'cascade' })
      .notNull(),

    teamId: integer('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),

    adopted: bool('adopted').notNull().default(true),

    /** adopted=false 时，常用为 1（需求：恶意评分可忽略互评，强制系数为 1） */
    forcedCoefficient: real('forced_coefficient'),

    decidedBy: integer('decided_by').references(() => users.id).notNull(),
    decidedAt: timestamps.decidedAt,
    reason: text('reason'),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    uniq: uniqueIndex('uniq_peer_review_adoption').on(t.windowId, t.teamId).where(sql`deleted_at IS NULL`),
    windowIdx: index('peer_review_adoptions_window_idx').on(t.windowId),
  })
);

/* =========================================================
 * 9) Approvals (optional, for unified "todo" pages)
 * ========================================================= */

export const approvalTypeEnum = ['project_review', 'team_join_request', 'peer_review_publish'] as const;
export type ApprovalType = (typeof approvalTypeEnum)[number];

export const approvalStatusEnum = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type ApprovalStatus = (typeof approvalStatusEnum)[number];

export const approvals = sqliteTable(
  'approvals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    type: text('type', { enum: approvalTypeEnum }).notNull(),
    status: text('status', { enum: approvalStatusEnum }).notNull().default('pending'),

    classId: integer('class_id').references(() => classes.id, { onDelete: 'cascade' }),
    teamId: integer('team_id').references(() => teams.id, { onDelete: 'cascade' }),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),

    requesterId: integer('requester_id').references(() => users.id).notNull(),
    reviewerId: integer('reviewer_id').references(() => users.id),

    payloadJson: text('payload_json').notNull().default('{}'),
    decisionReason: text('decision_reason'),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    decidedAt: timestamps.decidedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    typeStatusIdx: index('approvals_type_status_idx').on(t.type, t.status),
    reviewerIdx: index('approvals_reviewer_idx').on(t.reviewerId, t.status),
    classIdx: index('approvals_class_idx').on(t.classId, t.status),
  })
);

/* =========================================================
 * 10) Admin (ABAC rules + error monitor)
 * ========================================================= */

export const abacRules = sqliteTable(
  'abac_rules',
  {
    key: text('key').primaryKey(),
    enabled: bool('enabled').notNull().default(true),
    description: text('description'),
    configJson: text('config_json').notNull().default('{}'),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    enabledIdx: index('abac_rules_enabled_idx').on(t.enabled),
  })
);

export const errorEvents = sqliteTable(
  'error_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    level: text('level').notNull().default('error'),
    code: text('code'),
    message: text('message').notNull(),
    stack: text('stack'),

    route: text('route'),
    method: text('method'),
    requestId: text('request_id'),

    actorId: integer('actor_id').references(() => users.id),
    ip: text('ip'),
    userAgent: text('user_agent'),

    createdAt: timestamps.createdAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    levelTimeIdx: index('error_events_level_time_idx').on(t.level, t.createdAt),
    actorTimeIdx: index('error_events_actor_time_idx').on(t.actorId, t.createdAt),
  })
);

/* =========================================================
 * 11) Audit Logs (immutable)
 * ========================================================= */

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    actorId: integer('actor_id').references(() => users.id).notNull(),
    action: text('action').notNull(),

    targetTable: text('target_table').notNull(),
    targetId: text('target_id').notNull(),

    beforeJson: text('before_json'),
    afterJson: text('after_json'),

    classId: integer('class_id').references(() => classes.id),
    teamId: integer('team_id').references(() => teams.id),
    projectId: integer('project_id').references(() => projects.id),

    ip: text('ip'),
    userAgent: text('user_agent'),

    createdAt: timestamps.createdAt,

    // kept only to satisfy "core tables have deleted_at"; triggers prohibit delete/update anyway
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    actorTimeIdx: index('audit_actor_time_idx').on(t.actorId, t.createdAt),
    targetIdx: index('audit_target_idx').on(t.targetTable, t.targetId),
    classTimeIdx: index('audit_class_time_idx').on(t.classId, t.createdAt),
  })
);

/* =========================================================
 * 12) Notifications
 * ========================================================= */

export const notifications = sqliteTable(
  'notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    type: text('type').notNull(),
    title: text('title'),
    message: text('message'),
    payloadJson: text('payload_json').notNull().default('{}'),

    readAt: text('read_at'),

    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamps.deletedAt,
  },
  (t) => ({
    userReadIdx: index('notifications_user_read_idx').on(t.userId, t.readAt),
    userTimeIdx: index('notifications_user_time_idx').on(t.userId, t.createdAt),
  })
);

/* =========================================================
 * 13) Relations
 * ========================================================= */

export const usersRelations = relations(users, ({ one, many }) => ({
  studentProfile: one(studentProfiles, { fields: [users.id], references: [studentProfiles.userId] }),
  teacherProfile: one(teacherProfiles, { fields: [users.id], references: [teacherProfiles.userId] }),
  adminProfile: one(adminProfiles, { fields: [users.id], references: [adminProfiles.userId] }),
  settings: one(userSettings, { fields: [users.id], references: [userSettings.userId] }),

  classTeachers: many(classTeachers),
  classStudents: many(classStudents),

  teamsAsLeader: many(teams),
  teamMembers: many(teamMembers),
  teamJoinRequests: many(teamJoinRequests),

  filesUploaded: many(files),

  casesCreated: many(caseLibrary),

  projectsCreated: many(projects),

  submissions: many(submissions),
  gradesAsGrader: many(grades),

  peerReviewWindowsCreated: many(peerReviewWindows),
  peerReviews: many(peerReviews),
  peerReviewCoefficients: many(peerReviewCoefficients),
  peerReviewAdoptions: many(peerReviewAdoptions),

  approvalsRequested: many(approvals),

  auditLogs: many(auditLogs),
  notifications: many(notifications),
}));


export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, { fields: [userSettings.userId], references: [users.id] }),
  activeClass: one(classes, { fields: [userSettings.activeClassId], references: [classes.id] }),
}));

export const classesRelations = relations(classes, ({ many }) => ({
  teachers: many(classTeachers),
  students: many(classStudents),

  teams: many(teams),
  files: many(files),

  cases: many(caseLibrary),
  projects: many(projects),
  assignments: many(assignments),

  peerReviewWindows: many(peerReviewWindows),

  approvals: many(approvals),
  auditLogs: many(auditLogs),
}));

export const classTeachersRelations = relations(classTeachers, ({ one }) => ({
  class: one(classes, { fields: [classTeachers.classId], references: [classes.id] }),
  teacher: one(users, { fields: [classTeachers.teacherId], references: [users.id] }),
}));

export const classStudentsRelations = relations(classStudents, ({ one }) => ({
  class: one(classes, { fields: [classStudents.classId], references: [classes.id] }),
  student: one(users, { fields: [classStudents.studentId], references: [users.id] }),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  class: one(classes, { fields: [teams.classId], references: [classes.id] }),
  leader: one(users, { fields: [teams.leaderId], references: [users.id] }),

  members: many(teamMembers),
  joinRequests: many(teamJoinRequests),
  project: one(projects, { fields: [teams.id], references: [projects.teamId] }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  class: one(classes, { fields: [teamMembers.classId], references: [classes.id] }),
  student: one(users, { fields: [teamMembers.studentId], references: [users.id] }),
}));

export const teamJoinRequestsRelations = relations(teamJoinRequests, ({ one }) => ({
  team: one(teams, { fields: [teamJoinRequests.teamId], references: [teams.id] }),
  class: one(classes, { fields: [teamJoinRequests.classId], references: [classes.id] }),
  student: one(users, { fields: [teamJoinRequests.studentId], references: [users.id] }),
  reviewer: one(users, { fields: [teamJoinRequests.reviewerId], references: [users.id] }),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  class: one(classes, { fields: [files.classId], references: [classes.id] }),
  uploader: one(users, { fields: [files.uploadedBy], references: [users.id] }),

  caseFiles: many(caseFiles),
  submissionFiles: many(submissionFiles),
}));

export const caseLibraryRelations = relations(caseLibrary, ({ one, many }) => ({
  class: one(classes, { fields: [caseLibrary.classId], references: [classes.id] }),
  creator: one(users, { fields: [caseLibrary.createdBy], references: [users.id] }),
  files: many(caseFiles),
}));

export const caseFilesRelations = relations(caseFiles, ({ one }) => ({
  case: one(caseLibrary, { fields: [caseFiles.caseId], references: [caseLibrary.id] }),
  file: one(files, { fields: [caseFiles.fileId], references: [files.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  team: one(teams, { fields: [projects.teamId], references: [teams.id] }),
  class: one(classes, { fields: [projects.classId], references: [classes.id] }),
  case: one(caseLibrary, { fields: [projects.caseId], references: [caseLibrary.id] }),

  stages: many(projectStages),
  submissions: many(submissions),

  approvals: many(approvals),
}));

export const projectStagesRelations = relations(projectStages, ({ one, many }) => ({
  project: one(projects, { fields: [projectStages.projectId], references: [projects.id] }),
  submissions: many(submissions),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  class: one(classes, { fields: [assignments.classId], references: [classes.id] }),
  creator: one(users, { fields: [assignments.createdBy], references: [users.id] }),
  submissions: many(submissions),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  assignment: one(assignments, { fields: [submissions.assignmentId], references: [assignments.id] }),
  stage: one(projectStages, { fields: [submissions.stageId], references: [projectStages.id] }),
  submitter: one(users, { fields: [submissions.submitterId], references: [users.id] }),
  team: one(teams, { fields: [submissions.teamId], references: [teams.id] }),
  class: one(classes, { fields: [submissions.classId], references: [classes.id] }),
  project: one(projects, { fields: [submissions.projectId], references: [projects.id] }),
  file: one(files, { fields: [submissions.fileId], references: [files.id] }),

  files: many(submissionFiles),
  grade: one(grades, { fields: [submissions.id], references: [grades.submissionId] }),
}));

export const submissionFilesRelations = relations(submissionFiles, ({ one }) => ({
  submission: one(submissions, { fields: [submissionFiles.submissionId], references: [submissions.id] }),
  file: one(files, { fields: [submissionFiles.fileId], references: [files.id] }),
}));

export const gradesRelations = relations(grades, ({ one }) => ({
  submission: one(submissions, { fields: [grades.submissionId], references: [submissions.id] }),
  grader: one(users, { fields: [grades.graderId], references: [users.id] }),
}));

export const peerReviewWindowsRelations = relations(peerReviewWindows, ({ one, many }) => ({
  class: one(classes, { fields: [peerReviewWindows.classId], references: [classes.id] }),
  creator: one(users, { fields: [peerReviewWindows.createdBy], references: [users.id] }),
  reviews: many(peerReviews),
  coefficients: many(peerReviewCoefficients),
  adoptions: many(peerReviewAdoptions),
}));

export const peerReviewsRelations = relations(peerReviews, ({ one }) => ({
  window: one(peerReviewWindows, { fields: [peerReviews.windowId], references: [peerReviewWindows.id] }),
  class: one(classes, { fields: [peerReviews.classId], references: [classes.id] }),
  team: one(teams, { fields: [peerReviews.teamId], references: [teams.id] }),
  reviewer: one(users, { fields: [peerReviews.reviewerId], references: [users.id] }),
  reviewee: one(users, { fields: [peerReviews.revieweeId], references: [users.id] }),
}));

export const peerReviewCoefficientsRelations = relations(peerReviewCoefficients, ({ one }) => ({
  window: one(peerReviewWindows, { fields: [peerReviewCoefficients.windowId], references: [peerReviewWindows.id] }),
  team: one(teams, { fields: [peerReviewCoefficients.teamId], references: [teams.id] }),
  user: one(users, { fields: [peerReviewCoefficients.userId], references: [users.id] }),
}));

export const peerReviewAdoptionsRelations = relations(peerReviewAdoptions, ({ one }) => ({
  window: one(peerReviewWindows, { fields: [peerReviewAdoptions.windowId], references: [peerReviewWindows.id] }),
  team: one(teams, { fields: [peerReviewAdoptions.teamId], references: [teams.id] }),
  decider: one(users, { fields: [peerReviewAdoptions.decidedBy], references: [users.id] }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  class: one(classes, { fields: [approvals.classId], references: [classes.id] }),
  team: one(teams, { fields: [approvals.teamId], references: [teams.id] }),
  project: one(projects, { fields: [approvals.projectId], references: [projects.id] }),
  requester: one(users, { fields: [approvals.requesterId], references: [users.id] }),
  reviewer: one(users, { fields: [approvals.reviewerId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
  class: one(classes, { fields: [auditLogs.classId], references: [classes.id] }),
  team: one(teams, { fields: [auditLogs.teamId], references: [teams.id] }),
  project: one(projects, { fields: [auditLogs.projectId], references: [projects.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

/* =========================================================
 * 14) SQLite Triggers (complete)
 * ========================================================= */

const buildSqliteTriggers = () => {
  const list: string[] = [];

  // connection-local context knobs
  list.push(`
CREATE TABLE IF NOT EXISTS _ctx (
  allow_locked_write INTEGER DEFAULT 0,
  allow_archived_write INTEGER DEFAULT 0
);

-- ensure a single default row exists
INSERT OR IGNORE INTO _ctx(rowid, allow_locked_write, allow_archived_write) VALUES (1, 0, 0);`);

  // auto updated_at on updates
  [
    'users',
    'teacher_profiles',
    'student_profiles',
    'admin_profiles',

    'classes',
    'class_teachers',
    'class_students',

    'teams',
    'team_members',
    'team_join_requests',

    'files',
    'case_library',
    'case_files',

    'projects',
    'project_stages',

    'assignments',
    'submissions',
    'submission_files',
    'grades',

    'peer_review_windows',
    'peer_reviews',
    'peer_review_coefficients',
    'peer_review_adoptions',

    'approvals',
    'abac_rules',
    'notifications',
  ].forEach((t) => list.push(touchUpdatedAtSqlite(t)));

  /* ---------- archived class: deny writes ---------- */
  // roster + staff
  list.push(denyWriteIfClassArchived('class_students', 'NEW.class_id', 'INSERT'));
  list.push(denyWriteIfClassArchived('class_students', 'NEW.class_id', 'UPDATE'));
  list.push(denyWriteIfClassArchived('class_students', 'OLD.class_id', 'DELETE'));

  list.push(denyWriteIfClassArchived('class_teachers', 'NEW.class_id', 'INSERT'));
  list.push(denyWriteIfClassArchived('class_teachers', 'NEW.class_id', 'UPDATE'));
  list.push(denyWriteIfClassArchived('class_teachers', 'OLD.class_id', 'DELETE'));

  // teams / members / join requests
  list.push(denyWriteIfClassArchived('teams', 'NEW.class_id', 'INSERT'));
  list.push(denyWriteIfClassArchived('teams', 'NEW.class_id', 'UPDATE'));
  list.push(denyWriteIfClassArchived('teams', 'OLD.class_id', 'DELETE'));

  list.push(denyWriteIfClassArchived('team_members', 'NEW.class_id', 'INSERT'));
  list.push(denyWriteIfClassArchived('team_members', 'NEW.class_id', 'UPDATE'));
  list.push(denyWriteIfClassArchived('team_members', 'OLD.class_id', 'DELETE'));

  list.push(denyWriteIfClassArchived('team_join_requests', 'NEW.class_id', 'INSERT'));
  list.push(denyWriteIfClassArchived('team_join_requests', 'NEW.class_id', 'UPDATE'));
  list.push(denyWriteIfClassArchived('team_join_requests', 'OLD.class_id', 'DELETE'));

  // files / cases
  list.push(denyWriteIfClassArchived('files', 'NEW.class_id', 'INSERT'));
  list.push(denyWriteIfClassArchived('files', 'NEW.class_id', 'UPDATE'));
  list.push(denyWriteIfClassArchived('files', 'OLD.class_id', 'DELETE'));

  list.push(denyWriteIfClassArchived('case_library', 'NEW.class_id', 'INSERT'));
  list.push(denyWriteIfClassArchived('case_library', 'NEW.class_id', 'UPDATE'));
  list.push(denyWriteIfClassArchived('case_library', 'OLD.class_id', 'DELETE'));

  // projects
  list.push(denyWriteIfClassArchived('projects', 'NEW.class_id', 'INSERT'));
  list.push(denyWriteIfClassArchived('projects', 'NEW.class_id', 'UPDATE'));
  list.push(denyWriteIfClassArchived('projects', 'OLD.class_id', 'DELETE'));

  // assignments
  list.push(denyWriteIfClassArchived('assignments', 'NEW.class_id', 'INSERT'));
  list.push(denyWriteIfClassArchived('assignments', 'NEW.class_id', 'UPDATE'));
  list.push(denyWriteIfClassArchived('assignments', 'OLD.class_id', 'DELETE'));

  // submissions
  list.push(denyWriteIfClassArchived('submissions', 'NEW.class_id', 'INSERT'));
  list.push(denyWriteIfClassArchived('submissions', 'NEW.class_id', 'UPDATE'));
  list.push(denyWriteIfClassArchived('submissions', 'OLD.class_id', 'DELETE'));

  // peer review windows (class-scoped)
  list.push(denyWriteIfClassArchived('peer_review_windows', 'NEW.class_id', 'INSERT'));
  list.push(denyWriteIfClassArchived('peer_review_windows', 'NEW.class_id', 'UPDATE'));
  list.push(denyWriteIfClassArchived('peer_review_windows', 'OLD.class_id', 'DELETE'));

  // peer reviews / coefficients / adoptions (join to window->class)
  list.push(
    trg(
      'trg_peer_reviews_deny_write_when_class_archived',
      `
BEFORE INSERT ON peer_reviews
FOR EACH ROW
WHEN
  (SELECT c.status FROM classes c WHERE c.id = NEW.class_id) = 'archived'
  AND COALESCE((SELECT allow_archived_write FROM _ctx LIMIT 1), 0) = 0
BEGIN
  SELECT RAISE(ABORT, 'CLASS_ARCHIVED_READONLY');
END;`
    )
  );
  list.push(
    trg(
      'trg_peer_review_coeff_deny_write_when_class_archived',
      `
BEFORE INSERT ON peer_review_coefficients
FOR EACH ROW
WHEN
  (SELECT c.status FROM classes c
     JOIN peer_review_windows w ON w.class_id = c.id
    WHERE w.id = NEW.window_id) = 'archived'
  AND COALESCE((SELECT allow_archived_write FROM _ctx LIMIT 1), 0) = 0
BEGIN
  SELECT RAISE(ABORT, 'CLASS_ARCHIVED_READONLY');
END;`
    )
  );
  list.push(
    trg(
      'trg_peer_review_adoptions_deny_write_when_class_archived',
      `
BEFORE INSERT ON peer_review_adoptions
FOR EACH ROW
WHEN
  (SELECT c.status FROM classes c
     JOIN peer_review_windows w ON w.class_id = c.id
    WHERE w.id = NEW.window_id) = 'archived'
  AND COALESCE((SELECT allow_archived_write FROM _ctx LIMIT 1), 0) = 0
BEGIN
  SELECT RAISE(ABORT, 'CLASS_ARCHIVED_READONLY');
END;`
    )
  );

  // grades: class derived from submission
  list.push(
    trg(
      'trg_grades_deny_write_when_class_archived',
      `
BEFORE INSERT ON grades
FOR EACH ROW
WHEN
  (SELECT c.status FROM classes c
     JOIN submissions s ON s.class_id = c.id
    WHERE s.id = NEW.submission_id) = 'archived'
  AND COALESCE((SELECT allow_archived_write FROM _ctx LIMIT 1), 0) = 0
BEGIN
  SELECT RAISE(ABORT, 'CLASS_ARCHIVED_READONLY');
END;`
    )
  );

  /* ---------- team locked: deny membership changes ---------- */
  list.push(denyWriteIfTeamLocked('team_members', 'NEW.team_id', 'INSERT'));
  list.push(denyWriteIfTeamLocked('team_members', 'NEW.team_id', 'UPDATE'));
  list.push(denyWriteIfTeamLocked('team_members', 'OLD.team_id', 'DELETE'));

  list.push(denyWriteIfTeamLocked('team_join_requests', 'NEW.team_id', 'INSERT'));
  list.push(denyWriteIfTeamLocked('team_join_requests', 'NEW.team_id', 'UPDATE'));
  list.push(denyWriteIfTeamLocked('team_join_requests', 'OLD.team_id', 'DELETE'));

  /* ---------- cross-table consistency guards ---------- */
  list.push(
    trg(
      'trg_team_members_class_consistency',
      `
BEFORE INSERT ON team_members
FOR EACH ROW
WHEN (SELECT class_id FROM teams WHERE id = NEW.team_id) != NEW.class_id
BEGIN
  SELECT RAISE(ABORT, 'TEAM_MEMBER_CLASS_MISMATCH');
END;`
    )
  );

  list.push(
    trg(
      'trg_team_join_requests_class_consistency',
      `
BEFORE INSERT ON team_join_requests
FOR EACH ROW
WHEN (SELECT class_id FROM teams WHERE id = NEW.team_id) != NEW.class_id
BEGIN
  SELECT RAISE(ABORT, 'TEAM_JOIN_REQ_CLASS_MISMATCH');
END;`
    )
  );

  list.push(
    trg(
      'trg_projects_class_consistency',
      `
BEFORE INSERT ON projects
FOR EACH ROW
WHEN (SELECT class_id FROM teams WHERE id = NEW.team_id) != NEW.class_id
BEGIN
  SELECT RAISE(ABORT, 'PROJECT_CLASS_MISMATCH');
END;`
    )
  );

  list.push(
    trg(
      'trg_projects_class_consistency_update',
      `
BEFORE UPDATE ON projects
FOR EACH ROW
WHEN (SELECT class_id FROM teams WHERE id = NEW.team_id) != NEW.class_id
BEGIN
  SELECT RAISE(ABORT, 'PROJECT_CLASS_MISMATCH');
END;`
    )
  );

  // submissions: assignment/class/project/stage consistency + team vs individual constraint
  list.push(
    trg(
      'trg_submissions_consistency_insert',
      `
BEFORE INSERT ON submissions
FOR EACH ROW
BEGIN
  SELECT
    CASE
      WHEN (SELECT class_id FROM assignments WHERE id = NEW.assignment_id) != NEW.class_id
      THEN RAISE(ABORT, 'SUBMISSION_CLASS_ASSIGNMENT_MISMATCH')
    END;

  SELECT
    CASE
      WHEN (SELECT class_id FROM projects WHERE id = NEW.project_id) != NEW.class_id
      THEN RAISE(ABORT, 'SUBMISSION_CLASS_PROJECT_MISMATCH')
    END;

  SELECT
    CASE
      WHEN (SELECT project_id FROM project_stages WHERE id = NEW.stage_id) != NEW.project_id
      THEN RAISE(ABORT, 'SUBMISSION_STAGE_PROJECT_MISMATCH')
    END;

  SELECT
    CASE
      WHEN (SELECT type FROM assignments WHERE id = NEW.assignment_id) = 'team' AND NEW.team_id IS NULL
      THEN RAISE(ABORT, 'TEAM_ASSIGNMENT_REQUIRES_TEAM')
    END;

  SELECT
    CASE
      WHEN (SELECT type FROM assignments WHERE id = NEW.assignment_id) = 'individual' AND NEW.team_id IS NOT NULL
      THEN RAISE(ABORT, 'INDIVIDUAL_ASSIGNMENT_FORBIDS_TEAM')
    END;
END;`
    )
  );

  /* ---------- project approval side effects ---------- */
  // 1) project becomes active -> lock team
  list.push(
    trg(
      'trg_projects_active_lock_team',
      `
AFTER UPDATE ON projects
FOR EACH ROW
WHEN OLD.status != 'active' AND NEW.status = 'active'
BEGIN
  UPDATE teams
     SET status = 'locked',
         is_locked = 1,
         locked_at = COALESCE(locked_at, ${sqliteNow})
   WHERE id = NEW.team_id;
END;`
    )
  );

  // 2) project becomes active -> create default stages if not exists (and open first)
  list.push(
    trg(
      'trg_projects_active_init_stages',
      `
AFTER UPDATE ON projects
FOR EACH ROW
WHEN OLD.status != 'active' AND NEW.status = 'active'
BEGIN
  INSERT INTO project_stages (project_id, key, "order", status, opened_at, created_at, updated_at)
  SELECT NEW.id, 'requirements', 1, 'open', ${sqliteNow}, ${sqliteNow}, ${sqliteNow}
  WHERE NOT EXISTS (SELECT 1 FROM project_stages WHERE project_id = NEW.id AND deleted_at IS NULL);

  INSERT INTO project_stages (project_id, key, "order", status, created_at, updated_at)
  SELECT NEW.id, 'high_level_design', 2, 'locked', ${sqliteNow}, ${sqliteNow}
  WHERE (SELECT COUNT(*) FROM project_stages WHERE project_id = NEW.id AND deleted_at IS NULL) = 1;

  INSERT INTO project_stages (project_id, key, "order", status, created_at, updated_at)
  SELECT NEW.id, 'detailed_design', 3, 'locked', ${sqliteNow}, ${sqliteNow}
  WHERE (SELECT COUNT(*) FROM project_stages WHERE project_id = NEW.id AND deleted_at IS NULL) = 2;

  INSERT INTO project_stages (project_id, key, "order", status, created_at, updated_at)
  SELECT NEW.id, 'software_testing', 4, 'locked', ${sqliteNow}, ${sqliteNow}
  WHERE (SELECT COUNT(*) FROM project_stages WHERE project_id = NEW.id AND deleted_at IS NULL) = 3;

  INSERT INTO project_stages (project_id, key, "order", status, created_at, updated_at)
  SELECT NEW.id, 'acceptance', 5, 'locked', ${sqliteNow}, ${sqliteNow}
  WHERE (SELECT COUNT(*) FROM project_stages WHERE project_id = NEW.id AND deleted_at IS NULL) = 4;
END;`
    )
  );

  // 3) stage passed -> open next stage (gatekeeping)
  list.push(
    trg(
      'trg_project_stages_pass_opens_next',
      `
AFTER UPDATE ON project_stages
FOR EACH ROW
WHEN OLD.status != 'passed' AND NEW.status = 'passed'
BEGIN
  UPDATE project_stages
     SET status = 'open', opened_at = ${sqliteNow}
   WHERE project_id = NEW.project_id
     AND "order" = NEW."order" + 1
     AND status = 'locked'
     AND deleted_at IS NULL;
END;`
    )
  );

  /* ---------- audit logs immutable ---------- */
  list.push(
    trg(
      'trg_audit_logs_immutable_update',
      `
BEFORE UPDATE ON audit_logs
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE');
END;`
    )
  );
  list.push(
    trg(
      'trg_audit_logs_immutable_delete',
      `
BEFORE DELETE ON audit_logs
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE');
END;`
    )
  );

  return list;
};

export const sqliteTriggers = buildSqliteTriggers();

/* =========================================================
 * 15) Type Exports (Select/Insert)
 * ========================================================= */

// Users
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type TeacherProfile = InferSelectModel<typeof teacherProfiles>;
export type StudentProfile = InferSelectModel<typeof studentProfiles>;
export type AdminProfile = InferSelectModel<typeof adminProfiles>;
export type UserSetting = InferSelectModel<typeof userSettings>;
export type NewUserSetting = InferInsertModel<typeof userSettings>;

// Classes
export type Class = InferSelectModel<typeof classes>;
export type NewClass = InferInsertModel<typeof classes>;
export type ClassTeacher = InferSelectModel<typeof classTeachers>;
export type ClassStudent = InferSelectModel<typeof classStudents>;

// Teams
export type Team = InferSelectModel<typeof teams>;
export type TeamMember = InferSelectModel<typeof teamMembers>;
export type TeamJoinRequest = InferSelectModel<typeof teamJoinRequests>;

// Files & Case
export type FileRow = InferSelectModel<typeof files>;
export type Case = InferSelectModel<typeof caseLibrary>;
export type CaseFile = InferSelectModel<typeof caseFiles>;

// Projects & Stages
export type Project = InferSelectModel<typeof projects>;
export type ProjectStage = InferSelectModel<typeof projectStages>;

// Assignments/Submissions/Grades
export type Assignment = InferSelectModel<typeof assignments>;
export type Submission = InferSelectModel<typeof submissions>;
export type SubmissionFile = InferSelectModel<typeof submissionFiles>;
export type Grade = InferSelectModel<typeof grades>;

// Peer review
export type PeerReviewWindow = InferSelectModel<typeof peerReviewWindows>;
export type PeerReview = InferSelectModel<typeof peerReviews>;
export type PeerReviewCoefficient = InferSelectModel<typeof peerReviewCoefficients>;
export type PeerReviewAdoption = InferSelectModel<typeof peerReviewAdoptions>;

// Approvals/Admin/Audit/Notifications
export type Approval = InferSelectModel<typeof approvals>;
export type AbacRule = InferSelectModel<typeof abacRules>;
export type ErrorEvent = InferSelectModel<typeof errorEvents>;
export type AuditLog = InferSelectModel<typeof auditLogs>;
export type Notification = InferSelectModel<typeof notifications>;
