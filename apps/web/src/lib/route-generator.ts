import type { GeoJSONLineString, LngLat } from '@drawtrail/types';
import {
  drawingToGeoJSON,
  lineLengthMeters,
  measureRetracing,
  projectLngLat,
  sampleOrderedWaypoints,
  scoreLineSimilarity,
  unprojectEastNorth,
  validateDrawingGeometry,
} from '@drawtrail/geo-utils';
import type {
  RouteGenerationFailure,
  RouteGenerationAlternative,
  RouteGenerationRequest,
  RoutePreferences,
  RouteGenerationResponse,
  RouteGenerationSuccess,
} from '@drawtrail/validation';
import { ValhallaError, type ValhallaRoute } from './valhalla-client';
import { addRouteElevation, type ElevationLookup } from './route-elevation';

export type RouteSegmenter = (
  mode: RouteGenerationRequest['mode'],
  from: LngLat,
  to: LngLat,
  signal?: AbortSignal,
  preferences?: RoutePreferences,
) => Promise<ValhallaRoute>;

function failure(
  code: RouteGenerationFailure['code'],
  message: string,
  waypointIndex?: number,
): RouteGenerationFailure {
  return {
    status: 'error',
    code,
    message,
    ...(waypointIndex === undefined ? {} : { waypointIndex }),
    warnings: [],
  };
}

function distanceMeters(from: LngLat, to: LngLat, anchor: LngLat) {
  const first = projectLngLat(from, anchor);
  const second = projectLngLat(to, anchor);
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

function drawingLineLength(points: readonly (readonly [number, number])[]) {
  return points
    .slice(1)
    .reduce(
      (sum, point, index) =>
        sum +
        Math.hypot(point[0] - points[index]![0], point[1] - points[index]![1]),
      0,
    );
}

function mapRouterError(error: unknown, waypointIndex: number) {
  if (!(error instanceof ValhallaError)) {
    return failure(
      'engine_down',
      'The routing service could not complete this segment.',
      waypointIndex,
    );
  }
  const messages: Record<
    ValhallaError['code'],
    RouteGenerationFailure['code']
  > = {
    invalid_waypoint: 'infeasible_waypoint',
    no_route: 'no_route',
    missing_region: 'missing_region',
    engine_down: 'engine_down',
    timeout: 'timeout',
    cancelled: 'cancelled',
    invalid_response: 'invalid_response',
  };
  return failure(messages[error.code], error.message, waypointIndex);
}

class SearchBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchBudgetError';
  }
}

type DrawingWaypoint = { point: LngLat; alongMeters: number };

function distanceAlongLine(
  line: GeoJSONLineString,
  coordinate: LngLat,
  anchor: LngLat,
) {
  const metric = line.coordinates.map((point) => projectLngLat(point, anchor));
  const target = projectLngLat(coordinate, anchor);
  let alongMeters = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  let closestAlong = 0;
  for (let index = 0; index < metric.length - 1; index++) {
    const first = metric[index]!;
    const second = metric[index + 1]!;
    const deltaEast = second[0] - first[0];
    const deltaNorth = second[1] - first[1];
    const lengthSquared = deltaEast ** 2 + deltaNorth ** 2;
    const length = Math.sqrt(lengthSquared);
    const fraction =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((target[0] - first[0]) * deltaEast +
                (target[1] - first[1]) * deltaNorth) /
                lengthSquared,
            ),
          );
    const distance = Math.hypot(
      target[0] - (first[0] + deltaEast * fraction),
      target[1] - (first[1] + deltaNorth * fraction),
    );
    if (distance < closestDistance) {
      closestDistance = distance;
      closestAlong = alongMeters + length * fraction;
    }
    alongMeters += length;
  }
  return closestAlong;
}

