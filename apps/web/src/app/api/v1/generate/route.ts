import { generateRoute } from '../../../../lib/route-generator';
import { ValhallaClient } from '../../../../lib/valhalla-client';
import { readServerConfig } from '../../../../lib/env.mjs';
import { apiErrorEnvelope, apiSuccessEnvelope } from '@drawtrail/api-client';
import {
  apiEnvelopeSchema,
  routeGenerationFailureSchema,
  routeGenerationRequestSchema,
  routeGenerationResponseSchema,
  routeGenerationSuccessSchema,
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
    return Response.json(
      apiEnvelopeSchema(routeGenerationSuccessSchema).parse(
        apiErrorEnvelope(body.code, body.message, body.warnings),
      ),
      { status: 400 },
    );
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
    return Response.json(
      apiEnvelopeSchema(routeGenerationSuccessSchema).parse(
        apiErrorEnvelope(body.code, body.message, body.warnings),
      ),
      { status: 400 },
    );
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
    return Response.json(
      apiEnvelopeSchema(routeGenerationSuccessSchema).parse(
        apiErrorEnvelope(body.code, body.message, body.warnings),
      ),
      { status: 503 },
    );
  }

  const client = new ValhallaClient({
    baseUrl: config.VALHALLA_URL ?? 'http://127.0.0.1:8002',
    timeoutMs: 12_000,
    retries: 1,
  });
  const streamProgress = request.headers
    .get('accept')
    ?.includes('text/event-stream');
  if (streamProgress) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void generateRoute(
          parsed.data,
          (mode, from, to, signal, preferences) =>
            client.route(mode, from, to, {
              ...(signal ? { signal } : {}),
              ...(preferences ? { preferences } : {}),
            }),
          request.signal,
          (progress) => {
            controller.enqueue(
              encoder.encode(
                `event: progress\ndata: ${JSON.stringify(progress)}\n\n`,
              ),
            );
          },
        )
          .then((response) => {
            const validated = routeGenerationResponseSchema.parse(response);
            const envelope =
              validated.status === 'success'
                ? apiEnvelopeSchema(routeGenerationSuccessSchema).parse(
                    apiSuccessEnvelope(validated),
                  )
                : apiEnvelopeSchema(routeGenerationSuccessSchema).parse(
                    apiErrorEnvelope(
                      validated.code,
                      validated.message,
                      validated.warnings,
                    ),
                  );
            controller.enqueue(
              encoder.encode(
                `event: result\ndata: ${JSON.stringify(envelope)}\n\n`,
              ),
            );
            controller.close();
          })
          .catch((error: unknown) => {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : 'Route generation failed.' })}\n\n`,
              ),
            );
            controller.close();
          });
      },
      cancel() {
        // The incoming request signal is passed through to the routing engine.
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    });
  }

  const response = await generateRoute(
    parsed.data,
    (mode, from, to, signal, preferences) =>
      client.route(mode, from, to, {
        ...(signal ? { signal } : {}),
        ...(preferences ? { preferences } : {}),
      }),
    request.signal,
  );
  const validated = routeGenerationResponseSchema.parse(response);
  const envelope =
    validated.status === 'success'
      ? apiEnvelopeSchema(routeGenerationSuccessSchema).parse(
          apiSuccessEnvelope(validated),
        )
      : apiEnvelopeSchema(routeGenerationSuccessSchema).parse(
          apiErrorEnvelope(
            validated.code,
            validated.message,
            validated.warnings,
          ),
        );
  return Response.json(envelope, {
    status: validated.status === 'success' ? 200 : statusFor(validated.code),
  });
}
