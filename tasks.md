# GPS Art — Codex Implementation Backlog (Living Plan)

**Goal:** Turn freehand drawings, silhouettes, SVGs, and eventually photos into connected walking/running/cycling routes following real streets; expose a reusable API to a Next.js web app and future Expo mobile apps.

**Technical baseline:** pnpm TypeScript monorepo; `apps/web` Next.js App Router + Route Handlers (`/api/v1`), `apps/mobile` Expo later, shared packages, independent Node.js route worker, local Valhalla + OpenStreetMap data, MapLibre GL JS, Turf.js, PostgreSQL/PostGIS + Redis/BullMQ when needed. Use free/local infrastructure for development. No Django or paid routing API required. Treat map tile hosting as a separate operational concern.

**Important constraint:** The application must never claim that raw drawing strokes are safe/navigable streets. Only router-validated, contiguous network geometry is exportable as a navigable route. Do not assume matching a shape is solved by simply snapping points.

## Task rules

- IDs are permanent. New tasks get new IDs; do not renumber or silently change acceptance criteria. Record scope revisions in `TASKS.md` and ADRs.
- Each task should be its own small PR or commit, generally one focused deliverable. If too large, split into child tasks before coding.
- Status: `todo`, `in progress`, `blocked`, `review`, `done`; no task is `done` until checks/acceptance criteria pass.
- Keep changes backward compatible unless explicitly approved. Prefer local, open-source services; do not add subscriptions, credentials, or cloud deployments without asking.
- Codex should inspect repository state before implementation, report changed files, commands and results, known limitations, and next task. No unsupported success claims.
- For algorithms, test on **fixed fixtures and fixed OSM extracts**; live map data evolves, so avoid brittle exact polyline expectations.
- Map coordinates: API/GeoJSON `[longitude, latitude]`; metric projection inside optimizer. Never use degree-distance for target kilometers.
- Default first test area: Lyon, France, with a smaller sample region allowed for Valhalla setup if needed. Running initially shares pedestrian access logic with mode-specific preferences.

## Milestones / quality gates

| Gate                | Required tasks | Exit test                                                                     |
| ------------------- | -------------- | ----------------------------------------------------------------------------- |
| A: Scaffold         | 00–01          | Clean install, checks, web smoke test                                         |
| B: Drawing map      | 02–04          | Draw a heart and place it with correct scale/rotation over a map              |
| C: Routing baseline | 05–06          | Generate an actual contiguous walking route, show warnings and measured stats |
| D: Strong MVP       | 07–09          | Compare three candidates, background jobs, exports and mobile-responsive UI   |
| E: Public beta      | 10–11          | Secure ownership, rate limits, production service and field validation        |
| F: Mobile           | 12–13          | Android/iOS client reuses the API and tracks activities                       |
| G: Advanced         | 14             | Improved input recognition and broader geographic support                     |

## Task list

## Phase 00 — Product specification & engineering rules (P0)

### [x] 00-01 — Define v1 product boundaries

**Scope:** Write target users, web MVP vs mobile scope, supported inputs (freehand/SVG first), modes, and explicit exclusions.

**Acceptance:** docs/product/scope.md describes MVP and future scope; no code changes.

### [x] 00-02 — Write user stories and journeys

**Scope:** Document create/edit/generate/compare/export user flows, errors, and no-route experience.

**Acceptance:** Every MVP story has an observable success condition.

### [x] 00-03 — Define route-quality metrics

**Scope:** Specify shape fidelity, path continuity, legality proxy, requested-length error, repeats, and runtime; define thresholds as configurable initial targets.

**Acceptance:** docs/algorithm/metrics.md includes formula, units and how each is tested.

### [x] 00-04 — Record architecture decisions

**Scope:** Create ADRs for Next.js API, TypeScript worker, Valhalla, Postgres/PostGIS and Expo later.

**Acceptance:** Each ADR has decision, trade-offs, alternative and revision trigger.

### [x] 00-05 — Set repository contribution standards

**Scope:** Write naming, PR, small-task workflow, branch and commit conventions, definition of done.

**Acceptance:** CONTRIBUTING.md includes test and reporting expectations.

### [x] 00-06 — Create living task registry

**Scope:** Create TASKS.md tracking IDs, status, dependencies, decisions, and changes.

**Acceptance:** No missing IDs; changes documented without renumbering.

## Phase 01 — Monorepo and developer tooling (P0)

### [x] 01-01 — Initialize pnpm workspace

**Scope:** Create root package.json, pnpm-workspace.yaml, lockfile and workspace scripts.

**Acceptance:** Clean install succeeds from root.

### [x] 01-02 — Scaffold Next.js web application

**Scope:** Create apps/web with App Router, TypeScript and Tailwind.

**Acceptance:** Home page loads locally and build succeeds.

### [x] 01-03 — Create shared packages

**Scope:** Create packages/types, packages/validation, packages/geo-utils and packages/api-client with exports.

**Acceptance:** Web imports an example type without path hacks.

### [x] 01-04 — Set TypeScript strictness

**Scope:** Use shared tsconfig, strict mode and server/browser boundaries.

**Acceptance:** Root typecheck succeeds.

### [x] 01-05 — Configure lint and formatter

**Scope:** Add ESLint and Prettier with consistent scripts.

**Acceptance:** Lint and format checks pass.

### [x] 01-06 — Configure unit test framework

**Scope:** Set up Vitest for pure TypeScript packages.

**Acceptance:** One sample test runs in CI-compatible command.

### [x] 01-07 — Configure web component tests

**Scope:** Add Testing Library for React components.

**Acceptance:** One interaction test passes.

### [x] 01-08 — Set up Playwright

**Scope:** Add web E2E config and minimal smoke test.

**Acceptance:** Smoke test launches homepage.

### [x] 01-09 — Set up environment handling

**Scope:** Add env examples, runtime validation and secret-safe configuration.

**Acceptance:** Missing required variables fail with useful errors; no secrets committed.

### [ ] 01-10 — Add GitHub Actions baseline CI

**Scope:** Run install, lint, typecheck, unit tests, build on PRs.

**Acceptance:** Bad lint/test change fails workflow.

