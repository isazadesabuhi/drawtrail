# Phase 15-03: Moving-time estimates

## Implemented

- Editable walking and running pace in minutes per kilometre.
- Editable cycling speed in kilometres per hour.
- Activity-specific starting rates and bounded input validation.
- A moving-time estimate that updates with the selected route alternative.
- A clear note that the estimate excludes stops.

## Verification

- Full `npm run check` passed on 2026-11-10: docs registry, formatting, lint, typecheck, 211 tests, and production build.
- Unit tests cover walking, running, and cycling conversions; invalid rates and distances; and time formatting.
- Component tests cover rate editing, invalid-rate feedback, distance changes, and activity units.
- Workspace test confirms switching alternatives updates the estimate.
