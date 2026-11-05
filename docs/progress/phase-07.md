# Phase 07 progress — 2026-11-05

Phase 07 implements bounded area search and route-quality optimization. Users can choose a center and radius, compare deterministic placements, and inspect up to three distinct routes.

## Delivered

- Map panning and WGS84 coordinate selection work beyond Lyon. The local place-name catalog remains Lyon-only; route coverage follows the loaded Valhalla graph.
- The workspace displays an adjustable search radius and supports area search around the chosen point.
- Area search evaluates deterministic center, rotation, and scale candidates. A corner-aware symmetric geometry score, distance-deviation penalty, and repeated-geometry estimate rank candidates. An optional hard distance-deviation limit filters candidates.
- Search is limited by runtime and Valhalla request budgets. Cancellation stops further calls. Progress streams discrete completed-placement counts; existing JSON clients continue to work.
- Successful searches return up to three geometrically distinct alternatives, which can be selected in the workspace. Segment mode and continuity checks prevent invalid geometry from appearing as a route.
- If every placement fails, the API returns a typed no-route result with the number of placements tried. The failed search does not produce a navigable route.
- `npm run bench:generation:compare` detects the loaded Lyon or Andorra graph, benchmarks heart, letter, and circle drawings across walking, running, and cycling in two neighborhoods, and writes JSON output. Pass `-- --output=path.json` to save a report.
- The local ignored `.env` selects the Rhône-Alpes extract for this checkout; it is not part of Git.

## Verification

The route generator unit tests cover deterministic placement, corner-sensitive scoring, distance limits, retracing, alternatives, mode validation, progress counts, runtime/request budgets, cancellation, and impossible shapes. The API test checks the SSE progress framing and final result event.

| Check                                         | Result                                                                                                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full unit/component/API suite                 | Pass: 160 tests across 22 files.                                                                                                                                                                                 |
| Typecheck, lint, format, and backlog registry | Pass.                                                                                                                                                                                                            |
| Production build                              | Pass.                                                                                                                                                                                                            |
| Local live benchmark harness                  | Not run: Docker engine is unavailable in this environment (`docker_engine` named pipe missing), so Valhalla and the local API are offline. The script is ready to run after `pnpm routing:up` and `npm run dev`. |

The local Rhône-Alpes graph was previously verified healthy with a 0.84 km Lyon pedestrian fixture. Routing integration passed Lyon pedestrian and cycling routes, disconnected endpoint rejection, and invalid-coordinate rejection. Live area-search generation produced a 3.95 km Lyon heart route with 97% similarity, 7 waypoints, 0 m loop gap, and best-of-3 candidate selection.

## Limits

Repeated-road detection uses a metric-grid geometry heuristic because the Valhalla response does not provide graph-edge IDs. Benchmark results depend on the locally loaded OSM extract and should not be treated as universal route-quality validation. The harness can take several minutes because it runs 18 real route-generation requests.
