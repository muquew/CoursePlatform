import request from '@/utils/request';
import type { GradeEntry } from '@/types';

export const gradeService = {
  getMyGrades: () => {
    return request.get<GradeEntry[]>('/me/grades');
  },

  submitGrade: (submissionId: number, data: { score: number; feedback?: string }) => {
    return request.put(`/submissions/${submissionId}/grade`, data);
  },
};
