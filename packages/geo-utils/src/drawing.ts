import type { Drawing, DrawingPoint, DrawingStroke } from '@drawtrail/types';

const distance = (a: DrawingPoint, b: DrawingPoint) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
const equal = (a: DrawingPoint, b: DrawingPoint) => distance(a, b) < 1e-10;
export const emptyDrawing = (): Drawing => ({
  version: 1,
  name: 'My drawing',
  source: 'freehand',
  strokes: [],
});

export function fitStrokes(
  strokes: readonly DrawingStroke[],
  padding = 0.12,
): DrawingStroke[] {
  const points = strokes.flatMap((stroke) => [...stroke.points]);
  if (
    !points.length ||
    points.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))
  )
    throw new Error('The drawing has no usable geometry.');
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const extent = Math.max(maxX - minX, maxY - minY);
  if (extent < 1e-10) throw new Error('The drawing is only a point.');
  const scale = (1 - 2 * padding) / extent;
  return strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map(
      ([x, y]) =>
        [
          0.5 + (x - (minX + maxX) / 2) * scale,
          0.5 + (y - (minY + maxY) / 2) * scale,
        ] as DrawingPoint,
    ),
  }));
}

function segmentDistance(
  point: DrawingPoint,
  a: DrawingPoint,
  b: DrawingPoint,
): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t =
    dx || dy
      ? Math.max(
          0,
          Math.min(
            1,
            ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) /
              (dx * dx + dy * dy),
          ),
        )
      : 0;
  return distance(point, [a[0] + t * dx, a[1] + t * dy]);
}

function rdp(
  points: readonly DrawingPoint[],
  tolerance: number,
): DrawingPoint[] {
  if (points.length < 3) return [...points];
  const kept = new Set([0, points.length - 1]);
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let max = tolerance,
      chosen = -1;
    for (let i = start + 1; i < end; i++) {
      const d = segmentDistance(points[i]!, points[start]!, points[end]!);
      if (d > max) {
        max = d;
        chosen = i;
      }
    }
    if (chosen !== -1) {
      kept.add(chosen);
      stack.push([start, chosen], [chosen, end]);
    }
  }
  return [...kept].sort((a, b) => a - b).map((index) => points[index]!);
}

export function simplifyStroke(
  points: readonly DrawingPoint[],
  tolerance = 0.002,
  closed = false,
): DrawingPoint[] {
  if (!Number.isFinite(tolerance) || tolerance < 0)
    throw new Error('Simplification tolerance must be nonnegative.');
  const unique = points.filter(
    (point, index) => index === 0 || !equal(point, points[index - 1]!),
  );
  if (!closed || unique.length < 4) return rdp(unique, tolerance);
  if (!equal(unique[0]!, unique.at(-1)!)) unique.push(unique[0]!);
  let split = 1;
  for (let i = 2; i < unique.length - 1; i++)
    if (distance(unique[0]!, unique[i]!) > distance(unique[0]!, unique[split]!))
      split = i;
  const result = [
    ...rdp(unique.slice(0, split + 1), tolerance).slice(0, -1),
    ...rdp(unique.slice(split), tolerance),
  ];
  // A large tolerance must never turn a closed polygon into a degenerate segment.
  return result.length >= 4 ? result : unique;
}

/** Arc-length samples plus original vertices: corners and exact closure survive. */
export function resampleStroke(
  points: readonly DrawingPoint[],
  spacing = 0.025,
): DrawingPoint[] {
  if (!Number.isFinite(spacing) || spacing <= 0)
    throw new Error('Spacing must be positive.');
  if (points.length < 2) return [...points];
  const cumulative = [0];
  for (let i = 1; i < points.length; i++)
    cumulative.push(cumulative[i - 1]! + distance(points[i - 1]!, points[i]!));
  const total = cumulative.at(-1)!;
  if (total === 0) return [points[0]!];
  if (total / spacing + points.length > 8192)
    throw new Error('Resampling would create too many points.');
  const targets = [...cumulative];
  for (let at = spacing; at < total; at += spacing) targets.push(at);
  targets.sort((a, b) => a - b);
  let segment = 1;
  return targets
    .filter((at, i) => i === 0 || at - targets[i - 1]! > 1e-10)
    .map((at) => {
      while (segment < points.length - 1 && cumulative[segment]! < at)
        segment++;
      const a = points[segment - 1]!,
        b = points[segment]!;
      const length = cumulative[segment]! - cumulative[segment - 1]!;
      const ratio = length ? (at - cumulative[segment - 1]!) / length : 0;
      if (at === total) return points.at(-1)!;
      return [
        a[0] + (b[0] - a[0]) * ratio,
        a[1] + (b[1] - a[1]) * ratio,
      ] as DrawingPoint;
    });
}

