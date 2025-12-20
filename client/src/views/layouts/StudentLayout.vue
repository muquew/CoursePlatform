<template>
  <MainLayout :menu-items="menuItems" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import MainLayout from './MainLayout.vue';
import { Odometer, Reading, UserFilled, Folder, ChatLineSquare, DataAnalysis, Collection } from '@element-plus/icons-vue';

const { t } = useI18n();

const menuItems = computed(() => [
  { title: t('nav.dashboard'), path: '/student', icon: Odometer },
  { title: t('course.my_courses'), path: '/student/courses', icon: Reading },
  { title: t('assignment.title'), path: '/student/assignments', icon: Reading },
  { title: t('team.title'), path: '/student/teams', icon: UserFilled },
  { title: t('project.title'), path: '/student/projects', icon: Folder },
  { title: t('peer_review.title'), path: '/student/peer-reviews', icon: ChatLineSquare },
  { title: t('case.title'), path: '/student/cases', icon: Collection },
  { title: t('grade.title'), path: '/student/grades', icon: DataAnalysis },
]);
</script>
