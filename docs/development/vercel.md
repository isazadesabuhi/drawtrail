# Deploy DrawTrail's web app to Vercel

Vercel hosts the Next.js web application. The routing engine and the durable-job worker are separate services; Docker Compose does not run as a persistent service on Vercel.

## Vercel project settings

- Import the repository through the Vercel dashboard.
- Framework preset: Next.js.
- Root directory: `apps/web`.
- Enable **Include source files outside of the Root Directory** so the app can build its `packages/*` workspace dependencies.
- Leave the install, build, and output commands at their detected Next.js/pnpm defaults.
- Node.js version: `24.x`.

## Required environment variables

Set these in Vercel Project Settings. Use **Preview** values for test deployments and **Production** values for the live deployment.

| Variable                      | Purpose                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_MAP_STYLE_URL`   | Public map style URL from a production tile/style provider.                                                                                           |
| `NEXT_PUBLIC_MAP_ATTRIBUTION` | Attribution text required by that provider.                                                                                                           |
| `VALHALLA_URL`                | HTTPS endpoint for a deployed Valhalla service with the desired OSM graph. It cannot be `localhost` or the local Compose hostname.                    |
| `VALHALLA_API_KEY`            | Shared server-only key for the protected routing gateway. Set the same random value on the gateway host. Use at least 32 characters.                  |
| `DATABASE_URL`                | Managed PostgreSQL connection string for public shares and durable generation jobs. The database must have PostGIS enabled for job candidate storage. |
| `REDIS_URL`                   | Managed Redis connection string for BullMQ durable generation jobs.                                                                                   |

Map style URL and attribution are required for a configured production map. Route generation requires reachable Valhalla. Public sharing requires PostgreSQL and migration 002. Durable jobs require PostgreSQL, Redis, and the external worker.

## Services outside Vercel

1. Deploy Valhalla on a host that supports a persistent graph volume. Load the region(s) that should be routable and expose the service over HTTPS to Vercel.
2. Provision managed PostgreSQL with PostGIS and managed Redis. Apply the database migrations once before enabling public sharing or durable jobs.
3. Run the worker as a separate long-running Node service from the repository root with `pnpm worker`. Give it the same server-only `DATABASE_URL`, `REDIS_URL`, and `VALHALLA_URL` values.

For a single-host Rhône-Alpes Valhalla deployment using Docker Compose and Caddy HTTPS, see [routing host deployment](routing-host.md). The web app and worker send `VALHALLA_API_KEY` only from their server runtimes; never set it as `NEXT_PUBLIC_`.

Vercel Functions provide a maximum duration of 60 seconds for synchronous generation and 30 seconds for route repair. Long-running optimization should use the durable-job API and external worker.

## Rollout

1. Deploy a Preview environment and verify the map, start-location selection, direct route generation, and public sharing after the required services and migrations are ready.
2. Verify the durable-job worker separately if that API is enabled.
3. Promote the verified deployment to Production and add the production domain in Vercel.

Never commit production credentials or put server credentials under a `NEXT_PUBLIC_` variable.
