import { expect, test } from '@playwright/test';
import { mockMapStyle } from './map-fixture';

test('generates a routed baseline and shows route metrics and warnings', async ({
  page,
}) => {
  let submitted: Record<string, unknown> | undefined;
  await mockMapStyle(page);
  await page.route('**/api/v1/generate', async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        targetGeometry: {
          type: 'LineString',
          coordinates: [
            [4.84, 45.77],
            [4.8401, 45.7701],
          ],
        },
        route: {
          type: 'Feature',
          properties: { mode: 'walking' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [4.84, 45.77],
              [4.84005, 45.7702],
              [4.8401, 45.7701],
            ],
          },
        },
        distanceMeters: 1800,
        requestedDistanceMeters: 3000,
        similarityScore: 0.82,
        waypointCount: 8,
        warnings: [
          'Routed distance differs from the requested distance by more than 20%.',
        ],
      }),
    });
  });

  await page.goto('/workspace');
  await page
    .getByRole('button', { name: 'Start drawing', exact: true })
    .click();
  await expect(
    page.getByRole('application', { name: 'Drawing canvas' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Choose your place/ }).click();
  await page.getByLabel('Latitude', { exact: true }).fill('45.77');
  await page.getByLabel('Longitude', { exact: true }).fill('4.84');
  await page.getByRole('button', { name: 'Set start point' }).click();
  await page.getByRole('button', { name: /Draw your idea/ }).click();
  await expect(
    page.getByRole('application', { name: 'Drawing canvas' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Heart', exact: true }).click();
  await page
    .getByRole('checkbox', {
      name: 'Search for the shape around my chosen area',
    })
    .check();
  await expect(page.getByLabel('Map geometry legend')).toContainText(
    'Search area · 2.00 km radius',
  );
  await page.getByRole('button', { name: 'Generate street route' }).click();

  await expect(
    page.getByRole('region', { name: 'Generated route results' }),
  ).toBeVisible();
  await expect(page.getByText('1.80 km')).toBeVisible();
  await expect(page.getByText('82%')).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Route warnings' }),
  ).toContainText(
    'Routed distance differs from the requested distance by more than 20%',
  );
  await expect(page.getByLabel('Map geometry legend')).toContainText(
    'Actual street route (generated)',
  );
  expect(submitted).toMatchObject({
    center: [4.84, 45.77],
    mode: 'walking',
    targetDistanceKm: 3,
    loop: true,
    settings: {
      searchArea: { radiusMeters: 2000, candidateCount: 8 },
    },
  });
  expect(
    (submitted?.bounds as { radiusMeters: number }).radiusMeters,
  ).toBeGreaterThan(3000);
  expect((submitted?.drawing as { strokes: unknown[] }).strokes).toHaveLength(
    1,
  );
});

test('shows a typed missing-region failure without displaying a false route', async ({
  page,
}) => {
  await mockMapStyle(page);
  await page.route('**/api/v1/generate', async (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'error',
        code: 'missing_region',
        message: 'No routing graph covers one of these waypoints.',
        warnings: [],
      }),
    }),
  );
  await page.goto('/workspace');
  await page
    .getByRole('button', { name: 'Start drawing', exact: true })
    .click();
  await expect(
    page.getByRole('application', { name: 'Drawing canvas' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Choose your place/ }).click();
  await page.getByLabel('Latitude', { exact: true }).fill('45.77');
  await page.getByLabel('Longitude', { exact: true }).fill('4.84');
  await page.getByRole('button', { name: 'Set start point' }).click();
  await page.getByRole('button', { name: /Draw your idea/ }).click();
  await expect(
    page.getByRole('application', { name: 'Drawing canvas' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Heart', exact: true }).click();
  await page.getByRole('button', { name: 'Generate street route' }).click();
  await expect(
    page.getByRole('alert', { name: 'Drawing feedback' }),
  ).toContainText('No routing graph covers one of these waypoints.');
  await expect(
    page.getByRole('region', { name: 'Generated route results' }),
  ).toHaveCount(0);
});
