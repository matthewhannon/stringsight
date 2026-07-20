import { expect, test } from '@playwright/test';

test('opens directly into the tab-centered practice workspace', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('StringSight — Practice');
  await expect(page.getByRole('heading', { name: 'Neon River' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tab + Video' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('Video playback placeholder')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect microphone to record' })).toBeDisabled();
});

test('captures audio through the integrated input drawer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Input settings' }).click();
  const inputDrawer = page.getByRole('dialog', { name: 'Microphone and take controls' });

  await inputDrawer.getByRole('button', { name: 'Connect microphone' }).click();
  await expect(inputDrawer.getByText('monitoring', { exact: true })).toBeVisible();

  await inputDrawer.getByRole('button', { name: 'Record take' }).click();
  await expect(inputDrawer.getByText('recording', { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const label = await page.getByRole('meter').getAttribute('aria-label');
      return Number(label?.match(/\d+/)?.[0] ?? 0);
    })
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(inputDrawer.getByText('idle', { exact: true })).toBeVisible({ timeout: 15_000 });
});

test('keeps the workspace usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Neon River' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('keeps the dual canvas usable in the intermediate desktop band', async ({ page }) => {
  await page.setViewportSize({ width: 1050, height: 800 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Neon River' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reference video' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('does not overflow at responsive breakpoint edges', async ({ page }) => {
  for (const width of [980, 981, 1100, 1101]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${String(width)}px`).toBeLessThanOrEqual(1);
  }
});

test('does not leave a hidden splitter in focus modes', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Video Focus' }).click();
  await expect(page.getByRole('separator', { name: 'Resize tab and video panels' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('separator', { name: 'Resize tab and video panels' })).toHaveCount(0);
});

test('keeps primary practice controls reachable at 125 percent page scale', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const devtools = await page.context().newCDPSession(page);
  await devtools.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 });

  await expect(page.getByRole('heading', { name: 'Neon River' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Input settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Video Focus' }).click();
  await expect(page.getByRole('heading', { name: 'Reference video' })).toBeVisible();
});
