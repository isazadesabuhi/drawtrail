import { lineLengthMeters } from '@drawtrail/geo-utils';
import { describe, expect, it, vi } from 'vitest';
import type { RouteRepairRequest } from '@drawtrail/validation';
import { repairRouteSection, type RepairRouteSegmenter } from './route-repair';
import { ValhallaError } from './valhalla-client';

const route: RouteRepairRequest['route'] = {
  type: 'LineString',
  coordinates: Array.from(
    { length: 21 },
    (_, index) => [4.83 + index * 0.0002, 45.76] as [number, number],
  ),
};
const request: RouteRepairRequest = {
  mode: 'cycling',
  route,
  targetGeometry: route,
  startRatio: 0.3,
  endRatio: 0.7,
  viaWaypoints: [[4.832, 45.7608]],
};

function router(): RepairRouteSegmenter {
  return async (mode, from, to) => ({
    mode,
    geometry: { type: 'LineString', coordinates: [from, to] },
    distanceMeters: lineLengthMeters(
      { type: 'LineString', coordinates: [from, to] },
      route.coordinates[0]!,
    ),
  });
}

describe('route repair', () => {
  it('re-routes the selected section through the supplied waypoint in the same activity', async () => {
    const segmenter = vi.fn(router());
    const result = await repairRouteSection(request, segmenter);

    expect(segmenter).toHaveBeenCalled();
    expect(segmenter.mock.calls.every(([mode]) => mode === 'cycling')).toBe(
      true,
    );
    expect(result.route.properties.mode).toBe('cycling');
    expect(result.route.geometry.coordinates).toContainEqual(
      request.viaWaypoints[0],
    );
    expect(result.distanceMeters).toBeGreaterThan(0);
    expect(result.waypointCount).toBeGreaterThan(2);
    expect(result.similarityScore).toBeGreaterThanOrEqual(0);
    expect(result.retracingMeters).toBeGreaterThanOrEqual(0);
  });

  it('checks continuity between every router-generated segment', async () => {
    const disconnected: RepairRouteSegmenter = async (mode, from, to) => ({
      mode,
      geometry: {
        type: 'LineString',
        coordinates: [[from[0] + 0.001, from[1]], to],
      },
      distanceMeters: 100,
    });
    await expect(repairRouteSection(request, disconnected)).rejects.toThrow(
      'did not join within 2 m',
    );
  });

  it('surfaces a router error without returning partial geometry', async () => {
    const failed: RepairRouteSegmenter = async () => {
      throw new ValhallaError(
        'no_route',
        'No legal route connects these waypoints.',
      );
    };
    await expect(repairRouteSection(request, failed)).rejects.toMatchObject({
      code: 'no_route',
    });
  });
});
