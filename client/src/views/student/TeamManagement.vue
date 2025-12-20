<template>
  <div v-loading="loading">
    <div class="mb-4">
      <h2>{{ t('team.title') }}</h2>
    </div>

    <!-- 1. Not enrolled in a class -->
    <el-empty v-if="!activeClassId" :description="t('course.enter')">
      <el-button type="primary" @click="$router.push('/student/courses')">
        {{ t('course.my_courses') }}
      </el-button>
    </el-empty>

    <!-- 2. My Team -->
    <div v-else-if="myTeam">
      <el-card class="mb-4">
        <template #header>
          <div class="card-header">
            <h3>{{ myTeam.name }}</h3>
            <el-tag :type="myTeam.status === 'locked' ? 'danger' : 'success'">{{ t('team.status_' + myTeam.status) }}</el-tag>
          </div>
        </template>
        <p>{{ myTeam.description }}</p>
        
        <h4 class="mt-4">{{ t('team.members') }}</h4>
        <el-table :data="myTeam.members || []" style="width: 100%">
          <el-table-column prop="realName" :label="t('user.real_name')" />
          <el-table-column prop="userId" :label="t('user.id')" width="80" />
          <el-table-column label="Role">
            <template #default="scope">
              <el-tag v-if="scope.row.userId === myTeam.leaderId">{{ t('team.leader') }}</el-tag>
              <span v-else>{{ t('team.member') }}</span>
            </template>
          </el-table-column>
          <el-table-column v-if="isLeader && myTeam.status !== 'locked'" :label="t('common.actions')" width="100">
            <template #default="scope">
              <el-button 
                v-if="scope.row.userId !== myTeam.leaderId"
                type="danger" 
                size="small" 
                @click="removeMember(scope.row.userId)"
              >
                {{ t('common.delete') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="mt-4 flex gap-2">
          <el-button v-if="!isLeader" type="danger" @click="leaveTeam">{{ t('team.leave') }}</el-button>
          <el-button v-else type="warning" @click="showTransferDialog = true">{{ t('team.transfer_leader') }}</el-button>
        </div>
      </el-card>

      <!-- Leader: Join Requests -->
      <el-card v-if="isLeader && joinRequests.length > 0" class="mt-4">
        <template #header>
          <div class="card-header">
            <h3>{{ t('team.requests') }}</h3>
          </div>
        </template>
        <el-table :data="joinRequests" style="width: 100%">
          <el-table-column prop="realName" :label="t('user.real_name')" />
          <el-table-column prop="createdAt" :label="t('common.date')" />
          <el-table-column :label="t('common.actions')">
            <template #default="scope">
              <el-button type="success" size="small" @click="handleRequest(scope.row.id, 'approved')">
                {{ t('team.approve') }}
              </el-button>
              <el-button type="danger" size="small" @click="handleRequest(scope.row.id, 'rejected')">
                {{ t('team.reject') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <!-- 3. No Team: List all teams -->
    <div v-else>
      <div class="mb-4 flex justify-between">
        <h3>{{ t('team.not_in_team') }}</h3>
        <el-button type="primary" @click="showCreateDialog = true">{{ t('team.create') }}</el-button>
      </div>

      <el-table :data="teams" style="width: 100%">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" :label="t('team.name')" />
        <el-table-column prop="description" :label="t('team.description')" />
        <el-table-column prop="memberCount" :label="t('team.members')" />
        <el-table-column :label="t('common.actions')">
          <template #default="scope">
            <el-button 
              v-if="scope.row.status === 'recruiting'"
              type="primary" 
              size="small" 
              @click="joinTeam(scope.row.id)"
            >
              {{ t('team.join') }}
            </el-button>
            <el-tag v-else type="info">{{ t('team.locked') }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- Create Team Dialog -->
    <el-dialog v-model="showCreateDialog" :title="t('team.create')">
      <el-form :model="createForm" label-width="100px">
        <el-form-item :label="t('team.name')">
          <el-input v-model="createForm.name" />
        </el-form-item>
        <el-form-item :label="t('team.description')">
          <el-input v-model="createForm.description" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="createTeam" :loading="submitting">
            {{ t('common.confirm') }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- Transfer Leader Dialog -->
    <el-dialog v-model="showTransferDialog" :title="t('team.transfer_leader')">
      <el-form :model="transferForm" label-width="120px">
        <el-form-item :label="t('team.new_leader')" required>
           <el-select v-model="transferForm.toUserId" :placeholder="t('team.select_member')">
              <el-option 
                v-for="m in memberCandidates" 
                :key="m.userId" 
                :label="m.realName" 
                :value="m.userId" 
              />
           </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showTransferDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="transferLeader" :loading="submitting">
            {{ t('common.confirm') }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useUserStore } from '@/stores/user';
import { teamService } from '@/services/team';
import type { Team, TeamJoinRequest } from '@/types';

const { t } = useI18n();
const userStore = useUserStore();

const loading = ref(false);
const submitting = ref(false);
const showCreateDialog = ref(false);
const showTransferDialog = ref(false);
const activeClassId = computed(() => userStore.userInfo?.settings?.activeClassId);
const userId = computed(() => userStore.userInfo?.id);

const teams = ref<Team[]>([]);
const myTeam = ref<Team | null>(null);
const joinRequests = ref<TeamJoinRequest[]>([]);

const createForm = ref({ name: '', description: '' });
const transferForm = ref({ toUserId: undefined as number | undefined });

const isLeader = computed(() => myTeam.value?.leaderId === userId.value);

const memberCandidates = computed(() => {
  if (!myTeam.value?.members) return [];
  return myTeam.value.members.filter(m => m.userId !== userId.value);
});

const fetchData = async () => {
  if (!activeClassId.value) return;
  
  loading.value = true;
  try {
    const res = await teamService.getTeams(activeClassId.value);
    const allTeams = res.data;
    
    // Check if I am in a team
    const found = allTeams.find(t => t.members?.some(m => m.userId === userId.value));
    
    if (found) {
      // Fetch full details for my team
      const detailRes = await teamService.getTeamById(found.id);
      myTeam.value = detailRes.data;
      teams.value = []; // Don't need list if I have a team
      
      if (isLeader.value) {
        const reqRes = await teamService.getJoinRequests(found.id);
        joinRequests.value = reqRes.data.filter(r => r.status === 'pending');
      }
    } else {
      myTeam.value = null;
      teams.value = allTeams;
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const createTeam = async () => {
  if (!activeClassId.value) return;
  submitting.value = true;
  try {
    await teamService.createTeam(activeClassId.value, createForm.value);
    ElMessage.success(t('team.create_success'));
    showCreateDialog.value = false;
    createForm.value = { name: '', description: '' };
    await fetchData();
  } catch (e) {
    ElMessage.error(t('common.error'));
  } finally {
    submitting.value = false;
  }
};

const joinTeam = async (teamId: number) => {
  try {
    await teamService.createJoinRequest(teamId);
    ElMessage.success(t('team.join_sent'));
  } catch (e) {
    ElMessage.error(t('common.error'));
  }
};

const leaveTeam = async () => {
  if (!myTeam.value) return;
  try {
    await ElMessageBox.confirm(t('team.leave_confirm'), t('common.warning'), { type: 'warning' });
    await teamService.leaveTeam(myTeam.value.id);
    await fetchData();
  } catch (e) {
    // cancelled
  }
};

const removeMember = async (targetId: number) => {
  if (!myTeam.value) return;
  try {
    await ElMessageBox.confirm(t('team.remove_member_confirm'), t('common.warning'), { type: 'warning' });
    await teamService.removeMember(myTeam.value.id, targetId);
    await fetchData();
  } catch (e) {
    // cancelled
  }
};

const handleRequest = async (requestId: number, decision: 'approved' | 'rejected') => {
  if (!myTeam.value) return;
  try {
    await teamService.respondToJoinRequest(myTeam.value.id, requestId, { decision });
    ElMessage.success(t('common.success'));
    await fetchData();
  } catch (e) {
    ElMessage.error(t('common.error'));
  }
};

const transferLeader = async () => {
  if (!myTeam.value || !transferForm.value.toUserId) return;
  submitting.value = true;
  try {
    await teamService.transferLeader(myTeam.value.id, transferForm.value.toUserId);
    ElMessage.success(t('team.leader_changed'));
    showTransferDialog.value = false;
    await fetchData();
  } catch (e) {
    ElMessage.error(t('common.error'));
  } finally {
    submitting.value = false;
  }
};

onMounted(fetchData);
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.mt-4 { margin-top: 16px; }
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.flex { display: flex; }
.justify-between { justify-content: space-between; }
.gap-2 { gap: 8px; }
</style>
