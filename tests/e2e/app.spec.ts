import { expect, test, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function readTextDownload(download: Download): Promise<string> {
  const path = await download.path();
  return readFile(path, 'utf8');
}

test('opens directly into the functional realistic rack', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('StringSight');
  await expect(page.getByRole('heading', { name: 'StringSight rack workspace' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Audio input' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pitch analysis' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evaluation bench' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start microphone' })).toBeVisible();
});

test('captures and replays audio through a simulated microphone', async ({ page }) => {
  await page.goto('/#capture');
  await page.getByRole('button', { name: 'Start microphone' }).click();
  const capturePanel = page.getByLabel('Audio capture controls');
  await expect(capturePanel.getByText('Recording', { exact: true })).toBeVisible();
  await expect(
    page.getByLabel('Audio diagnostics').getByText(/Hz$/).filter({ hasNotText: '—' }),
  ).toBeVisible();

  await expect
    .poll(async () => Number(await page.getByRole('meter').getAttribute('aria-valuenow')))
    .toBeGreaterThan(0);
  await expect.poll(async () => page.locator('.note-timeline li').count()).toBeGreaterThan(0);
  await expect(page.getByLabel('Note analysis diagnostics')).toContainText('microphone-1');
  const maximumTimerGapMs = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let checks = 0;
        let lastCheck = performance.now();
        let maximumGap = 0;
        const interval = setInterval(() => {
          const now = performance.now();
          maximumGap = Math.max(maximumGap, now - lastCheck);
          lastCheck = now;
          checks += 1;
          if (checks === 20) {
            clearInterval(interval);
            resolve(maximumGap);
          }
        }, 16);
      }),
  );
  expect(maximumTimerGapMs).toBeLessThan(200);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(capturePanel.getByText('Recording ready', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Capture duration')).not.toHaveText('00:00.0');

  const suggestedNotes = page.locator('select[aria-label^="True note for event"]');
  await expect.poll(async () => suggestedNotes.count()).toBeGreaterThan(0);
  const selectedMidi = await suggestedNotes.evaluateAll((selects) =>
    selects.map((select) => Number((select as HTMLSelectElement).value)),
  );
  expect(selectedMidi.every(Number.isFinite)).toBe(true);
  const labelsButton = page.getByRole('button', {
    name: 'Accept suggestions & download labels',
  });
  await expect(labelsButton).toBeEnabled();
  const labelsDownloadPromise = page.waitForEvent('download');
  await labelsButton.click();
  const labelsDownload = await labelsDownloadPromise;
  const fixture = JSON.parse(await readTextDownload(labelsDownload)) as {
    groundTruth: { notes: { midi: number }[] };
    source: { recordedAt: string };
  };
  expect(fixture.groundTruth.notes.map((note) => note.midi)).toEqual(selectedMidi);
  expect(Number.isNaN(Date.parse(fixture.source.recordedAt))).toBe(false);

  await page.getByRole('button', { name: 'Replay analysis' }).click();
  await expect(capturePanel.getByText('Replaying', { exact: true })).toBeVisible();
  await expect(capturePanel.getByText('Recording ready', { exact: true })).toBeVisible({
    timeout: 5_000,
  });

  await page.getByRole('button', { name: 'Start microphone' }).click();
  await expect(page.getByLabel('Note analysis diagnostics')).toContainText('microphone-3');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(capturePanel.getByText('Recording ready', { exact: true })).toBeVisible();
});

test('keeps the rack usable without horizontal overflow on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Audio input' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start microphone' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
