export type Role = 'student' | 'teacher' | 'admin';

export interface UserProfile {
  studentNo?: string;
  teacherNo?: string;
  realName?: string;
  // Add other profile fields as needed
}

export interface User {
  id: number;
  username: string;
  role: Role;
  mustChangePassword?: boolean;
  profile?: UserProfile | null;
  settings?: {
    activeClassId: number | null;
    prefs?: Record<string, unknown>;
  } | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Class {
  id: number;
  name?: string;
  courseName?: string;
  term: string;
  code?: string;
  description?: string;
  config?: any;
  status?: 'active' | 'archived';
  allowStudentDownloadAfterArchived?: boolean;
}

export interface Assignment {
  id: number;
  classId: number;
  stageKey: string;
  type: 'individual' | 'team';
  title: string;
  description?: string;
  deadline: string;
  createdAt?: string;
}

export interface Submission {
  id: number;
  assignmentId: number;
  submitterId: number;
  teamId?: number | null;
  version: number;
  isLate: boolean;
  fileId?: number | null;
  createdAt: string;
  files?: any[];
  grade?: {
    score: number;
    feedback?: string;
    gradedAt: string;
  } | null;
}

export interface TeamMember {
  userId: number;
  realName: string;
  studentNo?: string;
  isActive?: boolean;
}

export interface Team {
  id: number;
  classId: number;
  name: string;
  description?: string;
  leaderId: number;
  status: 'recruiting' | 'locked';
  isLocked: boolean;
  members?: TeamMember[];
  memberCount?: number;
}

export interface TeamJoinRequest {
  id: number;
  studentId: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason?: string;
  createdAt: string;
  realName?: string;
  studentNo?: string;
}

export interface ProjectStage {
  id: number;
  key: string;
  order: number;
  status: 'locked' | 'open' | 'passed';
  openedAt?: string;
  passedAt?: string;
}

export interface Project {
  id: number;
  teamId: number;
  classId: number;
  name: string;
  sourceType: 'case_library' | 'custom';
  caseId?: number;
  background?: string;
  techStack?: string;
  status: 'draft' | 'submitted' | 'active' | 'rejected';
  stages?: ProjectStage[];
  reviewFeedback?: string;
}

export interface PeerReviewWindow {
  id: number;
  classId: number;
  stageKey: string;
  status: 'draft' | 'open' | 'sealed' | 'published';
  openAt?: string;
  closeAt?: string;
}

export interface PeerReview {
  id: number;
  windowId: number;
  reviewerId: number;
  revieweeId: number;
  payload: any;
}

export interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  content: string;
  payload?: any;
  readAt?: string | null;
  createdAt: string;
}

export interface Case {
  id: number;
  classId: number;
  title: string;
  description?: string;
  tags?: string;
  attachmentsJson?: string;
  attachments?: any[];
  createdAt: string;
}

export interface GradeEntry {
  id: number;
  submissionId: number;
  score: number;
  feedback?: string;
  gradedAt: string;
  submission: Submission;
  assignment: Assignment;
}
