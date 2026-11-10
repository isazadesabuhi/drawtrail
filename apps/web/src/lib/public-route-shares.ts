import { randomUUID } from 'node:crypto';
import {
  routeGenerationSuccessSchema,
  type RouteGenerationSuccess,
} from '@drawtrail/validation';

export interface ShareDatabase {
  query<T>(sql: string, values: unknown[]): Promise<{ rows: T[] }>;
}

export async function publishRoute(database: ShareDatabase, input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const body = input as Record<string, unknown>;
  if (
    body.locationSharingConfirmed !== true ||
    typeof body.name !== 'string' ||
    body.name.trim().length < 1 ||
    body.name.trim().length > 80
  )
    return null;
  const route = routeGenerationSuccessSchema.safeParse(body.route);
  if (!route.success) return null;
  if (JSON.stringify(route.data).length > 1_000_000) return null;
  const id = randomUUID();
  const result = await database.query<{ expires_at: Date }>(
    `WITH expired AS (
       DELETE FROM public_route_shares WHERE expires_at <= now()
     )
     INSERT INTO public_route_shares (id, name, route_json)
     VALUES ($1, $2, $3::jsonb)
     RETURNING expires_at`,
    [id, body.name.trim(), JSON.stringify(route.data)],
  );
  const expiresAt = result.rows[0]?.expires_at;
  if (!expiresAt) throw new Error('Share insert returned no expiry.');
  return { id, name: body.name.trim(), expiresAt: expiresAt.toISOString() };
}

export async function getPublishedRoute(database: ShareDatabase, id: string) {
  const parsedId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    );
  if (!parsedId) return null;
  const result = await database.query<{
    name: string;
    route_json: RouteGenerationSuccess;
    expires_at: Date;
  }>(
    `SELECT name, route_json, expires_at FROM public_route_shares
     WHERE id = $1 AND expires_at > now()`,
    [id],
  );
  const share = result.rows[0];
  if (!share) return null;
  const route = routeGenerationSuccessSchema.safeParse(share.route_json);
  if (!route.success) return null;
  return {
    name: share.name,
    route: route.data,
    expiresAt: share.expires_at.toISOString(),
  };
}
