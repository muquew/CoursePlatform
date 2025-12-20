import request from '@/utils/request';
import type { Assignment, Submission } from '@/types';

export const assignmentService = {
  getAssignments: (classId: number) => {
    return request.get<Assignment[]>(`/classes/${classId}/assignments`);
  },

  getAssignmentById: (id: number) => {
    return request.get<Assignment>(`/assignments/${id}`);
  },

  createAssignment: (classId: number, data: Partial<Assignment>) => {
    return request.post<Assignment>(`/classes/${classId}/assignments`, data);
  },

  updateAssignment: (id: number, data: Partial<Assignment>) => {
    return request.patch<Assignment>(`/assignments/${id}`, data);
  },

  deleteAssignment: (id: number) => {
    return request.delete<{ ok: boolean }>(`/assignments/${id}`);
  },

  // Submissions
  getSubmissions: (assignmentId: number) => {
    return request.get<Submission[]>(`/assignments/${assignmentId}/submissions`);
  },

  getSubmissionById: (id: number) => {
    return request.get<Submission>(`/submissions/${id}`);
  },

  createSubmission: (assignmentId: number, formData: FormData) => {
    return request.post<Submission>(`/assignments/${assignmentId}/submissions`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  getSubmissionVersions: (submissionId: number) => {
    return request.get<Submission[]>(`/submissions/${submissionId}/versions`);
  },
};
