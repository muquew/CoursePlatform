import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import i18n from './i18n'

const app = createApp(App)

app.use(createPinia()) // 启用状态管理
app.use(router)        // 启用路由
app.use(ElementPlus)
app.use(i18n)

app.mount('#app')