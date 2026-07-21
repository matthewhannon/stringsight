import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The browser evaluation dynamically imports the model surface. Pre-bundle its bare TensorFlow
  // imports so a cold Vite optimizer cannot invalidate the first Playwright module context.
  optimizeDeps: {
    include: [
      '@tensorflow/tfjs-backend-cpu',
      '@tensorflow/tfjs-backend-wasm',
      '@tensorflow/tfjs-converter',
      '@tensorflow/tfjs-core',
    ],
  },
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  test: {
    coverage: {
      exclude: [
        'src/main.tsx',
        'src/test/**',
        // Browser/WASM integration is exercised by Playwright against the real pinned model.
        'src/audio/polyphonic/basic-pitch-model.ts',
      ],
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    css: true,
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
