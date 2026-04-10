import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Port khi chạy: npm run dev
  server: {
    port: 6262,
    strictPort: false,
    // Chỉ áp dụng cho dev server (npm run dev)
    cors: {
      origin: '*',
    },
  },
})
