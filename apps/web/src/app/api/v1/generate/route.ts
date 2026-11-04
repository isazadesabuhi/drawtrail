import { generateRoute } from '../../../../lib/route-generator';
import { ValhallaClient } from '../../../../lib/valhalla-client';
import { readServerConfig } from '../../../../lib/env.mjs';
import {
  routeGenerationFailureSchema,
  routeGenerationRequestSchema,
  routeGenerationResponseSchema,
} from '@drawtrail/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function statusFor(code: string) {
  if (code === 'missing_region') return 404;
  if (code === 'engine_down') return 503;
  if (code === 'timeout') return 504;
  if (code === 'cancelled') return 499;
  if (code === 'invalid_request' || code === 'invalid_drawing') return 400;
  if (code === 'no_route' || code === 'route_discontinuity') return 422;
  return 422;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    const body = routeGenerationFailureSchema.parse({
      status: 'error',
      code: 'invalid_request',
      message: 'Request body must be valid JSON.',
      warnings: [],
    });
    return Response.json(body, { status: 400 });
  }

  const parsed = routeGenerationRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const body = routeGenerationFailureSchema.parse({
      status: 'error',
      code: 'invalid_request',
      message:
        'The route request is invalid. Check the drawing, coordinates, mode, and settings.',
      warnings: [],
    });
    return Response.json(body, { status: 400 });
  }

  let config: ReturnType<typeof readServerConfig>;
  try {
    config = readServerConfig(process.env, false);
  } catch {
    const body = routeGenerationFailureSchema.parse({
      status: 'error',
      code: 'engine_down',
      message: 'Routing configuration is invalid. Check VALHALLA_URL.',
      warnings: [],
    });
    return Response.json(body, { status: 503 });
  }

  const client = new ValhallaClient({
    baseUrl: config.VALHALLA_URL ?? 'http://127.0.0.1:8002',
    timeoutMs: 12_000,
    retries: 1,
  });
  const response = await generateRoute(
    parsed.data,
    (mode, from, to, signal) =>
      client.route(mode, from, to, signal ? { signal } : {}),
    request.signal,
  );
  const validated = routeGenerationResponseSchema.parse(response);
  return Response.json(validated, {
    status: validated.status === 'success' ? 200 : statusFor(validated.code),
  });
}
