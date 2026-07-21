import { expect, test } from '@playwright/test';

test('opens directly into the truthful authored-score workspace', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/^StringSight/);
  await expect(page.getByRole('heading', { name: 'Untitled guitar tab' })).toBeVisible();
  await expect(page.getByText(/^Working copy/)).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Notation preview' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Score ready' })).toContainText(
    '0 events',
    { timeout: 15_000 },
  );
  await expect(page.getByRole('tree', { name: 'Authored score structure' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import score' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Export MIDI' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^Microphone disconnected/ })).toBeEnabled();
});

test('captures audio through the integrated input and recording drawer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Input and recording' }).click();
  const inputDrawer = page.getByRole('dialog', { name: 'Microphone and recording' });

  await expect(inputDrawer).toBeVisible();
  await inputDrawer.getByRole('button', { name: 'Connect microphone' }).click();
  await expect(inputDrawer.getByText('monitoring', { exact: true })).toBeVisible();

  await inputDrawer.getByRole('button', { name: 'Record take' }).click();
  await expect(inputDrawer.getByText('recording', { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const level = await page.getByRole('meter').getAttribute('aria-valuenow');
      return Number(level ?? 0);
    })
    .toBeGreaterThan(0);

  await inputDrawer.getByRole('button', { name: 'Stop and save take' }).click();
  await expect(inputDrawer.getByText('idle', { exact: true })).toBeVisible({ timeout: 15_000 });
});

test('keeps the authored-score workspace usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Untitled guitar tab' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Notation preview' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('keeps the authored score usable in the intermediate desktop band', async ({ page }) => {
  await page.setViewportSize({ width: 1050, height: 800 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Untitled guitar tab' })).toBeVisible();
  await expect(page.getByRole('tree', { name: 'Authored score structure' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('does not overflow at responsive breakpoint edges', async ({ page }) => {
  for (const width of [980, 981, 1100, 1101]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Untitled guitar tab' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${String(width)}px`).toBeLessThanOrEqual(1);
  }
});

test('removes the practice splitter in edit mode while preserving the score', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('separator', { name: 'Resize tab and video panels' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('separator', { name: 'Resize tab and video panels' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Notation preview' })).toBeVisible();
});

test('keeps primary score and input actions reachable at 125 percent page scale', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const devtools = await page.context().newCDPSession(page);
  await devtools.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 });

  await expect(page.getByRole('heading', { name: 'Untitled guitar tab' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import score' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export MIDI' })).toBeVisible();
  await page.getByRole('button', { name: 'Input and recording' }).click();
  await expect(page.getByRole('dialog', { name: 'Microphone and recording' })).toBeVisible();
});
