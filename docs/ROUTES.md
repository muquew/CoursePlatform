# ROUTES.md (Redesigned — No Legacy Compatibility)

> 软件工程案例实践课程管理平台 — API Routes (v1, clean design)  
> **No legacy/compat routes.**  
> Base prefix: `/api/v1`

本版本为“重新设计”的 API 路由全集：  
- 仅保留规范、可演进的 REST 形态  
- 统一术语：**Team**（团队/小组）、**Stage**（阶段）  
- 明确落地需求硬规则：**Archived 班级只读**、**立项通过即锁定团队**、**阶段流转/回滚不删数据**、**提交版本控制**、**审计日志不可篡改**、**站内通知**。

---

## 0. Global Conventions

### 0.1 Auth
- Protected endpoints require: `Authorization: Bearer <JWT>`

### 0.2 CSRF (optional)
When `CSRF_ENABLED=1`, require:
- `x-csrf-token=sha256(<bearer-token>)` for `POST/PUT/PATCH/DELETE`

### 0.3 Error Format
```json
{ "error": { "code": "FORBIDDEN|BAD_REQUEST|NOT_FOUND|INTERNAL", "message": "...", "details": {} } }
```

### 0.4 Archived Class Read-only (Hard Rule)
If `class.status=archived`:
- **All writes are forbidden**: roster changes, team membership changes, project review, stage updates/rollback, submissions, grades, peer reviews.
- Reads remain allowed.
- File downloads depend on `classes.allowStudentDownloadAfterArchived`.

> Implementation: add a single guard at the top of every write handler: `assertClassWritable(classId)`.

---

## 1. Base

- `GET /` → v1 running status (`/api/v1/`)
- `GET /swagger` → OpenAPI docs (`/api/v1/swagger`)

> Note: root endpoints are mounted outside v1:
> - `GET /` (root) → Running message
> - `GET /about` (root) → Service info


---

## 2. Auth

- `POST /auth/login` → JWT login
- `POST /auth/logout` → Stateless logout
- `GET /auth/me` → Current user info

---

## 3. Users

### 3.1 Read
- `GET /users` → List/search users (privacy filtered)
- `GET /users/:userId` → User basic info
- `GET /users/:userId/profile` → Role-specific profile view (admin/teacher/self)

### 3.2 Password
- `PATCH /users/me/password` → Change password (self, clears `mustChangePassword`)
- `POST /classes/:classId/students/:studentId/password-reset` → Reset student password (teacher)

> 注意：避免 `PUT /users/:userId/password`（容易被误用成“改别人密码”）。

---

## 4. Classes

### 4.1 Core
- `POST /classes` → Create class (teacher)
- `GET /classes` → List my classes (by role)
- `GET /classes/:classId` → Class detail

### 4.2 Roster (students in class)
- `GET /classes/:classId/students` → List students (profile masking)
- `POST /classes/:classId/students` → Add student (teacher) + active enrollment
- `POST /classes/:classId/students/import` → Import students (teacher)
- `PATCH /classes/:classId/students/:studentId` → Update enrollment (teacher): `{ isActive, leftAt? }`
- `DELETE /classes/:classId/students/:studentId` → Remove student (teacher) (soft delete / mark inactive)

### 4.3 Teaching staff
- `GET /classes/:classId/teachers` → List teachers (member/admin)
- `POST /classes/:classId/teachers` → Add teacher (admin or class owner teacher)
- `DELETE /classes/:classId/teachers/:teacherId` → Remove teacher (protect last)

### 4.4 Student “My Enrollment”

> Implementation note: persist `active class` in DB via `user_settings.activeClassId` (nullable), so clients can resume context across devices.
- `GET /me/classes` → My enrollments (student)
- `PUT /me/classes/active` → Set active class (student): `{ classId }`
- `DELETE /me/classes/active` → Clear active class (student)

### 4.5 Lifecycle & Settings (Required)
- `PATCH /classes/:classId/status` → `{ status: "active" | "archived" }` (teacher/admin)
- `PATCH /classes/:classId/settings` → `{ allowStudentDownloadAfterArchived: boolean, ... }` (teacher/admin)

---

## 5. Teams (Group / Team Management)

