<template>
  <div v-loading="loading">
    <div class="mb-4 flex items-center">
      <el-button @click="$router.back()">{{ t('common.back') }}</el-button>
      <h2 class="ml-4">{{ assignment?.title }} - {{ t('assignment.submissions') }}</h2>
    </div>

    <el-table :data="groupedSubmissions" style="width: 100%">
      <el-table-column :label="t('assignment.submitter')" width="180">
        <template #default="scope">
           {{ getSubmitterName(scope.row.latest) }}
           <el-tag v-if="scope.row.history.length > 1" size="small" class="ml-2">{{ scope.row.history.length }}{{ t('assignment.versions_suffix') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Ver" width="60">
         <template #default="scope">{{ scope.row.latest.version }}</template>
      </el-table-column>
      <el-table-column :label="t('assignment.submitted_at')" width="180">
        <template #default="scope">
           {{ new Date(scope.row.latest.createdAt).toLocaleString() }}
           <el-tag v-if="scope.row.latest.isLate" type="danger" size="small" class="ml-2">{{ t('assignment.late') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('assignment.file')">
        <template #default="scope">
          <div v-for="file in scope.row.latest.files" :key="file.id">
            <el-button link type="primary" size="small" @click="handleDownload(file)">
              {{ file.originalName }}
            </el-button>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('assignment.grading')" width="250">
        <template #default="scope">
          <div v-if="scope.row.latest.grade">
            <span class="score">{{ scope.row.latest.grade.score }}</span>
            <el-button link size="small" @click="openGradeDialog(scope.row.latest)">{{ t('common.edit') }}</el-button>
            <div class="feedback">{{ scope.row.latest.grade.feedback }}</div>
          </div>
          <el-button v-else size="small" type="primary" @click="openGradeDialog(scope.row.latest)">{{ t('assignment.grading') }}</el-button>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="100">
        <template #default="scope">
           <el-button v-if="scope.row.history.length > 1" size="small" @click="openHistoryDialog(scope.row.history)">
             {{ t('assignment.history') }}
           </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- History Dialog -->
    <el-dialog v-model="showHistoryDialog" :title="t('assignment.history')" width="800px">
       <el-table :data="activeHistory" style="width: 100%">
          <el-table-column prop="version" label="Ver" width="60" />
          <el-table-column :label="t('assignment.submitted_at')">
             <template #default="scope">
                {{ new Date(scope.row.createdAt).toLocaleString() }}
                <el-tag v-if="scope.row.isLate" type="danger" size="small" class="ml-2">{{ t('assignment.late') }}</el-tag>
             </template>
          </el-table-column>
          <el-table-column :label="t('assignment.file')">
             <template #default="scope">
                <div v-for="file in scope.row.files" :key="file.id">
                   <el-button link type="primary" size="small" @click="handleDownload(file)">
                      {{ file.originalName }}
                   </el-button>
                </div>
             </template>
          </el-table-column>
          <el-table-column :label="t('assignment.grading')">
             <template #default="scope">
                <div v-if="scope.row.grade">
                   <span class="score">{{ scope.row.grade.score }}</span>
                   <div class="feedback">{{ scope.row.grade.feedback }}</div>
                </div>
                <el-button v-else size="small" @click="openGradeDialog(scope.row)">{{ t('assignment.grading') }}</el-button>
             </template>
          </el-table-column>
       </el-table>
    </el-dialog>

    <!-- Grade Dialog -->
    <el-dialog v-model="showGradeDialog" :title="t('assignment.grading')" width="500px">
      <el-form :model="gradeForm" label-width="80px">
        <el-form-item :label="t('assignment.score')">
          <el-input-number v-model="gradeForm.score" :min="0" :max="100" />
        </el-form-item>
        <el-form-item :label="t('assignment.feedback')">
          <el-input v-model="gradeForm.feedback" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGradeDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitGrade" :loading="submitting">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { courseService } from '@/services/course';
import { teamService } from '@/services/team';
import { assignmentService } from '@/services/assignment';
import { gradeService } from '@/services/grade';
import { downloadFile } from '@/utils/download';
import type { Assignment, Submission } from '@/types';

const { t } = useI18n();
const route = useRoute();
const assignmentId = Number(route.params.id);

const loading = ref(false);
const submitting = ref(false);
const assignment = ref<Assignment | null>(null);
const submissions = ref<Submission[]>([]);
const students = ref<any[]>([]);
const teams = ref<any[]>([]);

const showGradeDialog = ref(false);
const showHistoryDialog = ref(false);
const activeSubmissionId = ref<number | null>(null);
const activeHistory = ref<Submission[]>([]);
const gradeForm = ref({ score: 0, feedback: '' });

const groupedSubmissions = computed(() => {
  if (!assignment.value) return [];
  const map = new Map<string, Submission[]>();
  
  submissions.value.forEach(sub => {
    const key = assignment.value?.type === 'team' && sub.teamId 
      ? `team-${sub.teamId}` 
      : `student-${sub.submitterId}`;
      
    if (!map.has(key)) map.set(key, []);
    map.get(key)?.push(sub);
  });
  
  const result: any[] = [];
  map.forEach((subs) => {
    subs.sort((a, b) => b.version - a.version);
    result.push({
      latest: subs[0],
      history: subs
    });
  });
  return result;
});

const fetchData = async () => {
  loading.value = true;
  try {
    const [aRes, sRes] = await Promise.all([
      assignmentService.getAssignmentById(assignmentId),
      assignmentService.getSubmissions(assignmentId)
    ]);
    assignment.value = aRes.data;
    submissions.value = sRes.data;

    // Fetch roster info
    if (assignment.value) {
      const classId = assignment.value.classId;
      const [stRes, tmRes] = await Promise.all([
        courseService.getStudents(classId),
        teamService.getTeams(classId)
      ]);
      students.value = stRes.data;
      teams.value = tmRes.data;
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const getSubmitterName = (sub: Submission) => {
  if (sub.teamId) {
    const team = teams.value.find(t => t.id === sub.teamId);
    return team ? team.name : `${t('team.team_prefix')}${sub.teamId}`;
  }
  const student = students.value.find(s => s.id === sub.submitterId);
  return student ? `${student.realName} (${student.studentNo})` : `${t('team.student_prefix')}${sub.submitterId}`;
};

const handleDownload = async (file: any) => {
  try {
    await downloadFile(file.id, file.originalName);
  } catch (e) { console.error(e); }
};

const openHistoryDialog = (history: Submission[]) => {
  activeHistory.value = history;
  showHistoryDialog.value = true;
};

const openGradeDialog = (sub: Submission) => {
  activeSubmissionId.value = sub.id;
  if (sub.grade) {
    gradeForm.value = { score: sub.grade.score, feedback: sub.grade.feedback || '' };
  } else {
    gradeForm.value = { score: 80, feedback: '' };
  }
  showGradeDialog.value = true;
};

const submitGrade = async () => {
  if (!activeSubmissionId.value) return;
  submitting.value = true;
  try {
    await gradeService.submitGrade(activeSubmissionId.value, gradeForm.value);
    ElMessage.success(t('assignment.grade_success'));
    showGradeDialog.value = false;
    await fetchData();
  } catch (e) {
    ElMessage.error(t('common.error'));
  } finally {
    submitting.value = false;
  }
};

onMounted(fetchData);
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.ml-4 { margin-left: 16px; }
.ml-2 { margin-left: 8px; }
.flex { display: flex; }
.items-center { align-items: center; }
.score { font-weight: bold; font-size: 16px; color: #409EFF; margin-right: 8px; }
.feedback { font-size: 12px; color: #666; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
