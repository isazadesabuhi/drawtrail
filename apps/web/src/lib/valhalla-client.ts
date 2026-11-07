import type { ActivityMode, LngLat } from '@drawtrail/types';
import { lngLatSchema, type RoutePreferences } from '@drawtrail/validation';
import { z } from 'zod';

if (typeof window !== 'undefined') {
  throw new Error(
    'ValhallaClient is server-only and must not be imported by browser code.',
  );
}

export type RouteErrorCode =
  | 'invalid_waypoint'
  | 'no_route'
  | 'missing_region'
  | 'engine_down'
  | 'timeout'
  | 'cancelled'
  | 'invalid_response';

export class ValhallaError extends Error {
  constructor(
    readonly code: RouteErrorCode,
    message: string,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ValhallaError';
  }
}

export interface ValhallaRoute {
  mode: ActivityMode;
  geometry: { type: 'LineString'; coordinates: LngLat[] };
  distanceMeters: number;
}

export interface ValhallaClientOptions {
  baseUrl: string | URL;
  timeoutMs?: number;
  retries?: number;
  fetch?: typeof fetch;
}

export interface RouteOptions {
  signal?: AbortSignal;
  /** Maximum distance Valhalla should consider when snapping a waypoint to a road. */
  snapRadiusMeters?: number;
  walkingSpeedKph?: number;
  bicycleType?: 'road' | 'cross' | 'hybrid' | 'mountain';
  useRoads?: number;
  preferences?: RoutePreferences;
}

const valhallaResponseSchema = z.object({
  trip: z.object({
    legs: z
      .array(
        z.object({
          shape: z.string().min(1),
          summary: z.object({ length: z.number().finite().positive() }),
        }),
      )
      .min(1),
  }),
});

/** Decode Valhalla's default precision-six encoded polyline into [lng, lat]. */
export function decodePolyline6(encoded: string): LngLat[] {
  const coordinates: LngLat[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  const readDelta = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length || shift > 30) {
        throw new ValhallaError(
          'invalid_response',
          'Malformed route geometry.',
        );
      }
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) {
        throw new ValhallaError(
          'invalid_response',
          'Malformed route geometry.',
        );
      }
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    latitude += readDelta();
    longitude += readDelta();
    const point: LngLat = [longitude / 1_000_000, latitude / 1_000_000];
    if (!lngLatSchema.safeParse(point).success) {
      throw new ValhallaError(
        'invalid_response',
        'Route geometry is outside WGS84 bounds.',
      );
    }
    coordinates.push(point);
  }

  if (coordinates.length < 2) {
    throw new ValhallaError(
      'invalid_response',
      'Route geometry needs at least two points.',
    );
  }
  return coordinates;
}

function mapEngineError(status: number, body: unknown): ValhallaError {
  const engineCode =
    typeof body === 'object' && body !== null && 'error_code' in body
      ? Number(body.error_code)
      : Number.NaN;
  const detail =
    typeof body === 'object' && body !== null
      ? String(
          ('error' in body && body.error) ||
            ('status_message' in body && body.status_message) ||
            '',
        )
      : '';
  const normalized = detail.toLowerCase();
  if (engineCode === 170 || engineCode === 442) {
    return new ValhallaError(
      'no_route',
      'No legal route connects these waypoints.',
    );
  }
  if (normalized.includes('no data found for location')) {
    return new ValhallaError(
      'missing_region',
      'No routing graph covers one of these waypoints.',
    );
  }
  if (engineCode === 171 || normalized.includes('no suitable edges')) {
    return new ValhallaError(
      'invalid_waypoint',
      'No routeable edge is close enough to one of these waypoints.',
    );
  }
  if (
    normalized.includes('no edges near') ||
    normalized.includes('search cutoff') ||
    normalized.includes('outside the graph')
  ) {
    return new ValhallaError(
      'missing_region',
      'No routing graph covers one of these waypoints.',
    );
  }
  if (
    normalized.includes('no route') ||
    normalized.includes('not connected') ||
    normalized.includes('unconnected regions') ||
    normalized.includes('path not found') ||
    normalized.includes('no path could be found') ||
    normalized.includes('failed to route')
  ) {
    return new ValhallaError(
      'no_route',
      'No legal route connects these waypoints.',
    );
  }
  if (status >= 500 || status === 429) {
    return new ValhallaError(
      'engine_down',
      `Valhalla returned HTTP ${status}.`,
      true,
    );
  }
  return new ValhallaError(
    'invalid_waypoint',
    detail || `Valhalla rejected the route request (HTTP ${status}).`,
  );
}

export class ValhallaClient {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetcher: typeof fetch;

  constructor(options: ValhallaClientOptions) {
    this.baseUrl = new URL(options.baseUrl);
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retries = options.retries ?? 1;
    this.fetcher = options.fetch ?? fetch;
    if (
      this.retries < 0 ||
      this.retries > 3 ||
      !Number.isInteger(this.retries)
    ) {
      throw new RangeError('Valhalla retries must be an integer from 0 to 3.');
    }
  }

