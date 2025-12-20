<template>
  <MainLayout :menu-items="menuItems" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import MainLayout from './MainLayout.vue';
import { Odometer, School } from '@element-plus/icons-vue';

const { t } = useI18n();

const menuItems = computed(() => [
  { title: t('nav.dashboard'), path: '/teacher', icon: Odometer },
  { title: t('course.title'), path: '/teacher/courses', icon: School },
]);
</script>
