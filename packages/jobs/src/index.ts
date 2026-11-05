import { createHash, randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import type {
  GenerationJobState,
  GenerationJobStatus,
  GenerationProgress,
  RouteGenerationRequest,
  RouteGenerationSuccess,
} from '@drawtrail/validation';

export const GENERATION_QUEUE = 'drawtrail-generations';
export type GenerationTask = { generationId: string };

export class IdempotencyConflictError extends Error {
  constructor() {
    super('This idempotency key was already used for a different request.');
    this.name = 'IdempotencyConflictError';
  }
}

let pool: Pool | undefined;
let queue: Queue<GenerationTask> | undefined;

export function getDatabase() {
  pool ??= new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      'postgres://drawtrail:drawtrail@127.0.0.1:5432/drawtrail',
    max: 8,
    connectionTimeoutMillis: 3000,
  });
  return pool;
}

function redisConnectionOptions(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null as null,
  };
}

export function getGenerationQueue() {
  queue ??= new Queue<GenerationTask>(GENERATION_QUEUE, {
    connection: redisConnectionOptions(
      process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    ),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 86_400, count: 1000 },
      removeOnFail: { age: 604_800, count: 2000 },
    },
  });
  return queue;
}

export function createRedisConnection() {
  return new IORedis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
  });
}

type GenerationRow = {
  id: string;
  status: GenerationJobState;
  progress_json: GenerationProgress | null;
  result_json: RouteGenerationSuccess | null;
  error_json: { code: string; message: string } | null;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
};

function toJobStatus(row: GenerationRow): GenerationJobStatus {
  return {
    id: row.id,
    state: row.status,
    progress: row.progress_json,
    result: row.result_json,
    error: row.error_json as GenerationJobStatus['error'],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
  };
}

export async function createGeneration(
  request: RouteGenerationRequest,
  idempotencyKey: string | null,
) {
  const id = randomUUID();
  const keyDigest = idempotencyKey
    ? createHash('sha256').update(idempotencyKey).digest('hex')
    : null;
  const inserted = await getDatabase().query<GenerationRow>(
    `INSERT INTO generations (id, idempotency_key, request_json)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id, status, progress_json, result_json, error_json,
               created_at, updated_at, started_at, completed_at`,
    [id, keyDigest, JSON.stringify(request)],
  );
  if (inserted.rows[0])
    return { status: toJobStatus(inserted.rows[0]), created: true };
  const existing = await getDatabase().query<
    GenerationRow & { same_request: boolean }
  >(
    `SELECT id, status, progress_json, result_json, error_json, request_json = $2::jsonb AS same_request,
            created_at, updated_at, started_at, completed_at
     FROM generations WHERE idempotency_key = $1`,
    [keyDigest, JSON.stringify(request)],
  );
  if (!existing.rows[0])
    throw new Error('Idempotent generation lookup failed.');
  if (!existing.rows[0].same_request) throw new IdempotencyConflictError();
  return { status: toJobStatus(existing.rows[0]), created: false };
}

export async function getGeneration(id: string) {
  const result = await getDatabase().query<GenerationRow>(
    `SELECT id, status, progress_json, result_json, error_json,
            created_at, updated_at, started_at, completed_at
     FROM generations WHERE id = $1`,
    [id],
  );
  return result.rows[0] ? toJobStatus(result.rows[0]) : null;
}

export async function getGenerationRequest(
  id: string,
): Promise<RouteGenerationRequest | null> {
  const result = await getDatabase().query<{
    request_json: RouteGenerationRequest;
  }>('SELECT request_json FROM generations WHERE id = $1', [id]);
  return result.rows[0]?.request_json ?? null;
}

export async function listPendingGenerationIds(limit = 100) {
  const result = await getDatabase().query<{ id: string }>(
    `SELECT id FROM generations
     WHERE status = 'pending' AND queue_enqueued_at IS NULL
     ORDER BY created_at LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => row.id);
}

export async function enqueueGeneration(id: string) {
  await getGenerationQueue().add(
    'generate-route',
    { generationId: id },
    { jobId: id },
  );
  await getDatabase().query(
    `UPDATE generations SET queue_enqueued_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [id],
  );
}

