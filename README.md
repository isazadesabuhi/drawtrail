# DrawTrail

A local-first GPS art app: turn a simple drawing into a connected walking, running, or cycling route on real streets.

This checkout implements **Gate A: foundation**. It includes a responsive Next.js home screen, accessible activity selection, shared TypeScript packages, environment validation, and test/build tooling. The map, drawing editor, routing, and exports are subsequent milestones. The homepage artwork is an illustration, not a real route.

## Requirements

- Node.js 24 LTS recommended (minimum configured: 22.13).
- pnpm 11.25.0, recorded in `package.json`.
- Docker Desktop with WSL2 on Windows only when the routing phase begins; no Docker, credentials, database, or paid service is needed for this scaffold.

## Start locally

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>. Stop the server with Ctrl+C.

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
pnpm test:e2e
```

Each script can also be run with `npm.cmd run <script>`. `npm.cmd test` runs the unit/component suite; `npx.cmd playwright install chromium` installs the browser when network access is available. E2E runs both desktop and phone viewports against the production build, so run `pnpm build` first. Playwright starts and stops its own production server. `pnpm start` serves the same completed build interactively.

If Chromium download is unavailable, set `PLAYWRIGHT_EXECUTABLE_PATH` to an installed Chrome/Chromium executable for local testing. In Windows PowerShell, for example:

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd run test:e2e
```

CI installs Playwright's matching Chromium automatically. Local browser checks use phone emulation, not a physical iOS device. Build scripts for esbuild are explicitly allowed; sharp and unrs-resolver use their installed prebuilt optional binaries without running install scripts.

## Environment and service boundaries

No variables are required for Gate A. `apps/web/.env.example` documents the optional future `VALHALLA_URL`; copy it to `apps/web/.env.local` when needed. The startup validator rejects invalid HTTP(S) URLs without printing their contents. Routing code must call the validator with `requireRouter = true` so missing configuration fails explicitly. Never prefix routing credentials with `NEXT_PUBLIC_` or import server configuration into browser components.

## Layout

```text
apps/web/                 Next.js App Router + Tailwind
packages/types/           Browser-safe public contracts
packages/validation/      Zod schemas
packages/geo-utils/       Geographic helpers (Lyon center initially)
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
- Public map tile hosting and attribution are separate from routing infrastructure. No tile service is contacted by the scaffold.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [tasks.md](tasks.md) for acceptance and reporting rules. The scaffold follows the [Next.js installation guidance](https://nextjs.org/docs/app/getting-started/installation); lint runs separately from the build.
