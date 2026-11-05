#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const apiUrl = new URL(process.env.DRAWTRAIL_URL ?? 'http://127.0.0.1:3000');
const routerUrl = new URL(process.env.VALHALLA_URL ?? 'http://127.0.0.1:8002');
async function fetchApi(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot reach the DrawTrail API at ${apiUrl.origin}. Start the web app with "pnpm dev" or set DRAWTRAIL_URL to its address. (${detail})`,
      { cause: error },
    );
  }
}
const request = JSON.parse(
  await readFile(
    new URL(
      '../packages/validation/fixtures/generator-request.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const regions = [
  { name: 'Lyon', center: [4.84, 45.77] },
  { name: 'Andorra', center: [1.5218, 42.5063] },
];
let region;
for (const candidate of regions) {
  const url = new URL('/route', routerUrl);
  url.searchParams.set(
    'json',
    JSON.stringify({
      locations: [
        { lon: candidate.center[0], lat: candidate.center[1] },
        { lon: candidate.center[0] + 0.001, lat: candidate.center[1] + 0.001 },
      ],
      costing: 'pedestrian',
      units: 'kilometers',
    }),
  );
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (response?.ok) {
    region = candidate;
    break;
  }
}
assert(region, 'No supported Lyon or Andorra Valhalla graph is available.');

request.center = region.center;
request.bounds.radiusMeters = 7000;
delete request.settings.searchArea;
const idempotencyKey = `integration-${randomUUID()}`;
const submit = () =>
  fetchApi(new URL('/api/v1/generations', apiUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(20_000),
  });
const acceptedResponse = await submit();
const acceptedEnvelope = await acceptedResponse.json();
assert.equal(acceptedResponse.status, 202, JSON.stringify(acceptedEnvelope));
assert.equal(
  acceptedEnvelope.status,
  'success',
  JSON.stringify(acceptedEnvelope),
);
const generationId = acceptedEnvelope.data.id;
const duplicateResponse = await submit();
const duplicateEnvelope = await duplicateResponse.json();
assert.equal(duplicateResponse.status, 200, JSON.stringify(duplicateEnvelope));
assert.equal(duplicateEnvelope.data.id, generationId);
assert.equal(duplicateEnvelope.data.reused, true);

const unknown = await fetchApi(
  new URL(`/api/v1/generations/${randomUUID()}`, apiUrl),
);
assert.equal(unknown.status, 404, 'Unknown generation should return 404.');

const deadline = Date.now() + 180_000;
let finalStatus;
while (Date.now() < deadline) {
  const response = await fetchApi(
    new URL(`/api/v1/generations/${generationId}`, apiUrl),
  );
  const envelope = await response.json();
  assert(response.ok, JSON.stringify(envelope));
  finalStatus = envelope.data;
  if (['completed', 'failed', 'cancelled'].includes(finalStatus.state)) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert(finalStatus, 'Generation status was not returned.');
assert.equal(finalStatus.state, 'completed', JSON.stringify(finalStatus));
assert(finalStatus.result?.route?.geometry?.coordinates?.length >= 2);
assert(finalStatus.result.distanceMeters > 0);
console.log(
  `PASS durable ${region.name} generation ${generationId}: ${(finalStatus.result.distanceMeters / 1000).toFixed(2)} km; retry reused the same job.`,
);
