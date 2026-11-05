#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const apiUrl = new URL(process.env.DRAWTRAIL_URL ?? 'http://127.0.0.1:3000');
const routingUrl = new URL(process.env.VALHALLA_URL ?? 'http://127.0.0.1:8002');
const fixture = JSON.parse(
  await readFile(
    new URL(
      '../packages/validation/fixtures/generator-request.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const shapes = {
  heart: [
    [0.5, 0.1],
    [0.9, 0.4],
    [0.5, 0.9],
    [0.1, 0.4],
    [0.5, 0.1],
  ],
  letter: [
    [0.2, 0.9],
    [0.2, 0.1],
    [0.8, 0.9],
    [0.8, 0.1],
  ],
  circle: Array.from({ length: 17 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    return [0.5 + Math.cos(angle) * 0.4, 0.5 + Math.sin(angle) * 0.4];
  }),
};
const regions = [
  {
    name: 'Lyon',
    centers: [
      [4.84, 45.77],
      [4.86, 45.76],
    ],
  },
  {
    name: 'Andorra',
    centers: [
      [1.5218, 42.5063],
      [1.54, 42.51],
    ],
  },
];
async function supports(center) {
  const url = new URL('/route', routingUrl);
  url.searchParams.set(
    'json',
    JSON.stringify({
      locations: [
        { lon: center[0], lat: center[1] },
        { lon: center[0] + 0.001, lat: center[1] + 0.001 },
      ],
      costing: 'pedestrian',
      units: 'kilometers',
    }),
  );
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  return Boolean(response?.ok);
}
let region = null;
for (const candidate of regions) {
  if (
    (await supports(candidate.centers[0])) &&
    (await supports(candidate.centers[1]))
  ) {
    region = candidate;
    break;
  }
}
assert(
  region,
  'No supported two-neighborhood Lyon or Andorra graph was detected.',
);

const cases = [];
for (const [neighborhoodIndex, center] of region.centers.entries()) {
  for (const [shape, points] of Object.entries(shapes)) {
    for (const mode of ['walking', 'running', 'cycling']) {
      const body = structuredClone(fixture);
      body.drawing.name = `Benchmark ${shape}`;
      body.drawing.strokes[0] = {
        ...body.drawing.strokes[0],
        id: shape,
        label: shape,
        points,
        closed: shape !== 'letter',
      };
      body.center = center;
      body.mode = mode;
      body.targetDistanceKm = 3;
      body.loop = shape !== 'letter';
      body.bounds.radiusMeters = 7000;
      body.settings.seed = `benchmark-${region.name}-${neighborhoodIndex}-${shape}-${mode}`;
      body.settings.searchArea = {
        radiusMeters: 250,
        candidateCount: 2,
        maxRuntimeMs: 30_000,
        maxRouterRequests: 20,
      };
      const started = performance.now();
      const response = await fetch(new URL('/api/v1/generate', apiUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      const result = await response.json().catch(() => null);
      const generation = result?.status === 'success' ? result.data : null;
      const elapsedMs = Math.round(performance.now() - started);
      cases.push({
        neighborhood: `${region.name}-${neighborhoodIndex + 1}`,
        shape,
        mode,
        elapsedMs,
        status: result?.status ?? 'invalid_response',
        distanceMeters: generation?.distanceMeters ?? null,
        similarityScore: generation?.similarityScore ?? null,
        retracingMeters: generation?.retracingMeters ?? null,
        routerPlacements: generation?.alternatives?.length ?? 0,
        errorCode: result?.error?.code ?? null,
      });
      console.log(
        `${cases.at(-1).status.toUpperCase()} ${cases.at(-1).neighborhood} ${shape}/${mode}: ${elapsedMs} ms`,
      );
    }
  }
}
const report = {
  generatedAt: new Date().toISOString(),
  region: region.name,
  apiUrl: apiUrl.origin,
  routingUrl: routingUrl.origin,
  cases,
};
const output = process.argv
  .find((arg) => arg.startsWith('--output='))
  ?.slice('--output='.length);
const json = `${JSON.stringify(report, null, 2)}\n`;
if (output) await writeFile(output, json, 'utf8');
else process.stdout.write(json);