export type DrawingTransform = {
  dx?: number;
  dy?: number;
  scale?: number;
  degrees?: number;
  flipX?: boolean;
  flipY?: boolean;
};
export function transformDrawing(
  drawing: Drawing,
  transform: DrawingTransform,
): Drawing {
  const points = drawing.strokes.flatMap((stroke) => [...stroke.points]);
  if (!points.length) return drawing;
  const cx =
    (Math.min(...points.map((p) => p[0])) +
      Math.max(...points.map((p) => p[0]))) /
    2;
  const cy =
    (Math.min(...points.map((p) => p[1])) +
      Math.max(...points.map((p) => p[1]))) /
    2;
  const scale = transform.scale ?? 1,
    angle = ((transform.degrees ?? 0) * Math.PI) / 180;
  if (
    ![scale, angle, transform.dx ?? 0, transform.dy ?? 0].every(
      Number.isFinite,
    ) ||
    scale <= 0
  )
    throw new Error('Invalid drawing transform.');
  const strokes = drawing.strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => {
      const x = (point[0] - cx) * scale * (transform.flipX ? -1 : 1);
      const y = (point[1] - cy) * scale * (transform.flipY ? -1 : 1);
      const next: DrawingPoint = [
        cx + x * Math.cos(angle) - y * Math.sin(angle) + (transform.dx ?? 0),
        cy + x * Math.sin(angle) + y * Math.cos(angle) + (transform.dy ?? 0),
      ];
      if (next.some((value) => value < -1e-10 || value > 1 + 1e-10))
        throw new Error(
          'That would move the drawing outside the canvas. Make it smaller first.',
        );
      return [
        Math.max(0, Math.min(1, next[0])),
        Math.max(0, Math.min(1, next[1])),
      ] as DrawingPoint;
    }),
  }));
  return { ...drawing, strokes };
}

export type PresetName = 'heart' | 'circle' | 'square' | 'star' | 'letter';
export function drawingPreset(name: PresetName): Drawing {
  let points: DrawingPoint[] = [];
  if (name === 'heart')
    points = Array.from({ length: 97 }, (_, i) => {
      const t = (i / 96) * Math.PI * 2;
      return [
        16 * Math.sin(t) ** 3,
        -(
          13 * Math.cos(t) -
          5 * Math.cos(2 * t) -
          2 * Math.cos(3 * t) -
          Math.cos(4 * t)
        ),
      ];
    });
  if (name === 'circle')
    points = Array.from({ length: 65 }, (_, i) => [
      Math.cos((i / 64) * Math.PI * 2),
      Math.sin((i / 64) * Math.PI * 2),
    ]);
  if (name === 'square')
    points = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
  if (name === 'star')
    points = Array.from({ length: 11 }, (_, i) => {
      const radius = i % 2 ? 0.43 : 1,
        t = (i / 10) * Math.PI * 2 - Math.PI / 2;
      return [Math.cos(t) * radius, Math.sin(t) * radius];
    });
  if (name === 'letter')
    points = [
      [0, 1],
      [0, 0],
      [0.5, 0.6],
      [1, 0],
      [1, 1],
    ];
  const closed = name !== 'letter';
  if (closed) points[points.length - 1] = points[0]!;
  return {
    version: 1,
    name:
      name === 'letter'
        ? 'Letter M'
        : `${name[0]!.toUpperCase()}${name.slice(1)}`,
    source: 'preset',
    strokes: fitStrokes([
      { id: `preset-${name}`, label: 'Stroke 1', closed, points },
    ]),
  };
}

export interface DrawingHistory {
  past: Drawing[];
  present: Drawing;
  future: Drawing[];
}
export function changeDrawing(
  history: DrawingHistory,
  drawing: Drawing,
): DrawingHistory {
  return {
    past: [...history.past, history.present].slice(-50),
    present: drawing,
    future: [],
  };
}
export function undoDrawing(history: DrawingHistory): DrawingHistory {
  return history.past.length
    ? {
        past: history.past.slice(0, -1),
        present: history.past.at(-1)!,
        future: [history.present, ...history.future].slice(0, 50),
      }
    : history;
}
export function redoDrawing(history: DrawingHistory): DrawingHistory {
  return history.future.length
    ? {
        past: [...history.past, history.present].slice(-50),
        present: history.future[0]!,
        future: history.future.slice(1),
      }
    : history;
}
