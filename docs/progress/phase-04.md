# Phase 04 verification — 2026-11-04

Tasks 04-01 through 04-07 are implemented locally. A saved drawing can now be previewed near the chosen Lyon start point using repeatable placement candidates. The target strokes and future street route have separate MapLibre GeoJSON sources and line styles.

## Deliverables

- Shared WGS84 `LngLat`, projected East/North metre, GeoJSON LineString, Feature, and FeatureCollection types. The Lyon editor validator rejects swapped and out-of-area coordinates.
- A reversible local equirectangular East/North projection anchored to a chosen coordinate. It rejects polar anchors and offsets over 100 km; the algorithm note documents its local-area limits and round-trip tolerance.
- Normalized drawing conversion into metric GeoJSON while preserving the drawing's aspect ratio, plus scale, rotation, and translation.
- Seeded placement candidates bounded in East/North metres. The workspace offers 12 repeatable candidates, centered within ±150 m of the chosen start, with rotation and scale variation.
- Typed geometry errors for malformed or degenerate strokes, with self-intersection warnings retained as potentially intentional art.
- Distinct target and actual-route GeoJSON map sources and MapLibre line layers. Target art is solid clay; the dashed green route layer remains empty until a routing phase provides real street geometry. The legend says the actual street route has not been generated.
- Canonical JSON and restricted SVG fixtures for a heart, circle, letter M, open stroke, and figure-eight. Unit validation and desktop/mobile browser SVG journeys consume those fixtures.

## Verification

| Check                     | Method                                           | Result                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types                     | `npm.cmd run typecheck`                          | Pass for all shared packages, app, and tests.                                                                                                                                                              |
| Unit/component suite      | `npm.cmd test`                                   | 119 tests across 17 files pass, covering coordinate order, projection, proportion, transforms, deterministic candidates, invalid geometry, crossing warnings, map source/layer registration, and fixtures. |
| Lint/format               | `npm.cmd run lint`, `npm.cmd run format:check`   | Pass with zero lint warnings and formatted files.                                                                                                                                                          |
| Documentation registry    | `npm.cmd run check:docs`                         | 141 permanent task IDs and status rows validate.                                                                                                                                                           |
| Development browser suite | `npm.cmd run test:e2e:dev` with installed Chrome | All 18 desktop/mobile browser tests report pass, including drawing placement preview and canonical SVG imports.                                                                                            |
| Production browser suite  | `npm.cmd run build:e2e`, `npm.cmd run test:e2e`  | Build succeeds; all 18 desktop/mobile browser tests report pass.                                                                                                                                           |
| Normal production build   | `npm.cmd run build`                              | Pass; home, workspace, and not-found pages prerender.                                                                                                                                                      |

Browser tests use a synthetic local map style and block public map-tile requests. The Windows Playwright harness leaves its wrapper waiting after the test server exits even though each test reports `ok`; the wrapper was interrupted after confirming there was no listening test server. This cleanup behavior does not indicate a browser assertion failure.

## Limits and next work

This phase positions and displays target geometry. The green actual-route layer has no route data yet. Candidates are deterministic samples, not route-aware search; Phase 05 adds local routing infrastructure and later phases generate, compare, and validate connected street paths. The equirectangular helper is restricted to 100 km around its anchor; larger-area work needs a regional projection or geodesic model.
