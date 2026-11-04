# Contributing

Work one permanent task ID at a time. Use branches like `feat/01-02-web-scaffold` and commits like `feat(web): scaffold app (01-02)`. Split large tasks into new child IDs before implementation; do not renumber IDs or rewrite acceptance criteria silently.

Use kebab-case filenames, PascalCase React components, camelCase functions, and named exports in shared packages. Browser-safe packages must not import server environment, filesystem, database, or routing credentials. API and GeoJSON coordinates are `[longitude, latitude]`; compute physical distances in meters.

Before a PR, run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and relevant `pnpm test:e2e`. Include the task ID, concrete behavior change, changed files, exact commands/results, and any blockers or remaining risks. Never claim an unrun check passed. Tests should verify useful behavior rather than mirror implementation.

Definition of done: acceptance criteria verified; relevant automated checks pass; error, input, accessibility, and privacy behavior considered; docs and `TASKS.md` updated with evidence. Use fixed fixtures and fixed OSM extracts for algorithms. Do not commit dependencies, build output, credentials, or large PBF files. Do not deploy, add paid services, or push without authorization.

`tasks.md` contains both the original acceptance criteria and the living status registry. References to `TASKS.md` mean this same file: Windows filenames are case-insensitive, so do not create a second case-only variant.