export async function setGenerationRunning(id: string) {
  await getDatabase().query(
    `UPDATE generations SET status = 'running', started_at = coalesce(started_at, now()), updated_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [id],
  );
}

export async function updateGenerationProgress(
  id: string,
  progress: GenerationProgress,
) {
  await getDatabase().query(
    `UPDATE generations SET progress_json = $2::jsonb, updated_at = now()
     WHERE id = $1 AND status = 'running'`,
    [id, JSON.stringify(progress)],
  );
}

export async function completeGeneration(
  id: string,
  result: RouteGenerationSuccess,
) {
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const current = await client.query<{ status: GenerationJobState }>(
      'SELECT status FROM generations WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (current.rows[0]?.status !== 'running') {
      await client.query('ROLLBACK');
      return;
    }
    await client.query(
      'DELETE FROM generation_candidates WHERE generation_id = $1',
      [id],
    );
    const candidates = result.alternatives?.length
      ? result.alternatives
      : [
          {
            id: 'route-1',
            targetGeometry: result.targetGeometry,
            route: result.route,
            distanceMeters: result.distanceMeters,
            similarityScore: result.similarityScore,
            retracingMeters: result.retracingMeters,
            score: result.similarityScore,
            waypointCount: result.waypointCount,
            warnings: result.warnings,
          },
        ];
    for (const [index, candidate] of candidates.entries()) {
      await client.query(
        `INSERT INTO generation_candidates
          (generation_id, ordinal, target_geometry, route_geometry, route_json, metrics_json, provenance_json)
         VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326),
                 ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), $5::jsonb, $6::jsonb, $7::jsonb)`,
        [
          id,
          index + 1,
          JSON.stringify(candidate.targetGeometry),
          JSON.stringify(candidate.route.geometry),
          JSON.stringify(candidate.route),
          JSON.stringify({
            distanceMeters: candidate.distanceMeters,
            similarityScore: candidate.similarityScore,
            retracingMeters: candidate.retracingMeters,
            score: candidate.score,
            waypointCount: candidate.waypointCount,
            warnings: candidate.warnings,
          }),
          JSON.stringify({
            engine: 'valhalla',
            mode: candidate.route.properties.mode,
          }),
        ],
      );
    }
    await client.query(
      `UPDATE generations SET status = 'completed', result_json = $2::jsonb,
       error_json = NULL, completed_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'running'`,
      [id, JSON.stringify(result)],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function failGeneration(
  id: string,
  code: string,
  message: string,
) {
  const state: GenerationJobState =
    code === 'cancelled' ? 'cancelled' : 'failed';
  await getDatabase().query(
    `UPDATE generations SET status = $2, error_json = $3::jsonb,
     completed_at = now(), updated_at = now()
     WHERE id = $1 AND status IN ('pending', 'running')`,
    [id, state, JSON.stringify({ code, message })],
  );
}

export async function cancelGeneration(id: string) {
  const current = await getGeneration(id);
  if (!current) return null;
  if (
    current.state === 'completed' ||
    current.state === 'failed' ||
    current.state === 'cancelled'
  )
    return current;
  await getDatabase().query(
    `UPDATE generations SET status = 'cancelled', error_json = $2::jsonb,
     completed_at = now(), updated_at = now() WHERE id = $1 AND status IN ('pending', 'running')`,
    [
      id,
      JSON.stringify({
        code: 'cancelled',
        message: 'Generation was cancelled.',
      }),
    ],
  );
  const redis = createRedisConnection();
  const job = await getGenerationQueue().getJob(id);
  await redis.set(`drawtrail:cancel:${id}`, '1', 'EX', 3600);
  if (job && (await job.getState()) !== 'active') {
    await job.remove().catch(() => undefined);
  }
  await redis.quit();
  return getGeneration(id);
}

export async function closeJobInfrastructure() {
  await Promise.all([pool?.end(), queue?.close()]);
  pool = undefined;
  queue = undefined;
}
