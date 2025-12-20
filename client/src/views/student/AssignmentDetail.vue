<template>
  <div v-loading="loading">
    <div class="mb-4">
      <el-button @click="$router.back()">{{ t('common.back') }}</el-button>
    </div>

    <el-card v-if="assignment" class="mb-4">
      <template #header>
        <div class="card-header">
          <h3>{{ assignment.title }}</h3>
          <el-tag>{{ assignment.type }}</el-tag>
        </div>
      </template>
      <p><strong>{{ t('assignment.deadline') }}:</strong> {{ assignment.deadline }}</p>
      <p><strong>{{ t('assignment.description') }}:</strong></p>
      <div class="desc">{{ assignment.description || t('case.no_description') }}</div>
    </el-card>

    <el-card class="mb-4">
      <template #header>
        <div class="card-header">
          <h3>{{ t('assignment.submit') }}</h3>
        </div>
      </template>
      
      <el-upload
        class="upload-demo"
        drag
        action="#"
        :auto-upload="false"
        :on-change="handleFileChange"
        :limit="1"
        :file-list="fileList"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          {{ t('common.upload_drag') }}
        </div>
      </el-upload>
      
      <div class="mt-4">
        <el-button type="primary" @click="submitAssignment" :loading="submitting" :disabled="!selectedFile">
          {{ t('assignment.submit') }}
        </el-button>
      </div>
    </el-card>

    <el-card v-if="submissions.length > 0">
      <template #header>
        <div class="card-header">
          <h3>{{ t('assignment.history') }}</h3>
        </div>
      </template>
      
      <el-timeline>
        <el-timeline-item
          v-for="sub in submissions"
          :key="sub.id"
          :timestamp="sub.createdAt"
          placement="top"
        >
          <el-card>
            <h4>{{ t('assignment.version_prefix') }}{{ sub.version }}</h4>
            <p v-if="sub.isLate" style="color: red">{{ t('assignment.late') }}</p>
            
            <div v-if="sub.files && sub.files.length > 0" class="mt-2">
              <p><strong>{{ t('assignment.file') }}:</strong></p>
              <div v-for="f in sub.files" :key="f.id">
                 <el-button link type="primary" @click="handleDownload(f)">{{ f.originalName }}</el-button>
              </div>
            </div>

            <div v-if="sub.grade" class="grade-info">
              <p><strong>{{ t('assignment.score') }}:</strong> {{ sub.grade.score }}</p>
              <p><strong>{{ t('assignment.feedback') }}:</strong> {{ sub.grade.feedback }}</p>
            </div>
            <div v-else>
               <el-tag type="info">{{ t('assignment.submitted') }}</el-tag>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { UploadFilled } from '@element-plus/icons-vue';
import { assignmentService } from '@/services/assignment';
import { downloadFile } from '@/utils/download';
import type { Assignment, Submission } from '@/types';

const { t } = useI18n();
const route = useRoute();
const assignmentId = Number(route.params.id);

const loading = ref(false);
const submitting = ref(false);
const assignment = ref<Assignment | null>(null);
const submissions = ref<Submission[]>([]);
const selectedFile = ref<any>(null);
const fileList = ref<any[]>([]);

const fetchData = async () => {
  loading.value = true;
  try {
    const [assignRes, subRes] = await Promise.all([
      assignmentService.getAssignmentById(assignmentId),
      assignmentService.getSubmissions(assignmentId)
    ]);
    assignment.value = assignRes.data;
    submissions.value = subRes.data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const handleFileChange = (file: any) => {
  selectedFile.value = file.raw;
  fileList.value = [file];
};

const submitAssignment = async () => {
  if (!selectedFile.value) return;
  
  submitting.value = true;
  const formData = new FormData();
  formData.append('file', selectedFile.value);
  
  try {
    await assignmentService.createSubmission(assignmentId, formData);
    ElMessage.success(t('assignment.upload_success'));
    selectedFile.value = null;
    fileList.value = [];
    await fetchData(); // Refresh list
  } catch (e) {
    console.error(e);
    ElMessage.error(t('common.error'));
  } finally {
    submitting.value = false;
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
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.desc {
  white-space: pre-wrap;
  color: #606266;
  margin-top: 8px;
}
.grade-info {
  margin-top: 8px;
  background: #f0f9eb;
  padding: 8px;
  border-radius: 4px;
}
</style>