/** Find separated local maxima where the routed path strays from the sketch. */
function findDrawingDeviationWaypoints(
  target: GeoJSONLineString,
  route: GeoJSONLineString,
  anchor: LngLat,
): DrawingWaypoint[] {
  const targetPoints = target.coordinates.map((point) =>
    projectLngLat(point, anchor),
  );
  const routePoints = route.coordinates.map((point) =>
    projectLngLat(point, anchor),
  );
  const lengths: number[] = [0];
  for (let index = 0; index < targetPoints.length - 1; index++) {
    const first = targetPoints[index]!;
    const second = targetPoints[index + 1]!;
    lengths.push(
      lengths[index]! + Math.hypot(second[0] - first[0], second[1] - first[1]),
    );
  }
  const totalLength = lengths.at(-1)!;
  if (totalLength < 1 || routePoints.length < 2) return [];
  const sampleCount = 128;
  const errors = Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const alongMeters = (totalLength * sampleIndex) / (sampleCount - 1);
    let segmentIndex = lengths.findIndex((length) => length >= alongMeters) - 1;
    segmentIndex = Math.max(0, Math.min(targetPoints.length - 2, segmentIndex));
    const first = targetPoints[segmentIndex]!;
    const second = targetPoints[segmentIndex + 1]!;
    const segmentLength = lengths[segmentIndex + 1]! - lengths[segmentIndex]!;
    const fraction =
      segmentLength === 0
        ? 0
        : (alongMeters - lengths[segmentIndex]!) / segmentLength;
    const point: [number, number] = [
      first[0] + (second[0] - first[0]) * fraction,
      first[1] + (second[1] - first[1]) * fraction,
    ];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (
      let routeIndex = 0;
      routeIndex < routePoints.length - 1;
      routeIndex++
    ) {
      const routeStart = routePoints[routeIndex]!;
      const routeEnd = routePoints[routeIndex + 1]!;
      const east = routeEnd[0] - routeStart[0];
      const north = routeEnd[1] - routeStart[1];
      const segmentLengthSquared = east ** 2 + north ** 2;
      const routeFraction =
        segmentLengthSquared === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((point[0] - routeStart[0]) * east +
                  (point[1] - routeStart[1]) * north) /
                  segmentLengthSquared,
              ),
            );
      nearestDistance = Math.min(
        nearestDistance,
        Math.hypot(
          point[0] - (routeStart[0] + east * routeFraction),
          point[1] - (routeStart[1] + north * routeFraction),
        ),
      );
    }
    return { point, alongMeters, deviationMeters: nearestDistance };
  });
  const east = targetPoints.map(([value]) => value);
  const north = targetPoints.map(([, value]) => value);
  const diagonal = Math.hypot(
    Math.max(...east) - Math.min(...east),
    Math.max(...north) - Math.min(...north),
  );
  const thresholdMeters = Math.max(15, diagonal * 0.01);
  const minimumSpacingMeters = Math.max(100, totalLength * 0.08);
  const maxima = errors
    .filter((sample, index) => {
      if (index < 2 || index >= errors.length - 2) return false;
      const previous = errors[index - 1]!;
      const next = errors[index + 1]!;
      return (
        sample.deviationMeters >= thresholdMeters &&
        sample.deviationMeters >= previous.deviationMeters &&
        sample.deviationMeters >= next.deviationMeters
      );
    })
    .sort((first, second) => second.deviationMeters - first.deviationMeters);
  const selected: DrawingWaypoint[] = [];
  for (const sample of maxima) {
    if (
      selected.some(
        (waypoint) =>
          Math.abs(waypoint.alongMeters - sample.alongMeters) <
          minimumSpacingMeters,
      )
    ) {
      continue;
    }
    selected.push({
      point: unprojectEastNorth(sample.point, anchor),
      alongMeters: sample.alongMeters,
    });
    if (selected.length === 4) break;
  }
  return selected.sort(
    (first, second) => first.alongMeters - second.alongMeters,
  );
}

