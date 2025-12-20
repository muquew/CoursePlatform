<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDown } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n'; 
import { availableLanguages } from '@/i18n.ts';

const { locale } = useI18n();

const currentLanguage = computed(() => locale.value);

const currentLanguageName = computed(() => {
  const lang = availableLanguages.find(l => l.code === currentLanguage.value);
  // 返回从文件元数据中读取到的 name
  return lang ? lang.name : 'N/A';
});

const handleCommand = (command: string) => {
  if (locale.value !== command) {
    locale.value = command;
    localStorage.setItem('language', command); 
  }
};

</script>
<template>
  <el-dropdown trigger="click" @command="handleCommand">
    <span class="el-dropdown-link cursor-pointer flex items-center">
      🌐 {{ currentLanguageName }}
      <el-icon class="el-icon--right"><ArrowDown /></el-icon>
    </span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item 
          v-for="lang in availableLanguages" 
          :key="lang.code" 
          :command="lang.code" 
          :disabled="currentLanguage === lang.code"
        >
          {{ lang.name }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>