### [x] 01-11 — Write local development README

**Scope:** Document Node/pnpm/Docker, startup, troubleshooting, Windows/WSL notes.

**Acceptance:** Fresh clone has reproducible setup.

### [x] 01-12 — Fix and verify development-server startup

**Scope:** Fix Tailwind import resolution when a dev transform omits its filename; provide a stable local dev command and run browser tests against development mode.

**Acceptance:** Missing-filename CSS regression passes; home, workspace, and CSS respond with HTTP 200 under the root dev command; desktop/mobile development browser tests and existing checks pass.

## Phase 02 — Maps and application shell (P0)

### [x] 02-01 — Create responsive app shell

**Scope:** Add header, navigation, workspace and accessible loading/error states.

**Acceptance:** Desktop and phone viewport render without overflow.

### [x] 02-02 — Integrate MapLibre client-side

**Scope:** Create browser-only Map component with cleanup on unmount.

**Acceptance:** No SSR errors; map pans and zooms.

### [x] 02-03 — Configure compliant development tiles

**Scope:** Make tile style configurable, add attribution and document service usage limits.

**Acceptance:** Attribution visible; no reliance on demo tiles for production.

### [x] 02-04 — Set initial city and map bounds

**Scope:** Default to Lyon test area; add centering and zoom reset.

**Acceptance:** User can return to default viewport.

### [x] 02-05 — Add map controls

**Scope:** Provide zoom, reset bearing, fullscreen where supported.

**Acceptance:** Controls respond to keyboard and pointer.

### [x] 02-06 — Create location search abstraction

**Scope:** Create replaceable geocoding interface and local/manual coordinate fallback.

**Acceptance:** Search can be disabled without breaking map selection.

### [x] 02-07 — Allow explicit start-point selection

**Scope:** Click or drag marker; display latitude/longitude with order conventions.

**Acceptance:** Chosen start point persists in editor state.

### [x] 02-08 — Build basic map interaction tests

**Scope:** Test map shell, marker state and unavailable-tile error.

**Acceptance:** Automated checks pass using mocks.

## Phase 03 — Drawing and image inputs (P0)

### [x] 03-01 — Define canonical drawing model

**Scope:** Represent ordered strokes, open/closed status, normalized coordinates and metadata.

**Acceptance:** Zod schema validates fixtures.

### [x] 03-02 — Implement freehand drawing canvas

**Scope:** Draw strokes by mouse and touch with visible pointer feedback.

**Acceptance:** Strokes stored in canonical model.

### [x] 03-03 — Add undo/redo and clear

**Scope:** Implement history changes for canvas edits.

**Acceptance:** Undo/redo works for multiple strokes.

### [x] 03-04 — Add shape presets

**Scope:** Provide heart, circle, square, star and simple single-stroke letter.

**Acceptance:** Presets create deterministic strokes.

### [x] 03-05 — Support SVG upload

**Scope:** Safely parse limited path geometry; reject scripts/external references.

**Acceptance:** Allowed SVG loads; malicious/invalid SVG rejected.

### [x] 03-06 — Support raster image upload preview

**Scope:** Accept limited PNG/JPEG with size limits and client preview, without pretending it is route-ready.

**Acceptance:** Preview and error feedback work.

### [x] 03-07 — Implement silhouette extraction prototype

**Scope:** Convert high-contrast raster to ordered contour; document limitations.

**Acceptance:** Fixture PNG produces ordered outline within tolerance.

### [x] 03-08 — Handle multi-stroke images explicitly

**Scope:** Expose stroke ordering/selection; reject unsupported complex tracing with clear message.

**Acceptance:** No silent joining of separate strokes.

### [x] 03-09 — Add stroke simplification and resampling

**Scope:** Implement RDP-like simplification and arc-length resampling; preserve closure.

**Acceptance:** Tests cover corners, zero-length and loops.

### [x] 03-10 — Add drawing manipulation

**Scope:** Move, rotate, flip and scale shape within editor.

**Acceptance:** Model updates and preview reflects changes.

### [x] 03-11 — Persist draft locally

**Scope:** Store nonsensitive editor draft in browser with schema version.

**Acceptance:** Reload restores draft; corrupt draft resets safely.

### [x] 03-12 — Test accessibility and touch input

**Scope:** Cover controls, keyboard alternatives and touch gestures.

**Acceptance:** Basic E2E drawing journey passes on mobile viewport.

## Phase 04 — Geographic geometry foundation (P0)

### [x] 04-01 — Define GeoJSON and coordinate conventions

**Scope:** Use WGS84 [longitude, latitude] at boundaries and projected metric coordinates internally.

**Acceptance:** Validation rejects swapped/out-of-range values.

### [x] 04-02 — Implement geographic projection utilities

**Scope:** Select suitable local metric projection or geodesic approach and expose reversible transforms.

**Acceptance:** Round-trip fixture tolerance documented and tested.

### [x] 04-03 — Transform normalized strokes to map footprint

**Scope:** Fit drawing within metric bounding box while preserving aspect ratio.

**Acceptance:** A 1 km square stays proportionate at test latitude.

### [x] 04-04 — Add scale/rotation/translation candidate generation

**Scope:** Generate seeded placements within allowed search bounds.

**Acceptance:** Candidate list deterministic for same seed.

### [x] 04-05 — Implement geometry validity checks

**Scope:** Check NaN, duplicate points, degenerate shapes, self-intersections as informational where appropriate.

**Acceptance:** Invalid geometry returns typed errors.

### [x] 04-06 — Build route overlay preview

**Scope:** Show target drawing and later snapped route as separate colored GeoJSON layers.

**Acceptance:** Legend distinguishes target vs actual path.

### [x] 04-07 — Create geometry fixtures

**Scope:** Store canonical SVG/JSON fixtures for heart, circle, letter, open stroke, figure-eight.

**Acceptance:** Fixtures available to unit and E2E tests.

## Phase 05 — Local routing infrastructure (P0)

### [x] 05-01 — Add Docker Compose for Valhalla

**Scope:** Create optional local Valhalla service and persistent tile volume; pin tested image version.

**Acceptance:** Service boots via documented command.

