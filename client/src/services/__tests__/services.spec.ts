import { describe, it, expect, vi, beforeEach } from 'vitest';
import { courseService } from '../course';
import { projectService } from '../project';
import { teamService } from '../team';
import { authService } from '../auth';
import request from '@/utils/request';

// Mock the axios request
vi.mock('@/utils/request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('Client Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Course Service', () => {
    it('should fetch classes', async () => {
      const mockClasses = [{ id: 1, courseName: 'Test Course' }];
      (request.get as any).mockResolvedValue({ data: mockClasses });

      const res = await courseService.getClasses();
      expect(request.get).toHaveBeenCalledWith('/classes');
      expect(res.data).toEqual(mockClasses);
    });

    it('should upload file with FormData', async () => {
      const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      (request.post as any).mockResolvedValue({ data: [{ id: 1 }] });

      await courseService.uploadFile(1, mockFile);
      
      expect(request.post).toHaveBeenCalledWith(
        '/classes/1/upload',
        expect.any(FormData),
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
    });
  });

  describe('Project Service', () => {
    it('should rollback stage', async () => {
      (request.post as any).mockResolvedValue({ data: { ok: true } });
      
      await projectService.rollbackStage(1, 'proposal');
      expect(request.post).toHaveBeenCalledWith('/projects/1/stages/proposal/rollback');
    });
  });

  describe('Team Service', () => {
    it('should create a team', async () => {
       const payload = { name: 'Dream Team' };
       (request.post as any).mockResolvedValue({ data: { id: 1, name: 'Dream Team' } });
       
       await teamService.createTeam(101, payload);
       expect(request.post).toHaveBeenCalledWith('/classes/101/teams', payload);
    });

    it('should join a team', async () => {
       (request.post as any).mockResolvedValue({ data: { id: 1 } });
       await teamService.createJoinRequest(5);
       expect(request.post).toHaveBeenCalledWith('/teams/5/join-requests');
    });
  });

  describe('Auth Service', () => {
     it('should get current user info', async () => {
        const mockUser = { id: 1, username: 'alice' };
        (request.get as any).mockResolvedValue({ data: mockUser });
        
        await authService.getMe();
        expect(request.get).toHaveBeenCalledWith('/auth/me');
     });
  });
});
