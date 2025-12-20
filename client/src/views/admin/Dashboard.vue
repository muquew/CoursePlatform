<template>
  <div>
    <h2 class="mb-4">{{ t('nav.dashboard') }}</h2>
    
    <el-tabs v-model="activeTab" @tab-click="handleTabClick">
      <!-- Audit Logs -->
      <el-tab-pane :label="t('admin.audit_logs')" name="audit">
        <el-table :data="auditLogs" v-loading="loadingAudit" style="width: 100%">
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column prop="action" :label="t('admin.action')" />
          <el-table-column :label="t('admin.resource')">
            <template #default="scope">
              {{ scope.row.targetTable }} : {{ scope.row.targetId }}
            </template>
          </el-table-column>
          <el-table-column prop="actorId" :label="t('user.id')" width="80" />
          <el-table-column prop="ip" :label="t('admin.ip')" />
          <el-table-column prop="createdAt" :label="t('admin.time')">
            <template #default="scope">
              {{ new Date(scope.row.createdAt).toLocaleString() }}
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.details')" type="expand">
            <template #default="props">
              <div class="audit-details">
                <p v-if="props.row.userAgent"><strong>{{ t('admin.user_agent') }}:</strong> {{ props.row.userAgent }}</p>
                <div class="audit-context mb-2" v-if="props.row.classId || props.row.teamId || props.row.projectId">
                   <strong>{{ t('admin.context') }}:</strong>
                   <span v-if="props.row.classId" class="mr-2">{{ t('admin.class_id') }} {{ props.row.classId }}</span>
                   <span v-if="props.row.teamId" class="mr-2">{{ t('admin.team_id') }} {{ props.row.teamId }}</span>
                   <span v-if="props.row.projectId">{{ t('admin.project_id') }} {{ props.row.projectId }}</span>
                </div>
                
                <div class="mt-2" v-if="props.row.before || props.row.after">
                    <JsonDiff :before="props.row.before" :after="props.row.after" />
                 </div>

              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Error Logs -->
      <el-tab-pane :label="t('admin.error_logs')" name="errors">
        <el-table :data="errorLogs" v-loading="loadingErrors" style="width: 100%">
          <el-table-column prop="createdAt" :label="t('admin.time')" width="180">
            <template #default="scope">
              {{ new Date(scope.row.createdAt).toLocaleString() }}
            </template>
          </el-table-column>
          <el-table-column prop="path" :label="t('admin.path')" width="150" />
          <el-table-column prop="method" :label="t('admin.method')" width="100" />
          <el-table-column prop="message" :label="t('admin.message')" />
          <el-table-column :label="t('admin.stack')" type="expand">
             <template #default="props">
               <pre class="text-xs">{{ props.row.stack }}</pre>
             </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- ABAC Rules -->
      <el-tab-pane :label="t('admin.abac_rules')" name="abac">
        <el-alert :title="t('admin.abac_note')" type="info" show-icon class="mb-4" />
        <el-table :data="abacRules" v-loading="loadingAbac" style="width: 100%">
           <el-table-column prop="key" :label="t('admin.rule_key')" />
           <el-table-column prop="description" :label="t('assignment.description')" />
           <el-table-column :label="t('admin.config')" type="expand">
             <template #default="scope">
               <pre class="text-xs">{{ JSON.stringify(scope.row.config, null, 2) }}</pre>
             </template>
           </el-table-column>
           <el-table-column :label="t('admin.status')">
             <template #default="scope">
                <el-switch v-model="scope.row.enabled" @change="toggleRule(scope.row)" />
             </template>
           </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- System Info -->
      <el-tab-pane :label="t('admin.system_info')" name="info">
        <el-alert :title="t('admin.rbac_desc')" type="info" class="mb-4" />
        <div v-if="roleMatrix">
           <h3>{{ t('admin.role_matrix') }}</h3>
           <p class="text-xs text-gray-500 mb-2">{{ t('admin.rbac_note') }}</p>
           <el-table :data="matrixData" border style="width: 100%">
              <el-table-column prop="resource" :label="t('admin.resource')" />
              <el-table-column v-for="role in roleMatrix.roles" :key="role" :prop="role" :label="role">
                 <template #default>
                    <el-icon class="text-green-500"><Check /></el-icon>
                 </template>
              </el-table-column>
           </el-table>
        </div>
      </el-tab-pane>

      <!-- Maintenance -->
      <el-tab-pane :label="t('admin.maintenance')" name="maintenance">
         <el-card class="mb-4">
           <template #header>{{ t('admin.data_consistency') }}</template>
           <div class="flex items-center gap-4">
              <span>{{ t('admin.fix_enrollment_desc') }}</span>
              <el-button type="warning" @click="handleFix('enrollment')">{{ t('admin.run_fix') }}</el-button>
           </div>
         </el-card>

         <el-card>
           <template #header>{{ t('admin.project_state') }}</template>
           <div class="flex items-center gap-4">
              <el-input v-model="fixProjectId" :placeholder="t('admin.project_id_placeholder')" style="width: 200px" />
              <el-button type="warning" @click="handleFix('project')">{{ t('admin.fix_project_status') }}</el-button>
           </div>
         </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Check } from '@element-plus/icons-vue';
