# Phase 14-07: Public route sharing

## Implemented

- Added a distinct public-link flow requiring an unchecked-by-default confirmation that the full route, including exact start and end locations, becomes visible to anyone with the link.
- Persisted share records in PostgreSQL with a 30-day expiry and indexed expiry lookup.
- Added a public route page with route name, activity, distance, route-shape preview, expiry date, and location disclosure.
- Validate stored route data and names; reject payloads above 1.1 MB at the API boundary and route JSON above 1 MB before storage.
- Share the currently selected route alternative.

## Setup

Start PostgreSQL and apply migrations before creating or opening public links:

```powershell
npm.cmd run jobs:up
npm.cmd run db:migrate
```

The share ID is a random UUID and acts as a bearer link. Anyone who receives it can view the route until it expires. Sharing currently has no account ownership or early revocation; those controls remain part of account route management.

## Verification

- Unit tests cover consent enforcement, invalid payload rejection, insert expiry, ID validation, and expiry filtering.
- Component test confirms that the consent checkbox is required before link creation.
- `npm run check` passed on 2026-11-10: docs registry, formatting, lint, typecheck, 234 tests, and production build.
