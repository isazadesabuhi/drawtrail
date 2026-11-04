import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DrawingPoint } from '@drawtrail/types';
import {
  changeDrawing,
  drawingPreset,
  emptyDrawing,
  fitStrokes,
  redoDrawing,
  resampleStroke,
  simplifyStroke,
  transformDrawing,
  undoDrawing,
  type DrawingHistory,
  type PresetName,
} from './drawing';

describe('deterministic drawing presets', () => {
  it.each(['heart', 'circle', 'square', 'star', 'letter'] as PresetName[])(
    'matches the fixed %s fixture',
    (name) => {
      const fixture = JSON.parse(
        readFileSync(
          new URL(`../fixtures/${name}.json`, import.meta.url),
          'utf8',
        ),
      );
      expect(drawingPreset(name)).toEqual(fixture);
      expect(drawingPreset(name)).toEqual(drawingPreset(name));
      expect(drawingPreset(name).strokes[0]?.closed).toBe(name !== 'letter');
    },
  );
});
describe('drawing geometry', () => {
  it('normalizes with aspect ratio preserved, including vertical lines', () => {
    const stroke = {
      id: 'a',
      label: 'A',
      closed: false,
      points: [
        [0, 0],
        [20, 10],
      ] as DrawingPoint[],
    };
    const fitted = fitStrokes([stroke])[0]!;
    expect(
      (fitted.points[1]![0] - fitted.points[0]![0]) /
        (fitted.points[1]![1] - fitted.points[0]![1]),
    ).toBeCloseTo(2);
    expect(
      fitStrokes([
        {
          ...stroke,
          points: [
            [0, 0],
            [0, 10],
          ],
        },
      ])[0]!.points[0]![0],
    ).toBe(0.5);
    expect(() =>
      fitStrokes([
        {
          ...stroke,
          points: [
            [0, 0],
            [0, 0],
          ],
        },
      ]),
    ).toThrow('only a point');
  });
  it('simplifies redundant points while preserving corners and loop closure', () => {
    const square: DrawingPoint[] = [
      [0, 0],
      [0.5, 0],
      [1, 0],
      [1, 0.5],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    expect(simplifyStroke(square, 0.001, true)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
    expect(simplifyStroke(square, 10, true).length).toBeGreaterThanOrEqual(4);
    expect(
      simplifyStroke(
        [
          [0, 0],
          [0, 0],
        ],
        0.01,
      ),
    ).toEqual([[0, 0]]);
    expect(simplifyStroke([], 0.01)).toEqual([]);
  });
  it('resamples by arc length, keeps original corners and exact endpoints', () => {
    const input: DrawingPoint[] = [
      [0, 0],
      [0.31, 0],
      [0.31, 0.4],
      [0, 0],
    ];
    const result = resampleStroke(input, 0.1);
    expect(result).toContainEqual([0.31, 0]);
    expect(result).toContainEqual([0.31, 0.4]);
    expect(result[0]).toEqual(result.at(-1));
    for (let i = 1; i < result.length; i++)
      expect(
        Math.hypot(
          result[i]![0] - result[i - 1]![0],
          result[i]![1] - result[i - 1]![1],
        ),
      ).toBeLessThanOrEqual(0.100000001);
    expect(
      resampleStroke([
        [0.2, 0.3],
        [0.2, 0.3],
      ]),
    ).toEqual([[0.2, 0.3]]);
    expect(() => resampleStroke(input, 0)).toThrow();
    expect(() => resampleStroke(input, 1e-9)).toThrow('too many points');
  });
  it('moves, rotates, scales and flips without mutating the source or distorting out-of-bounds geometry', () => {
    const square = drawingPreset('square'),
      original = JSON.stringify(square);
    expect(
      transformDrawing(square, { dx: 0.02 }).strokes[0]!.points[0]![0],
    ).toBeCloseTo(square.strokes[0]!.points[0]![0] + 0.02);
    const flipped = transformDrawing(
      transformDrawing(square, { flipX: true }),
      { flipX: true },
    );
    expect(flipped.strokes[0]!.points[0]![0]).toBeCloseTo(
      square.strokes[0]!.points[0]![0],
    );
    expect(
      transformDrawing(square, { degrees: 90, scale: 0.5 }).strokes[0]!.points,
    ).not.toEqual(square.strokes[0]!.points);
    expect(() => transformDrawing(square, { dx: 1 })).toThrow('outside');
    expect(() => transformDrawing(square, { scale: NaN })).toThrow('Invalid');
    expect(JSON.stringify(square)).toBe(original);
  });
});
describe('drawing history', () => {
  it('undoes and redoes multiple strokes and clearing; edits invalidate redo', () => {
    const initial: DrawingHistory = {
      past: [],
      present: emptyDrawing(),
      future: [],
    };
    const one = drawingPreset('letter');
    const two = {
      ...one,
      strokes: [...one.strokes, { ...one.strokes[0]!, id: 'second' }],
    };
    const added = changeDrawing(changeDrawing(initial, one), two);
    const cleared = changeDrawing(added, emptyDrawing());
    expect(undoDrawing(cleared).present).toEqual(two);
    expect(undoDrawing(undoDrawing(cleared)).present).toEqual(one);
    expect(redoDrawing(undoDrawing(cleared)).present.strokes).toHaveLength(0);
    expect(changeDrawing(undoDrawing(cleared), one).future).toEqual([]);
    expect(undoDrawing(initial)).toBe(initial);
    expect(redoDrawing(initial)).toBe(initial);
  });
  it('caps undo history to 50 bounded snapshots', () => {
    let history: DrawingHistory = {
      past: [],
      present: emptyDrawing(),
      future: [],
    };
    for (let i = 0; i < 60; i++)
      history = changeDrawing(history, { ...emptyDrawing(), name: String(i) });
    expect(history.past).toHaveLength(50);
  });
});
