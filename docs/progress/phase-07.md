# Phase 07 progress — 2026-11-05

The first bounded area-search slice is implemented and locally verified. A user can pick a center anywhere on the map, choose a radius, and ask the generator to compare eight placements. The local Rhône-Alpes graph was also configured so the default Lyon workspace can generate routes.

## Delivered

- Map panning and WGS84 coordinate selection are no longer limited to Lyon. The local name catalog remains Lyon-only; route coverage follows the loaded Valhalla graph.
- The workspace shows a dashed search-radius circle around the selected map pin and lets the user toggle area search and choose a radius from 0.25 to 25 km.
- Generation uses a deterministic bounded sample of centers within the circle, with rotation and scale variations. Every candidate is routed through Valhalla; invalid or disconnected candidates are skipped, and the best viable candidate is selected using shape similarity plus a distance-deviation penalty.
- The request contract validates area radius and candidate count. The existing fixed-center path remains available when area search is disabled.
- The live generation smoke detects either supported local graph and exercises a three-candidate area search.
- Local `.env` selects the Rhône-Alpes extract for this checkout; the ignored file is not part of Git. Health and routing integration checks accept either Lyon or Andorra graphs.

## Verification

| Check                                  | Result                                                                                                                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/component tests                   | Pass: 150 tests across 21 files.                                                                                                                                                                                                                              |
| Typecheck, lint, format, docs registry | Pass.                                                                                                                                                                                                                                                         |
| Desktop/mobile browser suite           | All 22 Playwright checks reported success, including search-area selection, circle legend, global coordinate selection, and route display. The Windows test wrapper remained alive after test completion and was interrupted after the successful assertions. |
| Rhône-Alpes Valhalla health            | Pass: Lyon pedestrian fixture route is 0.84 km.                                                                                                                                                                                                               |
| Routing integration                    | Pass: Lyon pedestrian and cycling routes, disconnected endpoint rejection, and invalid coordinate rejection.                                                                                                                                                  |
| Live area-search generation            | Pass: Lyon heart route 3.95 km, 97% similarity, 7 waypoints, 0 m loop gap; best of 3 candidates in a 0.5 km search radius. The route exceeded the 3.0 km request by more than 20%, so the expected distance warning was returned.                             |

## Remaining Phase 07 work

Returning three distinct alternatives, retracing penalties, configurable hard length limits, stronger graph/accessibility diagnostics, bounded runtime budgets/progress reporting, and cross-neighborhood algorithm comparison remain open.
