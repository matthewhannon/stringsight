import { expect, test, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
  await expect(page.getByRole('button', { exact: true, name: 'Connect microphone' })).toBeVisible();
});

test('captures and replays audio through a simulated microphone', async ({ page }) => {
  await page.goto('/#capture');
  await page.getByRole('button', { exact: true, name: 'Connect microphone' }).click();
  const capturePanel = page.getByLabel('Audio capture controls');
  await expect(capturePanel.getByText('Microphone connected', { exact: true })).toBeVisible();
  await expect(capturePanel.getByText(/Microphone connected — not recording/)).toBeVisible();
  await expect(page.getByLabel('Note analysis diagnostics')).toContainText('monitoring-1');
  await page.getByRole('button', { name: 'Record take' }).click();
  await expect(capturePanel.getByText('Recording', { exact: true })).toBeVisible();
  await expect(
    page.getByLabel('Audio diagnostics').getByText(/Hz$/).filter({ hasNotText: '—' }),
  ).toBeVisible();

  await expect
    .poll(async () => Number(await page.getByRole('meter').getAttribute('aria-valuenow')))
    .toBeGreaterThan(0);
  await expect(page.getByLabel('Note analysis diagnostics')).toContainText('microphone-1');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(capturePanel.getByText(/Microphone connected — not recording/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByLabel('Capture duration')).not.toHaveText('00:00.0');

  await page.getByRole('button', { name: 'Replay analysis' }).click();
  await expect(capturePanel.getByText('Replaying', { exact: true })).toBeVisible();
  await expect(capturePanel.getByText(/Microphone connected — not recording/)).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: 'Record take' }).click();
  await expect(page.getByLabel('Note analysis diagnostics')).toContainText('microphone-3');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(capturePanel.getByText(/Microphone connected — not recording/)).toBeVisible();
});

test('loads a WAV through the normal replay analysis path', async ({ page }) => {
  await page.goto('/#capture');
  const capturePanel = page.getByLabel('Audio capture controls');
  await capturePanel
    .locator('input[type="file"]')
    .setInputFiles(path.resolve('tests/fixtures/audio/dev-open-e2-soft.wav'));

  await expect(capturePanel.getByText(/Loaded and analyzed dev-open-e2-soft.wav/)).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByLabel('Note analysis diagnostics')).toContainText('replay-1');
  await expect.poll(async () => page.locator('.note-timeline li').count()).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Replay analysis' })).toBeEnabled();
});

test('finalizes a chord WAV with the real model and prepares a reviewed chord fixture', async ({
  page,
}) => {
  await page.goto('/#capture');
  const capturePanel = page.getByLabel('Audio capture controls');
  await capturePanel
    .locator('input[type="file"]')
    .setInputFiles(path.resolve('tests/fixtures/audio/dev-c-major-loud.wav'));

  const chordResults = page.getByLabel('Chord analysis results');
  const chordDiagnostics = page.getByLabel('Chord analysis diagnostics');
  await expect(chordDiagnostics).toContainText('ready', { timeout: 10_000 });
  await expect(chordDiagnostics).toContainText(/WASM|CPU/);
  await expect(chordResults.getByText('Finalized chord', { exact: true })).toBeVisible();
  await expect(chordResults.locator('.chord-readout > strong')).toHaveText('C');
  await expect(page.getByLabel('Latest chord events').getByRole('listitem')).toHaveCount(1);
  const chromaBars = chordResults.locator('.chroma-strip i');
  await expect(chromaBars).toHaveCount(12);
  const firstChromaBar = chromaBars.nth(0);
  expect(
    await firstChromaBar.evaluate((element) => ({
      height: getComputedStyle(element).height,
      transitionProperty: getComputedStyle(element).transitionProperty,
    })),
  ).toEqual({ height: '86px', transitionProperty: 'transform' });
  expect(await firstChromaBar.getAttribute('style')).toContain('--meter-scale');
  expect(
    await chordResults
      .getByLabel('Chord match strength')
      .locator('span')
      .evaluate((element) => getComputedStyle(element).transitionProperty),
  ).toBe('transform');

  await page.getByLabel('Fixture type').selectOption('chords');
  const reviewedChord = page.getByLabel('True chord for event 1');
  await expect(reviewedChord).toHaveValue('C');
  const labelsDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Accept suggestions & download labels' }).click();
  const fixture = JSON.parse(await readTextDownload(await labelsDownloadPromise)) as {
    groundTruth: { chords: { pitchClasses: number[]; symbol: string }[] };
    source: { license: string };
  };
  expect(fixture.groundTruth.chords).toEqual([
    expect.objectContaining({ pitchClasses: [0, 4, 7], symbol: 'C' }),
  ]);
  expect(fixture.source.license).toBe('private-evaluation-only');
});

test('keeps the rack usable without horizontal overflow on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Audio input' })).toBeVisible();
  await expect(page.getByRole('button', { exact: true, name: 'Connect microphone' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
