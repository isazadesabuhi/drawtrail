import type { LngLat } from '@drawtrail/types';
import { projectLngLat, unprojectEastNorth } from '@drawtrail/geo-utils';
import {
  elevationMetersSchema,
  type RouteElevation,
} from '@drawtrail/validation';

/** Sample the actual routed polyline, including both endpoints, with bounded work. */
export function sampleElevationLocations(
  coordinates: readonly LngLat[],
  distanceMeters: number,
) {
  if (
    coordinates.length < 2 ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters <= 0
  ) {
    throw new RangeError(
      'Elevation needs a nonempty route and positive distance.',
    );
  }
  const anchor = coordinates[0]!;
  const projected = coordinates.map((point) => projectLngLat(point, anchor));
  const cumulative = [0];
  for (let i = 1; i < projected.length; i++) {
    const a = projected[i - 1]!;
    const b = projected[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cumulative.at(-1)!;
  if (total <= 0)
    throw new RangeError('Elevation needs distinct route points.');
  const count = Math.min(1024, Math.max(2, Math.ceil(total / 30) + 1));
  let edge = 1;
  return Array.from({ length: count }, (_, index) => {
    const fraction = index / (count - 1);
    const position = total * fraction;
    while (edge < cumulative.length - 1 && cumulative[edge]! <= position)
      edge++;
    const length = cumulative[edge]! - cumulative[edge - 1]!;
    const t = length > 0 ? (position - cumulative[edge - 1]!) / length : 0;
    const a = projected[edge - 1]!;
    const b = projected[edge]!;
    const coordinate: LngLat =
      index === 0
        ? anchor
        : index === count - 1
          ? coordinates.at(-1)!
          : unprojectEastNorth(
              [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
              anchor,
            );
    return { coordinate, distanceMeters: distanceMeters * fraction };
  });
}

/** Missing heights never contribute invented flat sections or ascent/descent totals. */
export function summarizeElevation(
  distances: readonly number[],
  heights: readonly (number | null)[],
): RouteElevation {
  const unavailable = (
    reason: 'missing_data' | 'invalid_response',
  ): RouteElevation => ({
    status: 'unavailable',
    source: 'valhalla',
    reason,
  });
  if (
    heights.length !== distances.length ||
    heights.length < 2 ||
    heights.length > 1024
  )
    return unavailable('invalid_response');
  // The public API returns null; tolerate the underlying DEM no-data sentinel too.
  const normalized = heights.map((height) =>
    height === -32768 ? null : height,
  );
  if (
    normalized.some(
      (height) =>
        height !== null && !elevationMetersSchema.safeParse(height).success,
    )
  )
    return unavailable('invalid_response');
  if (normalized.every((height) => height === null))
    return unavailable('missing_data');
  if (normalized.some((height) => height === null)) {
    return {
      status: 'partial',
      source: 'valhalla',
      ascentMeters: null,
      descentMeters: null,
      samples: normalized.map((height, i) => ({
        distanceMeters: distances[i]!,
        elevationMeters: height,
      })),
    };
  }
  const samples = normalized.map((height, i) => ({
    distanceMeters: distances[i]!,
    elevationMeters: height!,
  }));
  let ascentMeters = 0;
  let descentMeters = 0;
  for (let i = 1; i < samples.length; i++) {
    const delta = samples[i]!.elevationMeters - samples[i - 1]!.elevationMeters;
    ascentMeters += Math.max(0, delta);
    descentMeters += Math.max(0, -delta);
  }
  return {
    status: 'complete',
    source: 'valhalla',
    samples,
    ascentMeters,
    descentMeters,
  };
}