import { adminService } from '@/services/admin';
import JsonDiff from '@c/JsonDiff.vue';

const { t } = useI18n();
const activeTab = ref('audit');

const auditLogs = ref<any[]>([]);
const loadingAudit = ref(false);

const errorLogs = ref<any[]>([]);
const loadingErrors = ref(false);

const abacRules = ref<any[]>([]);
const loadingAbac = ref(false);

const roleMatrix = ref<{ note: string; roles: string[]; resources: string[] } | null>(null);

const fixProjectId = ref('');

const fetchAuditLogs = async () => {
  loadingAudit.value = true;
  try {
    const res = await adminService.getAuditLogs();
    auditLogs.value = res.data;
  } catch (e) { console.error(e); }
  finally { loadingAudit.value = false; }
};

const fetchErrorLogs = async () => {
  loadingErrors.value = true;
  try {
    const res = await adminService.getErrorLogs();
    errorLogs.value = res.data;
  } catch (e) { console.error(e); }
  finally { loadingErrors.value = false; }
};

const fetchAbacRules = async () => {
  loadingAbac.value = true;
  try {
    const res = await adminService.getAbacRules();
    abacRules.value = res.data;
  } catch (e) { console.error(e); }
  finally { loadingAbac.value = false; }
};

const fetchRoleMatrix = async () => {
  try {
    const res = await adminService.getRoleMatrix();
    roleMatrix.value = res.data;
  } catch (e) { console.error(e); }
};

const matrixData = computed(() => {
  if (!roleMatrix.value) return [];
  return roleMatrix.value.resources.map(r => ({ resource: r }));
});

const toggleRule = async (rule: any) => {
  try {
    await adminService.toggleAbacRule(rule.key, rule.enabled);
    ElMessage.success(t('admin.rule_updated'));
  } catch (e) { 
    rule.enabled = !rule.enabled; // revert
    console.error(e); 
  }
};

const handleFix = async (type: 'enrollment' | 'project') => {
  try {
    if (type === 'project' && !fixProjectId.value) {
      ElMessage.warning(t('admin.enter_project_id'));
      return;
    }
    await ElMessageBox.confirm(t('admin.confirm_fix', { type }), t('common.confirm'), { type: 'warning' });
    await adminService.triggerFix(type, type === 'project' ? Number(fixProjectId.value) : undefined);
    ElMessage.success(t('admin.fix_triggered'));
  } catch (e) {
    if (e !== 'cancel') console.error(e);
  }
};

const handleTabClick = (tab: any) => {
  if (tab.paneName === 'audit') fetchAuditLogs();
  if (tab.paneName === 'errors') fetchErrorLogs();
  if (tab.paneName === 'abac') fetchAbacRules();
  if (tab.paneName === 'info') fetchRoleMatrix();
};

onMounted(() => {
  fetchAuditLogs();
});
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.mb-2 { margin-bottom: 8px; }
.mr-2 { margin-right: 8px; }
.text-xs { font-size: 12px; }
.flex { display: flex; }
.items-center { align-items: center; }
.gap-4 { gap: 16px; }
pre { white-space: pre-wrap; word-wrap: break-word; background: #f5f7fa; padding: 10px; border-radius: 4px; margin: 0; }
</style>
