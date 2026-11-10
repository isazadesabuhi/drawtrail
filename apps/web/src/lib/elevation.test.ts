import { describe, expect, it } from 'vitest';
import { routeElevationSchema } from '@drawtrail/validation';
import { sampleElevationLocations, summarizeElevation } from './elevation';

describe('route elevation sampling and totals', () => {
  it('samples along bends, keeps endpoints and maps distance to the routed total', () => {
    const samples = sampleElevationLocations(
      [
        [4.8, 45.7],
        [4.8, 45.701],
        [4.801, 45.701],
      ],
      200,
    );
    expect(samples[0]).toEqual({ coordinate: [4.8, 45.7], distanceMeters: 0 });
    expect(samples.at(-1)).toEqual({
      coordinate: [4.801, 45.701],
      distanceMeters: 200,
    });
    expect(samples.length).toBeGreaterThan(3);
    for (const {
      coordinate: [lon, lat],
    } of samples) {
      expect(Math.abs(lon - 4.8) < 1e-6 || Math.abs(lat - 45.701) < 1e-6).toBe(
        true,
      );
    }
  });
  it('caps long routes and handles duplicate geometry points', () => {
    const samples = sampleElevationLocations(
      [
        [4.8, 45.7],
        [4.8, 45.7],
        [5.6, 45.7],
      ],
      62_000,
    );
    expect(samples).toHaveLength(1024);
    expect(samples.at(-1)?.distanceMeters).toBe(62_000);
    expect(samples.every((p) => p.coordinate.every(Number.isFinite))).toBe(
      true,
    );
  });
  it('reports real climbs and descents and accepts flat sea-level terrain', () => {
    expect(
      summarizeElevation([0, 30, 60, 90], [100, 120, 110, 125]),
    ).toMatchObject({
      status: 'complete',
      ascentMeters: 35,
      descentMeters: 10,
    });
    expect(summarizeElevation([0, 30], [0, 0])).toMatchObject({
      status: 'complete',
      ascentMeters: 0,
      descentMeters: 0,
    });
    expect(summarizeElevation([0, 30], [-20, -10])).toMatchObject({
      status: 'complete',
      ascentMeters: 10,
    });
  });
  it('distinguishes partial, missing, and invalid data without fabricating totals', () => {
    const partial = summarizeElevation([0, 30, 60], [100, null, 120]);
    expect(partial).toMatchObject({
      status: 'partial',
      ascentMeters: null,
      descentMeters: null,
    });
    expect(routeElevationSchema.safeParse(partial).success).toBe(true);
    expect(summarizeElevation([0, 30], [null, -32768])).toMatchObject({
      status: 'unavailable',
      reason: 'missing_data',
    });
    expect(summarizeElevation([0, 30], [100])).toMatchObject({
      reason: 'invalid_response',
    });
    expect(summarizeElevation([0, 30], [100, Number.NaN])).toMatchObject({
      reason: 'invalid_response',
    });
    expect(
      routeElevationSchema.safeParse({ ...partial, ascentMeters: 20 }).success,
    ).toBe(false);
    expect(
      routeElevationSchema.safeParse({
        ...partial,
        samples: [
          { distanceMeters: 30, elevationMeters: null },
          { distanceMeters: 0, elevationMeters: 100 },
        ],
      }).success,
    ).toBe(false);
  });
});
