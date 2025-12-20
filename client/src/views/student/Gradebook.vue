<template>
  <div v-loading="loading">
    <div class="mb-4">
      <h2>{{ t('grade.title') }}</h2>
    </div>

    <el-table :data="grades" style="width: 100%">
      <el-table-column prop="assignment.title" :label="t('assignment.title')" />
      <el-table-column :label="t('assignment.score')">
        <template #default="scope">
          <span :class="getScoreClass(scope.row.score)">{{ scope.row.score }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="feedback" :label="t('assignment.feedback')" />
      <el-table-column prop="gradedAt" :label="t('common.date')">
        <template #default="scope">
          {{ new Date(scope.row.gradedAt).toLocaleDateString() }}
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { gradeService } from '@/services/grade';
import type { GradeEntry } from '@/types';

const { t } = useI18n();
const loading = ref(false);
const grades = ref<GradeEntry[]>([]);

const fetchData = async () => {
  loading.value = true;
  try {
    const res = await gradeService.getMyGrades();
    grades.value = res.data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const getScoreClass = (score: number) => {
  if (score >= 90) return 'text-success';
  if (score >= 60) return 'text-warning';
  return 'text-danger';
};

onMounted(fetchData);
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.text-success { color: #67c23a; font-weight: bold; }
.text-warning { color: #e6a23c; }
.text-danger { color: #f56c6c; }
</style>
