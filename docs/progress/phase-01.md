# Phase 01 verification — 2026-11-04

Phase 00 is complete. Phase 01 is implemented and verified locally. Task 01-10 remains in review until a real GitHub Actions run can be observed; no Git repository or remote is connected to this directory. Phase 02 is not started.

## Deliverables

- Root pnpm workspace, canonical lockfile, strict TypeScript configuration, ESLint, Prettier, Vitest, Playwright, and CI configuration.
- `apps/web`: Next.js/Tailwind home screen, accessible native radio selection, loading/error boundaries, explicitly non-navigable artwork, and validated server configuration.
- `packages/types`, `validation`, `geo-utils`, `api-client`: browser-safe exports consumed through workspace dependencies.
- Product, architecture, quality-metric and contributor documents; complete 140-task registry; README setup and Windows/WSL instructions.

## Verification

| Check                       | Command / method                                                                                                                      | Result                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry/document integrity | `npm.cmd run check:docs`                                                                                                              | 140 unique task IDs, complete status rows, five required documents.                                                                                                           |
| Clean installation          | pnpm 11.25.0 `install --offline --frozen-lockfile` in fresh `.tmp/clean-check-final`, with explicit workspace-local store/cache paths | Exit 0; 443 packages reused; zero downloads; lockfile unchanged.                                                                                                              |
| Formatting                  | `npm.cmd run format:check`                                                                                                            | Pass.                                                                                                                                                                         |
| Lint                        | `npm.cmd run lint`                                                                                                                    | Pass, zero warnings.                                                                                                                                                          |
| Strict types                | `npm.cmd run typecheck`                                                                                                               | Pass for all packages, web, and test configuration.                                                                                                                           |
| Unit/component tests        | `npm.cmd test`                                                                                                                        | 13 tests passed across three files: accepted/rejected modes, optional/required/invalid router configuration, interactive selection.                                           |
| Production build            | `npm.cmd run build`                                                                                                                   | Pass; home and not-found pages prerender successfully.                                                                                                                        |
| Production browser smoke    | `npm.cmd run test:e2e` with `PLAYWRIGHT_EXECUTABLE_PATH` set to installed Chrome                                                      | Two tests pass: desktop and iPhone viewport emulation. Checks include hydration/runtime errors, selection, keyboard radio behavior, illustration label, and no page overflow. |
| Visual QA                   | Full-page desktop/mobile PNGs from Playwright                                                                                         | Inspected; responsive layouts fit. Corrected a missing space when hiding a mobile line break.                                                                                 |
| CI failure propagation      | Temporary intentionally invalid lint fixture and failing Vitest fixture, removed afterward                                            | Both commands exited 1 as expected. Hosted Actions execution is unverified.                                                                                                   |

## Implementation decisions and limitations

- The machine's bundled pnpm 11.25.0 replaced the unavailable initial 10.28.2 pin before the first working lockfile was created. The frozen clean install verifies the resulting workspace.
- External package downloads are restricted. Initial installation used a temporary loopback-only mirror of existing npm cache content; published package manifests and integrity values were preserved. The lockfile contains no loopback URLs or temporary paths, and the final clean install used only the package store. Temporary cache/mirror files are ignored development artifacts.
- Vite is pinned as a direct dev dependency at 7.3.6, supported by the chosen Vitest version, to provide a consistent locally available toolchain. Vitest uses the runner configuration loader to avoid an esbuild directory-traversal access failure in this restricted Windows session.
- Native ESM Next.js/server-environment configuration works with both `next build` and `next start`, including when invoked from the monorepo root.
- esbuild install scripts are explicitly allowed. sharp and unrs-resolver use prebuilt optional binaries with install scripts explicitly disabled; a normal frozen install succeeds with that policy.
- Browser testing uses installed Chrome because Playwright Chromium is not available offline. Phone testing is emulation, not a physical iOS device test. This Windows sandbox required explicit cleanup of the owned test server after assertions; the runner then exited 0. No application assertion failed on the final production run.
- The GitHub workflow is configured but has not run on GitHub. ESLint 9 emits an end-of-support notice during dependency resolution; migration should be paired with a compatible Next.js ESLint configuration and verified separately.
- There is no drawing editor, interactive map, street-routing service, navigable export, worker, persistence service, mobile app, or deployment yet.

## Next phase

Phase 02 adds MapLibre, configured/attributed development tiles, Lyon viewport controls, manual coordinate fallback, start-point selection, and mocked map interaction/error tests. Keep raw drawing targets separate from actual router-validated geometry.
