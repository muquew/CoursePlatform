import request from '@/utils/request';

export const adminService = {
  getAuditLogs: (params?: any) => {
    return request.get<any[]>('/admin/audit-logs', { params });
  },

  createUser: (data: { username: string; password?: string; role: 'admin' | 'teacher'; profile?: any }) => {
    return request.post<any>('/admin/users', data);
  },

  changeUserRole: (userId: number, role: 'admin' | 'teacher' | 'student') => {
    return request.patch<{ ok: boolean }>(`/admin/users/${userId}/role`, { role });
  },

  getAbacRules: () => {
    return request.get<any[]>('/admin/abac/rules');
  },

  toggleAbacRule: (key: string, enabled: boolean) => {
    return request.patch<{ ok: boolean }>(`/admin/abac/rules/${key}`, { enabled });
  },

  getErrorLogs: () => {
    return request.get<any[]>('/admin/errors');
  },

  triggerFix: (type: 'enrollment' | 'project', id?: number) => {
    if (type === 'enrollment') return request.post<{ ok: boolean }>('/admin/fixes/enrollment');
    return request.post<{ ok: boolean }>(`/admin/fixes/project/${id}`);
  },

  getRoleMatrix: () => {
    return request.get<{ note: string; roles: string[]; resources: string[] }>('/admin/roles/matrix');
  }
};
