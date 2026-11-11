# Host the Rhône-Alpes Valhalla service

This deploys a separate, persistent routing service for the Vercel-hosted web app. It uses the repository's pinned Valhalla image, downloads the Rhône-Alpes Geofabrik extract, builds elevation data, and serves requests through Caddy with automatic HTTPS. Valhalla itself is not exposed on a public port. Caddy only forwards requests that include the shared routing key.

## Requirements

- An always-on Linux VPS with Docker Compose, a persistent disk, enough RAM and disk for a regional Valhalla graph build, and a public IPv4 address.
- A domain or subdomain, for example `routing.example.com`, whose DNS A record points to the VPS.
- Cloud firewall rules allowing inbound TCP 80 and 443 (and optionally UDP 443). Do not open port 8002.

The first graph and elevation build downloads OSM and terrain data and can take a long time. Ensure the VPS has several GB of free disk and monitor its available RAM. Keep the `valhalla_tiles` Docker volume after the first build; it contains the downloaded extract and generated graph.

## Deploy

1. Clone the repository onto the VPS and enter `deploy/routing`.
2. Copy `.env.example` to `.env`. Set `ROUTING_DOMAIN` to the DNS name pointing at the VPS. Generate a random secret of at least 32 characters (for example, `openssl rand -hex 32`) and set it as `VALHALLA_API_KEY`. Keep this value private.
3. Start the services:

   ```sh
   docker compose up -d
   docker compose logs -f valhalla
   ```

   Caddy waits for Valhalla's Lyon route health check before it starts accepting requests and automatically obtains a TLS certificate. The graph build may take many minutes. Leave the terminal with logs open until Valhalla becomes healthy.

4. Check that the hostname responds over HTTPS. An unauthenticated request should return HTTP 403; that confirms the gateway is reachable and the key check is active:

   ```sh
   curl -i "https://routing.example.com/status"
   ```

5. In Vercel → Project → Settings → Environment Variables, set these for Production:

   ```text
   VALHALLA_URL=https://routing.example.com
   VALHALLA_API_KEY=<the same random secret from the VPS .env>
   ```

   Replace the example hostname with your actual routing hostname in both examples. Redeploy DrawTrail after saving. The key is server-only; do not prefix it with `NEXT_PUBLIC_`.

## Maintenance

Update the repository on the VPS when changing the deployment files, then run `docker compose up -d`. The named volumes keep the graph and Caddy certificates across container recreations. To monitor service health, use `docker compose ps` and `docker compose logs --tail 100 valhalla gateway`.

The routing gateway has a shared key but no per-user identity or quota. For a public production app, add request rate limits at the gateway or through a compatible edge firewall and monitor VPS resource usage. The OSM-derived graph remains subject to the [OpenStreetMap attribution and ODbL terms](https://www.openstreetmap.org/copyright).
