import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

async function addRackModules(page: Page, titles: readonly string[]): Promise<void> {
  await page.getByRole('button', { exact: true, name: '+ Add module' }).click();
  for (const title of titles) {
    await page.getByRole('button', { exact: true, name: `Add ${title}` }).click();
  }
  await page.getByRole('button', { exact: true, name: 'Close library' }).click();
}

async function showPitchDiagnostics(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Analysis details' }).click();
  await expect(page.getByRole('region', { name: 'Analysis diagnostics' })).toBeVisible();
}

test('opens directly into the functional realistic rack', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('StringSight');
  await expect(page.getByRole('heading', { name: 'StringSight rack workspace' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Audio input' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pitch analysis' })).toHaveCount(0);
  await expect(page.getByText('00 installed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { exact: true, name: 'Input' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Source' })).toBeEnabled();

  await page.getByRole('button', { exact: true, name: '+ Add module' }).click();
  await expect(page.getByRole('button', { name: 'Add Evaluation bench' })).toHaveCount(0);
  await page.getByRole('button', { exact: true, name: 'Add Pitch analysis' }).click();
  await page.getByRole('button', { exact: true, name: 'Close library' }).click();
  await expect(page.getByRole('heading', { name: 'Pitch analysis' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evaluation bench' })).toHaveCount(0);
});

test('captures and replays audio through a simulated microphone', async ({ page }) => {
  await page.goto('/#capture');
  await addRackModules(page, ['Pitch analysis']);
  await page.getByRole('button', { exact: true, name: 'Input' }).click();
  const capturePanel = page.getByLabel('Audio capture controls');
  await expect(capturePanel.getByText('Active', { exact: true })).toBeVisible();
  await showPitchDiagnostics(page);
  await expect(page.getByRole('region', { name: 'Analysis diagnostics' })).toContainText(
    'monitoring-1',
  );

  await page.getByRole('button', { exact: true, name: 'Device details' }).click();
  await expect(capturePanel.getByText('Sample rate', { exact: true })).toBeVisible();
  await expect(capturePanel.getByText(/Hz$/).filter({ hasNotText: '—' })).toBeVisible();
  await page.getByRole('button', { exact: true, name: 'Device details' }).click();
  await expect(page.getByLabel('Capture duration')).toBeVisible();

  await page.getByRole('button', { exact: true, name: 'Record' }).click();
  await expect(capturePanel.getByText('Recording', { exact: true })).toBeVisible();
  await expect
    .poll(async () => Number(await page.getByRole('meter').getAttribute('aria-valuenow')))
    .toBeGreaterThan(0);
  await expect(page.getByRole('region', { name: 'Analysis diagnostics' })).toContainText(
    'microphone-1',
  );
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(capturePanel.getByText('Ready', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByLabel('Capture duration')).not.toHaveText('00:00.0');

  await page.getByRole('button', { exact: true, name: 'Replay' }).click();
  await expect(page.getByRole('button', { exact: true, name: 'Stop replay' })).toBeVisible();
  await expect(page.getByRole('button', { exact: true, name: 'Replay' })).toBeEnabled({
    timeout: 15_000,
  });

  await page.getByRole('button', { exact: true, name: 'Record' }).click();
  await expect(page.getByRole('region', { name: 'Analysis diagnostics' })).toContainText(
    'microphone-3',
  );
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(capturePanel.getByText('Ready', { exact: true })).toBeVisible();
});

test('loads a WAV through the normal replay analysis path', async ({ page }) => {
  await page.goto('/#capture');
  await addRackModules(page, ['Pitch analysis']);
  const capturePanel = page.getByLabel('Audio capture controls');
  await capturePanel
    .locator('input[type="file"]')
    .setInputFiles(path.resolve('tests/fixtures/audio/dev-open-e2-soft.wav'));

  await expect(capturePanel.getByText(/Loaded and analyzed dev-open-e2-soft.wav/)).toBeVisible({
    timeout: 5_000,
  });
  await showPitchDiagnostics(page);
  await expect(page.getByRole('region', { name: 'Analysis diagnostics' })).toContainText(
    'replay-1',
  );
  const pitchResults = page.getByRole('region', { name: 'Pitch analysis results' });
  await expect(pitchResults.getByText('E2 detected', { exact: true })).toBeVisible();
  await expect(
    pitchResults.getByText('Target frequency', { exact: true }).locator('..'),
  ).toContainText('82.41 Hz');
  await expect(pitchResults.getByText('Lower pitch slightly', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recent note history' })).toHaveCount(0);
  await expect(page.getByRole('button', { exact: true, name: 'Replay' })).toBeEnabled();
});

test('finalizes a chord WAV with the real model and reveals analysis details on demand', async ({
  page,
}) => {
  await page.goto('/#capture');
  await addRackModules(page, ['Chord analysis']);
  const capturePanel = page.getByLabel('Audio capture controls');
  await capturePanel
    .locator('input[type="file"]')
    .setInputFiles(path.resolve('tests/fixtures/audio/dev-c-major-loud.wav'));

  const chordResults = page.getByLabel('Chord analysis results');
  await expect(page.getByLabel('Chord analysis diagnostics')).toHaveCount(0);
  await chordResults.getByRole('button', { name: 'Analysis details' }).click();
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
});

test('keeps the rack usable without horizontal overflow on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Audio input' })).toBeVisible();
  await expect(page.getByRole('button', { exact: true, name: 'Input' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Source' })).toBeEnabled();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
