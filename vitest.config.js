import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Separate from vite.config.js on purpose: that file sets root to web/ for the
// app build, while the tests live in test/ at the repo root.
export default defineConfig({
  resolve: {
    alias: { shared: fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    env: { NODE_ENV: 'test' },
  },
});
