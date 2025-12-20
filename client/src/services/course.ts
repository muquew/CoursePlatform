import request from '@/utils/request';
import type { Class } from '@/types';

export const courseService = {
  // List classes (auto-filtered by server based on role)
  getClasses: () => {
    return request.get<Class[]>('/classes');
  },

  createClass: (data: { courseName: string; term: string; ownerTeacherId?: number }) => {
    return request.post<Class>('/classes', data);
  },

  getClassById: (id: number) => {
    return request.get<Class>(`/classes/${id}`);
  },

  // Student only: get enrolled classes
  getMyClasses: () => {
    return request.get<Class[]>('/me/classes');
  },

  setActiveClass: (classId: number) => {
    return request.put<{ ok: boolean; activeClassId: number }>('/me/classes/active', { classId });
  },
  
  clearActiveClass: () => {
      return request.delete<{ ok: boolean }>('/me/classes/active');
  },

  getTeachers: (classId: number) => {
    return request.get<any[]>(`/classes/${classId}/teachers`);
  },

  getStudents: (classId: number) => {
    return request.get<any[]>(`/classes/${classId}/students`);
  },

  addStudent: (classId: number, data: { studentNo: string; realName: string }) => {
    return request.post<{ ok: boolean; studentId: number }>(`/classes/${classId}/students`, data);
  },

  importStudents: (classId: number, students: Array<{ studentNo: string; realName: string }>, defaultPassword?: string) => {
    return request.post<{ ok: boolean; count: number }>(`/classes/${classId}/students/import`, { students, defaultPassword });
  },

  removeStudent: (classId: number, studentId: number) => {
    return request.delete<{ ok: boolean }>(`/classes/${classId}/students/${studentId}`);
  },

  updateClass: (classId: number, data: { courseName?: string; term?: string }) => {
    return request.patch<Class>(`/classes/${classId}`, data);
  },

  updateClassStatus: (classId: number, status: 'active' | 'archived') => {
    return request.patch<Class>(`/classes/${classId}/status`, { status });
  },

  updateSettings: (classId: number, data: { allowStudentDownloadAfterArchived?: boolean; config?: any }) => {
    return request.patch<Class>(`/classes/${classId}/settings`, data);
  },

  addTeacher: (classId: number, data: { teacherId: number; role?: 'owner' | 'teacher' | 'assistant' }) => {
    return request.post<{ ok: boolean }>(`/classes/${classId}/teachers`, data);
  },

  removeTeacher: (classId: number, teacherId: number) => {
    return request.delete<{ ok: boolean }>(`/classes/${classId}/teachers/${teacherId}`);
  },

  uploadFile: (classId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request.post<any[]>(`/classes/${classId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};