### [x] 05-02 — Document regional OSM extract acquisition

**Scope:** Use small fixture region first, then Lyon/Rhône extract if suitable; note disk/RAM and license.

**Acceptance:** No large PBF committed; setup repeatable.

### [x] 05-03 — Create routing-service health check

**Scope:** Wait for loaded graph and check a valid pedestrian route, not just a running container.

**Acceptance:** Health fails when tiles absent and succeeds after load.

### [x] 05-04 — Build typed Valhalla client

**Scope:** Create server-only client with timeout, cancellation and bounded retries.

**Acceptance:** Fixture request decodes geometry and distance.

### [x] 05-05 — Implement pedestrian route request

**Scope:** Use walking costing and verify legal access using engine results.

**Acceptance:** Known walkable fixture returns path.

### [x] 05-06 — Implement cycling route request

**Scope:** Use bicycle costing and mode-specific restrictions.

**Acceptance:** Cycling example differs from walking where network requires.

### [x] 05-07 — Implement running profile baseline

**Scope:** Treat running as pedestrian routing with configurable preferences, not invented distinct Valhalla profile.

**Acceptance:** Request and documentation state assumption.

### [x] 05-08 — Normalize routing errors

**Scope:** Handle no-route, timeouts, invalid waypoints, missing region and engine down.

**Acceptance:** Typed error contract tested.

### [x] 05-09 — Add routing fixtures and integration smoke test

**Scope:** Check simple A-to-B, disconnected endpoints and invalid coordinates.

**Acceptance:** Integration suite is opt-in and reproducible.

## Phase 06 — First working GPS-art generation (P0)

### [x] 06-01 — Define generator request/response schemas

**Scope:** Include drawing, center, mode, target distance, loop preference, bounds and settings.

**Acceptance:** Zod types and examples cover success/failure.

### [x] 06-02 — Sample ordered drawing waypoints

**Scope:** Produce N metric candidate points preserving feature corners.

**Acceptance:** Deterministic sampling for fixtures.

### [x] 06-03 — Create waypoint feasibility filter

**Scope:** Check bounds and route access; discard implausible or out-of-region points.

**Acceptance:** Invalid candidates get reason codes.

### [x] 06-04 — Implement segment-by-segment routing

**Scope:** Route between consecutive candidate waypoints preserving stroke order.

**Acceptance:** Returned path is concatenated in correct order.

### [x] 06-05 — Implement closed-loop completion

**Scope:** Connect ending point to start when loop=true; do not assume geometric closure means network closure.

**Acceptance:** Start and end within configured network tolerance.

### [x] 06-06 — Calculate real routed distance

**Scope:** Use routed geometry/engine result, not straight-line shape length.

**Acceptance:** Fixture distance matches route response tolerance.

### [x] 06-07 — Implement fixed-location baseline

**Scope:** Generate first viable shape route near a pinned location using deterministic placement.

**Acceptance:** Heart fixture yields a continuous route in demo area or typed failure.

### [x] 06-08 — Score basic shape similarity

**Scope:** Rasterize/normalize or resample geometry; compare target vs route with documented metric.

**Acceptance:** Identical fixture scores better than distorted one.

### [x] 06-09 — Add baseline result page

**Scope:** Show generated route, target overlay, distance, similarity and explicit warnings.

**Acceptance:** User can visually compare target and result.

### [x] 06-10 — Create golden test scenarios

**Scope:** Store real route examples and expected invariants; avoid exact path snapshots against changing OSM tiles.

**Acceptance:** Repeatable tests work on fixed local dataset.

## Phase 07 — Quality and optimization (P1)

### [x] 07-01 — Add rotation search

**Scope:** Evaluate a small bounded set of shape rotations.

**Acceptance:** Best candidate selected by score.

### [x] 07-02 — Add scale search

**Scope:** Test scales around target distance within configurable range.

**Acceptance:** At least two sizes can be compared.

### [x] 07-03 — Add placement search

**Scope:** Search candidate centers inside user-selected radius/bounds.

**Acceptance:** No candidate exits search area.

### [x] 07-04 — Add shape-fidelity metric refinement

**Scope:** Compare normalized geometry with symmetric distance and preserve salient corners.

**Acceptance:** Known fixtures rank in sensible order.

### [x] 07-05 — Add distance deviation penalty

**Scope:** Favor requested kilometers with hard maximum deviation option.

**Acceptance:** Scoring tests reject overlong alternative when configured.

### [x] 07-06 — Add retracing penalty

**Scope:** Detect repeated road segments and score unavoidable vs excessive backtracking.

**Acceptance:** Simple out-and-back ranks below reasonable loop.

### [x] 07-07 — Add continuity and accessibility validation

**Scope:** Ensure adjacent segments connect and engine-approved mode is followed.

**Acceptance:** Disconnected/invalid routes never show as navigable.

### [x] 07-08 — Introduce alternative candidate ranking

**Scope:** Return best three distinct routes, deduplicated by geometry overlap.

**Acceptance:** UI does not show three identical routes.

### [x] 07-09 — Make optimizer deterministic

**Scope:** Accept seed, bounds, config and iteration cap.

**Acceptance:** Same fixtures produce same ordering.

### [x] 07-10 — Add runtime budgets and cancellation

**Scope:** Enforce max requests/seconds and abort work safely.

**Acceptance:** Cancellation stops new API calls.

### [x] 07-11 — Add progress reporting

**Scope:** Report stages with counts and approximate progress without false precision.

**Acceptance:** UI shows processing and completion states.

### [x] 07-12 — Add algorithm comparison harness

**Scope:** Benchmark heart, letter, circle in two neighborhoods across modes.

**Acceptance:** Report quality and runtime to JSON.

### [x] 07-13 — Handle impossible art gracefully

**Scope:** Give best-effort result with clear low-fidelity warning or no-route state.

**Acceptance:** No false success for impossible geometry.

## Phase 08 — Web API and durable jobs (P1)

### [x] 08-01 — Create versioned API response envelope

**Scope:** Standardize JSON shape, error codes and API versions.

**Acceptance:** Contract tests check success and error formats.

### [x] 08-02 — Add POST /api/v1/generations

