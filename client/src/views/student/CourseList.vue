<template>
  <div>
    <h2 class="mb-4">{{ t('course.my_courses') }}</h2>
    <el-row :gutter="20" v-loading="loading">
      <el-col :span="8" v-for="course in courses" :key="course.id" class="mb-4">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>{{ course.courseName }}</span>
              <el-tag size="small">{{ course.term }}</el-tag>
            </div>
          </template>
          <div class="course-info">
            <p>{{ course.code }}</p>
          </div>
          <div class="card-actions mt-4">
            <el-button type="primary" size="small" @click="enterCourse(course.id)">
              {{ t('course.enter') }}
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <el-empty v-if="!loading && courses.length === 0" :description="t('course.no_courses')" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { courseService } from '@/services/course';
import { useUserStore } from '@/stores/user';
import type { Class } from '@/types';
import { useRouter } from 'vue-router';

const { t } = useI18n();
const router = useRouter();
const userStore = useUserStore();

const courses = ref<Class[]>([]);
const loading = ref(false);

const fetchCourses = async () => {
  loading.value = true;
  try {
    const res = await courseService.getMyClasses();
    courses.value = res.data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const enterCourse = async (id: number) => {
  try {
    await courseService.setActiveClass(id);
    // Refresh user info to update settings
    const authRes = await import('@/services/auth').then(m => m.authService.getMe());
    userStore.setUserInfo(authRes.data);
    ElMessage.success(t('common.success'));
    router.push('/student');
  } catch (e) {
    ElMessage.error(t('common.error'));
  }
};

onMounted(fetchCourses);
</script>

<style scoped>
.mb-4 {
  margin-bottom: 16px;
}
.mt-4 {
  margin-top: 16px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
