import { describe, expect, it } from 'vitest';
import type { GeoJSONLineString, LngLat } from '@drawtrail/types';
import {
  lineLengthMeters,
  sampleOrderedWaypoints,
  scoreLineSimilarity,
} from './routing';

const anchor: LngLat = [4.8357, 45.764];
const corner: LngLat = [4.837, 45.764];
const top: LngLat = [4.837, 45.765];
const lShape: GeoJSONLineString = {
  type: 'LineString',
  coordinates: [anchor, corner, top],
};

describe('routing geometry utilities', () => {
  it('samples deterministically in route order and retains a strong corner', () => {
    const first = sampleOrderedWaypoints(lShape, anchor, 3);
    const second = sampleOrderedWaypoints(lShape, anchor, 3);
    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first[0]?.[0]).toBeCloseTo(anchor[0], 9);
    expect(first[0]?.[1]).toBeCloseTo(anchor[1], 9);
    expect(first[1]?.[0]).toBeCloseTo(corner[0], 9);
    expect(first[1]?.[1]).toBeCloseTo(corner[1], 9);
    expect(first[2]?.[0]).toBeCloseTo(top[0], 9);
    expect(first[2]?.[1]).toBeCloseTo(top[1], 9);
  });

  it('uses projected meters for lengths and rejects short or invalid samples', () => {
    expect(lineLengthMeters(lShape, anchor)).toBeGreaterThan(150);
    expect(() => sampleOrderedWaypoints(lShape, anchor, 1)).toThrow();
    expect(() =>
      sampleOrderedWaypoints(
        { type: 'LineString', coordinates: [anchor, anchor] },
        anchor,
        4,
      ),
    ).toThrow();
  });

  it('scores an identical fixture above a distorted path', () => {
    const distorted: GeoJSONLineString = {
      type: 'LineString',
      coordinates: [anchor, [4.837, 45.763], top],
    };
    const identicalScore = scoreLineSimilarity(lShape, lShape, anchor);
    const distortedScore = scoreLineSimilarity(lShape, distorted, anchor);
    expect(identicalScore.score).toBeCloseTo(1);
    expect(identicalScore.normalizedError).toBeCloseTo(0);
    expect(distortedScore.score).toBeLessThan(identicalScore.score);
  });
});
