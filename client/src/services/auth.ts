import request from '@/utils/request';
import type { AuthResponse, User } from '@/types';

export const authService = {
  login: (data: { username: string; password: string }) => {
    return request.post<AuthResponse>('/auth/login', data);
  },

  logout: () => {
    return request.post<{ ok: boolean }>('/auth/logout');
  },

  getMe: () => {
    return request.get<User>('/auth/me');
  },

  changePassword: (data: { currentPassword: string; newPassword: string }) => {
    return request.patch<{ ok: boolean }>('/users/me/password', data);
  },
};
