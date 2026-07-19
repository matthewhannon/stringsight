import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const fakeAudioPath = path.resolve(
  import.meta.dirname,
  'tests/fixtures/audio/dev-a-minor-pentatonic.wav',
);

export default defineConfig({
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  // Audio/model workflows are CPU-bound and timing-sensitive; keep worker scheduling deterministic.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  retries: process.env.CI ? 2 : 0,
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    // The Evaluation Bench is intentionally development-only; production exclusion is verified
    // by the build checks, while browser workflows exercise its fixture-review controls here.
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    url: 'http://127.0.0.1:4173',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--autoplay-policy=no-user-gesture-required',
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            `--use-file-for-fake-audio-capture=${fakeAudioPath}`,
          ],
        },
        permissions: ['microphone'],
      },
    },
  ],
});
