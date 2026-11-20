import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Server API (npm run dev:server) chạy ở cổng 3001
const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:3001',
    changeOrigin: false,
  },
}

export default defineConfig({
  plugins: [react()],
  // Relative path: deploy ở root hoặc thư mục con đều chạy
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
})
