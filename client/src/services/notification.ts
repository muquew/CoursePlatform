import request from '@/utils/request';
import type { Notification } from '@/types';

export const notificationService = {
  getNotifications: () => {
    return request.get<Notification[]>('/me/notifications');
  },

  markAsRead: (id: number) => {
    return request.patch<{ ok: boolean }>(`/me/notifications/${id}`, { readAt: new Date().toISOString() });
  },
};
