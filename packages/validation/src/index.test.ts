import { describe, expect, it } from 'vitest';
import {
  activityModeSchema,
  apiEnvelopeSchema,
  generationJobAcceptedSchema,
  generationJobStatusSchema,
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

describe('versioned API and generation job contracts', () => {
  const envelope = apiEnvelopeSchema(activityModeSchema);
  it('accepts versioned success and error envelopes only', () => {
    expect(
      envelope.safeParse({
        apiVersion: 'v1',
        status: 'success',
        data: 'walking',
        error: null,
      }).success,
    ).toBe(true);
    expect(
      envelope.safeParse({
        apiVersion: 'v1',
        status: 'error',
        data: null,
        error: { code: 'not_found', message: 'Missing.', warnings: [] },
      }).success,
    ).toBe(true);
    expect(
      envelope.safeParse({
        apiVersion: 'v2',
        status: 'success',
        data: 'walking',
        error: null,
      }).success,
    ).toBe(false);
  });

  it('validates accepted job and all persisted state fields', () => {
    const id = 'f9b1d832-7a22-4ac0-987b-c99c017fc472';
    expect(
      generationJobAcceptedSchema.parse({
        id,
        state: 'pending',
        statusUrl: `/api/v1/generations/${id}`,
        reused: false,
      }).id,
    ).toBe(id);
    expect(
      generationJobStatusSchema.safeParse({
        id,
        state: 'running',
        progress: { stage: 'searching', completed: 2, total: 8 },
        result: null,
        error: null,
        createdAt: '2026-11-05T10:00:00.000Z',
        updatedAt: '2026-11-05T10:00:02.000Z',
        startedAt: '2026-11-05T10:00:01.000Z',
        completedAt: null,
      }).success,
    ).toBe(true);
  });
});
