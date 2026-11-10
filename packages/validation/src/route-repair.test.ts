import { describe, expect, it } from 'vitest';
import { routeRepairRequestSchema } from './route-repair';

const line = {
  type: 'LineString' as const,
  coordinates: [
    [4.83, 45.76] as [number, number],
    [4.84, 45.77] as [number, number],
  ],
};

describe('route repair validation', () => {
  it('accepts a repair range and optional waypoints in WGS84 order', () => {
    expect(
      routeRepairRequestSchema.safeParse({
        mode: 'cycling',
        route: line,
        targetGeometry: line,
        startRatio: 0.2,
        endRatio: 0.7,
        viaWaypoints: [[4.835, 45.765]],
      }).success,
    ).toBe(true);
  });

  it('rejects overlapping or too-short sections', () => {
    expect(
      routeRepairRequestSchema.safeParse({
        mode: 'walking',
        route: line,
        targetGeometry: line,
        startRatio: 0.5,
        endRatio: 0.55,
        viaWaypoints: [],
      }).success,
    ).toBe(false);
  });

  it('rejects invalid and excessive via waypoints', () => {
    const base = {
      mode: 'walking',
      route: line,
      targetGeometry: line,
      startRatio: 0.1,
      endRatio: 0.9,
    };
    expect(
      routeRepairRequestSchema.safeParse({
        ...base,
        viaWaypoints: [[181, 45]],
      }).success,
    ).toBe(false);
    expect(
      routeRepairRequestSchema.safeParse({
        ...base,
        viaWaypoints: Array.from({ length: 5 }, () => [4.83, 45.76]),
      }).success,
    ).toBe(false);
  });
});
