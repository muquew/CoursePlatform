import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@s': fileURLToPath(new URL('./src/stores', import.meta.url)),
      '@v': fileURLToPath(new URL('./src/views', import.meta.url)),
      '@c': fileURLToPath(new URL('./src/components', import.meta.url))
    }
  }
})