**Scope:** Validate input and create generation request, without blocking on optimization.

**Acceptance:** Returns job ID + accepted status.

### [x] 08-03 — Add GET generation status

**Scope:** Expose pending/running/completed/failed/cancelled states and progress.

**Acceptance:** Unknown ID gives 404.

### [x] 08-04 — Add worker process package

**Scope:** Create independently runnable Node/TS worker sharing pure packages.

**Acceptance:** Worker starts without starting Next.js.

### [ ] 08-05 — Connect Redis queue

**Scope:** Use BullMQ for jobs; configure bounded concurrency and retry policy.

**Acceptance:** Enqueued job processed once in normal case.

### [x] 08-06 — Implement job cancellation

**Scope:** Allow cancellation and check cooperative cancellation in optimizer.

**Acceptance:** Cancelled work stops and status persists.

### [x] 08-07 — Implement idempotent generation requests

**Scope:** Accept idempotency key and avoid duplicate jobs from retries.

**Acceptance:** Repeated request returns same job.

### [ ] 08-08 — Add PostgreSQL and PostGIS containers

**Scope:** Set up local service, migrations and GeoJSON storage policy.

**Acceptance:** Migration up/down and connectivity succeed.

### [ ] 08-09 — Create route and generation persistence models

**Scope:** Persist request settings, candidate geometries, metrics, status, timestamps and provenance.

**Acceptance:** Data survives worker restart.

### [x] 08-10 — Add API contract and integration tests

**Scope:** Test job create/status/result/error with stubbed worker.

**Acceptance:** All states covered.

## Phase 09 — Web experience and exporting (P1)

### [ ] 09-01 — Create end-to-end generation wizard

**Scope:** Connect shape, mode, location, distance and generate action.

**Acceptance:** Happy-path E2E reaches result screen.

### [ ] 09-02 — Add route alternatives comparison

**Scope:** Show up to three candidates and their measured properties.

**Acceptance:** Choosing alternative updates map and details.

### [ ] 09-03 — Add route preference controls

**Scope:** Expose fidelity vs distance vs retracing and search radius with defaults.

**Acceptance:** Values persist into request.

### [ ] 09-04 — Add map fit and step-through

**Scope:** Fit route bounds and locate start/end; add route step list if available.

**Acceptance:** Preview never zooms to wrong hemisphere.

### [ ] 09-05 — Implement GPX export

**Scope:** Generate standards-compliant track with longitude/latitude order; include metadata.

**Acceptance:** GPX parses in independent test library.

### [ ] 09-06 — Implement GeoJSON export

**Scope:** Download standards-compliant LineString or MultiLineString as appropriate.

**Acceptance:** Export reimport yields same geometry.

### [ ] 09-07 — Add shareable image export

**Scope:** Create visual PNG snapshot with attribution and route stats.

**Acceptance:** Download works without leaking private draft.

### [ ] 09-08 — Add local route saving and reopening

**Scope:** Until auth exists, save user routes locally or anonymous server records with explicit retention.

**Acceptance:** Route opens after reload.

### [ ] 09-09 — Improve empty, loading and failure UI

**Scope:** Add retry, edit input, no suitable route, and routing engine unavailable states.

**Acceptance:** Accessibility tests cover states.

### [ ] 09-10 — Mobile-responsive browser design

**Scope:** Make web usable on phone with drawing, map and results.

**Acceptance:** Playwright mobile viewport pass.

## Phase 10 — Identity, accounts and route ownership (P2)

### [ ] 10-01 — Choose auth provider and threat model

**Scope:** Write security design for web and future mobile token handling.

**Acceptance:** ADR records session approach and mobile OAuth/PKCE plan.

### [ ] 10-02 — Implement web authentication

**Scope:** Add sign-in/out with selected provider; enforce secure session.

**Acceptance:** Protected test endpoint rejects anonymous access.

### [ ] 10-03 — Create user model and ownership checks

**Scope:** Associate routes and jobs with users; prevent cross-user access.

**Acceptance:** Unauthorized route fetch returns 404/403 per policy.

### [ ] 10-04 — Implement my routes list

**Scope:** Paginate, search and order saved routes.

**Acceptance:** User sees only own records.

### [ ] 10-05 — Add route rename and delete

**Scope:** Allow rename, delete and confirmation.

**Acceptance:** Deletion removes active views and storage references.

### [ ] 10-06 — Add account export and deletion workflow

**Scope:** Support download and deletion of personal activity data.

**Acceptance:** Integration test verifies account deletion behavior.

### [ ] 10-07 — Add privacy policy and consent surfaces

**Scope:** Explain location, uploads, retention and sharing defaults.

**Acceptance:** Routes private by default.

## Phase 11 — Production hardening and deployment (P2)

### [ ] 11-01 — Threat-model file and location endpoints

**Scope:** Document SSRF, upload bombs, arbitrary SVG, permissions, and abuse risks.

**Acceptance:** Mitigations tracked in tests/issues.

### [ ] 11-02 — Add input limits and rate limits

**Scope:** Limit image size, stroke count, region size, jobs and requests per user.

**Acceptance:** Oversized/abusive request fails safely.

### [ ] 11-03 — Add observability

**Scope:** Structured logs, request/job IDs, worker metrics and errors without raw GPS in logs.

**Acceptance:** A failed job traceable end to end.

### [ ] 11-04 — Add job resource controls

**Scope:** Set CPU/memory, retries, concurrency and queue pressure limits.

**Acceptance:** Load tests avoid unbounded job accumulation.

### [ ] 11-05 — Create staging deployment

**Scope:** Deploy web API, worker, Redis, PostGIS and routing engine with secure networking.

**Acceptance:** Public staging web can call private worker/routing services.

### [ ] 11-06 — Set up migrations and backups

**Scope:** Document safe database migrations, backup and restore.

**Acceptance:** Restore drill passes.

### [ ] 11-07 — Configure production map tile provider

**Scope:** Choose compliant hosted/self-hosted tiles, attribution, caching and budget.

**Acceptance:** No public demo tiles relied on in production.

### [ ] 11-08 — Set up deployment CI/CD

**Scope:** Build/test then deploy with gated secrets and rollback instructions.

