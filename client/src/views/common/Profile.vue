<template>
  <div class="profile-page">
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>{{ t('nav.profile') }}</span>
        </div>
      </template>
      
      <div class="user-info mb-6">
        <el-descriptions :column="1" border>
          <el-descriptions-item :label="t('auth.username')">{{ userStore.userInfo?.username }}</el-descriptions-item>
          <el-descriptions-item :label="t('user.role')">{{ userStore.userInfo?.role }}</el-descriptions-item>
          <el-descriptions-item :label="t('user.real_name')">{{ profile?.realName || '-' }}</el-descriptions-item>
          <el-descriptions-item :label="t('user.student_no')">{{ profile?.studentNo || profile?.teacherNo || '-' }}</el-descriptions-item>
        </el-descriptions>
      </div>

      <el-divider content-position="left">{{ t('common.change_password') }}</el-divider>

      <el-form
        ref="pwdFormRef"
        :model="pwdForm"
        :rules="pwdRules"
        label-width="140px"
        style="max-width: 500px"
      >
        <el-form-item :label="t('common.current_password')" prop="currentPassword">
          <el-input v-model="pwdForm.currentPassword" type="password" show-password />
        </el-form-item>
        <el-form-item :label="t('common.new_password')" prop="newPassword">
          <el-input v-model="pwdForm.newPassword" type="password" show-password />
        </el-form-item>
        <el-form-item :label="t('common.confirm_password')" prop="confirmPassword">
          <el-input v-model="pwdForm.confirmPassword" type="password" show-password />
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="handleChangePassword" :loading="submitting">
            {{ t('common.update_password') }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, type FormInstance } from 'element-plus';
import { useUserStore } from '@/stores/user';
import { userService } from '@/services/user';

const { t } = useI18n();
const userStore = useUserStore();

const profile = ref<any>(null); // Combined profile type
const submitting = ref(false);
const pwdFormRef = ref<FormInstance>();

const pwdForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const validatePass2 = (_rule: any, value: any, callback: any) => {
  if (value === '') {
    callback(new Error(t('common.input_again')));
  } else if (value !== pwdForm.newPassword) {
    callback(new Error(t('common.password_mismatch')));
  } else {
    callback();
  }
};

const pwdRules = computed(() => ({
  currentPassword: [{ required: true, message: t('common.input_current_password'), trigger: 'blur' }],
  newPassword: [
    { required: true, message: t('common.input_new_password'), trigger: 'blur' },
    { min: 6, message: t('common.password_min_length'), trigger: 'blur' },
  ],
  confirmPassword: [{ validator: validatePass2, trigger: 'blur' }],
}));

onMounted(async () => {
  if (userStore.userInfo?.id) {
    try {
      const res = await userService.getUserById(userStore.userInfo.id);
      profile.value = res.data;
    } catch (e) {
      console.error(e);
    }
  }
});

const handleChangePassword = async () => {
  if (!pwdFormRef.value) return;
  await pwdFormRef.value.validate(async (valid) => {
    if (valid) {
      submitting.value = true;
      try {
        await userService.updatePassword({
          currentPassword: pwdForm.currentPassword,
          newPassword: pwdForm.newPassword,
        });
        ElMessage.success(t('common.password_updated'));
        pwdForm.currentPassword = '';
        pwdForm.newPassword = '';
        pwdForm.confirmPassword = '';
      } catch (e) {
        ElMessage.error(t('common.password_update_failed'));
      } finally {
        submitting.value = false;
      }
    }
  });
};
</script>

<style scoped>
.profile-page {
  padding: 20px;
}
.mb-6 {
  margin-bottom: 24px;
}
</style>
