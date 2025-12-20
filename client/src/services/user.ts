import request from '@/utils/request';
import type { User, UserProfile } from '@/types';

export const userService = {
  getUsers: (params?: { q?: string }) => {
    return request.get<User[]>('/users', { params });
  },

  getUserById: (id: number) => {
    return request.get<User>(`/users/${id}`);
  },

  getUserProfile: (id: number) => {
    return request.get<UserProfile>(`/users/${id}/profile`);
  },

  updatePassword: (data: { currentPassword: string; newPassword: string }) => {
    return request.patch<{ ok: boolean }>('/users/me/password', data);
  },
  
  // Teacher only: reset student password
  resetStudentPassword: (classId: number, studentId: number) => {
      return request.post<{ ok: boolean; tempPassword: string }>(`/classes/${classId}/students/${studentId}/password-reset`);
  }
};
