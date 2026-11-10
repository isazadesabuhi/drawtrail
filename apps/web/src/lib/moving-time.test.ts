import { describe, expect, it } from 'vitest';
import {
  defaultMovingRate,
  estimateMovingTimeSeconds,
  formatMovingTime,
} from './moving-time';

describe('moving time estimates', () => {
  it.each([
    ['walking', 10, 3000],
    ['running', 6, 1800],
    ['cycling', 20, 900],
  ] as const)(
    'converts %s rate to moving time in seconds',
    (mode, rate, expectedSeconds) => {
      expect(estimateMovingTimeSeconds(5000, mode, rate)).toBe(expectedSeconds);
    },
  );

  it('provides activity-specific starting rates', () => {
    expect(defaultMovingRate('walking')).toBe(10);
    expect(defaultMovingRate('running')).toBe(6);
    expect(defaultMovingRate('cycling')).toBe(18);
  });

  it('rejects invalid rates and distances', () => {
    expect(estimateMovingTimeSeconds(1000, 'walking', 0)).toBeNull();
    expect(estimateMovingTimeSeconds(1000, 'running', 61)).toBeNull();
    expect(estimateMovingTimeSeconds(1000, 'cycling', 2)).toBeNull();
    expect(estimateMovingTimeSeconds(1000, 'cycling', Number.NaN)).toBeNull();
    expect(estimateMovingTimeSeconds(0, 'walking', 10)).toBeNull();
    expect(
      estimateMovingTimeSeconds(Number.POSITIVE_INFINITY, 'walking', 10),
    ).toBeNull();
  });

  it.each([
    [1800, '30 min'],
    [3600, '1 hr'],
    [4500, '1 hr 15 min'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatMovingTime(seconds)).toBe(expected);
  });
});
