import type {
  Drawing,
  DrawingPoint,
  DrawingStroke,
  EastNorth,
  GeoJSONFeatureCollection,
  LngLat,
} from '@drawtrail/types';

const EARTH_RADIUS_METERS = 6_371_008.8;
const MAX_PROJECTION_LATITUDE = 85;
const MAX_LOCAL_DISTANCE_METERS = 100_000;
const EPSILON = 1e-9;

function assertLngLat(point: LngLat, name: string) {
  if (
    !Array.isArray(point) ||
    point.length !== 2 ||
    !Number.isFinite(point[0]) ||
    !Number.isFinite(point[1]) ||
    point[0] < -180 ||
    point[0] > 180 ||
    point[1] < -90 ||
    point[1] > 90
  ) {
    throw new RangeError(`${name} must be WGS84 [longitude, latitude].`);
  }
}

/**
 * Project WGS84 coordinates onto a local equirectangular East/North plane.
 * This is accurate for the small Lyon-area footprints in this phase; use a
 * geodesic or regional projection for large areas. Distances are metres.
 */
export function projectLngLat(point: LngLat, anchor: LngLat): EastNorth {
  assertLngLat(point, 'Point');
  assertLngLat(anchor, 'Anchor');
  if (Math.abs(anchor[1]) > MAX_PROJECTION_LATITUDE)
    throw new RangeError('Projection anchors must be below 85° latitude.');
  let deltaLongitude = ((point[0] - anchor[0] + 540) % 360) - 180;
  if (deltaLongitude === -180 && point[0] - anchor[0] > 0) deltaLongitude = 180;
  const anchorRadians = (anchor[1] * Math.PI) / 180;
  const projected: EastNorth = [
    EARTH_RADIUS_METERS *
      ((deltaLongitude * Math.PI) / 180) *
      Math.cos(anchorRadians),
    EARTH_RADIUS_METERS * (((point[1] - anchor[1]) * Math.PI) / 180),
  ];
  if (Math.hypot(...projected) > MAX_LOCAL_DISTANCE_METERS)
    throw new RangeError(
      'Use the local projection only within 100 km of its anchor.',
    );
  return projected;
}

/** Inverse of projectLngLat, returning normalized WGS84 [longitude, latitude]. */
export function unprojectEastNorth(
  position: EastNorth,
  anchor: LngLat,
): LngLat {
  assertLngLat(anchor, 'Anchor');
  if (
    !Array.isArray(position) ||
    position.length !== 2 ||
    !Number.isFinite(position[0]) ||
    !Number.isFinite(position[1])
  ) {
    throw new RangeError(
      'Projected coordinates must be finite East/North metres.',
    );
  }
  if (Math.abs(anchor[1]) > MAX_PROJECTION_LATITUDE)
    throw new RangeError('Projection anchors must be below 85° latitude.');
  if (Math.hypot(...position) > MAX_LOCAL_DISTANCE_METERS)
    throw new RangeError(
      'Use the local projection only within 100 km of its anchor.',
    );
  const anchorRadians = (anchor[1] * Math.PI) / 180;
  const longitude =
    anchor[0] +
    position[0] /
      (EARTH_RADIUS_METERS * Math.cos(anchorRadians)) /
      (Math.PI / 180);
  const latitude =
    anchor[1] + position[1] / EARTH_RADIUS_METERS / (Math.PI / 180);
  if (latitude < -90 || latitude > 90)
    throw new RangeError('Projected point lies outside WGS84 latitude bounds.');
  return [((longitude + 540) % 360) - 180, latitude];
}

export interface DrawingPlacement {
  /** Maximum permitted horizontal extent in metres. */
  widthMeters: number;
  /** Maximum permitted vertical extent in metres. */
  heightMeters: number;
  rotationDegrees?: number;
  scale?: number;
  offsetEastMeters?: number;
  offsetNorthMeters?: number;
}

