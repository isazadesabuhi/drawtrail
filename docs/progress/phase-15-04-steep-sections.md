# Phase 15-04: Sustained steep sections

## Implemented

- Detects approximate climbs and descents from actual route elevation samples.
- Uses an 8% grade threshold over at least 60 m, requiring two adjacent sample intervals.
- Breaks sections at missing samples, flat/under-threshold intervals, sign changes, or invalid distance steps.
- Shows direction, signed average grade, and start/end distance below the selected route profile.
- Explains the threshold and that terrain estimates can differ from bridges and tunnels.

## Verification

- Pure-function tests cover climbs, descents, spikes, missing-data gaps, flat grades, and invalid distances.
- Component tests cover steep-section display and the no-section state.
- Full `npm run check` passed on 2026-11-10: docs registry, formatting, lint, typecheck, 225 tests, and production build.
