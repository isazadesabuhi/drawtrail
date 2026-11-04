#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const baseUrl = new URL(process.env.DRAWTRAIL_URL ?? 'http://127.0.0.1:3000');
const requestBody = JSON.parse(
  await readFile(
    new URL(
      '../packages/validation/fixtures/generator-request.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const routingUrl = new URL(process.env.VALHALLA_URL ?? 'http://127.0.0.1:8002');
const routingFixtures = [
  { name: 'Lyon', center: [4.84, 45.77] },
  { name: 'Andorra', center: [1.5218, 42.5063] },
];
let selectedRegion;
for (const fixture of routingFixtures) {
  const url = new URL('/route', routingUrl);
  url.searchParams.set(
    'json',
    JSON.stringify({
      locations: [
        { lon: fixture.center[0], lat: fixture.center[1] },
        { lon: fixture.center[0] + 0.002, lat: fixture.center[1] + 0.002 },
      ],
      costing: 'pedestrian',
      units: 'kilometers',
    }),
  );
  const probe = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (probe?.ok) {
    selectedRegion = fixture;
    break;
  }
}
assert(selectedRegion, 'No supported Lyon or Andorra routing graph is loaded.');
requestBody.center = selectedRegion.center;
requestBody.bounds.radiusMeters = 5000;
requestBody.settings.searchArea = {
  radiusMeters: 500,
  candidateCount: 3,
};
const response = await fetch(new URL('/api/v1/generate', baseUrl), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(requestBody),
  signal: AbortSignal.timeout(180_000),
});
const body = await response.json().catch(() => null);
assert(
  response.ok,
  `Generation failed (${response.status}): ${JSON.stringify(body)}`,
);
assert.equal(
  body?.status,
  'success',
  `Unexpected response: ${JSON.stringify(body)}`,
);
assert.equal(body.route?.properties?.mode, 'walking');
assert(
  body.route.geometry.coordinates.length >= 2,
  'Generated route needs line geometry.',
);
assert(Number.isFinite(body.distanceMeters) && body.distanceMeters > 0);
assert(
  Number.isFinite(body.similarityScore) &&
    body.similarityScore >= 0 &&
    body.similarityScore <= 1,
);
assert(
  body.waypointCount >= 2 &&
    body.waypointCount <= requestBody.settings.maxWaypoints,
);

const [startLongitude, startLatitude] = body.route.geometry.coordinates[0];
const [endLongitude, endLatitude] = body.route.geometry.coordinates.at(-1);
const earthRadiusMeters = 6_371_008.8;
const radians = (degrees) => (degrees * Math.PI) / 180;
const latitudeDelta = radians(endLatitude - startLatitude);
const longitudeDelta = radians(endLongitude - startLongitude);
const arc =
  Math.sin(latitudeDelta / 2) ** 2 +
  Math.cos(radians(startLatitude)) *
    Math.cos(radians(endLatitude)) *
    Math.sin(longitudeDelta / 2) ** 2;
const closureMeters =
  earthRadiusMeters * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
assert(
  closureMeters <= requestBody.bounds.continuityToleranceMeters + 1,
  `Closed baseline ended ${closureMeters.toFixed(1)} m from its start.`,
);

console.log(
  `PASS ${selectedRegion.name} heart baseline: ${(body.distanceMeters / 1000).toFixed(2)} km, ${Math.round(body.similarityScore * 100)}% similarity, ${body.waypointCount} ordered waypoints, ${closureMeters.toFixed(1)} m loop gap.`,
);
if (body.warnings.length) {
  console.log(`Route warnings: ${body.warnings.join(' ')}`);
}
