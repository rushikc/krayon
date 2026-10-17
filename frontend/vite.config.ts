import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': { target: env.LOCAL_BACKEND_URL || 'http://localhost:8787', changeOrigin: true, ws: true },
        '/ws': { target: env.LOCAL_BACKEND_URL || 'http://localhost:8787', changeOrigin: true, ws: true },
      },
    },
  }
})
