# Phase 14-05: Elevation profiles

## Implemented

- Requests height samples from Valhalla for shortlisted route alternatives.
- Validates complete, partial, and unavailable elevation responses.
- Displays an elevation profile and ascent/descent for the currently selected alternative.
- Adds an accessible profile scrubber with keyboard support and avoids treating missing samples as zero elevation.
- Keeps route generation usable when the elevation service is unavailable.
- Adds `docker-compose.elevation.yml` and the `routing:elevation:up` / `routing:elevation:health` commands to build and verify a local Valhalla elevation dataset.

## Verification

- `npm run check`: passed (200 tests, formatting, lint, typecheck, docs registry, and production build).
- Desktop Playwright journey: passed (2 tests).
- Desktop and phone profile screenshots were visually checked during the browser run; the phone layout did not overflow horizontally.
- A later mobile-only rerun could not start because an earlier Playwright server still held port 3130.
- Live check passed on 2026-11-10 after a one-time forced graph rebuild: Lyon pedestrian route 0.84 km, embedded graph elevations verified, and `/height` lookup verified.

## Local service check

Run from the repository root:

```powershell
pnpm routing:elevation:up
pnpm routing:elevation:health
```

The first command builds Valhalla graph tiles with elevation data and may take time and disk space. The health command checks both routed elevations and the `/height` endpoint. Phase 14-05 live elevation verification passed for the Lyon fixture after the one-time forced rebuild.