  async route(
    mode: ActivityMode,
    from: LngLat,
    to: LngLat,
    options: RouteOptions = {},
  ): Promise<ValhallaRoute> {
    for (const [index, waypoint] of [from, to].entries()) {
      if (!lngLatSchema.safeParse(waypoint).success) {
        throw new ValhallaError(
          'invalid_waypoint',
          `Waypoint ${index + 1} is not a valid [longitude, latitude] coordinate.`,
        );
      }
    }

    const costing = mode === 'cycling' ? 'bicycle' : 'pedestrian';
    const snapRadiusMeters = options.snapRadiusMeters ?? 250;
    if (
      !Number.isFinite(snapRadiusMeters) ||
      snapRadiusMeters < 1 ||
      snapRadiusMeters > 5_000
    ) {
      throw new ValhallaError(
        'invalid_waypoint',
        'Waypoint road search radius must be between 1 and 5,000 m.',
      );
    }
    const request: Record<string, unknown> = {
      locations: [
        { lon: from[0], lat: from[1], type: 'break', radius: snapRadiusMeters },
        { lon: to[0], lat: to[1], type: 'break', radius: snapRadiusMeters },
      ],
      costing,
      units: 'kilometers',
      format: 'json',
    };
    const costingOptions: Record<string, unknown> = {};
    const hillPreference = options.preferences?.hills;
    if (hillPreference) {
      costingOptions.use_hills =
        hillPreference === 'flatter' ? 0 : hillPreference === 'hilly' ? 1 : 0.5;
    }
    if (costing === 'pedestrian') {
      if (options.walkingSpeedKph !== undefined) {
        if (
          !Number.isFinite(options.walkingSpeedKph) ||
          options.walkingSpeedKph < 0.5 ||
          options.walkingSpeedKph > 25
        ) {
          throw new ValhallaError(
            'invalid_waypoint',
            'Walking speed must be between 0.5 and 25 km/h.',
          );
        }
        costingOptions.walking_speed = options.walkingSpeedKph;
      }
    } else {
      const surface = options.preferences?.cyclingSurface;
      if (surface) {
        costingOptions.bicycle_type =
          surface === 'paved'
            ? 'road'
            : surface === 'rough'
              ? 'mountain'
              : 'hybrid';
        costingOptions.avoid_bad_surfaces =
          surface === 'paved' ? 0.9 : surface === 'rough' ? 0 : 0.2;
      } else if (options.bicycleType) {
        costingOptions.bicycle_type = options.bicycleType;
      }
      const roadPreference = options.preferences?.cyclingRoads;
      const useRoads = roadPreference
        ? roadPreference === 'paths'
          ? 0
          : roadPreference === 'roads'
            ? 0.8
            : 0.25
        : options.useRoads;
      if (useRoads !== undefined) {
        if (!Number.isFinite(useRoads) || useRoads < 0 || useRoads > 1) {
          throw new ValhallaError(
            'invalid_waypoint',
            'Bicycle useRoads must be between 0 and 1.',
          );
        }
        costingOptions.use_roads = useRoads;
      }
    }
    if (Object.keys(costingOptions).length)
      request.costing_options = { [costing]: costingOptions };

    const url = new URL('/route', this.baseUrl);
    const snapRadii = [
      ...new Set([
        snapRadiusMeters,
        Math.max(snapRadiusMeters, 1_000),
        Math.max(snapRadiusMeters, 3_000),
        5_000,
      ]),
    ];
    let snapRadiusIndex = 0;
    let attempt = 0;

    while (true) {
      if (options.signal?.aborted) {
        throw new ValhallaError('cancelled', 'Route request was cancelled.');
      }
      const currentSnapRadius = snapRadii[snapRadiusIndex]!;
      for (const location of request.locations as Array<
        Record<string, unknown>
      >) {
        location.radius = currentSnapRadius;
      }
      url.searchParams.set('json', JSON.stringify(request));
      const controller = new AbortController();
      const onAbort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener('abort', onAbort, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.timeoutMs);
      try {
        const response = await this.fetcher(url, { signal: controller.signal });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const error = mapEngineError(response.status, body);
          if (
            error.code === 'invalid_waypoint' &&
            snapRadiusIndex < snapRadii.length - 1
          ) {
            snapRadiusIndex += 1;
            continue;
          }
          if (error.code === 'invalid_waypoint') {
            throw new ValhallaError(
              'invalid_waypoint',
              `No routeable edge was found within ${currentSnapRadius} m of these waypoints. Tried wider road searches up to this distance.`,
            );
          }
          if (error.retryable && attempt < this.retries) {
            attempt += 1;
            continue;
          }
          throw error;
        }
        const parsed = valhallaResponseSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValhallaError(
            'invalid_response',
            'Valhalla returned an incomplete route response.',
          );
        }
        const coordinates: LngLat[] = [];
        let distanceKm = 0;
        for (const leg of parsed.data.trip.legs) {
          const points = decodePolyline6(leg.shape);
          coordinates.push(...(coordinates.length ? points.slice(1) : points));
          distanceKm += leg.summary.length;
        }
        if (coordinates.length < 2) {
          throw new ValhallaError(
            'invalid_response',
            'Valhalla returned an empty route geometry.',
          );
        }
        return {
          mode,
          geometry: { type: 'LineString', coordinates },
          distanceMeters: distanceKm * 1000,
        };
      } catch (error) {
        if (error instanceof ValhallaError) throw error;
        if (options.signal?.aborted) {
          throw new ValhallaError(
            'cancelled',
            'Route request was cancelled.',
            false,
            { cause: error },
          );
        }
        if (timedOut) {
          throw new ValhallaError(
            'timeout',
            `Valhalla exceeded the ${this.timeoutMs} ms timeout.`,
            false,
            { cause: error },
          );
        }
        if (attempt < this.retries) {
          attempt += 1;
          continue;
        }
        throw new ValhallaError(
          'engine_down',
          'Could not connect to the Valhalla routing service.',
          true,
          { cause: error },
        );
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
      }
    }
  }
}
