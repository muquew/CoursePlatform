# Client API Reference

This document outlines the key service modules in the client application (`client/src/services`), which interface with the backend REST API.

## 1. Auth Service (`auth.ts`)
Handles user authentication and session management.
- `login(credentials)`: POST `/auth/login`. Returns JWT token and user info.
- `logout()`: POST `/auth/logout`. Clears session.
- `getMe()`: GET `/auth/me`. Fetches current user profile and settings.

## 2. Course Service (`course.ts`)
Manages courses (classes), including student/teacher enrollment.
- `getClasses()`: List visible courses.
- `createClass(data)`: Create a new course (Admin/Teacher).
- `uploadFile(classId, file)`: Upload a file (multipart/form-data) to a class context.
- `importStudents(classId, file)`: Bulk import students from Excel/CSV.

## 3. Project Service (`project.ts`)
Handles project lifecycles, stages, and peer reviews.
- `getAllProjects(classId)`: List all projects in a course.
- `updateStageStatus(projectId, stageKey, status)`: Force pass/open a stage.
- `rollbackStage(projectId, stageKey)`: **[New]** Revert a stage to 'open' and lock subsequent stages.
- `submitPeerReview(projectId, data)`: Submit a peer review score/comment.

## 4. Team Service (`team.ts`)
Manages team formation and leadership.
- `createTeam(classId, data)`: Create a new team.
- `joinTeam(teamId)`: Request to join a team.
- `forceLeader(teamId, { toUserId })`: **[Teacher]** Force change team leader.
- `transferLeader(teamId, toUserId)`: **[Student]** Current leader transfers leadership to a member.

## 5. Case Service (`case.ts`)
Manages the Case Library.
- `createCase(classId, data)`: Create a new case with optional attachments.
- `updateCase(caseId, data)`: Update case details.

## 6. Admin Service (`admin.ts`)
System administration.
- `createUser(data)`: Create Teacher, Admin, or **Student** manually.
- `getAuditLogs()`: View system audit trails.
- `triggerFix(type)`: Run system maintenance tasks.