**Acceptance:** Staging deployment reproducible.

### [ ] 11-09 — Conduct beta test and route safety review

**Scope:** Recruit test runners; verify route accessibility in field with explicit user judgment.

**Acceptance:** Issues filed with location-redacted evidence.

### [ ] 11-10 — Create release checklist

**Scope:** Cover privacy, licenses/attribution, accessibility, monitoring, terms and incident response.

**Acceptance:** No release without checklist signoff.

## Phase 12 — Mobile foundation (Expo) (P3)

### [ ] 12-01 — Scaffold Expo app

**Scope:** Create apps/mobile with TypeScript and Expo Router.

**Acceptance:** Runs on Android emulator/device.

### [ ] 12-02 — Build shared API client

**Scope:** Use package api-client with versioned endpoints, typed errors and token injection.

**Acceptance:** Mobile can fetch a mock route.

### [ ] 12-03 — Design mobile authentication

**Scope:** Implement OAuth authorization code + PKCE or secure equivalent with native deep linking.

**Acceptance:** Login/logout and token refresh are tested.

### [ ] 12-04 — Build mobile route list and detail

**Scope:** List owned routes and show metrics.

**Acceptance:** Can open a web-created route.

### [ ] 12-05 — Integrate native map

**Scope:** Use Expo-compatible map SDK; handle dev builds if required.

**Acceptance:** Displays actual route on Android and iOS test device.

### [ ] 12-06 — Add mobile creation form

**Scope:** Choose preset or uploaded shape, starting point, activity, distance.

**Acceptance:** Creates a generation job via API.

### [ ] 12-07 — Add generation status and alternatives

**Scope:** Poll or subscribe for results and choose a candidate.

**Acceptance:** Interrupted request can be resumed.

### [ ] 12-08 — Add mobile GPX share/export

**Scope:** Share GPX using platform share sheet.

**Acceptance:** GPX opens in compatible external app.

### [ ] 12-09 — Add mobile local cache

**Scope:** Cache owned routes and metadata with clear stale-data semantics.

**Acceptance:** Previously opened route viewable offline.

## Phase 13 — Mobile GPS recording and field use (P3)

### [ ] 13-01 — Implement foreground GPS permission flow

**Scope:** Request permission only when needed and explain use.

**Acceptance:** Denied permission handled without crash.

### [ ] 13-02 — Record active activity in foreground

**Scope:** Track timestamped fixes with accuracy, distance and pause/resume.

**Acceptance:** Recorded test path persists locally.

### [ ] 13-03 — Add off-route indicator

**Scope:** Compute deviation from route using geo distance with adjustable tolerance.

**Acceptance:** Mock test warns only after threshold.

### [ ] 13-04 — Add background location support

**Scope:** Use Expo TaskManager and required platform permissions via development build.

**Acceptance:** Background test works on real devices; docs state OS limitations.

### [ ] 13-05 — Protect activity data on device

**Scope:** Use suitable local storage and explicit retention/clear behavior.

**Acceptance:** Activity not publicly visible or leaked to logs.

### [ ] 13-06 — Implement offline activity queue and sync

**Scope:** Queue local activities and sync idempotently when online.

**Acceptance:** No duplicates after reconnect.

### [ ] 13-07 — Create activity history

**Scope:** Display recorded time, distance, track and matching planned route.

**Acceptance:** Completed activity available offline then online.

### [ ] 13-08 — Battery and accuracy field testing

**Scope:** Test walking, running, cycling, GPS gaps, battery use and location spoof/error conditions.

**Acceptance:** Documented field checklist and observed results.

### [ ] 13-09 — Prepare Android release candidate

**Scope:** Create signed internal Android build with permissions/privacy disclosures.

**Acceptance:** Installable build tested on actual phone.

### [ ] 13-10 — Prepare iOS release candidate

**Scope:** Configure Apple signing and TestFlight process, noting developer account costs.

**Acceptance:** iOS release checklist and tested build where credentials exist.

## Phase 14 — Post-MVP advanced image features (P4)

### [ ] 14-01 — Add text-to-single-stroke art

**Scope:** Convert supported fonts/letters into ordered paths.

**Acceptance:** Sample word generates stroke model with explicit gaps.

### [ ] 14-02 — Add advanced raster tracing

**Scope:** Support contour mode, threshold tuning and multi-contour ordering.

**Acceptance:** Human can inspect/approve detected contours.

### [ ] 14-03 — Add photo edge extraction

**Scope:** Extract candidate lines from photo and require user selection/edit.

**Acceptance:** No promise of accurate portrait from raw photo.

### [ ] 14-04 — Support multi-stroke path planning

**Scope:** Optimize stroke ordering and connectors; mark retracing/transport gaps explicitly.

**Acceptance:** No teleportation between strokes.

### [ ] 14-05 — Add elevation-aware preferences

**Scope:** Display ascents/descents and support optional hills avoidance.

**Acceptance:** Metrics come from source data.

### [ ] 14-06 — Add cities and region catalog

**Scope:** Support downloadable/on-demand region datasets and coverage warnings.

**Acceptance:** Out-of-coverage queries show actionable error.

### [ ] 14-07 — Add public sharing opt-in

**Scope:** User can publish selected route with location/privacy warnings.

**Acceptance:** Private routes not accidentally exposed.

### [ ] 14-08 — Add route-quality feedback collection

**Scope:** Collect route usability rating and anonymized algorithm feedback with consent.

**Acceptance:** Users can delete feedback.

## Dependencies and changes

- Implement phases 00–06 sequentially unless a specific task has no dependency. Within a phase, each task depends on the preceding relevant foundation, not necessarily every other task.
- Phases 07–09 may overlap after baseline generation works. Authentication/deployment (10–11) can be deferred until local MVP is stable. Mobile begins only once versioned route endpoints are stable.
- Start without PostgreSQL/Redis until phase 08; local draft storage is acceptable before that point. Avoid treating a synchronous Next.js HTTP request as a reliable long-running optimizer.
- Decisions to revisit: best-area search versus fixed-start route; acceptable fidelity/length error; provider for web and native map tiles; auth model; degree of photograph automation; mobile map SDK and platform release costs.

