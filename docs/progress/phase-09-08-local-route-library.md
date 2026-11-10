# Phase 09-08: Local route saving and reopening

## Implemented

- Save a generated route result under a user-provided name.
- Persist the result, alternatives, profiles, and selected alternative in versioned browser local storage.
- Reopen a saved route after reload and fit the map to its selected route.
- Remove saved routes from the local list.
- Limit the library to 20 entries and bound serialized storage size; show errors when storage is unavailable or full.

## Verification

- Storage tests cover save/read, trimming names, corrupt data, removal, and storage-write failure.
- UI tests cover save, reopen after remount, removal, and map fit when loading a stored route.
- `npm run check` passed on 2026-11-10: docs registry, formatting, lint, typecheck, 230 tests, and production build.
