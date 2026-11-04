import { describe, expect, it } from 'vitest';
import { traceSilhouette, type RasterPixels } from './silhouette';

function pixels(
  predicate: (x: number, y: number) => boolean,
  gray = 0,
): RasterPixels {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const at = (y * 32 + x) * 4,
        color = predicate(x, y) ? gray : 255;
      data[at] = data[at + 1] = data[at + 2] = color;
      data[at + 3] = 255;
    }
  return { width: 32, height: 32, data };
}
describe('single-silhouette contour prototype', () => {
  it('returns an ordered closed square matching the fixed PNG pixel layout', () => {
    const result = traceSilhouette(
      pixels((x, y) => x >= 8 && x < 24 && y >= 8 && y < 24),
    );
    const stroke = result.strokes[0]!;
    expect(stroke.closed).toBe(true);
    expect(stroke.points).toHaveLength(5);
    for (const point of stroke.points)
      for (const value of point)
        expect(
          Math.min(Math.abs(value - 0.12), Math.abs(value - 0.88)),
        ).toBeLessThan(1e-8);
    expect(stroke.points[0]).toEqual(stroke.points.at(-1));
  });
  it('rejects separate components, holes, low contrast and empty images', () => {
    expect(() =>
      traceSilhouette(pixels((x, y) => (x < 5 && y < 5) || (x > 25 && y > 25))),
    ).toThrow('separate');
    expect(() =>
      traceSilhouette(
        pixels(
          (x, y) =>
            x >= 4 &&
            x < 28 &&
            y >= 4 &&
            y < 28 &&
            !(x >= 10 && x < 20 && y >= 10 && y < 20),
        ),
      ),
    ).toThrow('Holes');
    expect(() => traceSilhouette(pixels((x) => x < 16, 100))).toThrow(
      'high-contrast',
    );
    expect(() => traceSilhouette(pixels(() => false))).toThrow();
  });
});
