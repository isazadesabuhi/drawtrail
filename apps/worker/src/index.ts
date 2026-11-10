import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  GENERATION_QUEUE,
  closeJobInfrastructure,
  createRedisConnection,
  enqueueGeneration,
  failGeneration,
  getGeneration,
  getGenerationRequest,
  listPendingGenerationIds,
  setGenerationRunning,
  updateGenerationProgress,
  completeGeneration,
} from '@drawtrail/jobs';
import { routeGenerationResponseSchema } from '@drawtrail/validation';
import { generateRoute } from '../../web/src/lib/route-generator';
import { ValhallaClient } from '../../web/src/lib/valhalla-client';
import { processGenerationTask } from './process-generation';

const concurrency = Math.max(
  1,
  Math.min(4, Number(process.env.WORKER_CONCURRENCY ?? 2)),
);
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const router = new ValhallaClient({
  baseUrl: process.env.VALHALLA_URL ?? 'http://127.0.0.1:8002',
  timeoutMs: 12_000,
  retries: 1,
});

const worker = new Worker(
  GENERATION_QUEUE,
  async (job) => {
    const { generationId } = job.data;
    const controller = new AbortController();
    const cancellationClient = createRedisConnection();
    let checkingCancellation = false;
    const timer = setInterval(() => {
      if (checkingCancellation) return;
      checkingCancellation = true;
      void cancellationClient
        .get(`drawtrail:cancel:${generationId}`)
        .then((value) => {
          if (value === '1') controller.abort();
        })
        .catch((error: unknown) => {
          console.error('Cancellation check failed:', error);
        })
        .finally(() => {
          checkingCancellation = false;
        });
    }, 250);
    timer.unref();

    try {
      return await processGenerationTask(
        generationId,
        controller.signal,
        {
          getState: async (id) => (await getGeneration(id))?.state ?? null,
          getRequest: getGenerationRequest,
          markRunning: setGenerationRunning,
          updateProgress: updateGenerationProgress,
          generate: async (request, signal, onProgress) =>
            routeGenerationResponseSchema.parse(
              await generateRoute(
                request,
                (mode, from, to, routeSignal, preferences) =>
                  router.route(mode, from, to, {
                    ...(routeSignal ? { signal: routeSignal } : {}),
                    ...(preferences ? { preferences } : {}),
                  }),
                signal,
                onProgress,
                router.elevation.bind(router),
              ),
            ),
          complete: completeGeneration,
          fail: failGeneration,
        },
        (progress) => {
          void job.updateProgress(progress).catch((error: unknown) => {
            console.error('Queue progress update failed:', error);
          });
        },
      );
    } finally {
      clearInterval(timer);
      await cancellationClient
        .del(`drawtrail:cancel:${generationId}`)
        .catch(() => undefined);
      await cancellationClient.quit();
    }
  },
  {
    connection,
    concurrency,
    limiter: { max: 10, duration: 1000 },
  },
);

worker.on('completed', (job) => console.log(`Generation ${job.id} completed.`));
worker.on('failed', (job, error) =>
  console.error(`Generation ${job?.id} failed:`, error),
);
worker.on('error', (error) => console.error('Worker error:', error));

for (const id of await listPendingGenerationIds()) {
  await enqueueGeneration(id);
}
console.log(`DrawTrail worker ready with concurrency ${concurrency}.`);

async function shutdown() {
  await worker.close();
  await connection.quit();
  await closeJobInfrastructure();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