## Shared Definition of Done

1. Functionality works end to end at the level covered by the task.
2. Unit/integration/E2E tests added or existing tests updated appropriately, and run with reported results.
3. Typecheck, lint and build pass (or blockers documented accurately).
4. Input validation, error states, accessibility and privacy considered where relevant.
5. Documentation and `TASKS.md` status updated; no secrets, giant OSM datasets, or generated files committed.
6. No unrelated refactors or unapproved paid services; report follow-up risks and next recommended task.

## Copy/paste prompt for Codex

> Read `TASKS.md`, this backlog, architecture ADRs, and the current repository state. Implement ONLY task **00-01**. Before coding, briefly describe the concrete files you will change. Keep the implementation minimal and consistent with the agreed architecture. Add or update tests and documentation specified in the acceptance criteria. Run available checks and report exact outcomes. Update `TASKS.md` with status and evidence. Do not implement later tasks, introduce paid services, push/deploy, or change task definitions without approval. If genuinely blocked, report the exact missing information and a safe next action.

After the first task, replace **00-01** with the next chosen task ID.

## References (verify versions as the project evolves)

- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- Valhalla Docker: https://github.com/valhalla/valhalla/blob/master/docker/README.md
- Valhalla: https://valhalla.github.io/valhalla/
- Expo background location: https://docs.expo.dev/versions/latest/sdk/location/
- OSM tile usage policy: https://operations.osmfoundation.org/policies/tiles/

## Living task registry

Updated 2026-11-04. Work resumed at the user's request, phase by phase with tests. On Windows, TASKS.md and tasks.md refer to this same file. Original IDs and acceptance criteria are preserved.

Phase 00 documentation was reviewed against each acceptance criterion. Registry integrity is checked with `node tools/check-backlog.mjs`. Phase 01 passed local installation, formatting, lint, typecheck, unit/component tests, build, and desktop/mobile smoke. Hosted CI execution remains in review (01-10). Dependencies for future phases remain as documented above and will be refined when their phase begins.

