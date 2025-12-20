import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'
import request from '@/utils/request'

type Role = 'student' | 'teacher' | 'admin'

function homeByRole(role?: Role): string {
  if (role === 'teacher') return '/teacher'
  if (role === 'admin') return '/admin'
  return '/student'
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: () => {
      const token = localStorage.getItem('token')
      if (!token) return '/login'
      try {
        const stored = localStorage.getItem('userInfo')
        const u = stored ? (JSON.parse(stored) as { role?: Role } | null) : null
        return homeByRole(u?.role)
      } catch {
        return '/login'
      }
    },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@v/auth/Login.vue'),
    meta: { isPublic: true },
  },

  // Student
  {
    path: '/student',
    component: () => import('@v/layouts/StudentLayout.vue'),
    children: [
      {
        path: '',
        name: 'student-dashboard',
        component: () => import('@v/student/Dashboard.vue'),
      },
      {
        path: 'courses',
        name: 'student-courses',
        component: () => import('@v/student/CourseList.vue'),
      },
      {
        path: 'assignments',
        name: 'student-assignments',
        component: () => import('@v/student/AssignmentList.vue'),
      },
      {
        path: 'assignments/:id',
        name: 'student-assignment-detail',
        component: () => import('@v/student/AssignmentDetail.vue'),
      },
      {
        path: 'teams',
        name: 'student-teams',
        component: () => import('@v/student/TeamManagement.vue'),
      },
      {
        path: 'projects',
        name: 'student-projects',
        component: () => import('@v/student/ProjectWorkspace.vue'),
      },
      {
        path: 'peer-reviews',
        name: 'student-peer-reviews',
        component: () => import('@v/student/PeerReview.vue'),
      },
      {
        path: 'profile',
        name: 'student-profile',
        component: () => import('@v/common/Profile.vue'),
      },
      {
        path: 'grades',
        name: 'student-grades',
        component: () => import('@v/student/Gradebook.vue'),
      },
      {
        path: 'cases',
        name: 'student-cases',
        component: () => import('@v/student/CaseLibrary.vue'),
      },
    ],
  },

  // Teacher
  {
    path: '/teacher',
    component: () => import('@v/layouts/TeacherLayout.vue'),
    children: [
      {
        path: '',
        name: 'teacher-dashboard',
        component: () => import('@v/teacher/Dashboard.vue'),
      },
      {
        path: 'courses',
        name: 'teacher-courses',
        component: () => import('@v/teacher/CourseManagement.vue'),
      },
      {
        path: 'courses/:id',
        name: 'teacher-course-detail',
        component: () => import('@v/teacher/CourseDetail.vue'),
      },
      {
        path: 'assignments/:id/submissions',
        name: 'teacher-assignment-submissions',
        component: () => import('@v/teacher/AssignmentSubmissions.vue'),
      },
      {
        path: 'profile',
        name: 'teacher-profile',
        component: () => import('@v/common/Profile.vue'),
      },
    ],
  },

  // Admin
  {
    path: '/admin',
    component: () => import('@v/layouts/AdminLayout.vue'),
    children: [
      {
        path: '',
        name: 'admin-dashboard',
        component: () => import('@v/admin/Dashboard.vue'),
      },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('@v/admin/UserManagement.vue'),
      },
      {
        path: 'courses',
        name: 'admin-courses',
        component: () => import('@v/admin/CourseManagement.vue'),
      },
      {
        path: 'courses/:id',
        name: 'admin-course-detail',
        component: () => import('@v/teacher/CourseDetail.vue'),
      },
      {
        path: 'assignments/:id/submissions',
        name: 'admin-assignment-submissions',
        component: () => import('@v/teacher/AssignmentSubmissions.vue'),
      },
      {
        path: 'profile',
        name: 'admin-profile',
        component: () => import('@v/common/Profile.vue'),
      },
    ],
  },

  {
    path: '/:pathMatch(.*)*',
    name: 'notfound',
    component: () => import('@v/common/NotFound.vue'),
    meta: { isPublic: true },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to) => {
  const token = localStorage.getItem('token')
  if (to.meta?.isPublic) {
    // If already logged in and visiting /login, send to home.
    if (token && to.path === '/login') {
      const store = useUserStore()
      return homeByRole(store.userInfo?.role)
    }
    return true
  }

  if (!token) return '/login'

  // Ensure we have the latest /auth/me after refresh.
  const store = useUserStore()
  if (!store.userInfo) {
    try {
      const res = await request.get('/auth/me')
      store.setUserInfo(res.data)
    } catch {
      store.logout()
      return '/login'
    }
  }

  // Basic role guard: prevent teacher/admin accidentally entering student area and vice versa.
  const role = store.userInfo?.role as Role | undefined
  if (to.path.startsWith('/teacher') && role !== 'teacher' && role !== 'admin') return homeByRole(role)
  if (to.path.startsWith('/student') && role !== 'student' && role !== 'admin') return homeByRole(role)
  if (to.path.startsWith('/admin') && role !== 'admin') return homeByRole(role)

  return true
})

export default router
