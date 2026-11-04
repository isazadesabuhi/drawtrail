import { expect, test } from '@playwright/test';
import { mockMapStyle } from './map-fixture';

test('real MapLibre loads, pans, zooms, and keeps a selected point while resetting the viewport', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockMapStyle(page);
  await page.goto('/workspace');
  await expect(
    page.getByText('Map · click to set your area center'),
  ).toBeVisible();
  await expect(
    page.getByText('Synthetic test geometry — no street data'),
  ).toBeVisible();
  const canvas = page
    .getByRole('region', { name: 'Interactive map' })
    .locator('canvas');
  await canvas.click({ position: { x: 145, y: 230 } });
  await expect(
    page.getByRole('status', { name: 'Selected start point', exact: true }),
  ).toContainText('° N');
  const beforeDrag = await page
    .getByRole('status', { name: 'Selected start point', exact: true })
    .textContent();
  const pin = await page.locator('.maplibregl-marker').boundingBox();
  expect(pin).not.toBeNull();
  await page.mouse.move(pin!.x + pin!.width / 2, pin!.y + pin!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    pin!.x + pin!.width / 2 + 35,
    pin!.y + pin!.height / 2 + 20,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole('status', { name: 'Selected start point', exact: true }),
  ).not.toHaveText(beforeDrag!);
  const point = await page
    .getByRole('status', { name: 'Selected start point', exact: true })
    .textContent();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByLabel('Map viewport')).toContainText('Zoom 14.0');
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Map viewport')).not.toContainText(
    '45.7640, 4.8357',
  );
  await page.getByRole('button', { name: 'Back to Lyon' }).click();
  await expect(page.getByLabel('Map viewport')).toContainText(
    '45.7640, 4.8357 · Zoom 13.0',
  );
  await expect(
    page.getByRole('status', { name: 'Selected start point', exact: true }),
  ).toHaveText(point!);
  // Native navigation controls are focusable and respond to keyboard activation.
  await page.getByRole('button', { name: 'Zoom out', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Map viewport')).toContainText('Zoom 12.0');
  await canvas.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByLabel('Map viewport')).not.toContainText('Bearing 0°');
  await page.getByRole('button', { name: /click to reset north/i }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Map viewport')).toContainText('Bearing 0°');
  if (await page.evaluate(() => document.fullscreenEnabled)) {
    await page.getByRole('button', { name: 'Enter fullscreen' }).click();
    await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  }
  await page.getByRole('button', { name: 'Back to Lyon' }).click();
  await page.screenshot({
    path: testInfo.outputPath('workspace.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('local search and coordinates work, including when the map style fails', async ({
  page,
}) => {
  await mockMapStyle(page, true);
  await page.goto('/workspace');
  await expect(
    page.getByRole('alert').filter({ hasText: 'The map is unavailable' }),
  ).toBeVisible();
  await page.getByRole('searchbox').fill('Bellecour');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await page.getByRole('button', { name: 'Place Bellecour' }).click();
  await expect(
    page.getByRole('status', { name: 'Selected start point', exact: true }),
  ).toContainText('45.757900');
  await page.getByLabel('Latitude', { exact: true }).fill('42.5063');
  await page.getByLabel('Longitude', { exact: true }).fill('1.5218');
  await page.getByRole('button', { name: 'Set start point' }).click();
  await expect(
    page.getByRole('status', { name: 'Selected start point', exact: true }),
  ).toContainText('42.506300° N, 1.521800° E');
  await page.getByLabel('Latitude', { exact: true }).fill('45.77');
  await page.getByLabel('Longitude', { exact: true }).fill('4.84');
  await page.getByRole('button', { name: 'Set start point' }).click();
  await expect(
    page.getByRole('status', { name: 'Selected start point', exact: true }),
  ).toContainText('45.770000° N, 4.840000° E');
  await page.unroute('**/__test__/map-style.json');
  await mockMapStyle(page);
  await page.getByRole('button', { name: 'Retry map' }).click();
  await expect(
    page.getByText('Map · click to set your area center'),
  ).toBeVisible();
  await expect(
    page.getByRole('status', { name: 'Selected start point', exact: true }),
  ).toContainText('45.770000');
  await expect(page.locator('.maplibregl-marker')).toHaveCount(1);
});