/** Route one ordered stroke segment-by-segment, never inventing a connector. */
async function generateSingleRoute(
  request: RouteGenerationRequest,
  routeSegment: RouteSegmenter,
  signal?: AbortSignal,
  shapeDistanceKm = request.targetDistanceKm ?? 3,
  extraWaypoints: readonly DrawingWaypoint[] = [],
): Promise<RouteGenerationResponse> {
  if (request.drawing.strokes.length !== 1) {
    return failure(
      'unsupported_multistroke',
      'Generate one stroke at a time. Select a stroke before generating a route.',
    );
  }
  const validation = validateDrawingGeometry(request.drawing);
  if (!validation.valid) {
    return failure(
      'invalid_drawing',
      validation.errors[0]?.message ?? 'The drawing is invalid.',
    );
  }

  const stroke = request.drawing.strokes[0]!;
  const normalizedLength = drawingLineLength(stroke.points);
  const xs = stroke.points.map(([x]) => x);
  const ys = stroke.points.map(([, y]) => y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const scale = request.settings.placement.scale;
  const metersPerNormalizedUnit = (shapeDistanceKm * 1000) / normalizedLength;
  let targetGeometry: ReturnType<typeof drawingToGeoJSON>;
  try {
    targetGeometry = drawingToGeoJSON(request.drawing, request.center, {
      widthMeters: Math.max(1, spanX * metersPerNormalizedUnit),
      heightMeters: Math.max(1, spanY * metersPerNormalizedUnit),
      scale,
      rotationDegrees: request.settings.placement.rotationDegrees,
      offsetEastMeters: request.settings.placement.offsetEastMeters,
      offsetNorthMeters: request.settings.placement.offsetNorthMeters,
    });
  } catch (error) {
    return failure('infeasible_waypoint', (error as Error).message);
  }
  const target: GeoJSONLineString = targetGeometry.features[0]!.geometry;
  let waypoints: LngLat[];
  try {
    waypoints = sampleOrderedWaypoints(
      target,
      request.center,
      request.settings.maxWaypoints,
    );
    if (extraWaypoints.length) {
      waypoints = [
        ...waypoints.map((point) => ({
          point,
          alongMeters: distanceAlongLine(target, point, request.center),
        })),
        ...extraWaypoints,
      ]
        .sort((first, second) => first.alongMeters - second.alongMeters)
        .reduce<LngLat[]>((result, item) => {
          const previous = result.at(-1);
          if (
            !previous ||
            distanceMeters(previous, item.point, request.center) > 1
          ) {
            result.push(item.point);
          }
          return result;
        }, []);
    }
  } catch (error) {
    return failure('invalid_drawing', (error as Error).message);
  }

  const outsideIndex = waypoints.findIndex(
    (waypoint) =>
      distanceMeters(waypoint, request.center, request.center) >
      request.bounds.radiusMeters,
  );
  if (outsideIndex !== -1) {
    return failure(
      'infeasible_waypoint',
      `Waypoint ${outsideIndex + 1} falls outside the ${request.bounds.radiusMeters} m search radius.`,
      outsideIndex,
    );
  }

  const closedLoop = request.loop || stroke.closed;
  if (
    waypoints.length > 2 &&
    distanceMeters(waypoints[0]!, waypoints.at(-1)!, request.center) < 1
  ) {
    waypoints = waypoints.slice(0, -1);
  }
  if (waypoints.length < 2) {
    return failure(
      'invalid_drawing',
      'The stroke needs two distinct route waypoints.',
    );
  }

  const segments: Array<[LngLat, LngLat, number]> = [];
  const requiredWaypoint = request.requiredWaypoint;
  const needsStartConnector =
    requiredWaypoint !== undefined &&
    distanceMeters(requiredWaypoint, waypoints[0]!, request.center) > 1;
  if (needsStartConnector) {
    segments.push([requiredWaypoint!, waypoints[0]!, -1]);
  }
  for (let index = 0; index < waypoints.length - 1; index++) {
    segments.push([waypoints[index]!, waypoints[index + 1]!, index]);
  }
  if (closedLoop) {
    segments.push([waypoints.at(-1)!, waypoints[0]!, waypoints.length - 1]);
    if (needsStartConnector) {
      segments.push([waypoints[0]!, requiredWaypoint!, waypoints.length]);
    }
  }

  const routeCoordinates: LngLat[] = [];
  let distance = 0;
  let maximumSnapDistanceMeters = 0;
  for (const [segmentIndex, [from, to, waypointIndex]] of segments.entries()) {
    if (signal?.aborted)
      return failure(
        'cancelled',
        'Route generation was cancelled.',
        waypointIndex,
      );
    let segment: ValhallaRoute;
    try {
      segment = await routeSegment(
        request.mode,
        from,
        to,
        signal,
        request.settings.preferences,
      );
    } catch (error) {
      if (error instanceof SearchBudgetError) {
        return failure('optimization_budget', error.message, waypointIndex);
      }
      return mapRouterError(error, waypointIndex);
    }
    if (segment.mode !== request.mode) {
      return failure(
        'invalid_response',
        `The router returned ${segment.mode} access for a ${request.mode} request.`,
        waypointIndex,
      );
    }
    const coordinates = segment.geometry.coordinates;
    if (
      coordinates.length < 2 ||
      !Number.isFinite(segment.distanceMeters) ||
      segment.distanceMeters <= 0
    ) {
      return failure(
        'invalid_response',
        'The routing service returned an invalid segment.',
        waypointIndex,
      );
    }
    maximumSnapDistanceMeters = Math.max(
      maximumSnapDistanceMeters,
      distanceMeters(coordinates[0]!, from, request.center),
      distanceMeters(coordinates.at(-1)!, to, request.center),
    );
    if (
      requiredWaypoint &&
      segmentIndex === 0 &&
      distanceMeters(coordinates[0]!, requiredWaypoint, request.center) > 250
    ) {
      return failure(
        'infeasible_waypoint',
        'The selected start point is more than 250 m from a routeable street. Move the pin closer to a mapped path.',
        waypointIndex,
      );
    }
    const previous = routeCoordinates.at(-1);
    if (
      previous &&
      distanceMeters(previous, coordinates[0]!, request.center) >
        request.bounds.continuityToleranceMeters
    ) {
      return failure(
        'route_discontinuity',
        `Routed segments do not connect within ${request.bounds.continuityToleranceMeters} m.`,
        waypointIndex,
      );
    }
    routeCoordinates.push(...(previous ? coordinates.slice(1) : coordinates));
    distance += segment.distanceMeters;
  }

  const routeLine: GeoJSONLineString = {
    type: 'LineString',
    coordinates: routeCoordinates,
  };
  if (closedLoop) {
    const closureGap = distanceMeters(
      routeCoordinates[0]!,
      routeCoordinates.at(-1)!,
      request.center,
    );
    if (closureGap > request.bounds.continuityToleranceMeters) {
      return failure(
        'route_discontinuity',
        `The loop ends ${closureGap.toFixed(1)} m from its start.`,
        waypoints.length - 1,
      );
    }
  }

  const similarity = scoreLineSimilarity(target, routeLine, request.center);
  const snapPenalty = Math.min(
    0.35,
    Math.max(0, maximumSnapDistanceMeters - 100) / 4_000,
  );
  const retracing = measureRetracing(routeLine, request.center);
  const requestedDistanceMeters =
    request.targetDistanceKm === undefined
      ? null
      : request.targetDistanceKm * 1000;
  const warnings: string[] = [];
  if (
    requestedDistanceMeters !== null &&
    Math.abs(distance - requestedDistanceMeters) / requestedDistanceMeters > 0.2
  ) {
    warnings.push(
      'Routed distance differs from the requested distance by more than 20%.',
    );
  }
  if (similarity.normalizedError > 0.1) {
    warnings.push('The street route differs noticeably from the drawn shape.');
  }
  if (maximumSnapDistanceMeters >= 300) {
    warnings.push(
      `A route waypoint snapped up to ${Math.round(maximumSnapDistanceMeters / 50) * 50} m from the drawn line.`,
    );
  }
  if (retracing.percent > 0.25) {
    warnings.push(
      `The route repeats approximately ${Math.round(retracing.percent * 100)}% of its street distance.`,
    );
  }

  const response: RouteGenerationSuccess = {
    status: 'success',
    targetGeometry: {
      type: 'LineString',
      coordinates: target.coordinates.map(([longitude, latitude]) => [
        longitude,
        latitude,
      ]),
    },
    route: {
      type: 'Feature',
      properties: { mode: request.mode },
      geometry: {
        type: 'LineString',
        coordinates: routeLine.coordinates.map(([longitude, latitude]) => [
          longitude,
          latitude,
        ]),
      },
    },
    distanceMeters: distance,
    requestedDistanceMeters,
    similarityScore: Math.max(0, similarity.score - snapPenalty),
    averageDeviationMeters: similarity.averageDeviationMeters,
    p95DeviationMeters: similarity.p95DeviationMeters,
    maximumDeviationMeters: similarity.maximumDeviationMeters,
    retracingMeters: retracing.repeatedMeters,
    waypointCount: waypoints.length,
    warnings,
  };
  return response;
}

function searchPlacements(
  center: LngLat,
  radiusMeters: number,
  count: number,
  seed: string,
) {
  const seedAngle =
    (([...seed].reduce(
      (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16_777_619),
      2_166_136_261,
    ) >>>
      0) /
      4_294_967_296) *
    Math.PI *
    2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) {
      return {
        center,
        rotationDegrees: 0,
        scale: 1,
      };
    }
    const fraction = Math.sqrt(index / (count - 1));
    const angle = seedAngle + index * goldenAngle;
    const candidateCenter = unprojectEastNorth(
      [
        Math.cos(angle) * radiusMeters * fraction,
        Math.sin(angle) * radiusMeters * fraction,
      ],
      center,
    );
    const rotationDegrees =
      ((index * 137.508 + (seedAngle * 180) / Math.PI) % 360) - 180;
    const scales = [0.8, 1, 1.2, 0.9, 1.1];
    return {
      center: candidateCenter,
      rotationDegrees,
      scale: scales[index % scales.length]!,
    };
  });
}

