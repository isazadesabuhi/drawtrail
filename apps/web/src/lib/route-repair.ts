import type { GeoJSONLineString, LngLat } from '@drawtrail/types';
import {
  measureRetracing,
  projectLngLat,
  scoreLineSimilarity,
  unprojectEastNorth,
} from '@drawtrail/geo-utils';
import type {
  RouteRepairRequest,
  RouteRepairSuccess,
} from '@drawtrail/validation';
import { ValhallaError, type ValhallaRoute } from './valhalla-client';
import { addRouteElevation, type ElevationLookup } from './route-elevation';

export type RepairRouteSegmenter = (
  mode: RouteRepairRequest['mode'],
  from: LngLat,
  to: LngLat,
  signal?: AbortSignal,
) => Promise<ValhallaRoute>;

function sampleWaypoints(line: GeoJSONLineString, count = 20): LngLat[] {
  const anchor = line.coordinates[0]!;
  const projected = line.coordinates.map((point) =>
    projectLngLat(point, anchor),
  );
  const distances = [0];
  for (let index = 1; index < projected.length; index += 1) {
    const previous = projected[index - 1]!;
    const current = projected[index]!;
    distances.push(
      distances[index - 1]! +
        Math.hypot(current[0] - previous[0], current[1] - previous[1]),
    );
  }
  const total = distances.at(-1)!;
  if (!Number.isFinite(total) || total <= 0)
    throw new RangeError('The route has no usable length to repair.');

  return Array.from({ length: count }, (_, sampleIndex) => {
    const target = (total * sampleIndex) / (count - 1);
    const endIndex = distances.findIndex((distance) => distance >= target);
    if (endIndex <= 0) return anchor;
    const startIndex = endIndex < 0 ? distances.length - 2 : endIndex - 1;
    const segmentLength = distances[startIndex + 1]! - distances[startIndex]!;
    const fraction = segmentLength
      ? (target - distances[startIndex]!) / segmentLength
      : 0;
    const start = projected[startIndex]!;
    const end = projected[startIndex + 1]!;
    return unprojectEastNorth(
      [
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
      ],
      anchor,
    );
  });
}

function distanceMeters(first: LngLat, second: LngLat, anchor: LngLat) {
  const a = projectLngLat(first, anchor);
  const b = projectLngLat(second, anchor);
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export async function repairRouteSection(
  request: RouteRepairRequest,
  routeSegment: RepairRouteSegmenter,
  signal?: AbortSignal,
  elevationLookup?: ElevationLookup,
): Promise<RouteRepairSuccess> {
  const originalWaypoints = sampleWaypoints(request.route);
  const startIndex = Math.floor(
    request.startRatio * (originalWaypoints.length - 1),
  );
  const endIndex = Math.ceil(request.endRatio * (originalWaypoints.length - 1));
  if (endIndex <= startIndex) {
    throw new RangeError('Choose a wider section of the route to repair.');
  }
  const waypoints = [
    ...originalWaypoints.slice(0, startIndex + 1),
    ...request.viaWaypoints,
    ...originalWaypoints.slice(endIndex),
  ];
  if (waypoints.length > 32) {
    throw new RangeError('The repair has too many route waypoints.');
  }

  const coordinates: LngLat[] = [];
  let distance = 0;
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    if (signal?.aborted)
      throw new ValhallaError('cancelled', 'Route repair was cancelled.');
    const segment = await routeSegment(
      request.mode,
      waypoints[index]!,
      waypoints[index + 1]!,
      signal,
    );
    if (segment.mode !== request.mode)
      throw new ValhallaError(
        'invalid_response',
        'The routing service returned a different activity mode.',
      );
    if (
      segment.geometry.coordinates.length < 2 ||
      !Number.isFinite(segment.distanceMeters) ||
      segment.distanceMeters <= 0
    ) {
      throw new ValhallaError(
        'invalid_response',
        'The routing service returned an invalid repaired section.',
      );
    }
    const segmentCoordinates = segment.geometry.coordinates;
    const previous = coordinates.at(-1);
    if (
      previous &&
      distanceMeters(
        previous,
        segmentCoordinates[0]!,
        request.route.coordinates[0]!,
      ) > 2
    ) {
      throw new ValhallaError(
        'invalid_response',
        'Repaired route segments did not join within 2 m.',
      );
    }
    coordinates.push(
      ...(previous ? segmentCoordinates.slice(1) : segmentCoordinates),
    );
    distance += segment.distanceMeters;
  }

  const geometry: GeoJSONLineString = { type: 'LineString', coordinates };
  const anchor = request.targetGeometry.coordinates[0]!;
  const similarity = scoreLineSimilarity(
    request.targetGeometry,
    geometry,
    anchor,
  );
  const retracing = measureRetracing(geometry, anchor);
  const warnings: string[] = [];
  if (similarity.normalizedError > 0.1)
    warnings.push(
      'The repaired route differs noticeably from the target shape.',
    );
  if (distance > 0 && retracing.repeatedMeters / distance > 0.25)
    warnings.push(
      `The route repeats approximately ${Math.round((retracing.repeatedMeters / distance) * 100)}% of its street distance.`,
    );

  const result: RouteRepairSuccess = {
    status: 'success',
    route: {
      type: 'Feature',
      properties: { mode: request.mode },
      geometry: {
        type: 'LineString',
        coordinates: geometry.coordinates.map(
          ([longitude, latitude]) => [longitude, latitude] as [number, number],
        ),
      },
    },
    distanceMeters: distance,
    similarityScore: similarity.score,
    retracingMeters: retracing.repeatedMeters,
    waypointCount: waypoints.length,
    warnings,
  };
  const enriched = await addRouteElevation(
    {
      status: 'success',
      route: result.route,
      targetGeometry: request.targetGeometry,
      distanceMeters: result.distanceMeters,
      requestedDistanceMeters: null,
      similarityScore: result.similarityScore,
      retracingMeters: result.retracingMeters,
      waypointCount: result.waypointCount,
      warnings: result.warnings,
    },
    elevationLookup,
    signal,
  );
  if (enriched.status === 'success' && enriched.elevation)
    return { ...result, elevation: enriched.elevation };
  return result;
}
