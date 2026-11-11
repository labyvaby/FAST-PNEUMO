import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // две страницы: стенд (React) и 3D-презентация проекта
      input: {
        main: resolve(__dirname, 'index.html'),
        presentation: resolve(__dirname, 'presentation/index.html'),
      },
    },
  },
})
