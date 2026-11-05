import { apiErrorEnvelope, apiSuccessEnvelope } from '@drawtrail/api-client';
import {
  apiEnvelopeSchema,
  generationJobStatusSchema,
} from '@drawtrail/validation';
import { getGeneration } from '@drawtrail/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    return Response.json(
      apiErrorEnvelope('not_found', 'Generation was not found.'),
      { status: 404 },
    );
  }
  try {
    const status = await getGeneration(id);
    if (!status)
      return Response.json(
        apiErrorEnvelope('not_found', 'Generation was not found.'),
        { status: 404 },
      );
    const data = generationJobStatusSchema.parse(status);
    return Response.json(
      apiEnvelopeSchema(generationJobStatusSchema).parse(
        apiSuccessEnvelope(data),
      ),
    );
  } catch {
    return Response.json(
      apiErrorEnvelope(
        'service_unavailable',
        'Generation storage is unavailable.',
      ),
      { status: 503 },
    );
  }
}
