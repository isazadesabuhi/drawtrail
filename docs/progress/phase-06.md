# Phase 06 verification — 2026-11-04

Phase 06 first GPS-art route generation is implemented. All task acceptance checks have fixture or live-service evidence.

## Deliverables

- Strict Zod request/success/failure contracts and JSON examples cover the drawing, global `[longitude, latitude]` center, mode, requested length, loop preference, search/continuity bounds, deterministic seed, and placement settings.
- Metric target geometry derives from requested distance. Ordered sampling is deterministic, uses metric arc length, retains endpoints and strong corners, and is bounded to eight points in the workspace baseline.
- Waypoints outside the configured search radius receive a reason code. Actual route requests check engine-reported walking/running/cycling access, and failures remain typed; unsupported multi-stroke drawings are rejected without adding connectors.
- Consecutive waypoints route in drawing order. Router-returned geometry is concatenated only after continuity checks. Loop requests route the last point to the first and verify the final gap.
- Measured length is the sum of Valhalla leg lengths. The symmetric 64-sample nearest-point shape score and its normalized error are documented; distance and shape warnings are shown with the route on the workspace map.
- The server endpoint defaults to local Valhalla at `127.0.0.1:8002` and accepts a configured `VALHALLA_URL`. The UI supports walking, running baseline, cycling, requested distance, and loop selection.
- Fixed fixtures cover route contracts, sampling/corners, continuity, errors, distance, score ordering, and the heart baseline. Opt-in scripts cover a real service route and a browser journey covers result display and missing-region feedback.

## Verification

| Check                                            | Result                                                                                                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/component tests                             | Pass: 144 tests across 21 files.                                                                                                                                              |
| Typecheck                                        | Pass: `npm.cmd run typecheck`.                                                                                                                                                |
| Lint and format                                  | Pass: `npm.cmd run lint`; `npm.cmd run format:check`.                                                                                                                         |
| Backlog registry                                 | Pass: `npm.cmd run check:docs` (141 task IDs).                                                                                                                                |
| Production build                                 | Pass: `NEXT_DIST_DIR=.next-e2e npm.cmd run build`; generated route API is dynamic.                                                                                            |
| Desktop/mobile browser suite                     | Pass: all 22 Playwright checks reported success, including generation result and typed missing-region cases.                                                                  |
| Live generation against the loaded Andorra graph | Pass: heart produced a 4.59 km walking route, 96% similarity, 7 ordered waypoints, and 0.0 m loop gap. It warned that the route exceeded the 3.0 km request by more than 20%. |

## Limits and next work

The workspace start-point picker remains Lyon-bounded. The current Andorra test graph can be used by the integration fixture; a Lyon-selected drawing correctly receives a typed missing-region response until a Rhône-Alpes graph is built. The baseline routes one stroke at a fixed selected placement. Rotation, scale, center search, and candidate comparison are Phase 07.