| ID    | Status | Dependencies                 | Evidence / next action                                                                                                                                      |
| ----- | ------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00-01 | done   | —                            | docs/product/scope.md; scope and exclusions reviewed.                                                                                                       |
| 00-02 | done   | 00-01                        | docs/product/journeys.md; observable success for every MVP journey.                                                                                         |
| 00-03 | done   | 00-02                        | docs/algorithm/metrics.md; formulas, units, initial targets, tests.                                                                                         |
| 00-04 | done   | 00-03                        | docs/adr/0001-architecture.md; decisions, trade-offs, alternatives, revision triggers.                                                                      |
| 00-05 | done   | 00-04                        | CONTRIBUTING.md; workflow and definition of done.                                                                                                           |
| 00-06 | done   | 00-05                        | Full registry below; tools/check-backlog.mjs checks completeness.                                                                                           |
| 01-01 | done   | 00-06                        | pnpm 11.25.0 lockfile; fresh frozen offline install passes (443 packages, zero downloads).                                                                  |
| 01-02 | done   | 01-01                        | Next.js/Tailwind home; production build and desktop/mobile browser smoke pass.                                                                              |
| 01-03 | done   | 01-02                        | Four shared package exports; web imports types and validation via workspace links.                                                                          |
| 01-04 | done   | 01-03                        | Root strict typecheck passes across packages, web, and test configuration.                                                                                  |
| 01-05 | done   | 01-04                        | ESLint has zero warnings; Prettier format check passes.                                                                                                     |
| 01-06 | done   | 01-05                        | Vitest pure validation tests pass as part of 13-test suite.                                                                                                 |
| 01-07 | done   | 01-06                        | Testing Library activity interaction test passes.                                                                                                           |
| 01-08 | done   | 01-07                        | Two production Playwright smoke tests pass: desktop and mobile viewport.                                                                                    |
| 01-09 | done   | 01-08                        | Optional, required, valid and rejected URL configuration tested without secret output.                                                                      |
| 01-10 | review | 01-09                        | Workflow configured; local negative lint/test fixtures exit 1. Remote now exists; hosted CI status unverified.                                              |
| 01-11 | done   | 01-01                        | README documents locked install, startup, checks, browser fallback, Windows/WSL; clean install verified.                                                    |
| 01-12 | done   | 01-05, 01-08                 | Tailwind regression, explicit base, stable Webpack dev command; 45 unit/component and 6 dev browser tests pass. See docs/progress/dev-startup-fix.md.       |
| 02-01 | done   | 01-02, 01-05                 | Responsive /workspace and shared header; desktop/mobile browser screenshots and overflow checks pass.                                                       |
| 02-02 | done   | 02-01                        | Browser-only MapLibre 6.16.0, bundled worker, real-renderer browser tests; mocked cleanup passes.                                                           |
| 02-03 | done   | 02-02                        | Configurable style/credit, visible attribution, development-only OSM tiles; docs/development/maps.md.                                                       |
| 02-04 | done   | 02-02                        | Lyon center/bounds and Back to Lyon reset tested; selected point stays unchanged.                                                                           |
| 02-05 | done   | 02-04                        | Pointer/keyboard zoom and compass reset, supported fullscreen enter/exit verified in browser tests.                                                         |
| 02-06 | done   | 02-04                        | Cancellable provider interface, local catalog, disabled-provider and coordinate fallback tests pass.                                                        |
| 02-07 | done   | 02-06                        | Click, drag, manual and place selection update one editor state; coordinate order/invalid drag tested.                                                      |
| 02-08 | done   | 02-03, 02-05, 02-07          | 44 unit/component tests and 6 desktop/mobile E2E tests pass; failures/retry covered with fixtures.                                                          |
| 03-01 | done   | 02-07                        | Drawing/ordered stroke types and bounded versioned Zod schemas; all fixed preset fixtures validate.                                                         |
| 03-02 | done   | 03-01                        | SVG canvas records normalized mouse/touch strokes with cursor feedback; real browser journeys pass.                                                         |
| 03-03 | done   | 03-02                        | 50-snapshot undo/redo and clear; multiple-stroke, branching and clear/restore tests pass.                                                                   |
| 03-04 | done   | 03-03                        | Deterministic heart, circle, square, star and single-stroke M; fixed JSON fixtures match.                                                                   |
| 03-05 | done   | 03-04                        | Detached bounded SVG geometry parser; accepted curves/primitives and malicious/unsupported rejection tests pass.                                            |
| 03-06 | done   | 03-05                        | PNG/JPEG header, byte and pixel limits plus transient previews; real browser PNG/JPEG decoding verified.                                                    |
| 03-07 | done   | 03-06                        | Single connected contour prototype; fixed PNG yields ordered closed outline at expected normalized bounds.                                                  |
| 03-08 | done   | 03-07                        | Explicit ordered stroke list, selection/reorder/reverse/keep-one; no silent connectors; complex contours rejected.                                          |
| 03-09 | done   | 03-08                        | Iterative RDP and arc-length sampling retain corners/closure; zero-length and loop fixtures tested.                                                         |
| 03-10 | done   | 03-09                        | Whole-drawing move, rotate, flip, scale; out-of-bounds changes fail without clipping; undo restores geometry.                                               |
| 03-11 | done   | 03-10                        | Versioned drawing-only local drafts survive reload; corruption, schema mismatch and storage denial tested.                                                  |
| 03-12 | done   | 03-11                        | Keyboard drawing and real emulated touch journeys pass in desktop/mobile browser suites without overflow.                                                   |
| 04-01 | done   | 03-12                        | Shared WGS84/GeoJSON types, global coordinate checks, and Lyon-area order validator reject swapped/out-of-range inputs.                                     |
| 04-02 | done   | 04-01                        | Documented reversible local East/North equirectangular projection; Lyon round-trip error tested below 1 mm.                                                 |
| 04-03 | done   | 04-02                        | Normalized strokes fit metric extents proportionally; 1 km square and degenerate-axis fixtures pass.                                                        |
| 04-04 | done   | 04-03                        | Seeded translation/rotation/scale generator is deterministic and constrains every candidate to explicit bounds.                                             |
| 04-05 | done   | 04-04                        | Typed errors cover invalid geometry; self-crossings remain informational warnings, including the figure-eight fixture.                                      |
| 04-06 | done   | 04-05                        | Separate GeoJSON target and actual-route sources/layers use distinct colors and a visible target/route legend; route remains empty until routing exists.    |
| 04-07 | done   | 04-06                        | Canonical heart/circle/letter/open-stroke/figure-eight SVG and JSON fixtures pass unit validation and browser import journeys.                              |
| 05-01 | done   | See phase dependencies above | Compose service started successfully with the pinned image and persistent graph volume.                                                                     |
| 05-02 | done   | See phase dependencies above | Andorra/Rhône-Alpes setup, storage, and ODbL guidance documented.                                                                                           |
| 05-03 | done   | See phase dependencies above | Route-aware health passed after graph load; pedestrian fixture returned 1.17 km.                                                                            |
| 05-04 | done   | See phase dependencies above | Typed client decodes fixture routes; timeout, cancellation, retries tested.                                                                                 |
| 05-05 | done   | See phase dependencies above | Pedestrian costing and access-aware fixture route tested; local route passed.                                                                               |
| 05-06 | done   | See phase dependencies above | Local cycling route returned 1.43 km and differed from walking.                                                                                             |
| 05-07 | done   | See phase dependencies above | Running maps to pedestrian costing with optional speed.                                                                                                     |
| 05-08 | done   | See phase dependencies above | Typed route failures covered by fixture tests.                                                                                                              |
| 05-09 | done   | See phase dependencies above | Live A-to-B, disconnected endpoint, and invalid-coordinate smoke passed.                                                                                    |
| 06-01 | done   | See phase dependencies above | Generator request, success, and failure schemas are fixture-tested.                                                                                         |
| 06-02 | done   | See phase dependencies above | Metric waypoint sampling is deterministic and preserves salient corners.                                                                                    |
| 06-03 | done   | See phase dependencies above | Search radius and route-access failures return typed reason codes.                                                                                          |
| 06-04 | done   | See phase dependencies above | Ordered segment routing and concatenation pass fixtures and live route smoke.                                                                               |
| 06-05 | done   | See phase dependencies above | Loops route back to the start and enforce configured closure tolerance.                                                                                     |
| 06-06 | done   | See phase dependencies above | Distance sums Valhalla segment metrics; live baseline measured 4.59 km.                                                                                     |
| 06-07 | done   | See phase dependencies above | Live heart fixture generated a continuous 4.59 km route in Andorra.                                                                                         |
| 06-08 | done   | See phase dependencies above | Documented symmetric shape score ranks identical geometry above distortion.                                                                                 |
| 06-09 | done   | See phase dependencies above | Workspace shows target/route overlays, metrics, similarity, and warnings.                                                                                   |
| 06-10 | done   | See phase dependencies above | Opt-in fixed-fixture generation smoke checks route and closure invariants.                                                                                  |
| 07-01 | done   | See phase dependencies above | Deterministic area search compares bounded rotations and selects the highest-scoring viable result; covered by generator tests and live Lyon generation.    |
| 07-02 | done   | See phase dependencies above | Scale candidates vary physical target size around the requested distance; scale behavior is covered by a metric-length test.                                |
| 07-03 | done   | See phase dependencies above | User-selected map center and radius bound candidate centers; search circle is shown on the map and live-tested against Lyon Valhalla.                       |
| 07-04 | done   | See phase dependencies above | Corner-aware symmetric geometry score preserves salient turns; shortcut-misses-corner fixtures rank worse than shape-preserving routes.                     |
| 07-05 | done   | See phase dependencies above | Relative-distance penalty and optional hard deviation limit are covered by generator tests.                                                                 |
| 07-06 | done   | See phase dependencies above | Metric-grid repeat estimate penalizes out-and-back geometry; tests compare it with a simple loop.                                                           |
| 07-07 | done   | See phase dependencies above | Segment joins, router provenance, requested mode, and loop closure are validated before success.                                                            |
| 07-08 | done   | See phase dependencies above | Up to three high-ranked distinct alternatives are returned and selectable in the workspace.                                                                 |
| 07-09 | done   | See phase dependencies above | Seed, radius bounds, and candidate count produce repeatable search results.                                                                                 |
| 07-10 | done   | See phase dependencies above | Router-call/runtime limits preserve best-so-far results; cancellation test proves no additional calls start.                                                |
| 07-11 | done   | See phase dependencies above | SSE reports discrete completed-placement counts; editor displays counts and keeps JSON fallback support.                                                    |
| 07-12 | done   | See phase dependencies above | Harness benchmarks heart, letter, and circle across three modes and two detected neighborhoods, with JSON quality/runtime metrics.                          |
| 07-13 | done   | See phase dependencies above | All-impossible placements return typed no-route with a clear attempts count and never a success geometry.                                                   |
| 08-01 | done   | See phase dependencies above | Versioned success/error envelopes cover sync generation and job API routes; contract tests validate both forms.                                             |
| 08-02 | done   | See phase dependencies above | POST validates, persists and queues a request, then returns 202 with job ID and status URL without routing inline.                                          |
| 08-03 | done   | See phase dependencies above | GET returns durable status/progress/result/error; malformed and unknown IDs return 404.                                                                     |
| 08-04 | done   | See phase dependencies above | Standalone Node worker package runs its processor independently of Next.js; processor tests cover success/error/cancel paths.                               |
| 08-05 | review | See phase dependencies above | BullMQ queue, bounded worker concurrency and one-attempt policy are implemented; live processing awaits Redis/Postgres service verification.                |
| 08-06 | done   | See phase dependencies above | Cancel API persists terminal state and Redis signal; worker passes cooperative AbortSignal into routing.                                                    |
| 08-07 | done   | See phase dependencies above | Idempotency key reuses the same job; request mismatch returns 409 and does not enqueue a duplicate.                                                         |
| 08-08 | review | See phase dependencies above | PostGIS and Redis Compose services plus reversible SQL migration are implemented; live migration up/down awaits Docker engine.                              |
| 08-09 | review | See phase dependencies above | Requests, progress, result/errors, timestamps, provenance, metrics and PostGIS candidate lines persist in PostgreSQL; restart-survival awaits live DB test. |
| 08-10 | done   | See phase dependencies above | API and worker contract tests cover accepted, running, completed, failed, cancelled, duplicate, invalid and missing-job states with stubs.                  |
| 09-01 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 09-02 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 09-03 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 09-04 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 09-05 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 09-06 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 09-07 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 09-08 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 09-09 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 09-10 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 10-01 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 10-02 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 10-03 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 10-04 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 10-05 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 10-06 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 10-07 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 11-01 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 11-02 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 11-03 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 11-04 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 11-05 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 11-06 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 11-07 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 11-08 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 11-09 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 11-10 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 12-01 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 12-02 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 12-03 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 12-04 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 12-05 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 12-06 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 12-07 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 12-08 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 12-09 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 13-01 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 13-02 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 13-03 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 13-04 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 13-05 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 13-06 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 13-07 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 13-08 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 13-09 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 13-10 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 14-01 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 14-02 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 14-03 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 14-04 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 14-05 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 14-06 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 14-07 | todo   | See phase dependencies above | Not started.                                                                                                                                                |
| 14-08 | todo   | See phase dependencies above | Not started.                                                                                                                                                |

