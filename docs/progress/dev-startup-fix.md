# Development startup fix — task 01-12

The first live development check after Phase 02 exposed a failure that production-only browser tests had missed. Tailwind 4.2.2 resolved imports from the parent directory when a PostCSS transform omitted its source filename. A bounded regression test reproduced the failure without launching a dev server. Tailwind's [upstream fix](https://github.com/tailwindlabs/tailwindcss/commit/bfb5732b0b948d89c6803cb537bca168ec8e0a46) uses the plugin's configured base in that case.

## Changes

- Pin `tailwindcss` and `@tailwindcss/postcss` together at 4.3.3; declare the PostCSS test dependency explicitly and update the pnpm lockfile.
- Set the web directory as the explicit base in `apps/web/postcss.config.mjs`, using `dirname(fileURLToPath(import.meta.url))`. Avoid a directory `new URL('.', import.meta.url)` expression, which Turbopack attempts to resolve as an asset and rejects.
- Add `apps/web/src/lib/styles.test.ts`, which compiles a real Tailwind import/utility with no PostCSS source filename. It failed before the upgrade and passes afterward. Automatic source scanning is disabled inside this focused regression fixture.
- Use `next dev --webpack` for local development. A subsequent Turbopack dev attempt still spawned excessive CSS workers on this Windows setup. The identified project workers were stopped; unrelated Node processes were left alone. Production remains on the existing Turbopack build.
- Add `tools/test-dev.mjs`, `test:e2e:dev`, and a separate Playwright development-server mode on port 3130. CI now checks the actual root dev command with the existing desktop/mobile browser journeys as well as the production build.

## Verification

- The regression failed under 4.2.2 with the parent-directory resolution error, then passed under 4.3.3.
- Normal `npm.cmd run dev -- --hostname 127.0.0.1` served `/` and `/workspace` with HTTP 200 and the expected page content; its CSS returned HTTP 200 as well.
- The normal dev run had six Node processes across the machine at the measured checkpoint, rather than the earlier thousands of orphaned project workers. This is an observed startup check, not a long-running memory benchmark.
- All 45 unit/component tests pass.
- All six real-renderer browser tests pass against development mode, across desktop and phone viewport emulation. Map tiles are mocked local fixtures, so these tests make no automated public tile requests.
- All six production browser tests pass as well, for 12 browser checks across development and production modes.
- Lint, strict typecheck, formatting, task-registry checks, and the normal production build pass. Hosted CI status has not been observed here.

The restricted Windows test environment required explicit cleanup of the owned dev-test server after assertions. Normal interactive development can be stopped with Ctrl+C. No OS paging-file settings or global package configuration were changed.
