import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // LAN 访问
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/photos': 'http://127.0.0.1:8000',
    },
  },
})
