<template>
  <div>
    <h2 class="mb-4">{{ t('assignment.title') }}</h2>
    
    <div v-if="!activeClassId">
      <el-empty :description="t('course.enter')">
        <el-button type="primary" @click="$router.push('/student/courses')">
          {{ t('course.my_courses') }}
        </el-button>
      </el-empty>
    </div>

    <div v-else>
      <el-table :data="assignments" v-loading="loading" style="width: 100%">
        <el-table-column prop="title" :label="t('assignment.title')" />
        <el-table-column prop="type" :label="t('user.role')">
            <template #default="scope">
                <el-tag size="small">{{ scope.row.type }}</el-tag>
            </template>
        </el-table-column>
        <el-table-column prop="deadline" :label="t('assignment.deadline')" />
        <el-table-column :label="t('common.actions')" width="150">
          <template #default="scope">
            <el-button size="small" type="primary" @click="viewDetail(scope.row.id)">
              {{ t('assignment.view_details') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { assignmentService } from '@/services/assignment';
import type { Assignment } from '@/types';

const { t } = useI18n();
const router = useRouter();
const userStore = useUserStore();

const loading = ref(false);
const assignments = ref<Assignment[]>([]);

const activeClassId = computed(() => userStore.userInfo?.settings?.activeClassId);

const fetchAssignments = async () => {
  if (!activeClassId.value) return;
  
  loading.value = true;
  try {
    const res = await assignmentService.getAssignments(activeClassId.value);
    assignments.value = res.data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const viewDetail = (id: number) => {
  router.push(`/student/assignments/${id}`);
};

onMounted(() => {
  if (activeClassId.value) {
    fetchAssignments();
  }
});
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
</style>
