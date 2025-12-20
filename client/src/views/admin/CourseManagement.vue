<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <h2>{{ t('course.all_courses') }}</h2>
      <el-button type="primary" @click="showCreateDialog = true">{{ t('course.create') }}</el-button>
    </div>

    <el-table :data="courses" v-loading="loading" style="width: 100%">
      <el-table-column prop="id" :label="t('user.id')" width="80" />
      <el-table-column prop="courseName" :label="t('course.course_name')" />
      <el-table-column prop="code" :label="t('course.code')" />
      <el-table-column prop="term" :label="t('course.term')" />
      <el-table-column prop="status" :label="t('assignment.status')">
         <template #default="scope">
            <el-tag :type="scope.row.status === 'active' ? 'success' : 'info'">
              {{ scope.row.status === 'active' ? t('user.status.active') : t('user.status.archived') }}
            </el-tag>
         </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="200">
        <template #default="scope">
          <el-button size="small" @click="handleEdit(scope.row)">
            {{ t('common.edit') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showCreateDialog" :title="t('course.create')">
      <el-form :model="createForm" label-width="120px">
        <el-form-item :label="t('course.course_name')" required>
          <el-input v-model="createForm.courseName" />
        </el-form-item>
        <el-form-item :label="t('course.term')" required>
          <el-input v-model="createForm.term" />
        </el-form-item>
        <el-form-item :label="t('role.teacher')">
          <el-select
             v-model="createForm.ownerTeacherId"
             filterable
             remote
             :remote-method="searchTeachers"
             :loading="loadingTeachers"
             :placeholder="t('user.search_teacher_placeholder')"
          >
             <el-option
                v-for="item in teacherOptions"
                :key="item.id"
                :label="`${item.profile?.realName || item.username} (${item.username})`"
                :value="item.id"
             />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleCreateCourse">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { courseService } from '@/services/course';
import { userService } from '@/services/user';
import type { Class } from '@/types';

const { t } = useI18n();
const router = useRouter();
const courses = ref<Class[]>([]);
const loading = ref(false);

const showCreateDialog = ref(false);
const createForm = ref<{ courseName: string; term: string; ownerTeacherId?: number }>({ courseName: '', term: '' });

const teacherOptions = ref<any[]>([]);
const loadingTeachers = ref(false);

const fetchCourses = async () => {
  loading.value = true;
  try {
    const res = await courseService.getClasses();
    courses.value = res.data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const searchTeachers = async (query: string) => {
  if (query) {
    loadingTeachers.value = true;
    try {
      const res = await userService.getUsers({ q: query });
      // Filter strictly for teachers on client side if needed, 
      // though server allows assigning any user. Let's filter for UX.
      teacherOptions.value = res.data.filter((u: any) => u.role === 'teacher');
    } catch (e) {
      console.error(e);
    } finally {
      loadingTeachers.value = false;
    }
  } else {
    teacherOptions.value = [];
  }
};

const handleCreateCourse = async () => {
  if (!createForm.value.courseName || !createForm.value.term) {
    ElMessage.warning(t('course.validation_required'));
    return;
  }
  try {
    await courseService.createClass(createForm.value);
    ElMessage.success(t('common.success'));
    showCreateDialog.value = false;
    createForm.value = { courseName: '', term: '' };
    teacherOptions.value = [];
    await fetchCourses();
  } catch (e) {
    console.error(e);
  }
};

const handleEdit = (row: Class) => {
  router.push(`/admin/courses/${row.id}`);
};

onMounted(fetchCourses);
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.flex { display: flex; }
.justify-between { justify-content: space-between; }
.items-center { align-items: center; }
</style>
