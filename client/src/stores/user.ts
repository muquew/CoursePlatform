import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { User } from '@/types'

// 定义一个叫 'user' 的仓库
export const useUserStore = defineStore('user', () => {
  
  // --- 1. State (状态/数据) ---
  // 这就是那个“钱包”，用来存 token 和用户信息
  // 关键点：初始化时，它会尝试去 localStorage (浏览器硬盘) 里找，
  // 这样即使你按 F5 刷新网页，登录状态也不会丢！
  const token = ref<string>(localStorage.getItem('token') || '')

  const userInfo = ref<User | null>(null)
  try {
    const storedUser = localStorage.getItem('userInfo')
    if (storedUser) {
      userInfo.value = JSON.parse(storedUser) as User
    }
  } catch (e) {
    console.error('用户信息解析失败，可能是数据损坏', e)
    localStorage.removeItem('userInfo') // 出错就删掉，防止无限白屏
    localStorage.removeItem('token')
  }

  // --- 2. Actions (动作/方法) ---
  // 这是“存钱”的方法。登录成功后调用它。
  function login(payload: { token: string; user: User }) {
    token.value = payload.token
    localStorage.setItem('token', payload.token)

    userInfo.value = payload.user
    localStorage.setItem('userInfo', JSON.stringify(payload.user))
  }

  function setUserInfo(info: User) {
    userInfo.value = info
    localStorage.setItem('userInfo', JSON.stringify(info))
  }
  // 这是“把钱扔掉”的方法。点击退出登录时调用。
  // 3. Action: 登出 (把钱包倒空)
  function logout() {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
  } 


  return { token, userInfo, login, setUserInfo, logout }
})