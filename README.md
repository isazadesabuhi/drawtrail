# DrawTrail

A local-first GPS art app: turn a simple drawing into a connected walking, running, or cycling route on real streets.

This checkout includes the foundation and **Phase 02: map workspace**. At `/workspace`, explore Lyon, search a small local place catalog, and choose a start point by clicking, dragging a pin, or entering coordinates. Drawing, routing, and exports are later milestones. The homepage artwork is an illustration, not a real route.

## Requirements

- Node.js 24 LTS recommended (minimum configured: 22.13).
- pnpm 11.25.0, recorded in `package.json`.
- Docker Desktop with WSL2 on Windows only when the routing phase begins; no Docker, credentials, database, or paid service is needed for this scaffold.

## Start locally

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000> or go directly to <http://localhost:3000/workspace>. Stop the server with Ctrl+C.

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
pnpm build:e2e
pnpm test:e2e
```

Each script can also be run with `npm.cmd run <script>`. `npm.cmd test` runs the unit/component suite; `npx.cmd playwright install chromium` installs the browser when network access is available. Run `pnpm build:e2e` before browser tests so they use synthetic fixture geometry instead of live public tiles. Playwright starts and stops its own production server. Rebuild with ordinary `pnpm build` afterward for normal production use; `pnpm start` serves that completed build.

If Chromium download is unavailable, set `PLAYWRIGHT_EXECUTABLE_PATH` to an installed Chrome/Chromium executable for local testing. In Windows PowerShell, for example:

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd run build:e2e
npm.cmd run test:e2e
```

CI installs Playwright's matching Chromium automatically. Local browser checks use phone emulation, not a physical iOS device. Build scripts for esbuild are explicitly allowed; sharp and unrs-resolver use their installed prebuilt optional binaries without running install scripts.

## Environment and service boundaries

No variables are required for Gate A. `apps/web/.env.example` documents the optional future `VALHALLA_URL`; copy it to `apps/web/.env.local` when needed. The startup validator rejects invalid HTTP(S) URLs without printing their contents. Routing code must call the validator with `requireRouter = true` so missing configuration fails explicitly. Never prefix routing credentials with `NEXT_PUBLIC_` or import server configuration into browser components.

Interactive development uses attributed OSM standard tiles by default. Production requires `NEXT_PUBLIC_MAP_STYLE_URL` and `NEXT_PUBLIC_MAP_ATTRIBUTION`; without them, coordinate selection still works and the map shows a configuration message. See [map development](docs/development/maps.md) for provider setup, service usage limits, search abstraction, coordinate conventions, and fixture-based tests. The start point stays in editor state while editing; saving across reloads comes in Phase 03.

## Layout

```text
apps/web/                 Next.js App Router + Tailwind
packages/types/           Browser-safe public contracts
packages/validation/      Zod schemas
packages/geo-utils/       Lyon center, editor bounds, and boundary helpers
packages/api-client/      Versioned client foundation
docs/product/             Scope and user journeys
docs/algorithm/           Metrics and quality gates
docs/adr/                 Architecture decisions
tests/e2e/                Desktop/mobile Playwright smoke tests
tasks.md                  Original backlog + living task registry
```

The future worker and Expo app are intentionally deferred to their backlog phases. No routing API endpoint is advertised by this scaffold.

## Troubleshooting

- If port 3000 is occupied: `pnpm dev --port 3001` (or `npm.cmd run dev -- --port 3001`). E2E expects port 3000.
- If package downloads fail, the environment may restrict network access. Offline installation needs complete metadata and tarballs, plus a writable cache. Do not treat a failed install as a passing check.
- If browser tests report a missing executable, install Playwright Chromium once. A system browser can be used for local QA via a separate explicit configuration; CI installs the matching browser.
- Use either native Windows or WSL consistently for dependencies; do not share `node_modules` between them. Use Docker's WSL2 backend for the later routing service and keep large OSM data out of source control.
- Public map tile hosting and attribution are separate from routing infrastructure. If tiles fail, use coordinate entry or retry; the selected start point is kept. The tests use local fixtures and never require live public tiles.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [tasks.md](tasks.md) for acceptance and reporting rules. The scaffold follows the [Next.js installation guidance](https://nextjs.org/docs/app/getting-started/installation); lint runs separately from the build.
