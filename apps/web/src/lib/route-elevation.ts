import type { LngLat } from '@drawtrail/types';
import {
  routeElevationSchema,
  type RouteElevation,
  type RouteGenerationResponse,
} from '@drawtrail/validation';

export type ElevationLookup = (
  coordinates: readonly LngLat[],
  distanceMeters: number,
  signal?: AbortSignal,
) => Promise<RouteElevation>;

/** Enrich only the shortlisted alternatives; terrain failure does not invalidate a street route. */
export async function addRouteElevation(
  result: RouteGenerationResponse,
  lookup?: ElevationLookup,
  signal?: AbortSignal,
): Promise<RouteGenerationResponse> {
  if (result.status !== 'success' || !lookup) return result;
  const cancelled = (): RouteGenerationResponse => ({
    status: 'error',
    code: 'cancelled',
    message: 'Route generation was cancelled.',
    warnings: [],
  });
  const profiles: RouteElevation[] = [];
  for (const candidate of result.alternatives ?? [result]) {
    if (signal?.aborted) return cancelled();
    try {
      const parsed = routeElevationSchema.safeParse(
        await lookup(
          candidate.route.geometry.coordinates,
          candidate.distanceMeters,
          signal,
        ),
      );
      const validDistance =
        parsed.success &&
        (parsed.data.status === 'unavailable' ||
          Math.abs(
            parsed.data.samples.at(-1)!.distanceMeters -
              candidate.distanceMeters,
          ) <= 1);
      profiles.push(
        parsed.success && validDistance
          ? parsed.data
          : {
              status: 'unavailable',
              source: 'valhalla',
              reason: 'invalid_response',
            },
      );
    } catch {
      profiles.push({
        status: 'unavailable',
        source: 'valhalla',
        reason: 'service_unavailable',
      });
    }
    if (signal?.aborted) return cancelled();
  }
  return {
    ...result,
    elevation: profiles[0]!,
    ...(result.alternatives
      ? {
          alternatives: result.alternatives.map((candidate, i) => ({
            ...candidate,
            elevation: profiles[i]!,
          })),
        }
      : {}),
  };
}
