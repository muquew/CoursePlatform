import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user' // 1. 引入 Store
import { i18nGlobal } from '@/i18n'

const request = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:3000/api/v1',
  timeout: 10000
})

// -----------------------------------------------------------
// 🌟 请求拦截器：每次发请求前，自动把 Token 塞进 Header
// -----------------------------------------------------------
request.interceptors.request.use(
  (config) => {
    const userStore = useUserStore()
    
    // 只要钱包里有 Token，就自动贴在请求头上带过去
    if (userStore.token) {
      // 格式通常是: Bearer <token>
      config.headers.Authorization = `Bearer ${userStore.token}`
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 (保持不变，或者处理 401 Token 过期)
request.interceptors.response.use(
  (response) => response,
  (error) => {
    
    // 如果后端返回 401 (未授权/Token过期)，自动踢回登录页
    if (!error.config?.url?.includes('/auth/login') && error.response?.status === 401) {
      ElMessage.error(i18nGlobal.t('auth.login_expired'))
      const userStore = useUserStore()
      userStore.logout()  // 扔掉旧门票
      window.location.href = '/login'
    }
    
    return Promise.reject(error)
  }
)

export default request