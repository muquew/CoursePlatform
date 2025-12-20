import request from '@/utils/request';
import type { Case } from '@/types';

export const caseService = {
  getCases: (classId: number) => {
    return request.get<Case[]>(`/classes/${classId}/cases`);
  },

  getCaseById: (id: number) => {
    return request.get<Case>(`/cases/${id}`);
  },

  createCase: (classId: number, data: Partial<Case>) => {
    return request.post<Case>(`/classes/${classId}/cases`, data);
  },

  updateCase: (id: number, data: Partial<Case>) => {
    return request.patch<Case>(`/cases/${id}`, data);
  },

  deleteCase: (id: number) => {
    return request.delete<{ ok: boolean }>(`/cases/${id}`);
  }
};
