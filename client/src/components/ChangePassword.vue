<template>
  <div class="change-password-comp">
    <h4 class="mb-4 text-gray-600">{{ t('auth.change_password_title') }}</h4>
    
    <el-form 
      ref="pwdFormRef"
      :model="pwdForm" 
      :rules="rules"
      label-width="100px"
      status-icon
    >
    <el-form-item :label="t('common.current_password')" prop="currentPassword">
        <el-input 
        v-model="pwdForm.currentPassword" 
          type="password" 
          show-password 
          :placeholder="t('common.placeholder_current_password')"
        />
      </el-form-item>
      
      <el-form-item :label="t('common.new_password')" prop="newPassword">
        <el-input 
          v-model="pwdForm.newPassword" 
          type="password" 
          show-password 
          :placeholder="t('common.placeholder_new_password')"
        />
      </el-form-item>
      
      <el-form-item :label="t('common.confirm_password')" prop="confirmPassword">
        <el-input 
          v-model="pwdForm.confirmPassword" 
          type="password" 
          show-password 
          :placeholder="t('common.placeholder_confirm_password')"
        />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="loading" @click="handleChangePassword">
          {{ t('common.confirm_change') }}
        </el-button>
        <el-button @click="resetForm">{{ t('common.reset') }}</el-button>
      </el-form-item>
    </el-form>

    <el-alert
      :title="t('common.note')"
      type="warning"
      :description="t('auth.logout_after_change_pwd')"
      show-icon
      :closable="false"
      class="mt-6"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { useUserStore } from '@/stores/user';
import { useRouter } from 'vue-router';
import request from '@/utils/request';
import { ElMessage, type FormInstance } from 'element-plus';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const router = useRouter();
const userStore = useUserStore();
const loading = ref(false);
const pwdFormRef = ref<FormInstance>();

// 表单数据
const pwdForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
});

// 校验规则
const validatePass2 = (rule: unknown, value: string, callback: (err?: Error) => void) => {
  void rule;
  if (value === '') {
    callback(new Error(t('common.input_again')));
  } else if (value !== pwdForm.newPassword) {
    callback(new Error(t('common.password_mismatch')));
  } else {
    callback();
  }
};

const rules = computed(() => ({
  currentPassword: [
    { required: true, message: t('common.input_current_password'), trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: t('common.input_new_password'), trigger: 'blur' },
    { min: 6, message: t('common.password_min_length'), trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, validator: validatePass2, trigger: 'blur' }
  ]
}));

// 提交修改
const handleChangePassword = async () => {
  if (!pwdFormRef.value) return;
  
  await pwdFormRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true;
      try {
        await request.patch(`/users/me/password`, {
          currentPassword: pwdForm.currentPassword,
          newPassword: pwdForm.newPassword
        });

        ElMessage.success(t('auth.password_changed_relogin'));
        userStore.logout();
        router.push('/login');
      } catch (error: any) {
        console.error(error);
        const msg = error.response?.data?.error?.message || t('auth.password_change_failed');
        ElMessage.error(msg);
      } finally {
        loading.value = false;
      }
    }
  });
};

const resetForm = () => {
  if (!pwdFormRef.value) return;
  pwdFormRef.value.resetFields();
};
</script>

<style scoped>
.text-gray-600 { color: #606266; }
.mb-4 { margin-bottom: 16px; }
.mt-6 { margin-top: 24px; }
</style>