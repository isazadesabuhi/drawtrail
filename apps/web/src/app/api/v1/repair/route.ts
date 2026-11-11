import { apiErrorEnvelope, apiSuccessEnvelope } from '@drawtrail/api-client';
import {
  apiEnvelopeSchema,
  routeRepairRequestSchema,
  routeRepairSuccessSchema,
} from '@drawtrail/validation';
import { readServerConfig } from '../../../../lib/env.mjs';
import { repairRouteSection } from '../../../../lib/route-repair';
import { ValhallaClient, ValhallaError } from '../../../../lib/valhalla-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function errorResponse(code: string, message: string, status: number) {
  return Response.json(apiErrorEnvelope(code, message), { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      'invalid_request',
      'Request body must be valid JSON.',
      400,
    );
  }
  const parsed = routeRepairRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      'invalid_request',
      'The route repair request is invalid. Check the selected section and waypoints.',
      400,
    );
  }

  let config: ReturnType<typeof readServerConfig>;
  try {
    config = readServerConfig(process.env, false);
  } catch {
    return errorResponse(
      'service_unavailable',
      'Routing configuration is invalid. Check VALHALLA_URL.',
      503,
    );
  }

  const client = new ValhallaClient({
    baseUrl: config.VALHALLA_URL ?? 'http://127.0.0.1:8002',
    ...(config.VALHALLA_API_KEY ? { apiKey: config.VALHALLA_API_KEY } : {}),
    timeoutMs: 12_000,
    retries: 1,
  });
  try {
    const result = await repairRouteSection(
      parsed.data,
      (mode, from, to, signal) =>
        client.route(mode, from, to, {
          ...(signal ? { signal } : {}),
          ...(parsed.data.preferences
            ? { preferences: parsed.data.preferences }
            : {}),
        }),
      request.signal,
      client.elevation.bind(client),
    );
    return Response.json(
      apiEnvelopeSchema(routeRepairSuccessSchema).parse(
        apiSuccessEnvelope(result),
      ),
    );
  } catch (error) {
    if (error instanceof ValhallaError) {
      const code =
        error.code === 'invalid_waypoint' ? 'infeasible_waypoint' : error.code;
      const status =
        error.code === 'missing_region'
          ? 404
          : error.code === 'engine_down'
            ? 503
            : error.code === 'timeout'
              ? 504
              : error.code === 'cancelled'
                ? 499
                : 422;
      return errorResponse(code, error.message, status);
    }
    if (error instanceof RangeError) {
      return errorResponse('infeasible_waypoint', error.message, 422);
    }
    return errorResponse(
      'engine_down',
      'The routing service could not repair this route section.',
      503,
    );
  }
}
