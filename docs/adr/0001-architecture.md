# ADR 0001: Local-first TypeScript architecture

Status: accepted for initial implementation, 2026-11-04.

## Next.js web and API

Decision: pnpm TypeScript monorepo with `apps/web`, App Router, and future `/api/v1` Route Handlers. Pure packages expose types, validation, geographic utilities, and an API client without server credentials.

Trade-offs: shared language and one local web process simplify development; Next.js introduces framework conventions and server/client boundaries. Alternative: separate React SPA and Node API. Revisit if independent API deployment or non-web client needs exceed Route Handlers.

## Independent TypeScript worker

Decision: add a separately runnable Node worker when generation jobs become durable (phase 08). Never rely on an HTTP request for reliable long optimization.

Trade-offs: extra process and eventual queue operations; explicit cancellation and resource budgets are possible. Alternative: synchronous web generation for all work. Revisit for measured CPU constraints or a specialized algorithm runtime.

## Local Valhalla routing

Decision: route against local Valhalla and a fixed regional OSM extract. Walking and running use pedestrian access; cycling uses bicycle costing.

Trade-offs: no routing subscription, reproducible fixtures, but graph construction needs disk, RAM, and maintenance. Alternative: OSRM/GraphHopper or a hosted router. Revisit after measured shape quality, access coverage, or deployment cost evidence. Pin and test an image before claiming infrastructure complete.

## PostgreSQL/PostGIS and Redis/BullMQ later

Decision: defer services until phase 08; use versioned browser drafts before then. Durable job state will use Postgres/PostGIS and Redis/BullMQ with bounded concurrency.

Trade-offs: less initial setup but browser data is device-local and not durable across clearing storage. Alternative: SQLite and an in-process queue. Revisit if MVP volume does not justify the operational cost or worker delivery semantics need revision.

## Expo later

Decision: add `apps/mobile` after the versioned API stabilizes; reuse types, validation, and client packages, not browser map components.

Trade-offs: shared TypeScript but native maps, background location, signing, and device testing remain platform work. Alternative: responsive web/PWA only. Revisit after web MVP use and field validation.

## Map tiles

Decision: use MapLibre in phase 02 with configurable, attributed development tiles; select production hosting separately.

Trade-offs: tile licensing, availability, and quotas are an operational dependency independent of routing. Alternative: self-host tiles initially. Revisit before any public deployment. No paid service or deployment is authorized by this ADR.
