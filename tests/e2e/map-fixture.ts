import type { Page } from '@playwright/test';

// Synthetic geometry around the test viewport. No real street or navigation claim.
export const fixtureStyle = {
  version: 8,
  sources: {
    neighborhood: {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { kind: 'park' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [4.846, 45.774],
                  [4.864, 45.774],
                  [4.864, 45.787],
                  [4.846, 45.787],
                  [4.846, 45.774],
                ],
              ],
            },
          },
          {
            type: 'Feature',
            properties: { kind: 'river' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [4.842, 45.8],
                [4.842, 45.775],
                [4.837, 45.76],
                [4.823, 45.738],
              ],
            },
          },
          ...Array.from({ length: 9 }, (_, index) => ({
            type: 'Feature',
            properties: { kind: 'line' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [4.81 + index * 0.006, 45.74],
                [4.825 + index * 0.006, 45.79],
              ],
            },
          })),
          ...Array.from({ length: 9 }, (_, index) => ({
            type: 'Feature',
            properties: { kind: 'line' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [4.8, 45.745 + index * 0.005],
                [4.875, 45.75 + index * 0.005],
              ],
            },
          })),
        ],
      },
      attribution: 'Synthetic test geometry',
    },
  },
  layers: [
    {
      id: 'paper',
      type: 'background',
      paint: { 'background-color': '#e8eddf' },
    },
    {
      id: 'park',
      type: 'fill',
      source: 'neighborhood',
      filter: ['==', ['get', 'kind'], 'park'],
      paint: { 'fill-color': '#d1dfb9' },
    },
    {
      id: 'lines',
      type: 'line',
      source: 'neighborhood',
      filter: ['==', ['get', 'kind'], 'line'],
      paint: { 'line-color': '#fffdf6', 'line-width': 8 },
    },
    {
      id: 'river',
      type: 'line',
      source: 'neighborhood',
      filter: ['==', ['get', 'kind'], 'river'],
      paint: { 'line-color': '#afcfc8', 'line-width': 28 },
    },
  ],
};

export async function mockMapStyle(page: Page, fail = false) {
  await page.route('**/__test__/map-style.json', (route) =>
    fail
      ? route.fulfill({ status: 503, body: 'Test map unavailable' })
      : route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(fixtureStyle),
        }),
  );
  // A regression must never turn these automated tests into public tile requests.
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.abort(),
  );
}
