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

const fixtures = [
  {
    name: 'Lyon',
    start: { lat: 45.764, lon: 4.8357 },
    finish: { lat: 45.768, lon: 4.841 },
  },
  {
    name: 'Andorra',
    start: { lat: 42.5063, lon: 1.5218 },
    finish: { lat: 42.5092, lon: 1.5342 },
  },
];
let selected;
let success;
for (const fixture of fixtures) {
  const candidate = await route([fixture.start, fixture.finish]);
  if (candidate.response.ok) {
    selected = fixture;
    success = candidate;
    break;
  }
}
assert(success && selected, 'No supported Lyon or Andorra graph is loaded.');
assert(
  success.body.trip?.legs?.[0]?.shape &&
    success.body.trip.legs[0].summary?.length > 0,
  'A-to-B route did not include a usable shape and distance.',
);
console.log(
  `PASS pedestrian A-to-B (${success.body.trip.legs[0].summary.length.toFixed(2)} km)`,
);

const cycling = await route([selected.start, selected.finish], 'bicycle');
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
  selected.start,
  { lat: 0, lon: 0, radius: 1, search_cutoff: 1 },
]);
assert(
  !unreachable.response.ok,
  'A remote disconnected endpoint unexpectedly routed.',
);
console.log('PASS disconnected endpoint is rejected by the engine');

const invalid = await route([selected.start, { lat: 91, lon: 1 }]);
assert(!invalid.response.ok, 'An invalid coordinate unexpectedly routed.');
console.log('PASS invalid coordinate is rejected by the engine');
