import { getDatabase } from '@drawtrail/jobs';
import {
  getPublishedRoute,
  publishRoute,
} from '../../../../lib/public-route-shares';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 1_100_000)
      return Response.json(
        { error: 'Shared route payload is too large.' },
        { status: 413 },
      );
    body = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }
  try {
    const share = await publishRoute(getDatabase(), body);
    if (!share)
      return Response.json(
        {
          error:
            'A name, valid route, and location sharing confirmation are required.',
        },
        { status: 400 },
      );
    return Response.json(share, { status: 201 });
  } catch {
    return Response.json(
      { error: 'Route sharing is unavailable.' },
      { status: 503 },
    );
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  try {
    const share = await getPublishedRoute(getDatabase(), id);
    return share
      ? Response.json(share, {
          headers: { 'Cache-Control': 'public, max-age=60' },
        })
      : Response.json(
          { error: 'This shared route was not found or has expired.' },
          { status: 404 },
        );
  } catch {
    return Response.json(
      { error: 'Route sharing is unavailable.' },
      { status: 503 },
    );
  }
}
