# Phase 02 verification — 2026-11-04

Tasks 02-01 through 02-08 are implemented and verified locally. Phase 03 is not started. Hosted GitHub Actions status has not been observed in this session.

## Deliverables

- `/workspace`, a responsive editor shell sharing the existing DrawTrail header/branding; the home page links to it.
- A browser-only MapLibre 6.16.0 map with Lyon center/bounds, keyboard/pointer navigation, zoom, compass reset, fullscreen where supported, visible attribution, and a viewport reset that keeps the selected start point.
- Unified React start-point state updated through map clicks, pin dragging, named local places, or explicitly labeled latitude/longitude fields. Invalid/out-of-area drags restore the last valid marker. Clear removes the selection.
- A cancellable geocoding interface, small default Lyon catalog, disabled-search support, and coordinate fallback independent of map/provider availability.
- Configurable style/attribution, development-only OSM standard raster default, production configuration fallback, loading/error/timeout states, retry, and cleanup on unmount.
- WGS84 validation, Lyon-region helpers, mocked-renderer tests, synthetic browser fixtures, test-build script, CI steps, and [map/provider documentation](../development/maps.md).

## Verification

| Check                               | Command / method                                                                  | Result                                                                                                                                                                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locked installation                 | pnpm 11.25.0 `install --offline --frozen-lockfile` with the workspace store/cache | Exit 0, lockfile up to date, no downloads.                                                                                                                                                                                                                              |
| Format                              | `npm.cmd run format:check`                                                        | Pass.                                                                                                                                                                                                                                                                   |
| Lint                                | `npm.cmd run lint`                                                                | Pass, zero warnings.                                                                                                                                                                                                                                                    |
| Strict types                        | `npm.cmd run typecheck`                                                           | Pass across packages, web, test files and tool configuration.                                                                                                                                                                                                           |
| Unit/component tests                | `npm.cmd test`                                                                    | 44 tests pass in seven files. Includes baseline tests, global/regional coordinate boundaries, configuration defaults and URL rejection, local search/cancellation, map clicks/drags, selected state, clear/reset, unavailable tiles, missing WebGL, retry, and cleanup. |
| Normal production build             | `npm.cmd run build`                                                               | Pass; `/`, `/workspace`, and not-found prerender. Normal build restored after browser QA.                                                                                                                                                                               |
| Fixture-configured production build | `npm.cmd run build:e2e`                                                           | Pass with a bundled local worker and intercepted synthetic style URL.                                                                                                                                                                                                   |
| Real-renderer browser tests         | `npm.cmd run test:e2e`, installed Chrome via `PLAYWRIGHT_EXECUTABLE_PATH`         | Six tests pass: home journey, real map/marker/navigation controls, and style failure/recovery, each on desktop and phone viewport emulation.                                                                                                                            |
| Visual QA                           | Desktop/mobile full-page `workspace.png` screenshots                              | Inspected; map, controls, forms, selected coordinates and attribution fit without page overflow.                                                                                                                                                                        |
| Backlog                             | `npm.cmd run check:docs`                                                          | All 140 task IDs retain complete, valid registry entries.                                                                                                                                                                                                               |

The initial browser run caught a missing worker URL with MapLibre 6. The implementation now uses the [documented Turbopack worker setup](https://maplibre.org/maplibre-gl-js/docs/#installation). Later failures were ambiguous test selectors matching both the selected-pin control and the selected-point output, or Next.js's route announcer; selectors now identify the intended accessible element. The final browser run passed all application assertions. This restricted Windows session required explicit shutdown of the owned test server after assertions, then the runner exited 0.

## Boundaries and remaining work

- Tests render actual MapLibre/WebGL and workers against synthetic geometry. They never request public OSM tiles; live external tile-service availability is not established by these results.
- Development tiles follow the linked [OSM policy](https://operations.osmfoundation.org/policies/tiles/); production tile hosting remains a separate operational choice. No demo/public tile default is silently enabled in production.
- Search is a small local catalog, not address geocoding. Passing `null` disables search without disabling coordinates or map selection.
- Start-point state persists during editing and map retry, not across browser reloads. Draft persistence is task 03-11.
- Coordinates indicate placement only. There is no street-network validation, drawing editor, generated route, distance estimate, navigable export, or deployment in this phase.
- Browser phone tests are emulation, not a physical iOS/Android test. Hosted CI and field checks remain separate evidence.

## Next phase

Phase 03 introduces the canonical drawing model, freehand input, history, deterministic shape presets, restricted SVG import, raster preview/prototype tracing, explicit stroke ordering, manipulation, versioned local drafts, and accessibility/touch tests. Preserve the separation between target drawings and router-validated network geometry.
