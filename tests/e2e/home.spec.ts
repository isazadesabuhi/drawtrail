import { expect, test } from '@playwright/test';
import { mockMapStyle } from './map-fixture';

test('homepage loads, activity selection works, and the viewport does not overflow', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  await mockMapStyle(page);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'The city is your canvas.' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('homepage.png'),
    fullPage: true,
  });
  await page.getByRole('radio', { name: 'Run', exact: true }).check();
  await expect(page.getByRole('status')).toContainText('running loop');
  await page.getByRole('radio', { name: 'Run', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('radio', { name: 'Ride', exact: true }),
  ).toBeChecked();
  await expect(page.getByRole('status')).toContainText('two wheels');
  await expect(
    page.getByText('Illustration, not a navigable route.', { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.getByRole('link', { name: 'Meet your workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose an area for your route.' }),
  ).toBeVisible();
});
