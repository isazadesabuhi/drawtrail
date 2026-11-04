# Phase 03 verification — 2026-11-04

Tasks 03-01 through 03-12 are implemented locally. The workspace now has place/drawing stages, preserving the selected location while switching. Phase 04 geographic placement and routing are not implemented here.

## Deliverables

- `packages/types` and `packages/validation`: canonical versioned normalized drawings, explicit open/closed strokes, ordered geometry, metadata and bounded Zod validation.
- `packages/geo-utils/src/drawing.ts` and fixed JSON fixtures: deterministic heart/circle/square/star/M presets, normalization, iterative simplification, corner-preserving arc-length resampling, move/rotate/flip/scale and bounded undo/redo history.
- `DrawingEditor`/`DrawingCanvas`: mouse, pen and single-finger drawing with visible feedback, keyboard alternatives, undo/redo/clear, presets, transforms, stroke ordering/selection and explicit multi-stroke controls.
- Client-only limited SVG geometry import; bounded PNG/JPEG preview; reviewed silhouette extraction with explicit rejection of unsupported complex/multiple contours.
- Versioned local drawing drafts, safe corruption/version/quota handling, and resource cleanup. Map locations, images, preview URLs and undo history are excluded from persistent drafts.
- Fixed SVG/PNG fixtures; model/geometry/import/history/storage/component tests and real-browser desktop/mobile journeys. Details and limits are documented in [drawing inputs](../algorithm/drawing-inputs.md).

## Verification

| Check                     | Method                                           | Result                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict typing             | `npm.cmd run typecheck`                          | Pass for shared packages, app and tests.                                                                                                                                                                                                 |
| Lint/format               | `npm.cmd run lint`, `npm.cmd run format:check`   | Pass with zero lint warnings.                                                                                                                                                                                                            |
| Unit/component suite      | `npm.cmd test`                                   | 99 tests across 16 files pass. Covers fixed presets, schemas/limits, corners/zero-length/closed loops, transforms, history, rejected SVG content, image headers/limits, contour topology, drafts, storage denial and editor interaction. |
| Development browser suite | `npm.cmd run test:e2e:dev` with installed Chrome | 16 desktop/mobile tests pass: existing map/home checks plus freehand mouse/trusted emulated touch, keyboard history, transformed draft reload, corrupt storage, SVG stroke ordering/security, PNG contour review and JPEG preview.       |
| Production/browser build  | `npm.cmd run build:e2e`, `npm.cmd run test:e2e`  | Production compile and 16 browser tests pass; normal build restored after QA.                                                                                                                                                            |
| Normal production build   | `npm.cmd run build`                              | Home, workspace and not-found prerender successfully; no browser-only import/SSR failure.                                                                                                                                                |
| Visual QA                 | Full-page desktop/mobile drawing editor PNGs     | Inspected: canvas, shape controls, history, stroke list, file input, feedback and privacy notice fit without overflow.                                                                                                                   |
| Registry                  | `npm.cmd run check:docs`                         | Permanent IDs and complete status registry remain valid.                                                                                                                                                                                 |

The test harness uses synthetic local map data and makes no automated public tile requests. Browser tests explicitly disable `crypto.randomUUID` for freehand drawing to verify a local-ID fallback for LAN HTTP contexts. Node 25's optional global localStorage shim is isolated in component tests with a controlled Storage implementation; actual browser persistence/decoding is verified in E2E.

An existing dev server initially returned HTML but had a broken hot-reload connection and non-interactive hydration in the test context. Restarting the identified project server allowed the complete development suite to pass. Owned test servers are stopped after assertions; this restricted Windows environment requires explicit server cleanup before the runner finishes. No unrelated processes, OS settings, paid services, deployments or uploads to a server were introduced.

## Limitations / next phase

- SVG support is intentionally limited; arcs, shorthand smooth curves, transforms, CSS, referenced/active content and general SVG rendering are unsupported and rejected.
- Raster tracing is experimental: a single solid dark silhouette on a light background, no holes/separate objects, at most 128×128 tracing resolution. Photos are not automatically converted into useful routes. Image previews are transient and only a reviewed outline changes the drawing.
- Current drawing and selected stroke persist only in this browser/device. Reload history is empty; location and source image files are not stored. Storage restrictions are surfaced rather than claiming a draft is saved.
- Desktop/phone viewport tests include emulated touch, not physical iOS/Android device testing. Hosted CI and field validation have not been observed in this session.
- No geographic projection, physical distance fitting, map footprint overlay, street-network routing, GPX export or mobile application is part of this phase. **Phase 04 is next:** geographic coordinate/projection utilities, metric footprint placement, deterministic placement candidates, validity checks and separate target/route overlay foundations.
