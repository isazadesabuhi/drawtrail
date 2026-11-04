import { describe, expect, it } from 'vitest';
import { activityModeSchema, lngLatSchema } from './index';

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
});