> **Team 是班级内的团队容器。**  
> 成员变更通过“申请/审批”完成；“教师强制”必须写审计日志。  
> **团队锁定的唯一来源：项目审核通过使 project.status=active 时自动锁定 team.status=locked、team.isLocked=true，并写入 lockedAt。** 
> 不提供 leader 手动 lock 接口，避免绕流程。

### 5.1 Core
- `POST /classes/:classId/teams` → Create team (student)
- `GET /classes/:classId/teams` → List teams in class (role-filtered)
- `GET /teams/:teamId` → Team detail (member/teacher/admin full; others limited)

### 5.2 Membership (Join Requests)
- `POST /teams/:teamId/join-requests` → Create join request (student)
- `GET /teams/:teamId/join-requests` → List join requests (leader/teacher/admin) with filter `?status=draft|approved|rejected|cancelled`
- `PATCH /teams/:teamId/join-requests/:requestId` → Leader decision: `{ decision: "approve" | "reject", reason? }`
- `DELETE /teams/:teamId/join-requests/:requestId` → Student cancels pending request

### 5.3 Leave / Remove (only if not locked)
- `POST /teams/:teamId/leave` → Leave team (student, non-leader, team not locked)
- `DELETE /teams/:teamId/members/:userId` → Remove member (leader, team not locked)

### 5.4 Leadership
- `POST /teams/:teamId/leader-transfer` → Leader transfers leadership: `{ toUserId }` (team not locked)
- `POST /teams/:teamId/leader-force` → Teacher/admin forces leadership change: `{ toUserId, reason }` (audit required)

### 5.5 Unassigned Students (Teacher helper)
- `GET /classes/:classId/students/unassigned` → Students not in any active team (teacher)
- `POST /classes/:classId/teams/assign` → Force-assign (teacher): `{ studentId, teamId? }`  
  - If `teamId` omitted, create a new team and assign.

---

## 6. Case Library (Optional but supported by schema)

- `POST /classes/:classId/cases` → Create case (teacher)
- `GET /classes/:classId/cases` → List cases
- `GET /cases/:caseId` → Case detail
- `PATCH /cases/:caseId` → Update case (teacher)
- `DELETE /cases/:caseId` → Delete case (teacher)

---

## 7. Projects (Lifecycle)

> Project belongs to **team + class**.  
> Two source types: `case_library` or `custom`.  
> **Teacher approval sets project active and locks team.**

### 7.1 Draft & Review
- `POST /teams/:teamId/projects` → Create project draft (leader)
- `GET /classes/:classId/projects` → List projects (role-filtered, support query)
- `GET /projects/:projectId` → Project detail (member/teacher/admin)
- `PATCH /projects/:projectId` → Update draft (leader, only if status=draft)
- `POST /projects/:projectId/submit` → Submit for review (leader, status changes draft → submitted)
- `POST /projects/:projectId/reviews` → Teacher review: `{ decision: "approve" | "reject", feedback? }`  
  - On approve: `projects.status=active` + `teams.isLocked=true` + open stage #1 + notify + audit

---

## 8. Stages (Required)

> Stage workflow: 需求分析 → 概要设计 → 详细设计 → 软件测试 → 交付验收  
> Stage status: `locked | open | passed`  
> **Rollback allowed** and **must not delete** any submission/grade data.

### 8.1 Read
- `GET /projects/:projectId/stages` → List stages (ordered)

### 8.2 Update / Progress
- `PATCH /projects/:projectId/stages/:stageKey` → Update stage status (leader for forward progress; teacher/admin for any)  
  Body: `{ status: "locked" | "open" | "passed" }`  
  - If `passed`, next stage auto-open (gatekeeping)

### 8.3 Rollback
- `POST /projects/:projectId/stages/:stageKey/rollback` → Roll back to target stage (teacher/admin)  
  - Set earlier stages `passed`, target `open`, later `locked`  
  - Keep all submissions/versions/grades

---

## 9. Assignments

> Assignment is class-scoped and can be personal/team.  
> (Your schema may use `assignments.type` or similar; align the payload.)

- `POST /classes/:classId/assignments` → Create assignment (teacher)
- `GET /classes/:classId/assignments` → List assignments
- `GET /assignments/:assignmentId` → Assignment detail
- `PATCH /assignments/:assignmentId` → Update assignment (teacher)
- `DELETE /assignments/:assignmentId` → Delete assignment (teacher)

---

