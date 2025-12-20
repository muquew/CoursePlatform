<template>
  <div v-loading="loading">
    <h2 class="mb-4">{{ t('nav.dashboard') }}</h2>
    
    <div v-if="userStore.userInfo?.settings?.activeClassId">
      <!-- Active Class Info -->
      <el-card class="mb-4">
        <template #header>
          <div class="card-header">
            <h3>{{ activeClass?.courseName || t('common.loading') }}</h3>
            <el-tag>{{ activeClass?.term }}</el-tag>
          </div>
        </template>
        <div v-if="activeClass">
          <p><strong>{{ t('course.code') }}:</strong> {{ activeClass.code }}</p>
          <div v-if="teachers.length > 0" class="mt-2">
            <strong>{{ t('dashboard.teachers') }}:</strong>
            <span v-for="(teacher, index) in teachers" :key="teacher.id">
              {{ teacher.realName || teacher.username }}
              <span v-if="index < teachers.length - 1">, </span>
            </span>
          </div>
        </div>
      </el-card>

      <el-row :gutter="20">
        <!-- Upcoming Assignments -->
        <el-col :span="12">
          <el-card class="box-card" shadow="hover">
            <template #header>
              <div class="card-header">
                <span>{{ t('dashboard.upcoming_assignments') }}</span>
                <el-button link type="primary" @click="$router.push('/student/assignments')">{{ t('common.view') }}</el-button>
              </div>
            </template>
            <div v-if="upcomingAssignments.length > 0">
              <div v-for="assign in upcomingAssignments" :key="assign.id" class="item-row" @click="$router.push(`/student/assignments/${assign.id}`)">
                <div class="item-title">{{ assign.title }}</div>
                <div class="item-date text-danger">{{ new Date(assign.deadline).toLocaleDateString() }}</div>
              </div>
            </div>
            <el-empty v-else :description="t('dashboard.no_upcoming')" image-size="60" />
          </el-card>
        </el-col>

        <!-- Recent Notifications -->
        <el-col :span="12">
          <el-card class="box-card" shadow="hover">
            <template #header>
              <div class="card-header">
                <span>{{ t('dashboard.recent_notifications') }}</span>
              </div>
            </template>
            <div v-if="notifications.length > 0">
               <div v-for="n in notifications.slice(0, 5)" :key="n.id" class="item-row">
                 <div class="item-title">{{ n.title }}</div>
                 <div class="item-date">{{ new Date(n.createdAt).toLocaleDateString() }}</div>
               </div>
            </div>
            <el-empty v-else :description="t('dashboard.no_notifications')" image-size="60" />
          </el-card>
        </el-col>
      </el-row>
    </div>

    <el-empty v-else :description="t('course.no_courses')">
      <el-button type="primary" @click="$router.push('/student/courses')">
        {{ t('course.all_courses') }}
      </el-button>
    </el-empty>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@/stores/user';
import { courseService } from '@/services/course';
import { assignmentService } from '@/services/assignment';
import { notificationService } from '@/services/notification';
import type { Class, Assignment, Notification } from '@/types';

const { t } = useI18n();
const userStore = useUserStore();
const loading = ref(false);

const activeClass = ref<Class | null>(null);
const teachers = ref<any[]>([]);
const upcomingAssignments = ref<Assignment[]>([]);
const notifications = ref<Notification[]>([]);

const fetchData = async () => {
  const classId = userStore.userInfo?.settings?.activeClassId;
  if (!classId) return;

  loading.value = true;
  try {
    // 1. Class Info
    const classRes = await courseService.getClassById(classId);
    activeClass.value = classRes.data;

    // 2. Teachers
    const teacherRes = await courseService.getTeachers(classId);
    teachers.value = teacherRes.data;

    // 3. Assignments
    const assignRes = await assignmentService.getAssignments(classId);
    const now = new Date().getTime();
    upcomingAssignments.value = assignRes.data
      .filter(a => new Date(a.deadline).getTime() > now)
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
      .slice(0, 5);

    // 4. Notifications
    const notifRes = await notificationService.getNotifications();
    notifications.value = notifRes.data;

  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

onMounted(fetchData);
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.mt-2 { margin-top: 8px; }
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.item-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}
.item-row:last-child {
  border-bottom: none;
}
.item-row:hover {
  background-color: #fafafa;
}
.item-title {
  font-weight: 500;
}
.item-date {
  color: #999;
  font-size: 12px;
}
.text-danger {
  color: #f56c6c;
}
</style>
