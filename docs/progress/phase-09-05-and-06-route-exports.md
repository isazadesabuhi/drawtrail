# Phases 09-05 and 09-06: GPX and GeoJSON export

## Implemented

- Download the currently selected alternative as GPX 1.1 with route name, activity, distance description, and track points.
- Download that route as a GeoJSON Feature with its original LineString coordinates and route metadata.
- Escape GPX metadata and sanitize filenames before download.
- Export only the generated route geometry; the user's private draft drawing is not included.

## Verification

- GPX tests parse the generated XML with the browser DOM parser and check metadata, point count, and longitude/latitude fields.
- GeoJSON tests parse and compare the exported coordinates to the source route.
- Filename tests cover accented names, punctuation, and empty-safe fallback.
- `npm run check` passed on 2026-11-10: docs registry, formatting, lint, typecheck, 237 tests, and production build.