## 10. Submissions (Required for versioning)

> Submission must be bound to a stage (`stageKey` or `stageId`) and supports versioning (V1, V2, …).  
> Files must be stored with UUID/timestamp and DB keeps mapping: `originalName`, `storagePath`.

### 10.1 Submit
- `POST /assignments/:assignmentId/submissions` → Create submission (student or leader depending on assignment type)  
  - multipart upload
  - server sets `version`, `isLate`

### 10.2 Query
- `GET /assignments/:assignmentId/submissions` → List submissions (teacher/leader; student sees own)
- `GET /submissions/:submissionId` → Submission detail (includes version + files mapping)
- `GET /submissions/:submissionId/versions` → Version history for the same logical key (assignment + stage + team/submitter)

---

## 11. Files (Recommended)

> To enforce permission + archived download policy, use API download rather than static direct links.

- `GET /files/:fileId/download` → Download file (checks ownership/class membership + archived policy)

---

## 12. Grades

> Teacher grades team submissions per stage; personal assignments graded per student.  
> Upsert is fine but keep audit trail.

- `PUT /submissions/:submissionId/grade` → Upsert grade (teacher)  
  Body: `{ score, feedback?, rubricJson? }`
- `GET /me/grades` → My grades (student)
- `GET /projects/:projectId/grades` → Project grade summary (teacher/member role-filtered)
- `GET /assignments/:assignmentId/grades` → Assignment grade summary (teacher)

---

## 13. Peer Reviews

> 双盲 + 延时公布 + 教师 veto。  
> 系统不限定算法，但需要“窗口/封存/发布”控制点来落地需求。

### 13.1 Windows (Control Plane)

- `GET /classes/:classId/peer-review-windows` → List windows (teacher)
- `POST /classes/:classId/peer-review-windows` → Open window (teacher)  
  Body: `{ stageKey, startsAt?, endsAt? }`
- `POST /peer-review-windows/:windowId/close` → Close & seal (teacher)

- `POST /peer-review-windows/:windowId/publish` → Publish results (teacher)  
  - transition: `sealed → published`; after publish, students may view.

### 13.2 Submit / View
- `POST /projects/:projectId/peer-reviews` → Submit peer review (student)  
- `GET /projects/:projectId/peer-reviews` → View (teacher/admin always; students only after publish)

### 13.3 Veto / Adopt
- `POST /projects/:projectId/peer-reviews/decision` → Teacher decision  
  Body: `{ adopt: boolean, forcedCoefficient?: number, reason? }`

---

## 14. Notifications

- `GET /me/notifications` → List my notifications
- `PATCH /me/notifications/:notificationId` → Mark read: `{ readAt: ISOString }` (or empty body to set now)

---

## 15. Audit Logs (Required)

> Audit log is append-only; no update/delete routes.

- `GET /admin/audit-logs` → Query audit logs (admin)
  - supports filters: `?classId=&teamId=&projectId=&actorId=&action=&from=&to=`

---

## 16. Admin

### 16.1 User/Role

- `POST /admin/users` → Create user (admin)  
  Body: `{ role: "teacher"|"admin", username, password?, profile?: { realName, teacherNo?, email? } }`  
  - No public registration; admin-only.
- `GET /admin/roles/matrix` → Roles/resources matrix
- `PATCH /admin/users/:userId/role` → Update user role: `{ role }`

### 16.2 ABAC Rules
- `GET /admin/abac/rules` → List rules
- `PATCH /admin/abac/rules/:key` → `{ enabled: boolean }`

### 16.3 Operational
- `GET /admin/errors` → Recent error monitor

### 16.4 Repair Tools (must audit)
- `POST /admin/fixes/project/:projectId` → Fix project state (audit)
- `POST /admin/fixes/enrollment` → Fix enrollment (audit)

---

## 17. Minimal Resource/Action Mapping (for `authorize()`)

Resources (suggested):
- `users`
- `classes`
- `class_students`
- `teams`
- `team_join_requests`
- `projects`
- `project_stages`
- `assignments`
- `submissions`
- `grades`
- `peer_reviews`
- `peer_review_windows`
- `notifications`
- `audit_logs`
- `admin`

Actions (suggested):
- `read | create | update | delete`
- plus: `review` (projects), `rollback` (stages), `force` (leadership), `publish` (grades/peer review)

---
