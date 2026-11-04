#!/usr/bin/env node
import { setTimeout as sleep } from 'node:timers/promises';

const baseUrl = new URL(process.env.VALHALLA_URL ?? 'http://127.0.0.1:8002');
const shouldWait = process.argv.includes('--wait');
const deadline = Date.now() + (shouldWait ? 15 * 60_000 : 5_000);
const fixtures = {
  pedestrian: {
    locations: [
      { lat: 42.5063, lon: 1.5218 },
      { lat: 42.5092, lon: 1.5342 },
    ],
    costing: 'pedestrian',
    units: 'kilometers',
  },
};

async function checkPedestrianRoute() {
  const url = new URL('/route', baseUrl);
  url.searchParams.set('json', JSON.stringify(fixtures.pedestrian));
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.error ?? body?.status_message ?? response.statusText;
    throw new Error(
      `Valhalla route check failed (${response.status}): ${detail}`,
    );
  }
  const summary = body?.trip?.legs?.[0]?.summary;
  const shape = body?.trip?.legs?.[0]?.shape;
  if (
    !Array.isArray(body?.trip?.legs) ||
    body.trip.legs.length === 0 ||
    typeof summary?.length !== 'number' ||
    !Number.isFinite(summary.length) ||
    summary.length <= 0 ||
    typeof shape !== 'string' ||
    shape.length === 0
  ) {
    throw new Error(
      'Valhalla responded, but no usable pedestrian graph route was returned.',
    );
  }
  return { distanceKm: summary.length, encodedShapeLength: shape.length };
}

let lastError;
do {
  try {
    const route = await checkPedestrianRoute();
    console.log(
      `Valhalla ready at ${baseUrl.origin}; pedestrian fixture route is ${route.distanceKm.toFixed(2)} km.`,
    );
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (!shouldWait || Date.now() >= deadline) break;
    console.log(`Waiting for Valhalla graph: ${error.message}`);
    await sleep(5_000);
  }
} while (Date.now() < deadline);

console.error(
  `Valhalla is not ready at ${baseUrl.origin}. A running container without loaded tiles is not healthy. ${lastError?.message ?? ''}`,
);
process.exit(1);
