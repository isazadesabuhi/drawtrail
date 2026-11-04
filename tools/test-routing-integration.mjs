#!/usr/bin/env node
const baseUrl = new URL(process.env.VALHALLA_URL ?? 'http://127.0.0.1:8002');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function route(locations, costing = 'pedestrian') {
  const url = new URL('/route', baseUrl);
  url.searchParams.set(
    'json',
    JSON.stringify({ locations, costing, units: 'kilometers' }),
  );
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

const start = { lat: 42.5063, lon: 1.5218 };
const finish = { lat: 42.5092, lon: 1.5342 };
const success = await route([start, finish]);
assert(
  success.response.ok,
  `A-to-B route failed: ${JSON.stringify(success.body)}`,
);
assert(
  success.body.trip?.legs?.[0]?.shape &&
    success.body.trip.legs[0].summary?.length > 0,
  'A-to-B route did not include a usable shape and distance.',
);
console.log(
  `PASS pedestrian A-to-B (${success.body.trip.legs[0].summary.length.toFixed(2)} km)`,
);

const cycling = await route([start, finish], 'bicycle');
assert(
  cycling.response.ok,
  `Cycling A-to-B route failed: ${JSON.stringify(cycling.body)}`,
);
const pedestrianShape = success.body.trip.legs[0].shape;
const cyclingShape = cycling.body.trip.legs[0].shape;
console.log(
  `PASS cycling A-to-B (${cycling.body.trip.legs[0].summary.length.toFixed(2)} km); ${pedestrianShape === cyclingShape ? 'same path on this extract' : 'profile selected a different path'}`,
);

const unreachable = await route([
  start,
  { lat: 0, lon: 0, radius: 1, search_cutoff: 1 },
]);
assert(
  !unreachable.response.ok,
  'A remote disconnected endpoint unexpectedly routed.',
);
console.log('PASS disconnected endpoint is rejected by the engine');

const invalid = await route([start, { lat: 91, lon: 1 }]);
assert(!invalid.response.ok, 'An invalid coordinate unexpectedly routed.');
console.log('PASS invalid coordinate is rejected by the engine');
