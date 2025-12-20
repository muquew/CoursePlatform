# Testing Guide

## Unit Tests
The project uses `vitest` for unit testing client service modules.

### Setup
1. Navigate to client directory:
   ```bash
   cd client
   ```
2. Install dependencies (if not already installed):
   ```bash
   npm install
   ```

### Running Tests
Run the following command to execute unit tests:
```bash
npx vitest run
```

### Coverage
To check test coverage:
```bash
npx vitest run --coverage
```

### Test Scope
Currently, the tests cover:
- **Course Service**: Fetching classes, File upload (FormData).
- **Project Service**: Stage rollback logic, Peer review submission.
- **Team Service**: Team creation, Join requests, Member management.
- **Auth Service**: User profile fetching, Login flow.
- **Admin Service**: ABAC rule toggling, Audit log fetching.

## E2E Testing Strategy
For End-to-End testing, we recommend using Playwright or Cypress.

### Scenario 1: Student Submission
1. Login as Student (default: `student1` / `123456`).
2. Navigate to **Courses** -> Enter a course.
3. Go to **Assignments** -> Select an assignment.
4. Upload a dummy file -> Click **Submit**.
5. Verify status changes to "Submitted" and file appears in history.

### Scenario 2: Teacher Grading
1. Login as Teacher (default: `teacher1` / `123456`).
2. Navigate to **Courses** -> Select the same course.
3. Go to **Assignments** -> Click **Submissions** on the target assignment.
4. Find the student's submission -> Click **Grading**.
5. Enter Score (e.g., 90) and Feedback -> **Confirm**.
6. Verify status changes to "Graded".

### Scenario 3: I18n Switching
1. Click the Language Switcher (globe icon) in the top-right corner.
2. Select "中文".
3. Verify UI text changes (e.g., "Login" -> "登录", "Courses" -> "课程").
4. Verify dynamic content (like Status tags) also translates correctly.

### Scenario 4: Admin Controls
1. Login as Admin (default: `admin` / `admin`).
2. Go to **Dashboard**.
3. Check **System Info** tab for RBAC Matrix.
4. Go to **ABAC Rules** tab -> Toggle a rule (e.g., "disable_project_submission").
5. Login as Student and verify the restricted action is blocked.

## Manual Verification Checklist
- [ ] **Auth**: Login, Logout, Change Password.
- [ ] **Navigation**: Sidebar links work for all roles.
- [ ] **Data Consistency**: Created teams/projects appear in lists.
- [ ] **Error Handling**: Network errors show toast notifications.
- [ ] **Localization**: No untranslated English strings in Chinese mode.
