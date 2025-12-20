<template>
  <el-container class="main-layout">
    <el-aside width="220px" class="aside">
      <div class="logo">{{ t('common.app_name') }}</div>
      <el-menu
        :default-active="activeMenu"
        class="el-menu-vertical"
        router
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    
    <el-container>
      <el-header class="header">
        <div class="header-left">
           <!-- Breadcrumb could go here -->
        </div>
        <div class="header-right">
          <!-- Notification Bell -->
          <el-popover
            v-model:visible="showNotifications"
            placement="bottom"
            :width="300"
            trigger="click"
          >
            <template #reference>
              <div class="notification-bell">
                <el-badge :value="unreadCount" :hidden="unreadCount === 0" class="item">
                  <el-icon :size="20"><Bell /></el-icon>
                </el-badge>
              </div>
            </template>
            <div class="notification-list">
              <div v-if="notifications.length === 0" class="empty-notif">{{ t('dashboard.no_notifications') }}</div>
              <div 
                v-for="n in notifications" 
                :key="n.id" 
                class="notification-item" 
                :class="{ unread: !n.readAt }"
                @click="handleNotificationClick(n)"
              >
                <div class="notif-title">{{ n.title }}</div>
                <div class="notif-content">{{ n.content }}</div>
                <div class="notif-time">{{ new Date(n.createdAt).toLocaleDateString() }}</div>
              </div>
            </div>
          </el-popover>

          <LanguageSwitcher class="mr-4" />
          <el-dropdown @command="handleUserCommand">
            <span class="user-dropdown">
              {{ userStore.userInfo?.username }}
              <el-icon class="el-icon--right"><arrow-down /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">{{ t('nav.profile') }}</el-dropdown-item>
                <el-dropdown-item command="logout" divided>{{ t('auth.logout') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { useI18n } from 'vue-i18n';
import LanguageSwitcher from '@/components/LanguageSwitcher.vue';
import { ArrowDown, Bell } from '@element-plus/icons-vue';
import { authService } from '@/services/auth';
import { notificationService } from '@/services/notification';
import type { Notification } from '@/types';

const props = defineProps<{
  menuItems: Array<{ title: string; path: string; icon?: any }>
}>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const notifications = ref<Notification[]>([]);
const showNotifications = ref(false);

const activeMenu = computed(() => route.path);
const unreadCount = computed(() => notifications.value.filter(n => !n.readAt).length);

const fetchNotifications = async () => {
  if (userStore.token) {
    try {
      const res = await notificationService.getNotifications();
      notifications.value = res.data;
    } catch (e) {
      console.error(e);
    }
  }
};

const handleNotificationClick = async (n: Notification) => {
  if (!n.readAt) {
    try {
      await notificationService.markAsRead(n.id);
      n.readAt = new Date().toISOString();
    } catch (e) { console.error(e); }
  }
};

const handleUserCommand = async (command: string) => {
  if (command === 'logout') {
    await authService.logout();
    userStore.logout();
    router.push('/login');
  } else if (command === 'profile') {
    const role = userStore.userInfo?.role || 'student';
    router.push(`/${role}/profile`);
  }
};

onMounted(() => {
  fetchNotifications();
});
</script>

<style scoped>
.main-layout {
  height: 100vh;
}

.aside {
  background-color: #001529;
  color: white;
  display: flex;
  flex-direction: column;
}

.logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  background-color: #002140;
}

.el-menu-vertical {
  border-right: none;
  background-color: transparent;
  flex: 1;
}

:deep(.el-menu-item) {
  color: #a6adb4;
}

:deep(.el-menu-item:hover), :deep(.el-menu-item.is-active) {
  background-color: #1890ff;
  color: white;
}

.header {
  background: white;
  box-shadow: 0 1px 4px rgba(0,21,41,.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-dropdown {
  cursor: pointer;
  display: flex;
  align-items: center;
}

.main-content {
  background-color: #f0f2f5;
  padding: 24px;
}

.notification-bell {
  cursor: pointer;
  padding: 4px;
}

.notification-list {
  max-height: 300px;
  overflow-y: auto;
}

.notification-item {
  padding: 8px;
  border-bottom: 1px solid #eee;
  cursor: pointer;
}

.notification-item:hover {
  background-color: #f5f7fa;
}

.notification-item.unread {
  background-color: #e6f7ff;
}

.notif-title {
  font-weight: bold;
  font-size: 14px;
}

.notif-content {
  font-size: 12px;
  color: #666;
}

.notif-time {
  font-size: 10px;
  color: #999;
  text-align: right;
}
</style>
