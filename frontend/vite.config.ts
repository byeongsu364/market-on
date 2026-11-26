import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({ plugins: [react()], test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], }, server: { proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, '') } } },
  // 배포 빌드 미리보기(vite preview)를 Cloudflare 임시 터널로 공개할 때: 같은 /api 프록시 + 터널 도메인만 허용
  preview: { allowedHosts: ['.trycloudflare.com'], proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, '') } } } })
