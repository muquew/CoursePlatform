<template>
  <div>
    <h2 class="mb-4">{{ t('nav.dashboard') }}</h2>
    <p>{{ t('auth.welcome') }}, {{ userStore.userInfo?.username }}</p>
    
    <div class="flex gap-4 mt-4">
      <el-card class="flex-1">
        <template #header>
          <div class="card-header">
            <span>{{ t('dashboard.recent_notifications') }}</span>
          </div>
        </template>
        <div v-if="notifications.length === 0" class="text-gray-500">{{ t('dashboard.no_notifications') }}</div>
        <div v-for="n in notifications" :key="n.id" class="notification-item" :class="{ unread: !n.readAt }">
           <div class="title">{{ n.title }}</div>
           <div class="message">{{ n.content }}</div>
           <div class="time">{{ new Date(n.createdAt).toLocaleString() }}</div>
           <el-button v-if="!n.readAt" size="small" link @click="markRead(n.id)">{{ t('common.mark_read') }}</el-button>
        </div>
      </el-card>

      <el-card class="flex-1">
        <template #header>
          <div class="card-header">
            <span>{{ t('dashboard.quick_actions') }}</span>
          </div>
        </template>
        <el-button type="primary" @click="$router.push('/teacher/courses')">
          {{ t('course.all_courses') }}
        </el-button>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@/stores/user';
import { notificationService } from '@/services/notification';
import type { Notification } from '@/types';

const { t } = useI18n();
const userStore = useUserStore();
const notifications = ref<Notification[]>([]);

const fetchNotifications = async () => {
  try {
    const res = await notificationService.getNotifications();
    notifications.value = res.data;
  } catch (e) { console.error(e); }
};

const markRead = async (id: number) => {
  try {
    await notificationService.markAsRead(id);
    await fetchNotifications();
  } catch (e) {}
};

onMounted(fetchNotifications);
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.mt-4 { margin-top: 16px; }
.flex { display: flex; }
.gap-4 { gap: 16px; }
.flex-1 { flex: 1; }
.notification-item { padding: 8px; border-bottom: 1px solid #eee; }
.notification-item.unread { background-color: #f0f9eb; }
.title { font-weight: bold; }
.message { color: #666; font-size: 14px; }
.time { font-size: 12px; color: #999; margin-top: 4px; }
.text-gray-500 { color: #999; }
</style>