### Decisions and changes

- 2026-11-04: User authorized phase-by-phase implementation with tests. No task definitions or IDs changed.
- Phase 00 defines the web MVP; advanced features, deployment, and mobile remain deferred.
- Phase 01 is verified locally; see docs/progress/phase-01.md for exact checks, results, environment limitations, and changed-file groups.
- Used bundled pnpm 11.25.0 and existing cached artifacts without external downloads. The canonical lockfile contains no temporary registry URLs. No routing infrastructure or deployment exists.

- 2026-11-04: Phase 00 complete; Phase 01 implemented and locally verified. Task 01-10 stays in review until hosted CI is observed. Phase 02 remains todo.

- 2026-11-04: Phase 02 completed with local checks (44 unit/component tests, 6 desktop/mobile browser tests); details in docs/progress/phase-02.md. Normal production build restored after fixture-based browser tests. No task definitions or IDs changed; Phase 03 is next.

- 2026-11-04: Added task 01-12 for the observed local development startup failure. Existing IDs and acceptance criteria are unchanged. Tailwind/PostCSS updated together, dev mode uses Webpack, and CI now exercises development browser journeys. See docs/progress/dev-startup-fix.md.

- 2026-11-04: Phase 03 implemented and verified locally: 99 unit/component tests, 16 development and 16 production browser checks. See docs/progress/phase-03.md and docs/algorithm/drawing-inputs.md for limits and evidence. Drawing drafts exclude map location/image files. No task IDs or acceptance criteria changed; Phase 04 is next.

- 2026-11-04: Phase 04 geographic placement foundations implemented. Metric projection, proportion-preserving footprints, seeded placements, geometry validation, separate MapLibre target/actual-route layers, and canonical fixtures verified. Route layer is intentionally empty pending routing. See docs/progress/phase-04.md and docs/algorithm/geographic-placement.md.

- 2026-11-05: Added Phase 07 bounded area-search slice: global WGS84 map selection, visible adjustable search radius, deterministic center/rotation/scale candidates, route scoring, and Rhône-Alpes local graph setup. Tasks 07-01, 07-02, 07-03, and 07-09 are complete. See docs/progress/phase-07.md for test and live-route evidence; remaining Phase 07 work stays open.
- 2026-11-05: Completed Phase 07 route-quality scoring, distance limits, repeat-traversal heuristic, route validation, alternatives, runtime/request budgets, cancellation, streaming placement progress, comparison harness, and typed no-route handling. See docs/progress/phase-07.md for scope and limitations.
- 2026-11-05: Implemented Phase 08 API envelopes, durable generation endpoints, BullMQ worker, cancellation/idempotency, PostgreSQL/PostGIS models and migration, and contract tests. Live Redis/PostgreSQL processing and migration checks remain in review because the Docker engine is unavailable in the current environment; see docs/development/jobs.md.
