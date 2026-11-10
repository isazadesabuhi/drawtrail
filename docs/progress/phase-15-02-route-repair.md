# Phase 15-02: Repair a generated route section

## Implemented

- Select a route section with start and end percentage controls.
- Optionally add a WGS84 via waypoint to guide the replacement.
- Rebuild the route through retained route waypoints and the selected replacement section using the same walking/running/cycling mode.
- Reject disconnected router segments when their join gap exceeds 2 m; do not add straight-line fallback geometry.
- Refresh distance, similarity, retracing, warnings, and elevation for the repaired route.
- Keep the original result in memory so Undo restores the complete route and its selected alternative.
- The full reroute may change streets outside the selected portion slightly; this is stated in the repair UI.

## Verification

- Unit tests cover activity propagation, via-waypoint inclusion, continuity rejection, and router failures.
- UI tests cover request validation, repair response handling, updated estimates, and Undo.
- Validation tests cover repair bounds, WGS84 coordinates, and waypoint limits.
- Full `npm run check` passed on 2026-11-10: docs registry, formatting, lint, typecheck, 219 tests, and production build.
