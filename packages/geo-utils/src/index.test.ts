import { describe, expect, it } from 'vitest';
import { isInsideLyon, LYON_BOUNDS, LYON_CENTER } from './index';

describe('Lyon editor region', () => {
  it('contains the default center and includes its exact bounds', () => {
    expect(isInsideLyon(LYON_CENTER)).toBe(true);
    expect(isInsideLyon(LYON_BOUNDS[0])).toBe(true);
    expect(isInsideLyon(LYON_BOUNDS[1])).toBe(true);
  });
  it('rejects swapped Lyon coordinates, out-of-area points, and non-finite values', () => {
    for (const point of [
      [45.764, 4.8357],
      [4.64, 45.76],
      [4.84, 45.91],
      [NaN, 45.76],
      [4.84, Infinity],
    ] as const) {
      expect(isInsideLyon(point)).toBe(false);
    }
  });
});
