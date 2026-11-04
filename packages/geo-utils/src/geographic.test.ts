import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Drawing, LngLat } from '@drawtrail/types';
import {
  drawingToGeoJSON,
  generatePlacementCandidates,
  projectLngLat,
  unprojectEastNorth,
  validateDrawingGeometry,
} from './geographic';
import { LYON_CENTER } from './index';

const square = JSON.parse(
  readFileSync(resolve('packages/geo-utils/fixtures/square.json'), 'utf8'),
) as Drawing;
const geographicFixtures = [
  'heart',
  'circle',
  'letter',
  'open-stroke',
  'figure-eight',
].map(
  (name) =>
    JSON.parse(
      readFileSync(resolve(`packages/geo-utils/fixtures/${name}.json`), 'utf8'),
    ) as Drawing,
);

describe('local metric projection', () => {
  it('round-trips a Lyon-area point within the documented sub-centimetre tolerance', () => {
    const point: LngLat = [4.8421, 45.7692];
    const restored = unprojectEastNorth(
      projectLngLat(point, LYON_CENTER),
      LYON_CENTER,
    );
    expect(
      Math.hypot(
        (restored[0] - point[0]) * 78_000,
        (restored[1] - point[1]) * 111_000,
      ),
    ).toBeLessThan(0.001);
  });

  it('rejects invalid positions and anchors too close to a pole', () => {
    expect(() => projectLngLat([181, 45], LYON_CENTER)).toThrow(RangeError);
    expect(() => projectLngLat([0, 0], [0, 86])).toThrow(RangeError);
    expect(() => projectLngLat([6.5, 45.764], LYON_CENTER)).toThrow(RangeError);
    expect(() => unprojectEastNorth([Number.NaN, 0], LYON_CENTER)).toThrow(
      RangeError,
    );
  });
});

describe('drawing footprint conversion', () => {
  it('keeps a square proportionate in a 1 km footprint at Lyon', () => {
    const footprint = drawingToGeoJSON(square, LYON_CENTER, {
      widthMeters: 1000,
      heightMeters: 1000,
    });
    const coordinates = footprint.features[0]!.geometry.coordinates;
    const projected = coordinates.map((point) =>
      projectLngLat(point, LYON_CENTER),
    );
    const xs = projected.map(([x]) => x);
    const ys = projected.map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(width).toBeCloseTo(1000, 0);
    expect(height).toBeCloseTo(1000, 0);
    expect(width / height).toBeCloseTo(1, 3);
  });

  it('fits a wide stroke inside the box without stretching its aspect ratio', () => {
    const wide: Drawing = {
      ...square,
      strokes: [
        {
          ...square.strokes[0]!,
          closed: false,
          points: [
            [0, 0.5],
            [1, 0.5],
          ],
        },
      ],
    };
    const [start, end] = drawingToGeoJSON(wide, LYON_CENTER, {
      widthMeters: 1000,
      heightMeters: 500,
    }).features[0]!.geometry.coordinates;
    const startXY = projectLngLat(start!, LYON_CENTER);
    const endXY = projectLngLat(end!, LYON_CENTER);
    expect(
      Math.hypot(endXY[0] - startXY[0], endXY[1] - startXY[1]),
    ).toBeCloseTo(1000, 0);
  });

  it('applies scale, rotation and bounded translation around the anchor', () => {
    const baseline = drawingToGeoJSON(square, LYON_CENTER, {
      widthMeters: 1000,
      heightMeters: 1000,
    });
    const moved = drawingToGeoJSON(square, LYON_CENTER, {
      widthMeters: 1000,
      heightMeters: 1000,
      scale: 2,
      rotationDegrees: 90,
      offsetEastMeters: 100,
      offsetNorthMeters: -50,
    });
    const centroid = (coords: readonly LngLat[]): [number, number] => {
      const xy = coords
        .slice(0, 4)
        .map((point) => projectLngLat(point, LYON_CENTER));
      return [
        xy.reduce((sum, [east]) => sum + east, 0) / xy.length,
        xy.reduce((sum, [, north]) => sum + north, 0) / xy.length,
      ];
    };
    const baselineCenter = centroid(baseline.features[0]!.geometry.coordinates);
    const movedCenter = centroid(moved.features[0]!.geometry.coordinates);
    expect(
      Math.hypot(
        movedCenter[0] - baselineCenter[0],
        movedCenter[1] - baselineCenter[1],
      ),
    ).toBeCloseTo(111.8, 0);
    expect(moved.features[0]!.geometry.coordinates).not.toEqual(
      baseline.features[0]!.geometry.coordinates,
    );
  });
});

