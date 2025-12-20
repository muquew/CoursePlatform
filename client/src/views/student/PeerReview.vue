<template>
  <div v-loading="loading">
    <div class="mb-4">
      <h2>{{ t('peer_review.title') }}</h2>
    </div>

    <el-empty v-if="!project" description="No active project found">
      <el-button type="primary" @click="$router.push('/student/projects')">
        {{ t('project.create') }}
      </el-button>
    </el-empty>

    <div v-else>
      <!-- Submission Form -->
      <el-card class="mb-4">
        <template #header>
          <div class="card-header">
            <h3>{{ t('peer_review.submit') }}</h3>
          </div>
        </template>
        
        <el-form :model="form" label-width="120px">
          <el-form-item :label="t('peer_review.select_teammate')">
            <el-select v-model="form.revieweeId" :placeholder="t('peer_review.select_teammate')">
              <el-option
                v-for="member in teammates"
                :key="member.userId"
                :label="member.realName || member.studentNo"
                :value="member.userId"
              />
            </el-select>
          </el-form-item>
          
          <el-form-item :label="t('peer_review.score')">
            <el-slider v-model="form.score" show-input :min="0" :max="100" />
          </el-form-item>
          
          <el-form-item :label="t('peer_review.comments')">
            <el-input v-model="form.comments" type="textarea" :rows="3" />
          </el-form-item>
          
          <el-form-item>
            <el-button type="primary" @click="submitReview" :loading="submitting" :disabled="!form.revieweeId">
              {{ t('common.confirm') }}
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- Received Reviews -->
      <el-card>
        <template #header>
          <div class="card-header">
            <h3>{{ t('peer_review.received_reviews') }}</h3>
          </div>
        </template>
        
        <div v-if="receivedReviews.length > 0">
          <div v-for="review in receivedReviews" :key="review.id" class="review-item">
            <p><strong>{{ t('peer_review.reviewee') }}:</strong> {{ getMemberName(review.revieweeId) }}</p>
            <p><strong>{{ t('peer_review.score') }}:</strong> {{ review.payload.score }}</p>
            <p><strong>{{ t('peer_review.comments') }}:</strong> {{ review.payload.comments }}</p>
            <el-divider />
          </div>
        </div>
        <el-empty v-else :description="t('peer_review.no_reviews')" />
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';
import { projectService } from '@/services/project';
import { teamService } from '@/services/team';
import type { Project, Team, PeerReview } from '@/types';

const { t } = useI18n();
const userStore = useUserStore();

const loading = ref(false);
const submitting = ref(false);
const project = ref<Project | null>(null);
const team = ref<Team | null>(null);
const receivedReviews = ref<PeerReview[]>([]);

const form = ref({
  revieweeId: undefined as number | undefined,
  score: 80,
  comments: '',
});

const activeClassId = computed(() => userStore.userInfo?.settings?.activeClassId);
const userId = computed(() => userStore.userInfo?.id);

const teammates = computed(() => {
  if (!team.value?.members) return [];
  return team.value.members.filter(m => m.userId !== userId.value);
});

const getMemberName = (id: number) => {
  const m = team.value?.members?.find(m => m.userId === id);
  return m ? (m.realName || m.studentNo) : `User ${id}`;
};

const fetchData = async () => {
  if (!activeClassId.value) return;
  loading.value = true;
  try {
    // 1. Get Team
    const teamsRes = await teamService.getTeams(activeClassId.value);
    const myTeam = teamsRes.data.find(t => t.members?.some(m => m.userId === userId.value));
    
    if (myTeam) {
      team.value = myTeam;
      // 2. Get Project
      const projRes = await projectService.getProjects(activeClassId.value);
      if (projRes.data.length > 0 && projRes.data[0]) {
        project.value = projRes.data[0];
        
        // 3. Get Reviews
        try {
          const revRes = await projectService.getPeerReviews(project.value.id);
          receivedReviews.value = revRes.data;
        } catch (e) {
          // Ignore error if forbidden (e.g. no published window)
        }
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const submitReview = async () => {
  if (!project.value || !form.value.revieweeId) return;
  submitting.value = true;
  
  const payload = {
    score: form.value.score,
    comments: form.value.comments
  };

  try {
    await projectService.submitPeerReview(project.value.id, {
      revieweeId: form.value.revieweeId,
      payload
    });
    ElMessage.success(t('peer_review.submit_success'));
    // Clear form
    form.value.comments = '';
    form.value.revieweeId = undefined;
    form.value.score = 80;
  } catch (e: any) {
    if (e.response?.status === 400) {
       ElMessage.error(t('peer_review.error_no_window'));
    } else {
       ElMessage.error(t('common.error'));
    }
  } finally {
    submitting.value = false;
  }
};

onMounted(fetchData);
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.review-item { padding: 8px 0; }
</style>
