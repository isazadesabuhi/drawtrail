# Phase 05 verification — 2026-11-04

Phase 05 local routing foundations and live service checks are complete. The user started the pinned Valhalla Compose service, confirmed its route-aware health check, and ran the integration smoke against the loaded Andorra graph.

## Deliverables

- Optional root Docker Compose service pins the Valhalla scripted image to `3.9.1`, persists source extracts and graph tiles in a named volume, and has a route-aware container health check.
- An Andorra-first setup plus Rhône-Alpes/Lyon region override is documented with expected disk/RAM considerations, no-PBF-in-git guidance, Geofabrik sources, and OSM attribution/license notes.
- A host-side readiness script waits for an actual pedestrian graph route instead of relying on container process state.
- Server-only `ValhallaClient` sends explicit pedestrian/bicycle costing requests, supports walking and bicycle preferences, decodes precision-six route geometry, reports route distance, allows caller cancellation, times out, and caps retries.
- Typed errors distinguish invalid waypoints, disconnected routes, missing graph regions, engine failures, timeouts, cancellation, and invalid engine responses.
- Fixed unit fixtures and an opt-in integration script cover returned route geometry and distance, profile selection, retry bounds, cancellation, timeout, A-to-B route invariants, disconnected endpoints, and invalid coordinates.

## Verification

| Check                                    | Result                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Unit tests                               | Pass: 131 tests across 18 files.                                                                         |
| Typecheck                                | Pass: `npm.cmd run typecheck`.                                                                           |
| Lint and formatting                      | Pass: `npm.cmd run lint`; `npm.cmd run format:check`.                                                    |
| Backlog registry                         | Pass: `npm.cmd run check:docs` (141 task IDs).                                                           |
| Production build                         | Pass: `npm.cmd run build`.                                                                               |
| Compose configuration                    | Pass: `docker compose config --quiet` (Docker CLI warns that the user Docker config cannot be read).     |
| Docker image and graph startup           | Pass: `pnpm routing:up` pulled Valhalla 3.9.1 and started the container with a persistent volume.        |
| Route-aware local health check           | Pass: `pnpm routing:health`; pedestrian fixture route returned 1.17 km.                                  |
| Integration smoke against local OSM data | Pass: pedestrian 1.17 km; cycling 1.43 km on a different path; disconnected and invalid inputs rejected. |

## Limits and next work

The live checks confirm graph loading and pedestrian/cycling behavior on the current Andorra extract. The drawing-to-route generation workflow remains Phase 06.