/** Fit normalized drawing strokes in a metric box without changing their proportions. */
export function drawingToGeoJSON(
  drawing: Drawing,
  anchor: LngLat,
  placement: DrawingPlacement,
): GeoJSONFeatureCollection<{
  strokeId: string;
  label: string;
  closed: boolean;
}> {
  assertLngLat(anchor, 'Anchor');
  const { widthMeters, heightMeters } = placement;
  const rotationDegrees = placement.rotationDegrees ?? 0;
  const scale = placement.scale ?? 1;
  const offsetEastMeters = placement.offsetEastMeters ?? 0;
  const offsetNorthMeters = placement.offsetNorthMeters ?? 0;
  if (
    ![
      widthMeters,
      heightMeters,
      rotationDegrees,
      scale,
      offsetEastMeters,
      offsetNorthMeters,
    ].every(Number.isFinite) ||
    widthMeters <= 0 ||
    heightMeters <= 0 ||
    widthMeters > 20_000 ||
    heightMeters > 20_000 ||
    scale <= 0 ||
    scale > 5 ||
    Math.abs(offsetEastMeters) > 50_000 ||
    Math.abs(offsetNorthMeters) > 50_000
  ) {
    throw new RangeError(
      'Placement dimensions and transform must be finite and positive.',
    );
  }
  if (!drawing.strokes.length)
    throw new RangeError('Drawing has no strokes to place.');
  const points = drawing.strokes.flatMap((stroke) => [...stroke.points]);
  if (
    points.some(
      ([x, y]) =>
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        x > 1 ||
        y < 0 ||
        y > 1,
    )
  ) {
    throw new RangeError('Drawing points must be finite and normalized.');
  }
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (Math.max(spanX, spanY) < EPSILON)
    throw new RangeError('Drawing geometry is degenerate.');
  const fitScale = Math.min(
    spanX > 0 ? widthMeters / spanX : Number.POSITIVE_INFINITY,
    spanY > 0 ? heightMeters / spanY : Number.POSITIVE_INFINITY,
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const radians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    type: 'FeatureCollection',
    features: drawing.strokes.map((stroke) => ({
      type: 'Feature',
      id: stroke.id,
      properties: {
        strokeId: stroke.id,
        label: stroke.label,
        closed: stroke.closed,
      },
      geometry: {
        type: 'LineString',
        coordinates: stroke.points.map(([x, y]) => {
          const east = (x - centerX) * fitScale * scale;
          const north = (centerY - y) * fitScale * scale;
          return unprojectEastNorth(
            [
              east * cos - north * sin + offsetEastMeters,
              east * sin + north * cos + offsetNorthMeters,
            ],
            anchor,
          );
        }),
      },
    })),
  };
}

export interface PlacementBounds {
  minEastMeters: number;
  maxEastMeters: number;
  minNorthMeters: number;
  maxNorthMeters: number;
}
export interface PlacementCandidate {
  id: string;
  offsetEastMeters: number;
  offsetNorthMeters: number;
  rotationDegrees: number;
  scale: number;
}
export interface PlacementCandidateOptions {
  seed: string | number;
  count: number;
  bounds: PlacementBounds;
  minRotationDegrees?: number;
  maxRotationDegrees?: number;
  minScale?: number;
  maxScale?: number;
}

