import { createI18n } from 'vue-i18n';

// 动态导入所有语言文件
const modules = import.meta.glob('./locales/*.ts', { eager: true });
const messages: Record<string, any> = {};

export const availableLanguages: Array<{ code: string; name: string }> = [];

// 1. 遍历所有导入的模块
for (const path in modules) {
  // 提取文件名作为语言代码 (例如：zh)
  const code = path.match(/([a-z]{2})\.ts$/i)?.[1];
  
  // 提取实际内容 (默认导入的模块在 default 属性下)
  const module = (modules as any)[path].default;
  
  if (code && module) {
    messages[code] = module;
    
    // 2. 🚀 从文件内读取元数据，而不是硬编码
    const metadata = module._metadata;
    if (metadata) {
      availableLanguages.push({
        code: metadata.code,
        name: metadata.name
      });
    }
    // 移除元数据，保持消息对象干净
    delete module._metadata;
  }
}

// 3. 设置初始语言
const savedLang = localStorage.getItem('language');
const defaultLang = availableLanguages[0]?.code ?? 'zh';
const initialLang = savedLang && availableLanguages.some(l => l.code === savedLang) ? savedLang : defaultLang;

// 4. 创建 i18n 实例
const i18n = createI18n({
  locale: initialLang, 
  fallbackLocale: defaultLang,
  messages,
  globalInjection: true,
  legacy: false
});

export const i18nGlobal = i18n.global; 
export default i18n;