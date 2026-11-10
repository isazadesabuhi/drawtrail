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

/** Route one ordered stroke segment-by-segment, never inventing a connector. */
async function generateSingleRoute(
  request: RouteGenerationRequest,
  routeSegment: RouteSegmenter,
  signal?: AbortSignal,
  shapeDistanceKm = request.targetDistanceKm ?? 3,
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
  for (let index = 0; index < waypoints.length - 1; index++) {
    segments.push([waypoints[index]!, waypoints[index + 1]!, index]);
  }
  if (closedLoop) {
    segments.push([waypoints.at(-1)!, waypoints[0]!, waypoints.length - 1]);
  }

  const routeCoordinates: LngLat[] = [];
  let distance = 0;
  for (const [from, to, waypointIndex] of segments) {
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
    similarityScore: similarity.score,
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
  if (!searchArea && !unconstrainedDistance)
    return addRouteElevation(
      await generateSingleRoute(request, routeSegment, signal),
      elevationLookup,
      signal,
    );

  const candidateCount = searchArea?.candidateCount ?? 6;
  const searchRadiusMeters = searchArea?.radiusMeters ?? 0;

  let placements: ReturnType<typeof searchPlacements>;
  try {
    placements = searchPlacements(
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
    candidateCount * (request.settings.maxWaypoints + 1);
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
  const ranked: Array<{ result: RouteGenerationSuccess; score: number }> = [];
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
          offsetEastMeters: 0,
          offsetNorthMeters: 0,
        },
      },
    };
    const candidate = await generateSingleRoute(
      candidateRequest,
      boundedRouter,
      signal,
      unconstrainedDistance
        ? unconstrainedShapeDistancesKm[
            placementIndex % unconstrainedShapeDistancesKm.length
          ]
        : request.targetDistanceKm,
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
    const relativeDistanceError =
      candidate.requestedDistanceMeters === null
        ? 0
        : Math.abs(
            candidate.distanceMeters - candidate.requestedDistanceMeters,
          ) / candidate.requestedDistanceMeters;
    if (
      candidate.requestedDistanceMeters !== null &&
      searchArea?.maxDistanceDeviationRatio !== undefined &&
      relativeDistanceError > searchArea.maxDistanceDeviationRatio
    ) {
      lastFailure = failure(
        'no_route',
        `A candidate exceeded the configured ${(searchArea.maxDistanceDeviationRatio * 100).toFixed(0)}% distance-deviation limit.`,
      );
      continue;
    }
    const retracingRatio =
      candidate.distanceMeters > 0
        ? candidate.retracingMeters / candidate.distanceMeters
        : 0;
    const score =
      candidate.similarityScore -
      (unconstrainedDistance ? 0 : 0.25 * relativeDistanceError) -
      0.15 * retracingRatio;
    ranked.push({ result: candidate, score });
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
      return Math.min(forward, backward) >= 0.92;
    });
    if (isDuplicate) continue;
    alternatives.push({
      id: `route-${alternatives.length + 1}`,
      targetGeometry: item.result.targetGeometry,
      route: item.result.route,
      distanceMeters: item.result.distanceMeters,
      similarityScore: item.result.similarityScore,
      retracingMeters: item.result.retracingMeters,
      score: item.score,
      waypointCount: item.result.waypointCount,
      warnings: item.result.warnings,
    });
    if (alternatives.length === 3) break;
  }
  const best = alternatives[0];
  if (best) {
    const warnings = [
      ...best.warnings,
      searchArea
        ? `Best of ${ranked.length} viable placements searched within a ${(searchArea.radiusMeters / 1000).toFixed(1)} km radius.`
        : `Best shape match of ${ranked.length} viable route sizes at the selected map pin.`,
    ];
    if (budgetMessage) warnings.push(budgetMessage);
    return addRouteElevation(
      {
        ...ranked.find((item) => item.result.route === best.route)!.result,
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
        ? `No route was found in the selected area after trying ${placements.length} placements.${lastFailure ? ` ${lastFailure.message}` : ''}`
        : `No route was found at the selected map pin after trying ${placements.length} shape sizes.${lastFailure ? ` ${lastFailure.message}` : ''}`,
    lastFailure?.waypointIndex,
  );
}

export function targetDistanceOfLine(line: GeoJSONLineString, anchor: LngLat) {
  return lineLengthMeters(line, anchor);
}
