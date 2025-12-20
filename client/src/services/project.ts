import request from '@/utils/request';
import type { Project, PeerReview } from '@/types';

export const projectService = {
  createProject: (teamId: number, data: Partial<Project>) => {
    return request.post<Project>(`/teams/${teamId}/projects`, data);
  },

  getProjects: (classId: number, params?: { status?: string; teamId?: number }) => {
    return request.get<Project[]>(`/classes/${classId}/projects`, { params });
  },

  getProjectById: (projectId: number) => {
    return request.get<Project>(`/projects/${projectId}`);
  },

  updateProject: (projectId: number, data: Partial<Project>) => {
    return request.patch<Project>(`/projects/${projectId}`, data);
  },

  submitProject: (projectId: number) => {
    return request.post<Project>(`/projects/${projectId}/submit`);
  },

  // Peer Reviews
  submitPeerReview: (projectId: number, data: { revieweeId: number; payload: any }) => {
    return request.post<PeerReview>(`/projects/${projectId}/peer-reviews`, data);
  },

  getPeerReviews: (projectId: number) => {
    return request.get<PeerReview[]>(`/projects/${projectId}/peer-reviews`);
  },

  updateStageStatus: (projectId: number, stageKey: string, status: 'locked' | 'open' | 'passed') => {
    return request.patch<{ ok: boolean }>(`/projects/${projectId}/stages/${stageKey}`, { status });
  },

  // Teacher Review Windows
  getReviewWindows: (classId: number) => {
    return request.get<any[]>(`/classes/${classId}/peer-review-windows`);
  },

  openReviewWindow: (classId: number, data: { stageKey: string; startsAt?: string; endsAt?: string }) => {
    return request.post<any>(`/classes/${classId}/peer-review-windows`, data);
  },

  closeReviewWindow: (windowId: number) => {
    return request.post<any>(`/peer-review-windows/${windowId}/close`);
  },

  publishReviewWindow: (windowId: number) => {
    return request.post<any>(`/peer-review-windows/${windowId}/publish`);
  },
  
  submitReviewDecision: (projectId: number, data: { adopt: boolean; forcedCoefficient?: number; reason?: string }) => {
      return request.post<{ ok: boolean }>(`/projects/${projectId}/peer-reviews/decision`, data);
  },

  // Teacher Project Management
  getAllProjects: (classId: number, params?: any) => {
    return request.get<any[]>(`/classes/${classId}/projects`, { params });
  },

  reviewProjectProposal: (projectId: number, data: { decision: 'approved' | 'rejected'; feedback?: string }) => {
    return request.post<any>(`/projects/${projectId}/reviews`, data);
  },

  getProjectStages: (projectId: number) => {
    return request.get<{ stages: any[] }>(`/projects/${projectId}/stages`);
  },

  rollbackStage: (projectId: number, stageKey: string) => {
    return request.post<{ ok: boolean }>(`/projects/${projectId}/stages/${stageKey}/rollback`);
  },

  getProjectGrades: (projectId: number) => {
    return request.get<any[]>(`/projects/${projectId}/grades`);
  }
};
