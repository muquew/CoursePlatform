import request from '@/utils/request';
import type { Team, TeamJoinRequest } from '@/types';

export const teamService = {
  getTeams: (classId: number) => {
    return request.get<Team[]>(`/classes/${classId}/teams`);
  },

  createTeam: (classId: number, data: { name: string; description?: string }) => {
    return request.post<Team>(`/classes/${classId}/teams`, data);
  },

  getTeamById: (teamId: number) => {
    return request.get<Team>(`/teams/${teamId}`);
  },

  createJoinRequest: (teamId: number) => {
    return request.post<TeamJoinRequest>(`/teams/${teamId}/join-requests`);
  },

  getJoinRequests: (teamId: number) => {
    return request.get<TeamJoinRequest[]>(`/teams/${teamId}/join-requests`);
  },

  respondToJoinRequest: (teamId: number, requestId: number, data: { decision: 'approved' | 'rejected'; reason?: string }) => {
    return request.patch<{ ok: boolean }>(`/teams/${teamId}/join-requests/${requestId}`, data);
  },

  leaveTeam: (teamId: number) => {
    return request.post<{ ok: boolean }>(`/teams/${teamId}/leave`);
  },
  
  removeMember: (teamId: number, userId: number) => {
      return request.delete<{ ok: boolean }>(`/teams/${teamId}/members/${userId}`);
  },

  deleteTeam: (teamId: number) => {
    return request.delete<{ ok: boolean }>(`/teams/${teamId}`);
  },

  // Teacher Methods
  getUnassignedStudents: (classId: number) => {
    return request.get<any[]>(`/classes/${classId}/students/unassigned`);
  },

  assignStudent: (classId: number, data: { studentId: number; teamId?: number; teamName?: string }) => {
    return request.post<{ ok: boolean; teamId: number; created: boolean }>(`/classes/${classId}/teams/assign`, data);
  },

  forceLeader: (teamId: number, data: { toUserId: number; reason?: string }) => {
    return request.post<Team>(`/teams/${teamId}/leader-force`, data);
  },

  transferLeader: (teamId: number, toUserId: number) => {
    return request.post<Team>(`/teams/${teamId}/leader-transfer`, { toUserId });
  }
};
