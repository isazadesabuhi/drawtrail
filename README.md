# DrawTrail

A local-first GPS art app: turn a simple drawing into a connected walking, running, or cycling route on real streets.

This checkout includes **durable route-generation jobs and best-shape-match search** alongside the GPS-art workspace. At `/workspace`, choose an area center anywhere on the map, draw or import a shape, then search an adjustable radius or optionally let the optimizer compare several drawing sizes without a target distance. Review real street geometry, measured distance, shape similarity, alternatives, and warnings; selecting an alternative fits the map to that route. Search is limited by the region loaded into Valhalla; the local Rhône-Alpes graph covers the Lyon workspace. Drawings and homepage artwork are target art, not navigable routes.

## Requirements

- Node.js 24 LTS recommended (minimum configured: 22.13).
- pnpm 11.25.0, recorded in `package.json`.
- Docker Desktop with WSL2 on Windows is optional for the basic web workspace and required for local routing plus durable generation jobs. The job services use local development credentials; no paid service is needed.

## Start locally

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000> or go directly to <http://localhost:3000/workspace>. Stop the server with Ctrl+C.

Development uses Next.js's Webpack mode. This avoids a CSS-worker flood observed with Turbopack development on this Windows setup; the production build continues to use Turbopack. Tailwind/PostCSS are pinned together at 4.3.3, with the web app configured as the explicit CSS base directory.

On Windows, use `pnpm.cmd` if PowerShell blocks `.ps1` launchers. If pnpm is not installed, `npm.cmd install --global pnpm@11.25.0` installs it in an ordinary unrestricted development session. Do not change system execution policy for this app.

After dependencies have been installed with pnpm, npm can also run the project scripts:

```sh
npm.cmd run dev
```

Use `npm` instead of `npm.cmd` on Linux/macOS. Keep `pnpm-lock.yaml` as the canonical dependency lockfile. A frozen-lockfile installation was verified in a fresh temporary workspace using the local package store, with zero downloads. The lockfile has no references to the temporary local registry used for the initial offline setup.

## Checks

```sh
pnpm format:check
pnpm check:docs
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e:dev
pnpm build:e2e
pnpm test:e2e
```

Each script can also be run with `npm.cmd run <script>`. `npm.cmd test` runs the unit/component suite; `npx.cmd playwright install chromium` installs the browser when network access is available. Run `pnpm build:e2e` before browser tests so they use synthetic fixture geometry instead of live public tiles. Playwright starts and stops its own production server. Rebuild with ordinary `pnpm build` afterward for normal production use; `pnpm start` serves that completed build.

`pnpm test:e2e:dev` runs the same browser journeys against a fresh development server on port 3130, using local map fixtures. Stop any existing development server for this checkout first: Next.js allows only one dev server per application directory. It does not need a production build. Both dev and production browser suites run in CI.

