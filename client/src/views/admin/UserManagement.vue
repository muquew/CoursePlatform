<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <h2>{{ t('nav.users') }}</h2>
      <el-button type="primary" @click="showCreateDialog = true">{{ t('admin.create_user') }}</el-button>
    </div>
    
    <div class="mb-4">
      <el-input v-model="searchQuery" :placeholder="t('common.search_placeholder')" class="w-64" clearable @clear="fetchUsers" @keyup.enter="fetchUsers">
        <template #append>
          <el-button @click="fetchUsers">{{ t('common.search') }}</el-button>
        </template>
      </el-input>
    </div>

    <el-table :data="users" v-loading="loading" style="width: 100%">
      <el-table-column prop="id" :label="t('user.id')" width="80" />
      <el-table-column prop="username" :label="t('auth.username')" />
      <el-table-column prop="role" :label="t('user.role')">
        <template #default="scope">
          <el-tag :type="getRoleTagType(scope.row.role)">{{ scope.row.role }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="realName" :label="t('user.real_name')" />
      <el-table-column prop="studentNo" :label="t('user.student_no')" />
      <el-table-column :label="t('common.actions')">
        <template #default="scope">
          <el-button size="small" @click="openRoleDialog(scope.row)">{{ t('user.role') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Create User Dialog -->
    <el-dialog v-model="showCreateDialog" :title="t('admin.create_user')">
      <el-form :model="createForm" label-width="120px">
        <el-form-item :label="t('auth.username')" required>
          <el-input v-model="createForm.username" />
        </el-form-item>
        <el-form-item :label="t('auth.password')">
          <el-input v-model="createForm.password" type="password" show-password :placeholder="t('common.optional_default_pwd')" />
        </el-form-item>
        <el-form-item :label="t('user.role')" required>
          <el-select v-model="createForm.role">
            <el-option :label="t('role.student')" value="student" />
            <el-option :label="t('role.teacher')" value="teacher" />
            <el-option :label="t('role.admin')" value="admin" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('user.real_name')">
           <el-input v-model="createForm.realName" />
        </el-form-item>
        <el-form-item :label="t('user.student_no')" v-if="createForm.role === 'student'">
           <el-input v-model="createForm.studentNo" />
        </el-form-item>
        <el-form-item :label="t('user.teacher_no')" v-if="createForm.role === 'teacher'">
           <el-input v-model="createForm.teacherNo" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleCreateUser">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Change Role Dialog -->
    <el-dialog v-model="showRoleDialog" :title="t('user.role')">
      <el-form :model="roleForm" label-width="120px">
        <el-form-item :label="t('user.role')">
           <el-select v-model="roleForm.role">
             <el-option :label="t('role.student')" value="student" />
             <el-option :label="t('role.teacher')" value="teacher" />
             <el-option :label="t('role.admin')" value="admin" />
           </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRoleDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleRoleChange">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { userService } from '@/services/user';
import { adminService } from '@/services/admin';
import type { User } from '@/types';

const { t } = useI18n();
const users = ref<User[]>([]);
const loading = ref(false);
const searchQuery = ref('');

const showCreateDialog = ref(false);
const createForm = ref({ username: '', password: '', role: 'student', realName: '', studentNo: '', teacherNo: '' });

const showRoleDialog = ref(false);
const roleForm = ref({ userId: 0, role: 'student' });

const fetchUsers = async () => {
  loading.value = true;
  try {
    const res = await userService.getUsers({ q: searchQuery.value });
    users.value = res.data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const getRoleTagType = (role: string) => {
  if (role === 'admin') return 'danger';
  if (role === 'teacher') return 'warning';
  return 'success';
};

const handleCreateUser = async () => {
  try {
    // Construct payload
    const payload: any = {
      username: createForm.value.username,
      password: createForm.value.password,
      role: createForm.value.role,
      profile: {}
    };
    if (createForm.value.realName) payload.profile.realName = createForm.value.realName;
    if (createForm.value.role === 'student') payload.profile.studentNo = createForm.value.studentNo;
    if (createForm.value.role === 'teacher') payload.profile.teacherNo = createForm.value.teacherNo;

    const res = await adminService.createUser(payload);
    ElMessage.success(t('common.success'));
    if (res.data.tempPassword && !createForm.value.password) {
      ElMessageBox.alert(t('common.user_created_default_pwd', { pwd: res.data.tempPassword }), t('common.success'));
    }
    showCreateDialog.value = false;
    createForm.value = { username: '', password: '', role: 'student', realName: '', studentNo: '', teacherNo: '' };
    await fetchUsers();
  } catch (e) { console.error(e); }
};

const openRoleDialog = (user: User) => {
  roleForm.value = { userId: user.id, role: user.role };
  showRoleDialog.value = true;
};

const handleRoleChange = async () => {
  try {
    await adminService.changeUserRole(roleForm.value.userId, roleForm.value.role as any);
    ElMessage.success(t('common.success'));
    showRoleDialog.value = false;
    await fetchUsers();
  } catch (e) { console.error(e); }
};

onMounted(fetchUsers);
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.flex { display: flex; }
.justify-between { justify-content: space-between; }
.items-center { align-items: center; }
</style>
