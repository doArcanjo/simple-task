import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

// Dev: vite serves web/ on :5180 and proxies the API on :3200.
// Build: output lands in dist/, which the Express server serves (one origin, no CORS).
export default defineConfig({
  root: 'web',
  plugins: [vue()],
  resolve: {
    alias: { shared: fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  server: {
    port: 5180,
    proxy: {
      '/api': 'http://localhost:3200',
      '/auth': 'http://localhost:3200',
      '/health': 'http://localhost:3200',
    },
  },
  build: { outDir: '../dist', emptyOutDir: true },
});
