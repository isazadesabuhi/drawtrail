import { describe, expect, it } from 'vitest';
import {
  activityModeSchema,
  geoJSONLineFeatureCollectionSchema,
  lngLatSchema,
  lyonLngLatSchema,
} from './index';

describe('shared activity validation', () => {
  it.each(['walking', 'running', 'cycling'])('accepts %s', (activity) => {
    expect(activityModeSchema.parse(activity)).toBe(activity);
  });
  it('rejects an unsupported activity', () => {
    expect(activityModeSchema.safeParse('driving').success).toBe(false);
  });
});

describe('WGS84 coordinates', () => {
  it('accepts longitude-latitude boundaries', () => {
    expect(lngLatSchema.parse([-180, -90])).toEqual([-180, -90]);
    expect(lngLatSchema.parse([180, 90])).toEqual([180, 90]);
  });
  it.each([
    [181, 45],
    [4, 91],
    [NaN, 45],
    [4, Infinity],
    ['4.8', 45],
    [4],
    [4, 45, 0],
  ])('rejects invalid coordinates: %j', (...point) => {
    expect(lngLatSchema.safeParse(point).success).toBe(false);
  });
  it('uses GeoJSON longitude-latitude order for the Lyon editor region', () => {
    expect(lyonLngLatSchema.safeParse([4.8357, 45.764]).success).toBe(true);
    expect(lyonLngLatSchema.safeParse([45.764, 4.8357]).success).toBe(false);
    expect(lyonLngLatSchema.safeParse([181, 45.764]).success).toBe(false);
    expect(lyonLngLatSchema.safeParse([4.8357, 91]).success).toBe(false);
  });
  it('validates a GeoJSON line feature collection', () => {
    expect(
      geoJSONLineFeatureCollectionSchema.safeParse({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'target-1',
            properties: { kind: 'target' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [4.8, 45.7],
                [4.9, 45.8],
              ],
            },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      geoJSONLineFeatureCollectionSchema.safeParse({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [45.7, 4.8],
                [45.8, 4.9],
              ],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
