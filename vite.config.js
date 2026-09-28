import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: { input: { app: 'index.html', legal: 'legal.html' } },
  },
  esbuild: {
    target: 'es2020',
  }
})