If Chromium download is unavailable, set `PLAYWRIGHT_EXECUTABLE_PATH` to an installed Chrome/Chromium executable for local testing. In Windows PowerShell, for example:

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd run build:e2e
npm.cmd run test:e2e
```

CI installs Playwright's matching Chromium automatically. Local browser checks use phone emulation, not a physical iOS device. Build scripts for esbuild are explicitly allowed; sharp and unrs-resolver use their installed prebuilt optional binaries without running install scripts.

## Environment and service boundaries

Copy `.env.example` to the repository root for Docker Compose and the worker, and copy `apps/web/.env.example` to `apps/web/.env.local` for Next.js. These files contain local service URLs and development-only database credentials. The startup validator rejects invalid HTTP(S) Valhalla URLs without printing their contents. Never prefix server service configuration with `NEXT_PUBLIC_` or import it into browser components.

Interactive development uses attributed OSM standard tiles by default. Production requires `NEXT_PUBLIC_MAP_STYLE_URL` and `NEXT_PUBLIC_MAP_ATTRIBUTION`; without them, coordinate selection still works and the map shows a configuration message. See [map development](docs/development/maps.md) for provider setup, service usage limits, search abstraction, coordinate conventions, and fixture-based tests. The start point stays in editor state while switching stages; map locations reset on reload.

The generation form offers hill preferences for each activity and cycling preferences for roads, cycleways, and surface suitability. Results include an elevation profile and estimated ascent/descent when terrain data is available, with approximate sustained steep sections (8% grade over at least 60 m). Partial coverage shows gaps and withholds totals; unavailable elevation never becomes a false flat profile. Enable local terrain data with `pnpm routing:elevation:up`, then run `pnpm routing:elevation:health`. The first elevation build downloads data and rebuilds the graph. See [elevation setup](docs/development/routing.md#enable-elevation) for existing graphs and [tasks.md](tasks.md) for remaining improvements.

Named routes can be saved to this browser and reopened after reload from **Saved routes**. The local library includes the selected alternative and route metrics; it does not sync across browsers or devices. Public links are a separate opt-in and expire after 30 days.

The selected route alternative can also be downloaded as GPX 1.1, GeoJSON, or an attributed PNG route card. Exports include the generated route geometry and metadata, not the private draft drawing.

Drawing drafts now survive reloads on the same browser/device. The map location and uploaded image files are not persisted. See [drawing inputs](docs/algorithm/drawing-inputs.md) for supported SVG geometry, file/model limits, keyboard shortcuts, stroke semantics, tracing limitations and privacy. PNG/JPEG import initially provides a preview; only an explicitly reviewed outline replaces the drawing.

Geographic placement uses a local East/North metric projection and deterministic candidate generation. See [geographic placement](docs/algorithm/geographic-placement.md) for projection limits, footprint semantics, validation warnings and overlay colors.

To run durable generation jobs, start Docker Desktop and run `pnpm jobs:up` and `pnpm db:migrate`, then start `pnpm worker` alongside `pnpm dev`. Redis/BullMQ processes jobs, while PostgreSQL/PostGIS stores job state and route candidates. Setup and API details are in [durable jobs](docs/development/jobs.md). The local services use development-only credentials.

To run routing locally, run `pnpm routing:up` and `pnpm routing:health`. Routing setup, larger Lyon/Rhône extracts, disk/RAM guidance, OSM licensing, and opt-in integration tests are documented in [local routing](docs/development/routing.md). Stop the service with `pnpm routing:down`; the graph volume remains available for the next start.

To exercise drawing-to-route area search, start `pnpm dev` in another terminal and run `pnpm test:generation:integration`. The smoke test detects the loaded Lyon or Andorra graph and searches three candidates. See [generation development](docs/development/generation.md) for details and fixed-fixture tests.

## Layout

```text
apps/web/                 Next.js App Router + Tailwind
packages/types/           Browser-safe public contracts
packages/validation/      Zod schemas
packages/geo-utils/       Lyon center, editor bounds, and boundary helpers
packages/api-client/      Versioned API response envelopes
packages/jobs/            PostgreSQL persistence and BullMQ queue
apps/worker/              Standalone route-generation worker
apps/web/src/lib/         Server-only Valhalla route client and typed errors
docs/product/             Scope and user journeys
docs/algorithm/           Metrics and quality gates
docs/adr/                 Architecture decisions
tests/e2e/                Desktop/mobile Playwright smoke tests
tasks.md                  Original backlog + living task registry
```

The durable job API is available at `/api/v1/generations`; Expo remains deferred to its backlog phase.

## Troubleshooting

- If port 3000 is occupied: `pnpm dev --port 3001` (or `npm.cmd run dev -- --port 3001`). E2E expects port 3000.
- If package downloads fail, the environment may restrict network access. Offline installation needs complete metadata and tarballs, plus a writable cache. Do not treat a failed install as a passing check.
- If browser tests report a missing executable, install Playwright Chromium once. A system browser can be used for local QA via a separate explicit configuration; CI installs the matching browser.
- Use either native Windows or WSL consistently for dependencies; do not share `node_modules` between them. Use Docker's WSL2 backend for the later routing service and keep large OSM data out of source control.
- Public map tile hosting and attribution are separate from routing infrastructure. If tiles fail, use coordinate entry or retry; the selected start point is kept. The tests use local fixtures and never require live public tiles.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [tasks.md](tasks.md) for acceptance and reporting rules. The scaffold follows the [Next.js installation guidance](https://nextjs.org/docs/app/getting-started/installation); lint runs separately from the build.