describe('deterministic placement candidates', () => {
  const options = {
    seed: 'lyon-route-1',
    count: 30,
    bounds: {
      minEastMeters: -500,
      maxEastMeters: 500,
      minNorthMeters: -300,
      maxNorthMeters: 300,
    },
  } as const;

  it('returns identical bounded placements for the same seed', () => {
    const first = generatePlacementCandidates(options);
    expect(generatePlacementCandidates(options)).toEqual(first);
    expect(first).toHaveLength(30);
    expect(
      first.every(
        (candidate) =>
          candidate.offsetEastMeters >= -500 &&
          candidate.offsetEastMeters <= 500,
      ),
    ).toBe(true);
    expect(
      first.every(
        (candidate) =>
          candidate.offsetNorthMeters >= -300 &&
          candidate.offsetNorthMeters <= 300,
      ),
    ).toBe(true);
  });

  it('changes candidates with the seed and rejects invalid search bounds', () => {
    expect(
      generatePlacementCandidates({ ...options, seed: 'another-seed' }),
    ).not.toEqual(generatePlacementCandidates(options));
    expect(() =>
      generatePlacementCandidates({ ...options, count: 10_001 }),
    ).toThrow(RangeError);
    expect(() =>
      generatePlacementCandidates({
        ...options,
        bounds: { ...options.bounds, minEastMeters: 501 },
      }),
    ).toThrow(RangeError);
  });
});

describe('drawing geometry validity', () => {
  it('keeps canonical heart, circle, letter, open-stroke and figure-eight fixtures usable', () => {
    for (const drawing of geographicFixtures) {
      expect(validateDrawingGeometry(drawing).valid, drawing.name).toBe(true);
      expect(
        drawingToGeoJSON(drawing, LYON_CENTER, {
          widthMeters: 1000,
          heightMeters: 1000,
        }).features.length,
      ).toBe(drawing.strokes.length);
    }
    expect(
      validateDrawingGeometry(geographicFixtures.at(-1)!).warnings[0]?.code,
    ).toBe('self_intersection');
  });

  it('accepts canonical shapes and returns intentional crossings as warnings', () => {
    expect(validateDrawingGeometry(square).valid).toBe(true);
    const figureEight: Drawing = {
      ...square,
      strokes: [
        {
          id: 'figure-eight',
          label: 'Figure eight',
          closed: true,
          points: [
            [0.1, 0.1],
            [0.9, 0.9],
            [0.1, 0.9],
            [0.9, 0.1],
            [0.1, 0.1],
          ],
        },
      ],
    };
    const result = validateDrawingGeometry(figureEight);
    expect(result.valid).toBe(true);
    expect(result.warnings.map(({ code }) => code)).toContain(
      'self_intersection',
    );
    expect(result.errors).toEqual([]);
  });

  it('returns typed errors for duplicate, non-finite, out-of-range and degenerate strokes', () => {
    const malformed = (
      points: Drawing['strokes'][number]['points'],
    ): Drawing => ({
      ...square,
      strokes: [{ ...square.strokes[0]!, closed: false, points }],
    });
    expect(
      validateDrawingGeometry(
        malformed([
          [0.1, 0.1],
          [0.1, 0.1],
        ]),
      ).errors[0]?.code,
    ).toBe('duplicate_points');
    expect(
      validateDrawingGeometry(
        malformed([
          [0.1, 0.1],
          [Number.NaN, 0.2],
        ]),
      ).errors[0]?.code,
    ).toBe('non_finite_point');
    expect(
      validateDrawingGeometry(
        malformed([
          [0.1, 0.1],
          [1.2, 0.2],
        ]),
      ).errors[0]?.code,
    ).toBe('out_of_bounds');
    expect(
      validateDrawingGeometry({ ...square, strokes: [] }).errors[0]?.code,
    ).toBe('no_strokes');
    const zeroArea: Drawing = {
      ...square,
      strokes: [
        {
          ...square.strokes[0]!,
          points: [
            [0.1, 0.5],
            [0.5, 0.5],
            [0.9, 0.5],
            [0.1, 0.5],
          ],
        },
      ],
    };
    expect(validateDrawingGeometry(zeroArea).errors[0]?.code).toBe(
      'degenerate_closed_stroke',
    );
  });
});
