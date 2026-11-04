import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawingSchema, drawingDraftSchema } from './index';

const fixture = {
  version: 1,
  name: 'Line',
  source: 'freehand',
  strokes: [
    {
      id: 'a',
      label: 'A',
      closed: false,
      points: [
        [0.1, 0.2],
        [0.8, 0.9],
      ],
    },
  ],
};
describe('canonical drawing validation', () => {
  it.each([
    'heart',
    'circle',
    'square',
    'star',
    'letter',
    'open-stroke',
    'figure-eight',
  ])('validates the fixed %s fixture', (name) => {
    const fixture = JSON.parse(
      readFileSync(
        new URL(`../../geo-utils/fixtures/${name}.json`, import.meta.url),
        'utf8',
      ),
    );
    expect(drawingSchema.safeParse(fixture).success).toBe(true);
  });
  it('accepts a normalized ordered stroke and an empty editor draft', () => {
    expect(drawingSchema.parse(fixture)).toEqual(fixture);
    expect(drawingSchema.safeParse({ ...fixture, strokes: [] }).success).toBe(
      true,
    );
    expect(
      drawingDraftSchema.safeParse({
        version: 1,
        drawing: fixture,
        selectedStrokeId: 'a',
      }).success,
    ).toBe(true);
  });
  it.each(
    [
      [
        [NaN, 0.2],
        [0.8, 0.9],
      ],
      [
        [-0.1, 0.2],
        [0.8, 0.9],
      ],
      [
        [0.1, 1.1],
        [0.8, 0.9],
      ],
      [
        [0.1, 0.2],
        [0.1, 0.2],
      ],
    ].map((points) => ({ points })),
  )('rejects invalid or degenerate coordinates', ({ points }) => {
    expect(
      drawingSchema.safeParse({
        ...fixture,
        strokes: [{ ...fixture.strokes[0], points }],
      }).success,
    ).toBe(false);
  });
  it('requires explicit closure, unique IDs, bounded counts and known schema versions', () => {
    expect(
      drawingSchema.safeParse({
        ...fixture,
        strokes: [{ ...fixture.strokes[0], closed: true }],
      }).success,
    ).toBe(false);
    expect(
      drawingSchema.safeParse({
        ...fixture,
        strokes: [fixture.strokes[0], fixture.strokes[0]],
      }).success,
    ).toBe(false);
    expect(
      drawingSchema.safeParse({
        ...fixture,
        strokes: Array.from({ length: 25 }, (_, i) => ({
          ...fixture.strokes[0],
          id: String(i),
        })),
      }).success,
    ).toBe(false);
    expect(drawingSchema.safeParse({ ...fixture, version: 2 }).success).toBe(
      false,
    );
    expect(
      drawingDraftSchema.safeParse({
        version: 1,
        drawing: fixture,
        selectedStrokeId: null,
        startPoint: [4.8, 45.7],
      }).success,
    ).toBe(false);
  });
});
