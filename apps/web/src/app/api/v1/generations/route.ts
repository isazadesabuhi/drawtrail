import { apiErrorEnvelope, apiSuccessEnvelope } from '@drawtrail/api-client';
import {
  routeGenerationRequestSchema,
  generationJobAcceptedSchema,
  apiEnvelopeSchema,
} from '@drawtrail/validation';
import {
  createGeneration,
  enqueueGeneration,
  failGeneration,
  IdempotencyConflictError,
} from '@drawtrail/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      apiErrorEnvelope('invalid_request', 'Request body must be valid JSON.'),
      { status: 400 },
    );
  }
  const parsed = routeGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      apiErrorEnvelope(
        'invalid_request',
        'The route request is invalid. Check the drawing, coordinates, mode, and settings.',
      ),
      { status: 400 },
    );
  }
  const idempotencyKey = request.headers.get('idempotency-key')?.trim() || null;
  if (idempotencyKey && idempotencyKey.length > 120) {
    return Response.json(
      apiErrorEnvelope(
        'invalid_request',
        'Idempotency-Key must be 120 characters or fewer.',
      ),
      { status: 400 },
    );
  }
  try {
    const created = await createGeneration(parsed.data, idempotencyKey);
    if (created.created) {
      try {
        await enqueueGeneration(created.status.id);
      } catch {
        await failGeneration(
          created.status.id,
          'service_unavailable',
          'The job queue could not accept this generation.',
        );
        return Response.json(
          apiErrorEnvelope(
            'service_unavailable',
            'The job queue is unavailable. Please retry.',
          ),
          { status: 503 },
        );
      }
    }
    const data = generationJobAcceptedSchema.parse({
      id: created.status.id,
      state: created.status.state,
      statusUrl: `/api/v1/generations/${created.status.id}`,
      reused: !created.created,
    });
    const envelope = apiEnvelopeSchema(generationJobAcceptedSchema).parse(
      apiSuccessEnvelope(data),
    );
    return Response.json(envelope, {
      status: created.created ? 202 : 200,
      headers: { location: data.statusUrl },
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return Response.json(
        apiErrorEnvelope('idempotency_conflict', error.message),
        { status: 409 },
      );
    }
    return Response.json(
      apiErrorEnvelope(
        'service_unavailable',
        'Generation storage is unavailable. Please retry.',
      ),
      { status: 503 },
    );
  }
}
