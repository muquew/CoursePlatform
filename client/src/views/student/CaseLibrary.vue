<template>
  <div v-loading="loading">
    <div class="mb-4">
      <h2>{{ t('case.title') }}</h2>
    </div>

    <el-row :gutter="20">
      <el-col v-for="c in cases" :key="c.id" :span="8" class="mb-4">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>{{ c.title }}</span>
            </div>
          </template>
          <p class="desc">{{ c.description || t('case.no_description') }}</p>
          <div class="tags mt-2">
             <el-tag v-for="tag in (c.tags?.split(',') || [])" :key="tag" size="small" class="mr-2">{{ tag }}</el-tag>
          </div>
          <div class="mt-4">
            <el-button type="primary" link @click="viewCase(c.id)">{{ t('common.view') }}</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
    
    <el-empty v-if="cases.length === 0" :description="t('case.no_cases')" />

    <!-- Case Detail Dialog -->
    <el-dialog v-model="showDetail" :title="activeCase?.title">
      <div v-if="activeCase">
        <p><strong>{{ t('case.description') }}:</strong></p>
        <div class="detail-desc">{{ activeCase.description }}</div>
        
        <div v-if="activeCase.tags" class="mt-4">
          <strong>{{ t('case.tags') }}:</strong>
          <el-tag v-for="tag in activeCase.tags.split(',')" :key="tag" class="ml-2">{{ tag }}</el-tag>
        </div>

        <div v-if="activeCase.attachments && activeCase.attachments.length > 0" class="mt-4">
          <strong>{{ t('case.attachments_label') }}</strong>
          <div v-for="file in activeCase.attachments" :key="file.id" class="mt-2">
            <el-button type="primary" link @click="handleDownload(file)">
              <el-icon class="mr-1"><Document /></el-icon>
              {{ file.originalName }}
            </el-button>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Document } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { caseService } from '@/services/case';
import { downloadFile } from '@/utils/download';
import type { Case } from '@/types';

const { t } = useI18n();
const userStore = useUserStore();
const loading = ref(false);
const cases = ref<Case[]>([]);
const activeCase = ref<Case | null>(null);
const showDetail = ref(false);

const activeClassId = computed(() => userStore.userInfo?.settings?.activeClassId);

const fetchData = async () => {
  if (!activeClassId.value) return;
  loading.value = true;
  try {
    const res = await caseService.getCases(activeClassId.value);
    cases.value = res.data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const viewCase = async (id: number) => {
  try {
    const res = await caseService.getCaseById(id);
    activeCase.value = res.data;
    showDetail.value = true;
  } catch (e) {
    console.error(e);
  }
};

const handleDownload = async (file: any) => {
  try {
    await downloadFile(file.id, file.originalName);
  } catch (e) {
    console.error(e);
  }
};

onMounted(fetchData);
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
.mr-1 { margin-right: 4px; }
.mr-2 { margin-right: 8px; }
.ml-2 { margin-left: 8px; }
.desc {
  color: #666;
  font-size: 14px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.detail-desc {
  white-space: pre-wrap;
  margin-top: 8px;
  line-height: 1.6;
}
</style>
