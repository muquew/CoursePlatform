<template>
  <AuthLayout>
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      @keyup.enter="handleLogin"
    >
      <el-form-item :label="t('auth.username')" prop="username">
        <el-input v-model="form.username" :placeholder="t('auth.username')" />
      </el-form-item>
      
      <el-form-item :label="t('auth.password')" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          :placeholder="t('auth.password')"
          show-password
        />
      </el-form-item>

      <el-form-item>
        <el-button
          type="primary"
          class="w-full"
          :loading="loading"
          @click="handleLogin"
        >
          {{ t('auth.login') }}
        </el-button>
      </el-form-item>
    </el-form>

    <el-dialog v-model="showForceChangePwd" :title="t('auth.change_password_title')" :close-on-click-modal="false" :close-on-press-escape="false" :show-close="false">
       <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-position="top">
          <el-alert :title="t('auth.password_expired_msg')" type="warning" :closable="false" class="mb-4" show-icon />
          <el-form-item :label="t('common.current_password')" prop="currentPassword">
             <el-input v-model="pwdForm.currentPassword" type="password" show-password />
          </el-form-item>
          <el-form-item :label="t('common.new_password')" prop="newPassword">
             <el-input v-model="pwdForm.newPassword" type="password" show-password />
          </el-form-item>
          <el-form-item :label="t('common.confirm_password')" prop="confirmPassword">
             <el-input v-model="pwdForm.confirmPassword" type="password" show-password />
          </el-form-item>
       </el-form>
       <template #footer>
          <el-button type="primary" @click="handleForceChangePassword" :loading="pwdLoading">{{ t('common.confirm_change') }}</el-button>
       </template>
    </el-dialog>
  </AuthLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage, type FormInstance } from 'element-plus';
import { authService } from '@/services/auth';
import { userService } from '@/services/user';
import { useUserStore } from '@/stores/user';
import AuthLayout from '../layouts/AuthLayout.vue';

const { t } = useI18n();
const router = useRouter();
const userStore = useUserStore();

const formRef = ref<FormInstance>();
const loading = ref(false);

const showForceChangePwd = ref(false);
const pwdLoading = ref(false);
const pwdFormRef = ref<FormInstance>();
const pwdForm = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' });

const form = reactive({
  username: '',
  password: '',
});

const rules = reactive({
  username: [{ required: true, message: t('common.input_username'), trigger: 'blur' }],
  password: [{ required: true, message: t('common.input_password'), trigger: 'blur' }],
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

const handleLogin = async () => {
  if (!formRef.value) return;
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true;
      try {
        const res = await authService.login(form);
        userStore.login(res.data);
        
        if (res.data.user.mustChangePassword) {
           showForceChangePwd.value = true;
           pwdForm.currentPassword = form.password; // pre-fill current password
           return;
        }

        ElMessage.success(t('auth.login_success'));
        const role = res.data.user.role;
        if (role === 'admin') router.push('/admin');
        else if (role === 'teacher') router.push('/teacher');
        else router.push('/student');
      } catch (error: any) {
        console.error(error);
        const msg = error.response?.data?.message || t('auth.login_failed');
        ElMessage.error(msg);
      } finally {
        loading.value = false;
      }
    }
  });
};

const handleForceChangePassword = async () => {
  if (!pwdFormRef.value) return;
  await pwdFormRef.value.validate(async (valid) => {
     if (valid) {
        pwdLoading.value = true;
        try {
           await userService.updatePassword({
              currentPassword: pwdForm.currentPassword,
              newPassword: pwdForm.newPassword
           });
           ElMessage.success(t('auth.password_updated'));
           showForceChangePwd.value = false;
           // Proceed to login redirect
           const role = userStore.userInfo?.role;
           if (role === 'admin') router.push('/admin');
           else if (role === 'teacher') router.push('/teacher');
           else router.push('/student');
        } catch (e: any) {
           const msg = e.response?.data?.error?.message || t('auth.password_change_failed');
           ElMessage.error(msg);
        } finally {
           pwdLoading.value = false;
        }
     }
  });
};
</script>

<style scoped>
.w-full {
  width: 100%;
}
</style>
