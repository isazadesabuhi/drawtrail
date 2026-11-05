# Phase 08 progress — 2026-11-05

Phase 08 adds the versioned durable-generation API, BullMQ worker, and PostgreSQL/PostGIS persistence model.

## Implemented

- All API v1 responses use a `{ apiVersion, status, data, error }` envelope. The existing synchronous endpoint remains available for the editor, and its SSE result event uses the same envelope.
- `POST /api/v1/generations` validates and persists a request, enqueues it, and returns HTTP 202 with the job ID and status URL. An optional `Idempotency-Key` returns the same job for the same JSON request; using the key with different request data returns HTTP 409.
- `GET /api/v1/generations/{id}` reports state, progress, result/error, and timestamps. `POST /api/v1/generations/{id}/cancel` persists cancellation and signals the worker.
- `apps/worker` is an independently runnable Node process. It uses bounded concurrency, processes jobs through the route optimizer, persists progress/results, and cooperatively aborts routing when cancellation is requested.
- BullMQ uses Redis with AOF and a persistent Compose volume. The worker reconciles saved pending jobs that were not marked enqueued.
- PostgreSQL/PostGIS Compose service and reversible migration create generation and candidate tables. Request/settings, progress, result/error, timestamps, metrics, provenance, and target/route geometries are stored. Idempotency keys are stored as SHA-256 digests.
- Contract tests cover envelope shapes, accepted and repeated requests, idempotency conflicts, unknown IDs, status, cancellation, and worker success/error/cancellation processing.
- `pnpm test:generation:jobs:integration` provides an opt-in service-backed test for submission, idempotent retry, unknown IDs, and completed persisted results.

## Verification

| Check                                                           | Result                                                                                                                                                                      |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/component/API/worker tests                                 | Pass: 170 tests across 26 files.                                                                                                                                            |
| Typecheck, lint, formatting, backlog registry, production build | Pass via `npm run check`.                                                                                                                                                   |
| Compose configuration                                           | Passes `docker compose config --quiet`.                                                                                                                                     |
| Live Redis/Postgres migration and worker processing             | Not run: Docker cannot connect to `npipe:////./pipe/docker_engine` in this environment. Tasks 08-05, 08-08, and 08-09 remain in review pending service-backed verification. |

## Run the service-backed checks

With Docker Desktop running, follow [durable job setup](../development/jobs.md): start PostGIS/Redis and Valhalla, migrate the database, then run the Next.js app and standalone worker in separate terminals. Verify a submitted job completes, inspect its result, restart the worker and confirm the status remains, then run the down/up migration check against local development data.

The job API is unauthenticated at this phase and intended for local development only. Do not expose it publicly before authentication and retention controls are implemented.
