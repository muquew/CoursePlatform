import { Elysia } from 'elysia';

import { authRoutes } from './auth.ts';
import { usersRoutes } from './users.ts';
import { classesRoutes } from './classes.ts';
import { teamsRoutes } from './teams.ts';
import { casesRoutes } from './cases.ts';
import { projectsRoutes } from './projects.ts';
import { stagesRoutes } from './stages.ts';
import { assignmentsRoutes } from './assignments.ts';
import { submissionsRoutes } from './submissions.ts';
import { filesRoutes } from './files.ts';
import { gradesRoutes } from './grades.ts';
import { peerReviewRoutes } from './peer_review.ts';
import { notificationsRoutes } from './notifications.ts';
import { adminRoutes } from './admin.ts';

/**
 * v1 routes are split by domain modules.
 *
 * Each module is an Elysia plugin without a prefix (prefix is applied by the group '/api/v1').
 */
export const v1Routes = new Elysia({ name: 'v1Routes' })
  .use(authRoutes)
  .use(usersRoutes)
  .use(classesRoutes)
  .use(teamsRoutes)
  .use(casesRoutes)
  .use(projectsRoutes)
  .use(stagesRoutes)
  .use(assignmentsRoutes)
  .use(submissionsRoutes)
  .use(filesRoutes)
  .use(gradesRoutes)
  .use(peerReviewRoutes)
  .use(notificationsRoutes)
  .use(adminRoutes);
