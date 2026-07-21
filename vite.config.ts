import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        audioInputPrototype: fileURLToPath(
          new URL('./audio-input-prototype.html', import.meta.url),
        ),
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
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
