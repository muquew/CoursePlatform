<template>
  <div v-loading="loading">
    <div class="mb-4">
      <el-button @click="handleBack">{{ t('common.back') }}</el-button>
    </div>

    <div v-if="course">
      <h2 class="mb-4">{{ course.courseName }} ({{ course.term }})</h2>
      
      <el-tabs v-model="activeTab">
        <!-- Overview -->
        <el-tab-pane :label="t('course.overview')" name="overview">
           <el-descriptions border :column="2">
             <el-descriptions-item :label="t('course.code')">{{ course.code }}</el-descriptions-item>
             <el-descriptions-item :label="t('course.term')">{{ course.term }}</el-descriptions-item>
             <el-descriptions-item :label="t('settings.allow_download')">{{ course.allowStudentDownloadAfterArchived ? t('user.status.yes') : t('user.status.no') }}</el-descriptions-item>
             <el-descriptions-item :label="t('assignment.status')">
               <el-tag :type="course.status === 'active' ? 'success' : 'info'">{{ course.status === 'active' ? t('user.status.active') : t('user.status.archived') }}</el-tag>
             </el-descriptions-item>
           </el-descriptions>
           
           <div class="mt-4">
             <el-button type="primary" @click="showEditDialog = true">{{ t('common.edit') }}</el-button>
             <el-button v-if="course.status === 'active'" type="warning" @click="handleStatusChange('archived')">{{ t('user.status.archived') }}</el-button>
             <el-button v-else type="success" @click="handleStatusChange('active')">{{ t('user.status.active') }}</el-button>
           </div>
        </el-tab-pane>

        <!-- Students -->
        <el-tab-pane :label="t('user.role_student')" name="students">
           <div class="mb-2 flex justify-between">
             <el-button type="primary" @click="showAddStudent = true">{{ t('user.add_student') }}</el-button>
             <el-button type="success" @click="showImportStudent = true">{{ t('user.import_students') }}</el-button>
           </div>
           <el-table :data="students" style="width: 100%">
             <el-table-column prop="studentNo" :label="t('user.student_no')" />
             <el-table-column prop="realName" :label="t('user.real_name')" />
             <el-table-column prop="isActive" :label="t('assignment.status')">
               <template #default="scope">
                 <el-tag :type="scope.row.isActive ? 'success' : 'danger'">{{ scope.row.isActive ? t('user.status.yes') : t('user.status.no') }}</el-tag>
               </template>
             </el-table-column>
             <el-table-column :label="t('common.actions')">
               <template #default="scope">
                  <el-button size="small" type="warning" @click="resetPwd(scope.row.id)">{{ t('user.reset_pwd') }}</el-button>
                  <el-button size="small" type="danger" @click="removeStudent(scope.row.id)">{{ t('user.remove') }}</el-button>
               </template>
             </el-table-column>
           </el-table>
        </el-tab-pane>

        <!-- Teachers -->
        <el-tab-pane :label="t('user.role_teacher')" name="teachers">
           <div class="mb-2">
             <el-button type="primary" @click="showAddTeacherDialog = true">{{ t('user.add_teacher') }}</el-button>
           </div>
           <el-table :data="teachers" style="width: 100%">
             <el-table-column prop="teacherNo" :label="t('user.teacher_no')" />
             <el-table-column prop="realName" :label="t('user.real_name')" />
             <el-table-column prop="role" :label="t('user.role')" />
             <el-table-column :label="t('common.actions')">
                <template #default="scope">
                  <el-button size="small" type="danger" @click="handleRemoveTeacher(scope.row.teacherId || scope.row.id)">{{ t('user.remove') }}</el-button>
                </template>
             </el-table-column>
           </el-table>
        </el-tab-pane>

        <!-- Assignments -->
        <el-tab-pane :label="t('assignment.title')" name="assignments">
           <div class="mb-2">
             <el-button type="primary" @click="handleAddAssignment">{{ t('assignment.create') }}</el-button>
           </div>
           <el-table :data="assignments" style="width: 100%">
             <el-table-column prop="title" :label="t('assignment.title')" />
             <el-table-column prop="type" :label="t('assignment.type')" />
             <el-table-column prop="deadline" :label="t('assignment.deadline')">
                <template #default="scope">
                  {{ new Date(scope.row.deadline).toLocaleDateString() }}
                </template>
             </el-table-column>
             <el-table-column :label="t('common.actions')">
                <template #default="scope">
                  <el-button size="small" @click="viewSubmissions(scope.row.id)">{{ t('assignment.submissions') }}</el-button>
                  <el-button size="small" type="primary" @click="handleEditAssignment(scope.row)">{{ t('common.edit') }}</el-button>
                  <el-button size="small" type="danger" @click="handleDeleteAssignment(scope.row.id)">{{ t('common.delete') }}</el-button>
                </template>
             </el-table-column>
           </el-table>
        </el-tab-pane>
        
        <!-- Teams -->
         <el-tab-pane :label="t('team.title')" name="teams">
            <div class="mb-2">
              <el-button type="primary" @click="openAssignDialog">{{ t('user.assign_create_team') }}</el-button>
            </div>
            <el-table :data="teams" style="width: 100%">
              <el-table-column prop="name" :label="t('team.name')" />
              <el-table-column :label="t('team.leader')">
                <template #default="scope">
                  {{ getLeaderName(scope.row) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('team.members')">
                <template #default="scope">
                  <el-tag v-for="m in scope.row.members" :key="m.userId" class="mr-1" style="margin-right: 4px">{{ m.realName }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="t('common.actions')">
                <template #default="scope">
                  <el-button size="small" type="warning" @click="openChangeLeaderDialog(scope.row)">{{ t('team.force_leader') }}</el-button>
                  <el-button size="small" type="danger" @click="handleDeleteTeam(scope.row.id)">{{ t('common.delete') }}</el-button>
                </template>
              </el-table-column>
            </el-table>
         </el-tab-pane>

         <!-- Projects -->
         <el-tab-pane :label="t('project.title')" name="projects">
            <el-table :data="projects" style="width: 100%">
              <el-table-column prop="name" :label="t('project.name')" />
              <el-table-column :label="t('team.title')">
                 <template #default="scope">
                   {{ getTeamName(scope.row.teamId) }}
                 </template>
              </el-table-column>
              <el-table-column prop="status" :label="t('assignment.status')">
                <template #default="scope">
                   <el-tag>{{ scope.row.status }}</el-tag>
                </template>
             </el-table-column>
             <el-table-column :label="t('common.actions')">
               <template #default="scope">
                 <el-button v-if="scope.row.status === 'submitted'" type="success" size="small" @click="openProjectReview(scope.row)">{{ t('project.review_proposal') }}</el-button>
                 <el-button type="primary" size="small" @click="handleForcePassStage(scope.row)">{{ t('project.manage_stages') }}</el-button>
                 <el-button type="warning" size="small" @click="handleOpenDecisionDialog(scope.row)">{{ t('project.decision') }}</el-button>
               </template>
             </el-table-column>
           </el-table>
        </el-tab-pane>

        <!-- Reviews -->
        <el-tab-pane :label="t('project.reviews')" name="reviews">
           <!-- ... existing review content ... -->
           <div class="mb-2">
             <el-button type="primary" @click="showReviewWindow = true">{{ t('project.open_window') }}</el-button>
           </div>
           <el-table :data="reviewWindows" style="width: 100%">
             <el-table-column prop="stageKey" :label="t('project.stage')" />
             <el-table-column prop="isOpen" :label="t('assignment.status')">
               <template #default="scope">
                 <el-tag :type="scope.row.isOpen ? 'success' : 'info'">{{ scope.row.isOpen ? t('user.status.open') : t('user.status.closed') }}</el-tag>
               </template>
             </el-table-column>
             <el-table-column prop="isPublished" :label="t('peer_review.published')">
                <template #default="scope">
                  <el-tag :type="scope.row.isPublished ? 'success' : 'info'">{{ scope.row.isPublished ? t('user.status.yes') : t('user.status.no') }}</el-tag>
                </template>
             </el-table-column>
             <el-table-column :label="t('common.actions')">
               <template #default="scope">
                 <el-button v-if="scope.row.isOpen" size="small" type="danger" @click="closeReview(scope.row.id)">{{ t('project.close_window') }}</el-button>
                 <el-button v-if="!scope.row.isOpen && !scope.row.isPublished" size="small" type="warning" @click="publishReview(scope.row.id)">{{ t('project.publish_window') }}</el-button>
               </template>
             </el-table-column>
           </el-table>
        </el-tab-pane>

        <!-- Case Library -->
        <el-tab-pane :label="t('case.title')" name="cases">
           <div class="mb-2">
             <el-button type="primary" @click="handleAddCase">{{ t('case.create') }}</el-button>
           </div>
           <el-table :data="cases" style="width: 100%">
             <el-table-column prop="title" :label="t('case.case_title')" />
             <el-table-column prop="tags" :label="t('case.tags')" />
             <el-table-column :label="t('common.actions')">
               <template #default="scope">
                 <el-button size="small" @click="handleEditCase(scope.row)">{{ t('common.edit') }}</el-button>
                 <el-button size="small" type="danger" @click="handleDeleteCase(scope.row.id)">{{ t('common.delete') }}</el-button>
               </template>
             </el-table-column>
           </el-table>
        </el-tab-pane>

        <!-- Settings -->
        <el-tab-pane :label="t('settings.title')" name="settings">
           <el-form :model="settingsForm" label-width="200px" style="max-width: 600px; margin-top: 20px;">
              <h3>{{ t('settings.general') }}</h3>
              <el-form-item :label="t('settings.allow_download')">
                 <el-switch v-model="settingsForm.allowStudentDownloadAfterArchived" />
              </el-form-item>
              
              <el-divider />
              <h3>{{ t('settings.team_config') }}</h3>
              <el-form-item :label="t('settings.min_size')">
                 <el-input-number v-model="settingsForm.minTeamSize" :min="1" />
              </el-form-item>
              <el-form-item :label="t('settings.max_size')">
                 <el-input-number v-model="settingsForm.maxTeamSize" :min="1" />
              </el-form-item>

              <el-form-item>
                 <el-button type="primary" @click="handleSaveSettings">{{ t('common.save') }}</el-button>
              </el-form-item>
           </el-form>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- Edit Course Dialog -->
    <el-dialog v-model="showEditDialog" :title="t('common.edit')">
      <el-form :model="courseForm" label-width="120px">
        <el-form-item :label="t('course.course_name')">
          <el-input v-model="courseForm.courseName" />
        </el-form-item>
        <el-form-item :label="t('course.term')">
          <el-input v-model="courseForm.term" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleUpdateCourse">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Add Teacher Dialog -->
    <el-dialog v-model="showAddTeacherDialog" :title="t('user.add_teacher')">
      <el-form :model="teacherForm" label-width="120px">
        <el-form-item :label="t('user.role_teacher')" required>
          <el-select
            v-model="teacherForm.teacherId"
            filterable
            remote
            :remote-method="handleSearchTeachers"
            :placeholder="t('user.search_teacher_placeholder')"
          >
            <el-option
              v-for="item in foundTeachers"
              :key="item.id"
              :label="`${item.realName} (${item.teacherNo})`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('user.role')">
           <el-select v-model="teacherForm.role">
               <el-option :label="t('user.role_teacher')" value="teacher" />
               <el-option :label="t('user.role_teacher') + t('team.role_assistant_suffix')" value="assistant" />
             </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddTeacherDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleAddTeacher">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Modals (Simplified placeholders for now) -->
    <el-dialog v-model="showAddAssignment" :title="t('assignment.create')">
      <el-form :model="assignmentForm" label-width="120px">
        <el-form-item :label="t('assignment.title')">
          <el-input v-model="assignmentForm.title" />
        </el-form-item>
        <el-form-item :label="t('assignment.type')">
          <el-select v-model="assignmentForm.type">
            <el-option :label="t('assignment.type_individual')" value="individual" />
            <el-option :label="t('assignment.type_team')" value="team" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('assignment.deadline')">
           <el-date-picker v-model="assignmentForm.deadline" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" />
        </el-form-item>
        <el-form-item :label="t('case.description')">
           <el-input v-model="assignmentForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddAssignment = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleCreateAssignment">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Review Window Dialog -->
    <el-dialog v-model="showReviewWindow" :title="t('project.open_window')">
      <el-form :model="reviewForm" label-width="120px">
        <el-form-item :label="t('project.stage')">
          <el-select v-model="reviewForm.stageKey">
            <el-option :label="t('project.stages.proposal')" value="proposal" />
            <el-option :label="t('project.stages.mvp')" value="mvp" />
            <el-option :label="t('project.stages.final')" value="final" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('project.starts_at')">
          <el-date-picker v-model="reviewForm.startsAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" />
        </el-form-item>
        <el-form-item :label="t('project.ends_at')">
          <el-date-picker v-model="reviewForm.endsAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showReviewWindow = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleOpenReview">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Project Proposal Review Dialog -->
    <el-dialog v-model="showProjectReviewDialog" :title="t('project.review_proposal')">
       <el-form :model="projectReviewForm">
          <el-form-item :label="t('project.decision')">
             <el-radio-group v-model="projectReviewForm.decision">
               <el-radio label="approved">{{ t('project.approve') }}</el-radio>
               <el-radio label="rejected">{{ t('project.reject') }}</el-radio>
             </el-radio-group>
          </el-form-item>
          <el-form-item :label="t('project.feedback')">
             <el-input v-model="projectReviewForm.feedback" type="textarea" :rows="3" />
          </el-form-item>
       </el-form>
       <template #footer>
         <el-button @click="showProjectReviewDialog = false">{{ t('common.cancel') }}</el-button>
         <el-button type="primary" @click="handleProjectReview">{{ t('common.confirm') }}</el-button>
       </template>
    </el-dialog>

    <!-- Project Stage Management Dialog -->
    <el-dialog v-model="showStageDialog" :title="t('project.manage_stages')">
      <el-table :data="activeProjectStages" style="width: 100%">
        <el-table-column prop="key" :label="t('project.stage')">
          <template #default="scope">
             {{ t('project.stages.' + scope.row.key) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="t('assignment.status')">
           <template #default="scope">
             <el-tag :type="scope.row.status === 'passed' ? 'success' : (scope.row.status === 'open' ? 'warning' : 'info')">
                {{ t('project.stage_status.' + scope.row.status) }}
             </el-tag>
           </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')">
           <template #default="scope">
              <el-button v-if="scope.row.status === 'open'" type="primary" size="small" @click="forcePassStage(scope.row.key)">
                 {{ t('common.pass') }}
              </el-button>
              <el-button v-if="scope.row.status === 'passed'" type="warning" size="small" @click="handleRollbackStage(scope.row.key)">
                 {{ t('project.rollback') }}
              </el-button>
           </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showStageDialog = false">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Peer Review Decision Dialog -->
    <el-dialog v-model="showDecisionDialog" :title="t('project.decision')" width="800px">
      <el-table :data="currentProjectReviews" style="width: 100%; margin-bottom: 20px;" max-height="300">
        <el-table-column prop="reviewerId" :label="t('peer_review.reviewer')">
           <template #default="scope">
             {{ getReviewerName(scope.row.reviewerId) }}
           </template>
        </el-table-column>
        <el-table-column prop="revieweeId" :label="t('peer_review.reviewee')">
           <template #default="scope">
             {{ getReviewerName(scope.row.revieweeId) }}
           </template>
        </el-table-column>
        <el-table-column :label="t('peer_review.score')">
           <template #default="scope">
             {{ scope.row.payload?.score }}
           </template>
        </el-table-column>
        <el-table-column :label="t('peer_review.comments')">
           <template #default="scope">
             {{ scope.row.payload?.comments }}
           </template>
        </el-table-column>
      </el-table>

      <el-form :model="decisionForm" label-width="150px">
        <el-form-item :label="t('project.adopt')">
           <el-switch v-model="decisionForm.adopt" />
        </el-form-item>
        <el-form-item :label="t('project.forced_coeff')" v-if="!decisionForm.adopt">
           <el-input-number v-model="decisionForm.forcedCoefficient" :step="0.1" :min="0" :max="2" />
        </el-form-item>
        <el-form-item :label="t('project.reason')">
           <el-input v-model="decisionForm.reason" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDecisionDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleSubmitDecision">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Assign Student to Team Dialog -->
    <el-dialog v-model="showAssignStudentDialog" :title="t('user.assign_create_team')">
       <el-form :model="assignStudentForm" label-width="120px">
          <el-form-item :label="t('user.role_student')" required>
             <el-select v-model="assignStudentForm.studentId" :placeholder="t('team.select_student')" filterable>
                <el-option v-for="s in unassignedStudents" :key="s.id" :label="`${s.realName} (${s.studentNo})`" :value="s.id" />
             </el-select>
          </el-form-item>
          <el-form-item :label="t('team.title')">
             <el-select v-model="assignStudentForm.teamId" :placeholder="t('team.select_team_optional')" clearable>
                <el-option v-for="t in teams" :key="t.id" :label="t.name" :value="t.id" />
             </el-select>
             <div class="text-xs text-gray-500">{{ t('team.leave_empty_new') }}</div>
          </el-form-item>
          <el-form-item :label="t('team.name')" v-if="!assignStudentForm.teamId">
             <el-input v-model="assignStudentForm.teamName" :placeholder="t('common.optional')" />
          </el-form-item>
       </el-form>
       <template #footer>
         <el-button @click="showAssignStudentDialog = false">{{ t('common.cancel') }}</el-button>
         <el-button type="primary" @click="handleAssignStudent">{{ t('common.confirm') }}</el-button>
       </template>
    </el-dialog>

    <!-- Case Dialog -->
    <el-dialog v-model="showCaseDialog" :title="isEditingCase ? t('case.edit') : t('case.create')">
       <el-form :model="caseForm" label-width="100px">
          <el-form-item :label="t('case.case_title')" required>
             <el-input v-model="caseForm.title" />
          </el-form-item>
          <el-form-item :label="t('case.description')">
             <el-input v-model="caseForm.description" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item :label="t('case.tags')">
             <el-input v-model="caseForm.tags" :placeholder="t('case.tags_placeholder')" />
          </el-form-item>
          <el-form-item :label="t('case.attachments')">
             <el-upload
               v-model:file-list="caseFileList"
               action=""
               :http-request="handleCaseUpload"
               multiple
             >
               <el-button type="primary">{{ t('common.upload') }}</el-button>
             </el-upload>
          </el-form-item>
       </el-form>
       <template #footer>
         <el-button @click="showCaseDialog = false">{{ t('common.cancel') }}</el-button>
         <el-button type="primary" @click="handleSaveCase">{{ t('common.confirm') }}</el-button>
       </template>
    </el-dialog>

    <el-dialog v-model="showAddStudent" :title="t('user.add_student')">
       <el-form :model="studentForm" label-width="120px">
         <el-form-item :label="t('user.student_no')">
           <el-input v-model="studentForm.studentNo" />
         </el-form-item>
         <el-form-item :label="t('user.real_name')">
           <el-input v-model="studentForm.realName" />
         </el-form-item>
       </el-form>
       <template #footer>
         <el-button @click="showAddStudent = false">{{ t('common.cancel') }}</el-button>
         <el-button type="primary" @click="handleAddStudent">{{ t('common.confirm') }}</el-button>
       </template>
    </el-dialog>

    <!-- Import Student Dialog -->
    <el-dialog v-model="showImportStudent" :title="t('user.import_students')">
       <div class="mb-4">
         <p class="mb-2">{{ t('user.import_help') }}</p>
         <el-upload
           class="upload-demo"
           drag
           action=""
           :auto-upload="false"
           :limit="1"
           v-model:file-list="importFileList"
           accept=".xlsx,.xls,.csv"
           :on-change="(file: UploadFile) => { importFileList = [file]; }"
         >
           <div class="el-upload__text">
             {{ t('common.upload_drag') }}
           </div>
         </el-upload>
         
         <div class="mt-4">
            <el-input v-model="importDefaultPassword" :placeholder="t('common.optional_default_pwd')" type="password" show-password>
               <template #prepend>{{ t('auth.password') }}</template>
            </el-input>
         </div>
       </div>
       <template #footer>
         <el-button @click="showImportStudent = false">{{ t('common.cancel') }}</el-button>
         <el-button type="primary" @click="handleImportStudents" :loading="importLoading">{{ t('common.confirm') }}</el-button>
       </template>
    </el-dialog>

    <!-- Change Leader Dialog -->
    <el-dialog v-model="showChangeLeaderDialog" :title="t('team.force_leader')">
       <el-form :model="changeLeaderForm" label-width="120px">
          <el-form-item :label="t('team.new_leader_id')" required>
             <el-select v-model="changeLeaderForm.toUserId" :placeholder="t('team.select_member')">
                <el-option v-for="m in activeTeamMembers" :key="m.userId" :label="m.realName" :value="m.userId" />
             </el-select>
          </el-form-item>
       </el-form>
       <template #footer>
         <el-button @click="showChangeLeaderDialog = false">{{ t('common.cancel') }}</el-button>
         <el-button type="primary" @click="handleChangeLeader">{{ t('common.confirm') }}</el-button>
       </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox, type UploadFile } from 'element-plus';
import { read, utils } from 'xlsx';
import { courseService } from '@/services/course';
import { userService } from '@/services/user';
import { assignmentService } from '@/services/assignment';
import { projectService } from '@/services/project';
import { teamService } from '@/services/team';
import { caseService } from '@/services/case';
import type { Class, Assignment, Case } from '@/types';

import { useUserStore } from '@/stores/user';

const { t } = useI18n();
const userStore = useUserStore();
const route = useRoute();
const router = useRouter();
const courseId = Number(route.params.id);

const loading = ref(true);
const course = ref<Class | null>(null);
const activeTab = ref('overview');

const students = ref<any[]>([]);
const teachers = ref<any[]>([]);
const assignments = ref<Assignment[]>([]);
const reviewWindows = ref<any[]>([]);
const projects = ref<any[]>([]);
const teams = ref<any[]>([]);
const cases = ref<Case[]>([]);

const showEditDialog = ref(false);
const showAddStudent = ref(false);
const showImportStudent = ref(false);
const importFileList = ref<UploadFile[]>([]);
const importDefaultPassword = ref('');
const importLoading = ref(false);

const showAddAssignment = ref(false);
const showReviewWindow = ref(false);
const showProjectReviewDialog = ref(false);
const showStageDialog = ref(false);
const activeProjectStages = ref<any[]>([]);
const showDecisionDialog = ref(false);
const currentProjectReviews = ref<any[]>([]);
const decisionForm = ref({ adopt: true, forcedCoefficient: 1, reason: '' });
const showAssignStudentDialog = ref(false);
const showCaseDialog = ref(false);
const showAddTeacherDialog = ref(false);
const showChangeLeaderDialog = ref(false);
const changeLeaderForm = ref({ teamId: 0, toUserId: undefined as number | undefined });
const activeTeamMembers = ref<any[]>([]);

const studentForm = ref({ studentNo: '', realName: '' });
const teacherForm = ref({ teacherId: undefined as number | undefined, role: 'teacher' as 'teacher' | 'assistant' });
const foundTeachers = ref<any[]>([]);

const courseForm = ref({ courseName: '', term: '' });

const assignmentForm = ref({
  id: undefined as number | undefined,
  title: '',
  type: 'individual' as 'individual' | 'team',
  stageKey: 'proposal',
  deadline: '',
  description: ''
});
const isEditingAssignment = ref(false);
const reviewForm = ref({
  stageKey: 'proposal',
  startsAt: '',
  endsAt: ''
});
const projectReviewForm = ref({ decision: 'approved', feedback: '' });
const activeProjectId = ref<number | null>(null);

const unassignedStudents = ref<any[]>([]);
const assignStudentForm = ref({ studentId: undefined as number | undefined, teamId: undefined as number | undefined, teamName: '' });

const caseForm = ref<Partial<Case>>({ title: '', description: '', tags: '' });
const isEditingCase = ref(false);
const caseFileList = ref<any[]>([]);

const settingsForm = ref({
  allowStudentDownloadAfterArchived: false,
  minTeamSize: 1,
  maxTeamSize: 5
});

const fetchData = async () => {
  loading.value = true;
  try {
    const [cRes, sRes, tRes, aRes, rRes, pRes, teamRes, caseRes] = await Promise.all([
      courseService.getClassById(courseId),
      courseService.getStudents(courseId),
      courseService.getTeachers(courseId),
      assignmentService.getAssignments(courseId),
      projectService.getReviewWindows(courseId),
      projectService.getAllProjects(courseId),
      teamService.getTeams(courseId),
      caseService.getCases(courseId)
    ]);
    course.value = cRes.data;
    students.value = sRes.data;
    teachers.value = tRes.data;
    assignments.value = aRes.data;
    reviewWindows.value = rRes.data;
    projects.value = pRes.data;
    teams.value = teamRes.data;
    cases.value = caseRes.data;

    if (course.value.config) {
      settingsForm.value = {
        allowStudentDownloadAfterArchived: course.value.allowStudentDownloadAfterArchived ?? false,
        minTeamSize: course.value.config.minTeamSize ?? 1,
        maxTeamSize: course.value.config.maxTeamSize ?? 5
      };
    }
    
    courseForm.value = {
      courseName: course.value?.courseName || '',
      term: course.value?.term || ''
    };
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const handleAddCase = () => {
  caseForm.value = { title: '', description: '', tags: '' };
  isEditingCase.value = false;
  caseFileList.value = [];
  showCaseDialog.value = true;
};

const handleEditCase = (c: Case) => {
  caseForm.value = { ...c };
  isEditingCase.value = true;
  caseFileList.value = c.attachments?.map(f => ({
     name: f.originalName,
     id: f.id,
     response: f
  })) || [];
  showCaseDialog.value = true;
};

const handleCaseUpload = async (options: any) => {
  const { file, onSuccess, onError } = options;
  try {
     const res = await courseService.uploadFile(courseId, file);
     if (res.data && res.data.length > 0) {
        onSuccess(res.data[0]);
     } else {
        onError(new Error('No file returned'));
     }
  } catch (e) {
     onError(e);
  }
};

const handleSaveCase = async () => {
  try {
    const attachmentFileIds = caseFileList.value.map(f => {
       if (f.response && f.response.id) return f.response.id;
       return f.id;
    }).filter(id => !!id);

    const payload = { ...caseForm.value, attachmentFileIds };

    if (isEditingCase.value && caseForm.value.id) {
      await caseService.updateCase(caseForm.value.id, payload);
    } else {
      await caseService.createCase(courseId, payload);
    }
    ElMessage.success(t('common.saved'));
    showCaseDialog.value = false;
    await fetchData();
  } catch (e) { console.error(e); }
};

const handleDeleteCase = async (id: number) => {
  try {
    await ElMessageBox.confirm(t('case.delete_confirm'), t('common.warning'), { type: 'warning' });
    await caseService.deleteCase(id);
    ElMessage.success(t('common.deleted'));
    await fetchData();
  } catch (e) {}
};

const handleSaveSettings = async () => {
  try {
    await courseService.updateSettings(courseId, {
      allowStudentDownloadAfterArchived: settingsForm.value.allowStudentDownloadAfterArchived,
      config: {
        minTeamSize: settingsForm.value.minTeamSize,
        maxTeamSize: settingsForm.value.maxTeamSize
      }
    });
    ElMessage.success(t('settings.updated'));
    await fetchData();
  } catch (e) { console.error(e); }
};

const handleStatusChange = async (status: 'active' | 'archived') => {
  try {
    await courseService.updateClassStatus(courseId, status);
    ElMessage.success(t('course.status_updated'));
    await fetchData();
  } catch (e) { console.error(e); }
};

const handleUpdateCourse = async () => {
  try {
    await courseService.updateClass(courseId, courseForm.value);
    ElMessage.success(t('course.updated'));
    showEditDialog.value = false;
    await fetchData();
  } catch (e) { console.error(e); }
};

const handleSearchTeachers = async (query: string) => {
  if (!query) return;
  try {
    const res = await userService.getUsers({ q: query });
    // filter only teachers
    foundTeachers.value = res.data.filter(u => u.role === 'teacher');
  } catch (e) { console.error(e); }
};

const handleAddTeacher = async () => {
  if (!teacherForm.value.teacherId) return;
  try {
    await courseService.addTeacher(courseId, teacherForm.value as any);
    ElMessage.success(t('user.teacher_added'));
    showAddTeacherDialog.value = false;
    await fetchData();
  } catch (e) { console.error(e); }
};

const handleRemoveTeacher = async (teacherId: number) => {
  try {
    await ElMessageBox.confirm(t('user.remove_teacher_confirm'), t('common.warning'), { type: 'warning' });
    await courseService.removeTeacher(courseId, teacherId);
    ElMessage.success(t('user.removed'));
    await fetchData();
  } catch (e) {}
};

const handleAddStudent = async () => {
  try {
    await courseService.addStudent(courseId, studentForm.value);
    ElMessage.success(t('user.student_added'));
    showAddStudent.value = false;
    studentForm.value = { studentNo: '', realName: '' };
    await fetchData();
  } catch (e) { console.error(e); }
};

const removeStudent = async (studentId: number) => {
   try {
     await ElMessageBox.confirm(t('user.remove_student_confirm'), t('common.warning'), { type: 'warning' });
     await courseService.removeStudent(courseId, studentId);
     ElMessage.success(t('user.removed'));
     await fetchData();
   } catch (e) {}
};

const resetPwd = async (studentId: number) => {
  try {
    const res = await userService.resetStudentPassword(courseId, studentId);
    ElMessageBox.alert(t('user.pwd_reset_success', { pwd: res.data.tempPassword }), t('common.success'));
  } catch (e) { console.error(e); }
};

const handleImportStudents = async () => {
  if (importFileList.value.length === 0 || !importFileList.value[0]) {
    ElMessage.warning(t('common.select_file'));
    return;
  }
  
  const file = importFileList.value[0].raw;
  if (!file) return;

  importLoading.value = true;
  try {
    const data = await file.arrayBuffer();
    const workbook = read(data);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      ElMessage.error(t('common.no_sheets'));
      return;
    }
    const firstSheet = workbook.Sheets[sheetName];
    if (!firstSheet) {
      ElMessage.error(t('common.sheet_empty'));
      return;
    }
    const rows: any[] = utils.sheet_to_json(firstSheet);
    
    // Expect columns: "studentNo", "realName" or Chinese equivalents
    // Map common Chinese headers if needed
    const students = rows.map(r => {
      const studentNo = r['studentNo'] || r['学号'] || r['Student No'];
      const realName = r['realName'] || r['姓名'] || r['Real Name'];
      return { studentNo: String(studentNo || ''), realName: String(realName || '') };
    }).filter(s => s.studentNo && s.realName);

    if (students.length === 0) {
      ElMessage.warning(t('user.import_no_valid'));
      return;
    }

    const res = await courseService.importStudents(courseId, students, importDefaultPassword.value);
    ElMessage.success(t('user.import_success', { count: res.data.count }));
    showImportStudent.value = false;
    importFileList.value = [];
    importDefaultPassword.value = '';
    await fetchData();
  } catch (e) {
    console.error(e);
    ElMessage.error(t('common.import_failed'));
  } finally {
    importLoading.value = false;
  }
};

const handleAddAssignment = () => {
  assignmentForm.value = { id: undefined, title: '', type: 'individual', stageKey: 'proposal', deadline: '', description: '' };
  isEditingAssignment.value = false;
  showAddAssignment.value = true;
};

const handleEditAssignment = (a: Assignment) => {
  assignmentForm.value = { 
    id: a.id, 
    title: a.title, 
    type: a.type, 
    stageKey: 'proposal', 
    deadline: a.deadline, 
    description: a.description || '' 
  };
  isEditingAssignment.value = true;
  showAddAssignment.value = true;
};

const handleDeleteAssignment = async (id: number) => {
  try {
    await ElMessageBox.confirm(t('assignment.delete_confirm'), t('common.warning'), { type: 'warning' });
    await assignmentService.deleteAssignment(id);
    ElMessage.success(t('common.deleted'));
    await fetchData();
  } catch (e) {}
};

const handleCreateAssignment = async () => {
  if (!assignmentForm.value.title || !assignmentForm.value.deadline) {
    ElMessage.warning(t('assignment.validation_error'));
    return;
  }
  try {
    if (isEditingAssignment.value && assignmentForm.value.id) {
       await assignmentService.updateAssignment(assignmentForm.value.id, assignmentForm.value);
       ElMessage.success(t('assignment.update_success'));
    } else {
       await assignmentService.createAssignment(courseId, assignmentForm.value);
       ElMessage.success(t('assignment.create_success'));
    }
    showAddAssignment.value = false;
    await fetchData();
  } catch (e) { console.error(e); }
};

const handleOpenReview = async () => {
  try {
     await projectService.openReviewWindow(courseId, reviewForm.value);
     ElMessage.success(t('project.window_opened'));
     showReviewWindow.value = false;
     await fetchData();
  } catch (e) { console.error(e); }
};

const closeReview = async (id: number) => {
  try {
    await projectService.closeReviewWindow(id);
    ElMessage.success(t('project.window_closed'));
    await fetchData();
  } catch (e) { console.error(e); }
};

const publishReview = async (id: number) => {
  try {
    await projectService.publishReviewWindow(id);
    ElMessage.success(t('project.published_success'));
    await fetchData();
  } catch (e) { console.error(e); }
};

const handleBack = () => {
  if (userStore.userInfo?.role === 'admin') {
    router.push('/admin/courses');
  } else {
    router.push('/teacher/courses');
  }
};

const viewSubmissions = (aid: number) => {
   if (userStore.userInfo?.role === 'admin') {
     router.push(`/admin/assignments/${aid}/submissions`);
   } else {
     router.push(`/teacher/assignments/${aid}/submissions`);
   }
};

const openProjectReview = (p: any) => {
  activeProjectId.value = p.id;
  projectReviewForm.value = { decision: 'approved', feedback: '' };
  showProjectReviewDialog.value = true;
};

const handleProjectReview = async () => {
  if (!activeProjectId.value) return;
  try {
    await projectService.reviewProjectProposal(activeProjectId.value, projectReviewForm.value as any);
    ElMessage.success(t('project.review_submitted'));
    showProjectReviewDialog.value = false;
    await fetchData();
  } catch(e) { console.error(e); }
};

const handleForcePassStage = async (p: any) => {
  activeProjectId.value = p.id;
  // We need to fetch stages for this project
  try {
    const res = await projectService.getProjectById(p.id);
    activeProjectStages.value = res.data.stages || [];
    showStageDialog.value = true;
  } catch(e) { console.error(e); }
};

const forcePassStage = async (stageKey: string) => {
  if (!activeProjectId.value) return;
  try {
     await projectService.updateStageStatus(activeProjectId.value, stageKey, 'passed');
     ElMessage.success(t('project.stage_passed'));
     // refresh stages
     const res = await projectService.getProjectById(activeProjectId.value);
     activeProjectStages.value = res.data.stages || [];
     await fetchData();
  } catch (e) { console.error(e); }
};

const handleRollbackStage = async (stageKey: string) => {
  if (!activeProjectId.value) return;
  try {
     await ElMessageBox.confirm(t('project.rollback_confirm'), t('common.warning'), { type: 'warning' });
     await projectService.rollbackStage(activeProjectId.value, stageKey);
     ElMessage.success(t('project.stage_rolled_back'));
     const res = await projectService.getProjectById(activeProjectId.value);
     activeProjectStages.value = res.data.stages || [];
     await fetchData();
  } catch (e) { console.error(e); }
};

const handleOpenDecisionDialog = async (p: any) => {
  activeProjectId.value = p.id;
  decisionForm.value = { adopt: true, forcedCoefficient: 1, reason: '' };
  try {
    const res = await projectService.getPeerReviews(p.id);
    currentProjectReviews.value = res.data;
    showDecisionDialog.value = true;
  } catch(e) { console.error(e); }
};

const handleSubmitDecision = async () => {
  if (!activeProjectId.value) return;
  try {
    await projectService.submitReviewDecision(activeProjectId.value, decisionForm.value);
    ElMessage.success(t('project.decision_submitted'));
    showDecisionDialog.value = false;
  } catch (e) { console.error(e); }
};

const getReviewerName = (userId: number) => {
  // Helper to find student name from `students` list or `teams`
  // We can search in `students` list which we have loaded
  const s = students.value.find(x => x.id === userId);
  return s ? s.realName : `${t('team.student_prefix')}${userId}`;
};

const openAssignDialog = async () => {
  try {
    const res = await teamService.getUnassignedStudents(courseId);
    unassignedStudents.value = res.data;
    assignStudentForm.value = { studentId: undefined, teamId: undefined, teamName: '' };
    showAssignStudentDialog.value = true;
  } catch (e) { console.error(e); }
};

const handleAssignStudent = async () => {
  if (!assignStudentForm.value.studentId) return;
  try {
    await teamService.assignStudent(courseId, assignStudentForm.value as any);
    ElMessage.success(t('team.student_assigned'));
    showAssignStudentDialog.value = false;
    await fetchData();
  } catch (e) { console.error(e); }
};

const handleDeleteTeam = async (id: number) => {
  try {
    await ElMessageBox.confirm(t('team.delete_confirm'), t('common.warning'), { type: 'warning' });
    await teamService.deleteTeam(id);
    ElMessage.success(t('common.deleted'));
    await fetchData();
  } catch (e) {}
};

const getTeamName = (tid: number) => {
  const t = teams.value.find(x => x.id === tid);
  return t ? t.name : t('common.unknown');
};

const getLeaderName = (team: any) => {
  const leaderId = team.leaderId;
  const m = team.members.find((x: any) => x.userId === leaderId);
  return m ? m.realName : `${t('team.user_prefix')}${leaderId}`;
};

const openChangeLeaderDialog = (team: any) => {
  changeLeaderForm.value = { teamId: team.id, toUserId: undefined };
  activeTeamMembers.value = team.members || [];
  showChangeLeaderDialog.value = true;
};

const handleChangeLeader = async () => {
  if (!changeLeaderForm.value.teamId || !changeLeaderForm.value.toUserId) return;
  try {
    await teamService.forceLeader(changeLeaderForm.value.teamId, { toUserId: changeLeaderForm.value.toUserId });
    ElMessage.success(t('team.leader_changed'));
    showChangeLeaderDialog.value = false;
    await fetchData();
  } catch (e) { console.error(e); }
};

onMounted(fetchData);
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.mb-2 { margin-bottom: 8px; }
.mt-4 { margin-top: 16px; }
.flex { display: flex; }
.justify-between { justify-content: space-between; }
</style>
