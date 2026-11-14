import { readFile } from 'node:fs/promises';
import type { LngLat } from '@drawtrail/types';
import { lineLengthMeters } from '@drawtrail/geo-utils';
import {
  routeGenerationRequestSchema,
  type RouteGenerationRequest,
} from '@drawtrail/validation';
import { describe, expect, it, vi } from 'vitest';
import { generateRoute, type RouteSegmenter } from './route-generator';
import { ValhallaError } from './valhalla-client';
import { summarizeElevation } from './elevation';
import { addRouteElevation, type ElevationLookup } from './route-elevation';

const anchor: LngLat = [1.5218, 42.5063];

async function readRequest(): Promise<RouteGenerationRequest> {
  const fixture = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/validation/fixtures/generator-request.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as unknown;
  return routeGenerationRequestSchema.parse(fixture);
}

function fixtureRouter(): RouteSegmenter {
  return async (mode, from, to) => ({
    mode,
    geometry: { type: 'LineString', coordinates: [from, to] },
    distanceMeters: lineLengthMeters(
      { type: 'LineString', coordinates: [from, to] },
      anchor,
    ),
  });
}

describe('route generator', () => {
  it.each(['fixed', 'area', 'best-shape'] as const)(
    'enriches only the returned alternatives with elevation in %s search',
    async (search) => {
      const request = await readRequest();
      request.bounds.radiusMeters = 25_000;
      if (search === 'area')
        request.settings.searchArea = { radiusMeters: 1000, candidateCount: 4 };
      if (search === 'best-shape') delete request.targetDistanceKm;
      const elevation = vi.fn<ElevationLookup>(async (_coordinates, distance) =>
        summarizeElevation([0, distance], [100, 120]),
      );
      const result = await generateRoute(
        request,
        fixtureRouter(),
        undefined,
        undefined,
        elevation,
      );
      expect(result.status).toBe('success');
      if (result.status !== 'success') return;
      expect(elevation).toHaveBeenCalledTimes(result.alternatives?.length ?? 1);
      expect(result.elevation).toMatchObject({
        status: 'complete',
        ascentMeters: 20,
      });
      for (const candidate of result.alternatives ?? [result]) {
        expect(candidate.elevation?.status).toBe('complete');
        if (candidate.elevation?.status === 'complete')
          expect(candidate.elevation.samples.at(-1)?.distanceMeters).toBe(
            candidate.distanceMeters,
          );
      }
      expect(elevation.mock.calls.length).toBeLessThanOrEqual(3);
    },
  );

  it('preserves a street route when terrain is unavailable and cancels enrichment cooperatively', async () => {
    const request = await readRequest();
    const route = await generateRoute(request, fixtureRouter());
    const missing = await addRouteElevation(route, async () => {
      throw new Error('offline');
    });
    expect(missing.status).toBe('success');
    if (missing.status === 'success')
      expect(missing.elevation).toMatchObject({ status: 'unavailable' });
    const controller = new AbortController();
    const cancelled = await addRouteElevation(
      route,
      async (_coords, distance) => {
        controller.abort();
        return summarizeElevation([0, distance], [100, 100]);
      },
      controller.signal,
    );
    expect(cancelled).toMatchObject({ status: 'error', code: 'cancelled' });
  });

  it('routes a heart fixture in ordered segments and reports routed metrics', async () => {
    const request = await readRequest();
    const router = vi.fn(fixtureRouter());
    const result = await generateRoute(request, router);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(router).toHaveBeenCalledTimes(result.waypointCount);
    expect(result.route.geometry.coordinates.length).toBeGreaterThan(2);
    expect(result.distanceMeters).toBeGreaterThan(0);
    expect(result.requestedDistanceMeters).toBe(3000);
    expect(result.similarityScore).toBeGreaterThan(0);
    const firstRequest = router.mock.calls[0]!;
    expect(firstRequest[0]).toBe('walking');
    expect(firstRequest[1]).toEqual(result.targetGeometry.coordinates[0]);
  });

  it('warns and lowers the score when road snapping pulls the route off the sketch', async () => {
    const request = await readRequest();
    request.bounds.radiusMeters = 25_000;
    const ideal = await generateRoute(request, fixtureRouter());
    const distantSnap: RouteSegmenter = async (mode, from, to) => {
      const offset = 0.01;
      const coordinates: [number, number][] = [
        [from[0] + offset, from[1]],
        [to[0] + offset, to[1]],
      ];
      return {
        mode,
        geometry: { type: 'LineString', coordinates },
        distanceMeters: lineLengthMeters(
          { type: 'LineString', coordinates },
          anchor,
        ),
      };
    };
    const snapped = await generateRoute(request, distantSnap);

    expect(ideal.status).toBe('success');
    expect(snapped.status).toBe('success');
    if (ideal.status !== 'success' || snapped.status !== 'success') return;
    expect(
      snapped.warnings.some((warning) =>
        /snapped up to \d+ m from the drawn line/.test(warning),
      ),
    ).toBe(true);
    expect(snapped.similarityScore).toBeLessThan(ideal.similarityScore);
  });

  it('searches shape sizes and ranks by drawing match when no distance target is set', async () => {
    const request = await readRequest();
    delete request.targetDistanceKm;
    request.bounds.radiusMeters = 25_000;
    const router = vi.fn(fixtureRouter());

    const result = await generateRoute(request, router);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.requestedDistanceMeters).toBeNull();
    expect(result.warnings).toContain(
      'Best shape match of 6 viable route sizes at the selected map pin.',
    );
    expect(router.mock.calls.length).toBeGreaterThan(result.waypointCount);
    expect(result.alternatives?.[0]?.route).toEqual(result.route);
  });

  it('allows activity-specific actual distances without a distance target', async () => {
    const walkingRequest = await readRequest();
    delete walkingRequest.targetDistanceKm;
    walkingRequest.bounds.radiusMeters = 25_000;
    const cyclingRequest = structuredClone(walkingRequest);
    cyclingRequest.mode = 'cycling';
    const router: RouteSegmenter = async (mode, from, to) => {
      const route = await fixtureRouter()(mode, from, to);
      return {
        ...route,
        distanceMeters: route.distanceMeters * (mode === 'cycling' ? 1.5 : 1),
      };
    };

    const walking = await generateRoute(walkingRequest, router);
    const cycling = await generateRoute(cyclingRequest, router);

    expect(walking.status).toBe('success');
    expect(cycling.status).toBe('success');
    if (walking.status !== 'success' || cycling.status !== 'success') return;
    expect(walking.requestedDistanceMeters).toBeNull();
    expect(cycling.requestedDistanceMeters).toBeNull();
    expect(cycling.distanceMeters).toBeGreaterThan(walking.distanceMeters);
    expect(cycling.route.properties.mode).toBe('cycling');
  });

  it('keeps area search available in best-shape-match mode without a length cap', async () => {
    const request = await readRequest();
    delete request.targetDistanceKm;
    request.bounds.radiusMeters = 7000;
    request.settings.searchArea = {
      radiusMeters: 1000,
      candidateCount: 2,
    };

    const result = await generateRoute(request, fixtureRouter());

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.requestedDistanceMeters).toBeNull();
    expect(result.warnings).toContain(
      'Best of 2 viable placements searched within a 1.0 km radius.',
    );
  });

  it('requires every routed coordinate to stay inside an area-only radius', async () => {
    const request = await readRequest();
    request.bounds.radiusMeters = 7000;
    request.settings.searchArea = {
      radiusMeters: 1000,
      candidateCount: 2,
      routeWithinRadius: true,
    };
    const outsideRouter: RouteSegmenter = async (mode, from, to) => {
      const coordinates: LngLat[] = [
        [from[0] + 0.02, from[1]],
        [to[0] + 0.02, to[1]],
      ];
      return {
        mode,
        geometry: { type: 'LineString', coordinates },
        distanceMeters: lineLengthMeters(
          { type: 'LineString', coordinates },
          anchor,
        ),
      };
    };

    await expect(generateRoute(request, outsideRouter)).resolves.toMatchObject({
      status: 'error',
      code: 'infeasible_waypoint',
      message: expect.stringContaining('No route fit entirely inside'),
    });

    request.settings.searchArea.radiusMeters = 10_000;
    const inside = await generateRoute(request, fixtureRouter());
    expect(inside.status).toBe('success');
    if (inside.status === 'success') {
      expect(
        inside.route.geometry.coordinates.every(
          ([longitude, latitude]) =>
            lineLengthMeters(
              {
                type: 'LineString',
                coordinates: [request.center, [longitude, latitude]],
              },
              request.center,
            ) <= 10_000,
        ),
      ).toBe(true);
    }
  });

  it.each(['fixed', 'area', 'best-shape'] as const)(
    'preserves preferences and cancellation for every segment in %s generation',
    async (search) => {
      const request = await readRequest();
      request.settings.preferences = {
        hills: 'flatter',
        cyclingRoads: 'paths',
        cyclingSurface: 'paved',
      };
      request.bounds.radiusMeters = 25_000;
      if (search === 'area') {
        request.settings.searchArea = { radiusMeters: 1000, candidateCount: 3 };
      }
      if (search === 'best-shape') delete request.targetDistanceKm;
      const router = vi.fn(fixtureRouter());
      const signal = new AbortController().signal;
      const result = await generateRoute(request, router, signal);

      expect(result.status).toBe('success');
      expect(router).toHaveBeenCalled();
      for (const call of router.mock.calls) {
        expect(call[3]).toBe(signal);
        expect(call[4]).toEqual(request.settings.preferences);
      }
    },
  );

  it('returns a typed missing-region failure for the fixed Lyon baseline with an Andorra graph', async () => {
    const request = await readRequest();
    request.center = [4.8357, 45.764];
    const router: RouteSegmenter = async () => {
      throw new ValhallaError('missing_region', 'No graph covers this place.');
    };
    await expect(generateRoute(request, router)).resolves.toMatchObject({
      status: 'error',
      code: 'missing_region',
      waypointIndex: 0,
    });
  });

  it('routes each segment in drawing order and explicitly closes a loop', async () => {
    const request = await readRequest();
    const router = vi.fn(fixtureRouter());
    await generateRoute(request, router);
    const calls = router.mock.calls;
    expect(calls.at(-1)?.[1]).toEqual(calls.at(-2)?.[2]);
    expect(calls.at(-1)?.[2]).toEqual(calls[0]?.[1]);
  });

  it('searches bounded area placements and returns the best viable route', async () => {
    const request = await readRequest();
    const fixed = await generateRoute(await readRequest(), fixtureRouter());
    if (fixed.status !== 'success') throw new Error('Fixture route failed.');
    request.bounds.radiusMeters = 7000;
    request.settings.searchArea = {
      radiusMeters: 2000,
      candidateCount: 3,
    };
    let callCount = 0;
    const router: RouteSegmenter = async (mode, from, to) => {
      callCount += 1;
      if (callCount === 1)
        throw new ValhallaError('no_route', 'No connected path.');
      return fixtureRouter()(mode, from, to);
    };

    const result = await generateRoute(request, router);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.warnings).toContain(
      'Best of 2 viable placements searched within a 2.0 km radius.',
    );
    expect(result.alternatives?.[0]?.route).toEqual(result.route);
    expect(result.alternatives?.length).toBeLessThanOrEqual(3);
    expect(callCount).toBe(1 + result.waypointCount * 2);
    expect(result.targetGeometry.coordinates[0]).not.toEqual(
      fixed.targetGeometry.coordinates[0],
    );
  });

  it('reports candidate progress without claiming fractional completion', async () => {
    const request = await readRequest();
    request.settings.searchArea = { radiusMeters: 1000, candidateCount: 3 };
    const progress = vi.fn();
    await generateRoute(request, fixtureRouter(), undefined, progress);
    expect(progress.mock.calls).toEqual([
      [{ stage: 'searching', completed: 1, total: 3 }],
      [{ stage: 'searching', completed: 2, total: 3 }],
      [{ stage: 'searching', completed: 3, total: 3 }],
    ]);
  });

  it('returns a clear no-route failure when every area placement is impossible', async () => {
    const request = await readRequest();
    request.settings.searchArea = { radiusMeters: 1000, candidateCount: 2 };
    const router: RouteSegmenter = async () => {
      throw new ValhallaError('no_route', 'No connected path.');
    };
    await expect(generateRoute(request, router)).resolves.toMatchObject({
      status: 'error',
      code: 'no_route',
      message: expect.stringContaining('after trying 2 placements'),
    });
  });

  it('repeats the same bounded search for the same seed and settings', async () => {
    const firstRequest = await readRequest();
    firstRequest.bounds.radiusMeters = 7000;
    firstRequest.settings.searchArea = {
      radiusMeters: 2000,
      candidateCount: 4,
    };
    const secondRequest = structuredClone(firstRequest);
    const first = await generateRoute(firstRequest, fixtureRouter());
    const second = await generateRoute(secondRequest, fixtureRouter());
    expect(first).toEqual(second);
  });

  it('uses scale candidates to compare different physical target sizes', async () => {
    const request = await readRequest();
    request.settings.placement.scale = 0.8;
    const result = await generateRoute(request, fixtureRouter());
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    const targetLength = lineLengthMeters(
      result.targetGeometry,
      request.center,
    );
    expect(targetLength).toBeCloseTo(2400, -1);
  });

  it('returns a typed failure for area searches beyond the projection latitude limit', async () => {
    const request = await readRequest();
    request.center = [1.5, 89];
    request.settings.searchArea = {
      radiusMeters: 1000,
      candidateCount: 4,
    };
    await expect(
      generateRoute(request, fixtureRouter()),
    ).resolves.toMatchObject({
      status: 'error',
      code: 'infeasible_waypoint',
    });
  });

  it('rejects area candidates beyond a configured distance deviation', async () => {
    const request = await readRequest();
    request.bounds.radiusMeters = 7000;
    request.settings.searchArea = {
      radiusMeters: 1000,
      candidateCount: 2,
      maxDistanceDeviationRatio: 0.1,
    };
    const router: RouteSegmenter = async (mode, from, to) => ({
      mode,
      geometry: { type: 'LineString', coordinates: [from, to] },
      distanceMeters: 1000,
    });

    await expect(generateRoute(request, router)).resolves.toMatchObject({
      status: 'error',
      code: 'no_route',
      message: expect.stringContaining(
        'configured 10% distance-deviation limit',
      ),
    });
  });

  it('keeps the best route when the request budget prevents more candidates', async () => {
    const request = await readRequest();
    request.bounds.radiusMeters = 7000;
    request.settings.searchArea = {
      radiusMeters: 1000,
      candidateCount: 4,
      maxRouterRequests: 7,
    };
    const router = vi.fn(fixtureRouter());

    const result = await generateRoute(request, router);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(router).toHaveBeenCalledTimes(7);
    expect(result.warnings).toContain(
      'Search stopped at its 7-request routing limit.',
    );
  });

  it('stops requesting routes when cancellation is signalled', async () => {
    const request = await readRequest();
    request.bounds.radiusMeters = 7000;
    request.settings.searchArea = {
      radiusMeters: 1000,
      candidateCount: 4,
    };
    const controller = new AbortController();
    const router = vi.fn(async (_mode: string, from: LngLat, to: LngLat) => {
      controller.abort();
      return fixtureRouter()('walking', from, to);
    });

    await expect(
      generateRoute(request, router, controller.signal),
    ).resolves.toMatchObject({ status: 'error', code: 'cancelled' });
    expect(router).toHaveBeenCalledOnce();
  });

  it('rejects a segment returned for a different activity mode', async () => {
    const request = await readRequest();
    const router: RouteSegmenter = async (_mode, from, to) => ({
      mode: 'cycling',
      geometry: { type: 'LineString', coordinates: [from, to] },
      distanceMeters: 100,
    });
    await expect(generateRoute(request, router)).resolves.toMatchObject({
      status: 'error',
      code: 'invalid_response',
      waypointIndex: 0,
    });
  });

  it('rejects disconnected segment joins and out-of-bounds waypoints', async () => {
    const request = await readRequest();
    let count = 0;
    const discontinuous: RouteSegmenter = async (mode, from, to) => {
      count += 1;
      const start = count === 2 ? ([from[0] + 0.001, from[1]] as LngLat) : from;
      return {
        mode,
        geometry: { type: 'LineString', coordinates: [start, to] },
        distanceMeters: 200,
      };
    };
    await expect(generateRoute(request, discontinuous)).resolves.toMatchObject({
      status: 'error',
      code: 'route_discontinuity',
    });

    request.bounds.radiusMeters = 100;
    const neverRoute = vi.fn(fixtureRouter());
    await expect(generateRoute(request, neverRoute)).resolves.toMatchObject({
      status: 'error',
      code: 'infeasible_waypoint',
    });
    expect(neverRoute).not.toHaveBeenCalled();
  });

  it('does not silently join unsupported multiple strokes', async () => {
    const request = await readRequest();
    request.drawing.strokes.push({
      ...request.drawing.strokes[0]!,
      id: 'second-stroke',
    });
    const router = vi.fn(fixtureRouter());
    await expect(generateRoute(request, router)).resolves.toMatchObject({
      status: 'error',
      code: 'unsupported_multistroke',
    });
    expect(router).not.toHaveBeenCalled();
  });
});
