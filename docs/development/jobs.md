# Durable generation jobs

The synchronous `POST /api/v1/generate` endpoint remains available for the current editor. New clients can use the durable job API:

- `POST /api/v1/generations` validates and saves a request, then returns HTTP 202 with a job ID and status URL.
- `GET /api/v1/generations/{id}` returns pending, running, completed, failed, or cancelled state, progress, and the saved result/error.
- `POST /api/v1/generations/{id}/cancel` requests cancellation. Active workers poll the cancellation key and pass an abort signal into routing.
- Send an `Idempotency-Key` header (up to 120 characters) to reuse the same job for client retries. Reusing a key for a different JSON request returns HTTP 409.
- All `/api/v1` JSON responses use `{ apiVersion: "v1", status, data, error }`. The existing progress-stream endpoint sends the same envelope in its result event.

## Local services and worker

Start Docker Desktop, then run:

```sh
pnpm jobs:up
pnpm db:migrate
pnpm routing:up
```

Copy `apps/web/.env.example` to `apps/web/.env.local` for Next.js and to the root `.env` for Docker Compose and the worker. The defaults in both files point to local development services. Then use separate terminals:

```sh
pnpm dev
pnpm worker
```

The worker is independently runnable with `pnpm --filter @drawtrail/worker start`; it does not start Next.js. `pnpm db:migrate:down` rolls back the latest migration and drops generation/candidate data, so test rollback only with a disposable database or a backup. PostgreSQL stores the request, progress, terminal result/error, timestamps, provenance, and PostGIS candidate geometries. Redis/BullMQ stores queue delivery state; the worker reconciles persisted pending jobs that have not yet been enqueued on startup.

With all services, the app, and worker running, use `pnpm test:generation:jobs:integration` to submit a real route job, verify idempotent retry and unknown-ID behavior, and poll for its persisted result.

Do not use the documented local database password for a public deployment. These unauthenticated job endpoints are intended for local development until the authentication and retention phases are implemented. A job ID acts as an opaque status capability.

## Verification

`npm test` covers the API envelope, accepted requests, idempotent retries and conflicts, status lookup, cancellation, and the worker processor's success, failure, and cooperative-cancellation paths with stubbed dependencies. For persistence across actual process restarts and migration up/down, run the services above; the test environment may not have a Docker daemon available.
