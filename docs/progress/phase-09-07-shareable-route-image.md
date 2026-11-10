# Phase 09-07: Shareable route image

## Implemented

- Download a 1600×1000 PNG card for the selected generated route alternative.
- Include the route name, activity, distance, start/end markers, DrawTrail attribution, and OpenStreetMap contributor attribution.
- Escape route names before embedding them in SVG and downsample long geometry for the preview.
- Build the image from the generated route geometry only; the private sketch is not passed to the exporter.

## Verification

- SVG source is parsed as XML and checked for attribution, route metadata, and escaped names.
- `npm run check` passed on 2026-11-10: docs registry, formatting, lint, typecheck, 238 tests, and production build.
