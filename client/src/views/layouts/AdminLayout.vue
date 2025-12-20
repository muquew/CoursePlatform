<template>
  <MainLayout :menu-items="menuItems" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import MainLayout from './MainLayout.vue';
import { Odometer, User, Reading } from '@element-plus/icons-vue';

const { t } = useI18n();

const menuItems = computed(() => [
  { title: t('nav.dashboard'), path: '/admin', icon: Odometer },
  { title: t('nav.courses'), path: '/admin/courses', icon: Reading },
  { title: t('nav.users'), path: '/admin/users', icon: User },
]);
</script>
