<template>
  <div v-loading="loading">
    <div class="mb-4">
      <h2>{{ t('project.title') }}</h2>
    </div>

    <!-- 1. No Team -->
    <el-empty v-if="!hasTeam" :description="t('team.not_in_team')">
      <el-button type="primary" @click="$router.push('/student/teams')">
        {{ t('team.join') }}
      </el-button>
    </el-empty>

    <!-- 2. Team but No Project -->
    <div v-else-if="!project">
      <el-empty :description="t('project.no_project_started')">
        <el-button v-if="isLeader" type="primary" @click="showCreateDialog = true">
          {{ t('project.create') }}
        </el-button>
        <p v-else>{{ t('project.waiting_for_leader') }}</p>
      </el-empty>
    </div>

    <!-- 3. Project Active -->
    <div v-else>
      <el-card class="mb-4">
        <template #header>
          <div class="card-header">
            <h3>{{ project.name }}</h3>
            <div class="flex gap-2">
              <el-tag>{{ t('project.status_' + project.status) }}</el-tag>
              <el-button v-if="isLeader && (project.status === 'draft' || project.status === 'rejected')" size="small" @click="showEditDialog = true">
                {{ t('common.edit') }}
              </el-button>
            </div>
          </div>
        </template>
        
        <p><strong>{{ t('project.background') }}:</strong> {{ project.background }}</p>
        <p><strong>{{ t('project.tech_stack') }}:</strong> {{ project.techStack }}</p>
        
        <div v-if="project.reviewFeedback" class="mt-4 p-2 bg-red-50 text-red-600 rounded">
          <strong>{{ t('project.feedback_label') }}</strong> {{ project.reviewFeedback }}
        </div>

        <div class="mt-4" v-if="isLeader && (project.status === 'draft' || project.status === 'rejected')">
          <el-button type="success" @click="submitProject">{{ t('project.submit') }}</el-button>
        </div>
      </el-card>

      <!-- Stages -->
      <el-card class="mb-4">
        <template #header>
          <div class="card-header"><h3>{{ t('project.stage') }}</h3></div>
        </template>
        <el-steps :active="activeStageIndex" finish-status="success">
          <el-step v-for="s in project.stages" :key="s.id" :title="t(`project.stages.${s.key}`)" :status="s.status === 'passed' ? 'success' : (s.status === 'open' ? 'process' : 'wait')">
             <template #description>
                <div v-if="isLeader && s.status === 'open'" class="mt-2">
                   <el-button type="primary" size="small" @click="passStage(s.key)">{{ t('project.mark_passed') }}</el-button>
                </div>
             </template>
          </el-step>
        </el-steps>
      </el-card>

      <!-- Project Grades -->
      <el-card v-if="projectGrades.length > 0">
        <template #header>
          <div class="card-header"><h3>{{ t('project.grades') }}</h3></div>
        </template>
        <el-table :data="projectGrades" style="width: 100%">
           <el-table-column prop="assignment.title" :label="t('assignment.title')" />
           <el-table-column prop="grade.score" :label="t('assignment.score')" />
           <el-table-column prop="grade.feedback" :label="t('assignment.feedback')" />
        </el-table>
      </el-card>
    </div>

    <!-- Create/Edit Dialog -->
    <el-dialog v-model="showCreateDialog" :title="t('project.create')">
      <el-form :model="projectForm" label-width="120px">
        <el-form-item :label="t('project.name')">
          <el-input v-model="projectForm.name" />
        </el-form-item>
        <el-form-item :label="t('project.source_type')">
          <el-radio-group v-model="projectForm.sourceType">
            <el-radio label="custom">{{ t('project.custom') }}</el-radio>
            <el-radio label="case_library">{{ t('project.case_library') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('project.background')">
          <el-input v-model="projectForm.background" type="textarea" />
        </el-form-item>
        <el-form-item :label="t('project.tech_stack')">
          <el-input v-model="projectForm.techStack" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createProject">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
    
    <el-dialog v-model="showEditDialog" :title="t('project.edit')">
      <el-form :model="projectForm" label-width="120px">
        <el-form-item :label="t('project.name')">
          <el-input v-model="projectForm.name" />
        </el-form-item>
        <el-form-item :label="t('project.background')">
          <el-input v-model="projectForm.background" type="textarea" />
        </el-form-item>
        <el-form-item :label="t('project.tech_stack')">
          <el-input v-model="projectForm.techStack" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="updateProject">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useUserStore } from '@/stores/user';
import { teamService } from '@/services/team';
import { projectService } from '@/services/project';
import type { Team, Project } from '@/types';

const { t } = useI18n();
const userStore = useUserStore();

const loading = ref(false);
const hasTeam = ref(false);
const isLeader = ref(false);
const team = ref<Team | null>(null);
const project = ref<Project | null>(null);
const projectGrades = ref<any[]>([]);

const showCreateDialog = ref(false);
const showEditDialog = ref(false);
const projectForm = ref<{ name: string; sourceType: 'custom' | 'case_library'; background: string; techStack: string }>({ name: '', sourceType: 'custom', background: '', techStack: '' });

const activeClassId = computed(() => userStore.userInfo?.settings?.activeClassId);
const userId = computed(() => userStore.userInfo?.id);

const activeStageIndex = computed(() => {
  if (!project.value?.stages) return 0;
  // find first non-passed or last passed
  const idx = project.value.stages.findIndex(s => s.status === 'open');
  if (idx !== -1) return idx;
  if (project.value.stages.every(s => s.status === 'passed')) return project.value.stages.length;
  return 0;
});

const fetchData = async () => {
  if (!activeClassId.value) return;
  loading.value = true;
  try {
    // 1. Check Team
    const teamsRes = await teamService.getTeams(activeClassId.value);
    const myTeam = teamsRes.data.find(t => t.members?.some(m => m.userId === userId.value));
    
    if (myTeam) {
      hasTeam.value = true;
      team.value = myTeam;
      isLeader.value = myTeam.leaderId === userId.value;
      
      // 2. Check Project
      const projRes = await projectService.getProjects(activeClassId.value);
      // As a student, getProjects should return only my team's project (server logic)
      if (projRes.data.length > 0 && projRes.data[0]) {
        // Fetch full details including stages
        const detailRes = await projectService.getProjectById(projRes.data[0].id);
        project.value = detailRes.data;
        // Populate form for edit
        projectForm.value = {
            name: project.value.name,
            sourceType: project.value.sourceType,
            background: project.value.background || '',
            techStack: project.value.techStack || ''
        };

        // 3. Fetch Grades
        try {
           const gradeRes = await projectService.getProjectGrades(project.value.id);
           projectGrades.value = gradeRes.data.filter((g: any) => g.grade); // only show graded ones
        } catch (e) {}
      } else {
        project.value = null;
      }
    } else {
      hasTeam.value = false;
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const createProject = async () => {
  if (!team.value) return;
  try {
    await projectService.createProject(team.value.id, projectForm.value);
    ElMessage.success(t('common.success'));
    showCreateDialog.value = false;
    await fetchData();
  } catch (e) {
    ElMessage.error(t('common.error'));
  }
};

const updateProject = async () => {
  if (!project.value) return;
  try {
    await projectService.updateProject(project.value.id, projectForm.value);
    ElMessage.success(t('common.success'));
    showEditDialog.value = false;
    await fetchData();
  } catch (e) {
    ElMessage.error(t('common.error'));
  }
};

const submitProject = async () => {
  if (!project.value) return;
  try {
    await ElMessageBox.confirm(t('project.submit_confirm_msg'), t('common.confirm'), { type: 'warning' });
    await projectService.submitProject(project.value.id);
    ElMessage.success(t('project.submitted'));
    await fetchData();
  } catch (e) {
    // cancelled or error
  }
};

const passStage = async (stageKey: string) => {
  if (!project.value) return;
  try {
    await ElMessageBox.confirm(t('project.pass_stage_confirm_msg'), t('common.confirm'), { type: 'warning' });
    await projectService.updateStageStatus(project.value.id, stageKey, 'passed');
    ElMessage.success(t('project.stage_passed'));
    await fetchData();
  } catch (e) {
    // cancelled
  }
};

onMounted(fetchData);
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.mt-4 { margin-top: 16px; }
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.flex { display: flex; }
.gap-2 { gap: 8px; }
.p-2 { padding: 8px; }
.bg-red-50 { background-color: #fef0f0; }
.text-red-600 { color: #f56c6c; }
.rounded { border-radius: 4px; }
</style>