/** Search a bounded area and return the best viable routed placement. */
export async function generateRoute(
  request: RouteGenerationRequest,
  routeSegment: RouteSegmenter,
  signal?: AbortSignal,
  onProgress?: (progress: {
    stage: 'searching';
    completed: number;
    total: number;
  }) => void,
  elevationLookup?: ElevationLookup,
): Promise<RouteGenerationResponse> {
  const searchArea = request.settings.searchArea;
  const unconstrainedDistance = request.targetDistanceKm === undefined;
  const distanceFlexibility = request.settings.distanceFlexibilityRatio;
  if (!searchArea && !unconstrainedDistance && distanceFlexibility === 0) {
    const initial = await generateSingleRoute(request, routeSegment, signal);
    if (initial.status !== 'success')
      return addRouteElevation(initial, elevationLookup, signal);
    const extraWaypoints = findDrawingDeviationWaypoints(
      initial.targetGeometry,
      initial.route.geometry,
      request.center,
    );
    if (!extraWaypoints.length)
      return addRouteElevation(initial, elevationLookup, signal);
    const refined = await generateSingleRoute(
      request,
      routeSegment,
      signal,
      request.targetDistanceKm,
      extraWaypoints,
    );
    if (
      refined.status === 'success' &&
      refined.similarityScore > initial.similarityScore + 0.005
    ) {
      return addRouteElevation(
        {
          ...refined,
          warnings: [
            ...refined.warnings,
            `Shape fit improved after adding ${extraWaypoints.length} waypoints at the largest drawing gaps.`,
          ],
        },
        elevationLookup,
        signal,
      );
    }
    return addRouteElevation(initial, elevationLookup, signal);
  }

  const distanceOffsets = [
    0,
    -distanceFlexibility,
    distanceFlexibility,
    -distanceFlexibility / 2,
    distanceFlexibility / 2,
  ];
  const candidateCount =
    searchArea?.candidateCount ?? (unconstrainedDistance ? 6 : 5);
  const searchRadiusMeters = searchArea?.radiusMeters ?? 0;

  let placements: ReturnType<typeof searchPlacements>;
  try {
    placements =
      !searchArea && !unconstrainedDistance
        ? Array.from({ length: candidateCount }, () => ({
            center: request.center,
            rotationDegrees: request.settings.placement.rotationDegrees,
            scale: request.settings.placement.scale,
          }))
        : searchPlacements(
            request.center,
            searchRadiusMeters,
            candidateCount,
            request.settings.seed,
          );
  } catch (error) {
    return failure(
      'infeasible_waypoint',
      error instanceof Error
        ? error.message
        : 'Could not create candidates in the selected search area.',
    );
  }
  const startedAt = Date.now();
  const maxRuntimeMs = searchArea?.maxRuntimeMs ?? 30_000;
  const maxRouterRequests =
    searchArea?.maxRouterRequests ??
    candidateCount *
      (request.settings.maxWaypoints +
        (request.requiredWaypoint && request.loop ? 2 : 1));
  let routerRequests = 0;
  let budgetMessage: string | undefined;
  const boundedRouter: RouteSegmenter = async (
    mode,
    from,
    to,
    signal,
    preferences,
  ) => {
    if (signal?.aborted) {
      throw new ValhallaError('cancelled', 'Route search was cancelled.');
    }
    if (routerRequests >= maxRouterRequests) {
      throw new SearchBudgetError(
        `Search stopped at its ${maxRouterRequests}-request routing limit.`,
      );
    }
    if (Date.now() - startedAt >= maxRuntimeMs) {
      throw new SearchBudgetError(
        `Search stopped at its ${Math.round(maxRuntimeMs / 1000)}-second time limit.`,
      );
    }
    routerRequests += 1;
    return routeSegment(mode, from, to, signal, preferences);
  };
  const ranked: Array<{
    result: RouteGenerationSuccess;
    score: number;
    request: RouteGenerationRequest;
    shapeDistanceKm: number;
    adaptiveWaypoints: number;
    detailedRefinement: boolean;
  }> = [];
  const scoreCandidate = (candidate: RouteGenerationSuccess) => {
    const relativeDistanceError =
      candidate.requestedDistanceMeters === null
        ? 0
        : Math.abs(
            candidate.distanceMeters - candidate.requestedDistanceMeters,
          ) / candidate.requestedDistanceMeters;
    const retracingRatio =
      candidate.distanceMeters > 0
        ? candidate.retracingMeters / candidate.distanceMeters
        : 0;
    return (
      candidate.similarityScore -
      (unconstrainedDistance ? 0 : 0.25 * relativeDistanceError) -
      0.15 * retracingRatio
    );
  };
  const fitsArea = (candidate: RouteGenerationSuccess) =>
    !searchArea?.routeWithinRadius ||
    candidate.route.geometry.coordinates.every(
      (coordinate) =>
        distanceMeters(coordinate, request.center, request.center) <=
        searchArea.radiusMeters,
    );
  const violatesDistanceLimit = (candidate: RouteGenerationSuccess) => {
    if (
      candidate.requestedDistanceMeters === null ||
      searchArea?.maxDistanceDeviationRatio === undefined
    )
      return false;
    const relativeDistanceError =
      Math.abs(candidate.distanceMeters - candidate.requestedDistanceMeters) /
      candidate.requestedDistanceMeters;
    return relativeDistanceError > searchArea.maxDistanceDeviationRatio;
  };
  let lastFailure: RouteGenerationFailure | undefined;
  const unconstrainedShapeDistancesKm = [2, 3.5, 5, 8, 12, 18];
  for (const [placementIndex, placement] of placements.entries()) {
    if (signal?.aborted) {
      return failure('cancelled', 'Area search was cancelled.');
    }
    if (Date.now() - startedAt >= maxRuntimeMs) {
      budgetMessage = `Search stopped at its ${Math.round(maxRuntimeMs / 1000)}-second time limit.`;
      break;
    }
    if (routerRequests >= maxRouterRequests) {
      budgetMessage = `Search stopped at its ${maxRouterRequests}-request routing limit.`;
      break;
    }
    const candidateRequest: RouteGenerationRequest = {
      ...request,
      center: [placement.center[0], placement.center[1]],
      settings: {
        ...request.settings,
        placement: {
          ...request.settings.placement,
          rotationDegrees: placement.rotationDegrees,
          scale: placement.scale,
          offsetEastMeters: searchArea
            ? 0
            : request.settings.placement.offsetEastMeters,
          offsetNorthMeters: searchArea
            ? 0
            : request.settings.placement.offsetNorthMeters,
        },
      },
    };
    const shapeDistanceKm = unconstrainedDistance
      ? unconstrainedShapeDistancesKm[
          placementIndex % unconstrainedShapeDistancesKm.length
        ]!
      : Math.max(
          0.2,
          Math.min(
            20,
            request.targetDistanceKm! *
              (1 + distanceOffsets[placementIndex % distanceOffsets.length]!),
          ),
        );
    const coarseRequest = searchArea
      ? {
          ...candidateRequest,
          settings: {
            ...candidateRequest.settings,
            maxWaypoints: Math.min(4, candidateRequest.settings.maxWaypoints),
          },
        }
      : candidateRequest;
    const candidate = await generateSingleRoute(
      coarseRequest,
      boundedRouter,
      signal,
      shapeDistanceKm,
    );
    onProgress?.({
      stage: 'searching',
      completed: placementIndex + 1,
      total: placements.length,
    });
    if (candidate.status === 'error') {
      lastFailure = candidate;
      if (candidate.code === 'optimization_budget') {
        budgetMessage = candidate.message;
        break;
      }
      if (
        candidate.code === 'engine_down' ||
        candidate.code === 'timeout' ||
        candidate.code === 'cancelled'
      ) {
        return candidate;
      }
      continue;
    }
    if (!fitsArea(candidate)) {
      lastFailure = failure(
        'infeasible_waypoint',
        'The routed path extends outside the selected search radius.',
      );
      continue;
    }
    if (violatesDistanceLimit(candidate)) {
      lastFailure = failure(
        'no_route',
        `A candidate exceeded the configured ${((searchArea?.maxDistanceDeviationRatio ?? 0) * 100).toFixed(0)}% distance-deviation limit.`,
      );
      continue;
    }
    ranked.push({
      result: candidate,
      score: scoreCandidate(candidate),
      request: candidateRequest,
      shapeDistanceKm,
      adaptiveWaypoints: 0,
      detailedRefinement: false,
    });
  }

  // Refine the leading candidates: area-only search first restores full
  // waypoint detail, then every search mode targets its largest shape gaps.
  if (ranked.length > 0) {
    ranked.sort(
      (first, second) =>
        second.score - first.score ||
        first.result.distanceMeters - second.result.distanceMeters,
    );
    // The coarse pass can mis-rank candidates whose bends need more waypoints.
    // Spend detailed routing on a wider shortlist before selecting alternatives.
    const refinementCount = searchArea ? Math.min(8, ranked.length) : 3;
    for (const item of ranked.slice(0, refinementCount)) {
      if (routerRequests >= maxRouterRequests) {
        budgetMessage = `Search stopped at its ${maxRouterRequests}-request routing limit.`;
        break;
      }
      if (Date.now() - startedAt >= maxRuntimeMs) {
        budgetMessage = `Search stopped at its ${Math.round(maxRuntimeMs / 1000)}-second time limit.`;
        break;
      }
      if (searchArea) {
        const detailed = await generateSingleRoute(
          item.request,
          boundedRouter,
          signal,
          item.shapeDistanceKm,
        );
        if (detailed.status === 'error') {
          if (detailed.code === 'optimization_budget') {
            budgetMessage = detailed.message;
            break;
          }
          if (detailed.code === 'cancelled') return detailed;
          continue;
        }
        if (!fitsArea(detailed) || violatesDistanceLimit(detailed)) continue;
        item.result = detailed;
        item.score = scoreCandidate(detailed);
        item.detailedRefinement = true;
      }
      const extraWaypoints = findDrawingDeviationWaypoints(
        item.result.targetGeometry,
        item.result.route.geometry,
        item.request.center,
      );
      if (!extraWaypoints.length) continue;
      const refined = await generateSingleRoute(
        item.request,
        boundedRouter,
        signal,
        item.shapeDistanceKm,
        extraWaypoints,
      );
      if (refined.status === 'error') {
        if (refined.code === 'optimization_budget') {
          budgetMessage = refined.message;
          break;
        }
        if (refined.code === 'cancelled') return refined;
        continue;
      }
      if (!fitsArea(refined) || violatesDistanceLimit(refined)) continue;
      const refinedScore = scoreCandidate(refined);
      if (refinedScore > item.score + 0.005) {
        item.result = {
          ...refined,
          warnings: [
            ...refined.warnings,
            `Shape fit improved after adding ${extraWaypoints.length} waypoints at the largest drawing gaps.`,
          ],
        };
        item.score = refinedScore;
        item.adaptiveWaypoints = extraWaypoints.length;
      }
    }
  }

  ranked.sort(
    (first, second) =>
      second.score - first.score ||
      first.result.distanceMeters - second.result.distanceMeters,
  );
  const alternatives: RouteGenerationAlternative[] = [];
  for (const item of ranked) {
    const isDuplicate = alternatives.some((alternative) => {
      const forward = scoreLineSimilarity(
        alternative.route.geometry,
        item.result.route.geometry,
        request.center,
      ).score;
      const backward = scoreLineSimilarity(
        item.result.route.geometry,
        alternative.route.geometry,
        request.center,
      ).score;
      const lengthDifference =
        Math.abs(alternative.distanceMeters - item.result.distanceMeters) /
        Math.max(alternative.distanceMeters, item.result.distanceMeters);
      return Math.min(forward, backward) >= 0.92 && lengthDifference <= 0.03;
    });
    if (isDuplicate) continue;
    alternatives.push({
      id: `route-${alternatives.length + 1}`,
      targetGeometry: item.result.targetGeometry,
      route: item.result.route,
      distanceMeters: item.result.distanceMeters,
      similarityScore: item.result.similarityScore,
      averageDeviationMeters: item.result.averageDeviationMeters,
      p95DeviationMeters: item.result.p95DeviationMeters,
      maximumDeviationMeters: item.result.maximumDeviationMeters,
      retracingMeters: item.result.retracingMeters,
      score: item.score,
      waypointCount: item.result.waypointCount,
      warnings: item.result.warnings,
    });
    if (alternatives.length === 3) break;
  }
  const best = alternatives[0];
  if (best) {
    const bestItem = ranked.find((item) => item.result.route === best.route)!;
    const detailedRefinements = ranked.filter(
      (item) => item.detailedRefinement,
    ).length;
    const warnings = [
      ...best.warnings,
      searchArea
        ? `Best of ${ranked.length} viable placements sampled within a ${(searchArea.radiusMeters / 1000).toFixed(1)} km radius; ${detailedRefinements} leading placements were rerouted with more drawing points.`
        : `Best shape match of ${ranked.length} viable route sizes at the selected map pin.`,
    ];
    if (budgetMessage) warnings.push(budgetMessage);
    if (bestItem.adaptiveWaypoints > 0) {
      warnings.push(
        `Shape fit was refined with ${bestItem.adaptiveWaypoints} extra waypoints at the largest drawing gaps.`,
      );
    }
    return addRouteElevation(
      {
        ...bestItem.result,
        warnings,
        alternatives,
      },
      elevationLookup,
      signal,
    );
  }
  return failure(
    budgetMessage ? 'optimization_budget' : (lastFailure?.code ?? 'no_route'),
    budgetMessage
      ? `No viable route was found before the search budget ended. ${budgetMessage}`
      : searchArea
        ? searchArea.routeWithinRadius
          ? `No route fit entirely inside the selected ${(searchArea.radiusMeters / 1000).toFixed(1)} km radius after trying ${placements.length} placements.${lastFailure ? ` ${lastFailure.message}` : ''}`
          : `No route was found in the selected area after trying ${placements.length} placements.${lastFailure ? ` ${lastFailure.message}` : ''}`
        : `No route was found at the selected map pin after trying ${placements.length} shape sizes.${lastFailure ? ` ${lastFailure.message}` : ''}`,
    lastFailure?.waypointIndex,
  );
}

export function targetDistanceOfLine(line: GeoJSONLineString, anchor: LngLat) {
  return lineLengthMeters(line, anchor);
}
