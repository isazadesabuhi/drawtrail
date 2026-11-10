#!/usr/bin/env node
import { setTimeout as sleep } from 'node:timers/promises';

const baseUrl = new URL(process.env.VALHALLA_URL ?? 'http://127.0.0.1:8002');
const shouldWait = process.argv.includes('--wait');
const requireElevation = process.argv.includes('--elevation');
const deadline = Date.now() + (shouldWait ? 15 * 60_000 : 5_000);
const fixtures = [
  {
    name: 'Lyon',
    locations: [
      { lat: 45.764, lon: 4.8357 },
      { lat: 45.768, lon: 4.841 },
    ],
  },
  {
    name: 'Andorra',
    locations: [
      { lat: 42.5063, lon: 1.5218 },
      { lat: 42.5092, lon: 1.5342 },
    ],
  },
];
let lastElevationError;
let lastRouteError;

async function checkPedestrianRoute(fixture) {
  const url = new URL('/route', baseUrl);
  url.searchParams.set(
    'json',
    JSON.stringify({
      ...fixture,
      costing: 'pedestrian',
      units: 'kilometers',
      ...(requireElevation ? { elevation_interval: 30 } : {}),
    }),
  );
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
  if (requireElevation) {
    const isHeight = (height) =>
      typeof height === 'number' &&
      Number.isFinite(height) &&
      height >= -500 &&
      height <= 10_000;
    const graphHeights = body.trip.legs[0].elevation;
    if (
      !Array.isArray(graphHeights) ||
      graphHeights.length < 2 ||
      !graphHeights.every(isHeight) ||
      !graphHeights.some((height) => height > 0)
    ) {
      const error = new Error(
        'The fixture graph has no usable elevation. Rebuild with elevation enabled.',
      );
      error.elevationCheckFailure = true;
      throw error;
    }
    const heightsResponse = await fetch(new URL('/height', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shape: fixture.locations, range: false }),
      signal: AbortSignal.timeout(8000),
    });
    const heights = (await heightsResponse.json().catch(() => null))?.height;
    if (
      !heightsResponse.ok ||
      !Array.isArray(heights) ||
      heights.length !== fixture.locations.length ||
      !heights.every(isHeight) ||
      !heights.some((height) => height > 0)
    ) {
      const error = new Error(
        'The elevation lookup has no usable data for the fixture region.',
      );
      error.elevationCheckFailure = true;
      throw error;
    }
  }
  return {
    region: fixture.name,
    distanceKm: summary.length,
    encodedShapeLength: shape.length,
  };
}

do {
  try {
    let route;
    for (const fixture of fixtures) {
      try {
        route = await checkPedestrianRoute(fixture);
        break;
      } catch (error) {
        if (error.elevationCheckFailure) {
          lastElevationError = error;
        } else {
          lastRouteError = error;
        }
      }
    }
    if (route) {
      console.log(
        `Valhalla ready at ${baseUrl.origin}; ${route.region} pedestrian fixture route is ${route.distanceKm.toFixed(2)} km.${requireElevation ? ' Elevation lookup and graph elevation verified.' : ''}`,
      );
      process.exit(0);
    }
    throw lastElevationError ?? lastRouteError;
  } catch (error) {
    if (error.elevationCheckFailure) {
      lastElevationError = error;
    } else {
      lastRouteError = error;
    }
    if (error.elevationCheckFailure || !shouldWait || Date.now() >= deadline)
      break;
    const usefulError = lastElevationError ?? error;
    console.log(`Waiting for Valhalla graph: ${usefulError.message}`);
    await sleep(5_000);
  }
} while (Date.now() < deadline);

const lastError = lastElevationError ?? lastRouteError;
console.error(
  `Valhalla is not ready at ${baseUrl.origin}. A running container without loaded tiles is not healthy. ${lastError?.message ?? ''}`,
);
process.exit(1);
