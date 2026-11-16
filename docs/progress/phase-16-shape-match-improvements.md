# Phase 16 — Shape-match quality improvements

Date: 2026-11-16

## Implemented

- The workspace distinguishes a pinned route start from an area-only search center and explains how each radius is applied.
- Pinned routes begin and, for loops, finish at a routeable street within 250 m of the selected point. Area-only search remains free to select its own route start.
- Users can choose exact distance or allow ±5%, ±10%, or ±20% flexibility. Generation compares route sizes around the target and retains distinct shorter and longer options when available.
- Routes with large drawing gaps can be rerouted through up to four separated miss locations. Radius search samples up to 16 placements, then spends more waypoint detail on the strongest candidates within existing request and runtime limits.
- Route results expose estimated fit plus average, 95th-percentile, and maximum sampled gaps in metres. The map marks the largest sampled gap.
- The integration and comparison tools now report pinned-start distance, actual route distance, fit, gap metrics, alternatives, and elapsed time.
- Generation and metric documentation describe the search bounds and score limitations.

## Verification

`npm.cmd run check` passed on 2026-11-16:

- Backlog registry and formatting checks
- ESLint and TypeScript checks
- 38 test files, 257 tests
- Next.js production build
- `git diff --check`

After the initial implementation, area search was broadened in response to lower observed fit scores: it now samples up to 48 placements and gives up to eight leading placements detailed waypoint refinement. Workspace search budgets allow up to 512 routing calls and 60 seconds. Validation enforces the 48-placement cap.

The real-route benchmark remains open as task 16-08. It could not run in this environment because there was no reachable Docker daemon, Valhalla endpoint at `127.0.0.1:8002`, or local web server at `127.0.0.1:3000`. Run `npm.cmd run test:generation:integration` and `npm.cmd run bench:generation:compare` with those services running to complete it.

The fit and gap metrics are geometry-based estimates over sampled lines. The candidate search is bounded, so the highest-ranked result is the best among placements the search evaluated, not a guarantee of a globally optimal route.