function seedNumber(seed: string | number): number {
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Generate repeatable bounded translation, rotation, and scale candidates. */
export function generatePlacementCandidates(
  options: PlacementCandidateOptions,
): PlacementCandidate[] {
  const { bounds, count } = options;
  const minRotation = options.minRotationDegrees ?? -180;
  const maxRotation = options.maxRotationDegrees ?? 180;
  const minScale = options.minScale ?? 0.8;
  const maxScale = options.maxScale ?? 1.2;
  const values = [
    bounds.minEastMeters,
    bounds.maxEastMeters,
    bounds.minNorthMeters,
    bounds.maxNorthMeters,
    minRotation,
    maxRotation,
    minScale,
    maxScale,
  ];
  if (
    !Number.isInteger(count) ||
    count < 0 ||
    count > 10_000 ||
    values.some((value) => !Number.isFinite(value)) ||
    bounds.minEastMeters > bounds.maxEastMeters ||
    bounds.minNorthMeters > bounds.maxNorthMeters ||
    Math.max(
      Math.abs(bounds.minEastMeters),
      Math.abs(bounds.maxEastMeters),
      Math.abs(bounds.minNorthMeters),
      Math.abs(bounds.maxNorthMeters),
    ) > 50_000 ||
    minRotation > maxRotation ||
    minScale <= 0 ||
    minScale > maxScale
  ) {
    throw new RangeError('Invalid placement candidate options.');
  }
  const random = seededRandom(seedNumber(options.seed));
  const between = (min: number, max: number) => min + random() * (max - min);
  return Array.from({ length: count }, (_, index) => ({
    id: `candidate-${index + 1}`,
    offsetEastMeters: between(bounds.minEastMeters, bounds.maxEastMeters),
    offsetNorthMeters: between(bounds.minNorthMeters, bounds.maxNorthMeters),
    rotationDegrees: between(minRotation, maxRotation),
    scale: between(minScale, maxScale),
  }));
}

export type GeometryIssueCode =
  | 'no_strokes'
  | 'too_few_points'
  | 'non_finite_point'
  | 'out_of_bounds'
  | 'duplicate_points'
  | 'degenerate_stroke'
  | 'closed_stroke_not_closed'
  | 'degenerate_closed_stroke';
export type GeometryWarningCode = 'self_intersection';
export interface GeometryIssue {
  code: GeometryIssueCode;
  strokeId?: string;
  message: string;
}
export interface GeometryWarning {
  code: GeometryWarningCode;
  strokeId: string;
  message: string;
}
export interface GeometryValidation {
  valid: boolean;
  errors: GeometryIssue[];
  warnings: GeometryWarning[];
}

function orientation(
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
) {
  return (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
}

function intersects(
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
  d: readonly number[],
): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return abC * abD < -EPSILON && cdA * cdB < -EPSILON;
}

function hasSelfIntersection(
  points: readonly (readonly number[])[],
  closed: boolean,
) {
  const segmentCount = points.length - 1;
  for (let first = 0; first < segmentCount; first++) {
    for (let second = first + 2; second < segmentCount; second++) {
      if (closed && first === 0 && second === segmentCount - 1) continue;
      if (
        intersects(
          points[first]!,
          points[first + 1]!,
          points[second]!,
          points[second + 1]!,
        )
      )
        return true;
    }
  }
  return false;
}

/** Validate route-like strokes; crossings stay informational because they may be intentional art. */
export function validateDrawingGeometry(drawing: Drawing): GeometryValidation {
  const errors: GeometryIssue[] = [];
  const warnings: GeometryWarning[] = [];
  const strokes: readonly DrawingStroke[] = drawing?.strokes ?? [];
  if (!strokes.length)
    errors.push({ code: 'no_strokes', message: 'Add at least one stroke.' });
  for (const stroke of strokes) {
    const points: readonly DrawingPoint[] = stroke.points ?? [];
    const issue = (code: GeometryIssueCode, message: string) =>
      errors.push({ code, strokeId: stroke.id, message });
    if (points.length < 2) {
      issue('too_few_points', 'A stroke needs at least two points.');
      continue;
    }
    if (
      points.some(
        (point) =>
          !Array.isArray(point) ||
          point.length !== 2 ||
          !Number.isFinite(point[0]) ||
          !Number.isFinite(point[1]),
      )
    ) {
      issue(
        'non_finite_point',
        'Stroke points must be finite coordinate pairs.',
      );
      continue;
    }
    if (points.some(([x, y]) => x! < 0 || x! > 1 || y! < 0 || y! > 1)) {
      issue('out_of_bounds', 'Normalized points must stay within [0, 1].');
      continue;
    }
    if (
      points.some(
        (point, index) =>
          index > 0 &&
          Math.hypot(
            point[0]! - points[index - 1]![0]!,
            point[1]! - points[index - 1]![1]!,
          ) < EPSILON,
      )
    ) {
      issue('duplicate_points', 'Remove adjacent duplicate points.');
      continue;
    }
    const first = points[0]!;
    const last = points.at(-1)!;
    if (stroke.closed && (first[0] !== last[0] || first[1] !== last[1])) {
      issue(
        'closed_stroke_not_closed',
        'Closed strokes must repeat their first point.',
      );
      continue;
    }
    let length = 0;
    for (let index = 1; index < points.length; index++)
      length += Math.hypot(
        points[index]![0]! - points[index - 1]![0]!,
        points[index]![1]! - points[index - 1]![1]!,
      );
    if (length < EPSILON) {
      issue('degenerate_stroke', 'Stroke length must be greater than zero.');
      continue;
    }
    const selfIntersection = hasSelfIntersection(points, stroke.closed);
    if (stroke.closed) {
      let doubleArea = 0;
      for (let index = 0; index < points.length - 1; index++)
        doubleArea +=
          points[index]![0]! * points[index + 1]![1]! -
          points[index + 1]![0]! * points[index]![1]!;
      if (Math.abs(doubleArea) < EPSILON && !selfIntersection) {
        issue(
          'degenerate_closed_stroke',
          'Closed stroke must enclose an area.',
        );
        continue;
      }
    }
    if (selfIntersection)
      warnings.push({
        code: 'self_intersection',
        strokeId: stroke.id,
        message:
          'Stroke crosses itself; the crossing is retained as intentional drawing geometry.',
      });
  }
  return { valid: errors.length === 0, errors, warnings };
}
