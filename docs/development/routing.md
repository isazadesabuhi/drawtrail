# Local routing development

DrawTrail uses a local Valhalla service for pedestrian, running-baseline, and bicycle route requests. The web client sends coordinates in `[longitude, latitude]` order and only treats the service's returned road geometry as a route. A drawing is never considered a navigable route by itself.

## Start a small test graph

Install and start Docker Desktop, then from the repository root run:

```sh
pnpm routing:up
pnpm routing:health
```

The Compose service uses the pinned `ghcr.io/valhalla/valhalla-scripted:3.9.1` image and downloads the current Geofabrik Andorra OSM extract into the `valhalla_tiles` named volume. The first start builds Valhalla graph tiles; this can take several minutes. The Compose health status and `routing:health` both require a successful pedestrian route, so a running process without graph tiles is not ready. `pnpm routing:health` waits up to 15 minutes. The first build requires internet access to fetch the image and OSM extract.

The small country extract keeps the initial setup manageable. Graph building needs free disk space for the PBF, intermediate files, graph tiles, and tile archive; allow several GB. RAM use depends on the OSM region and builder threads; the default is two threads. Larger extracts can need substantially more memory and disk, so increase `VALHALLA_SERVER_THREADS` only when the host has headroom.

To change the region before its first build, set `VALHALLA_TILE_URL` to a single OSM PBF URL. For example, the Geofabrik Rhône-Alpes extract covers the Lyon test area:

```powershell
$env:VALHALLA_TILE_URL = 'https://download.geofabrik.de/europe/france/rhone-alpes-latest.osm.pbf'
pnpm routing:up
```

Expect a much larger download and graph build than Andorra, with more RAM and disk required. The OSM PBF is stored only in Docker's named volume; do not commit regional data files. To deliberately replace the selected region, remove the `valhalla_tiles` Docker volume after stopping Valhalla, then start it again. Removing that volume deletes the locally built graph.

Open <http://localhost:8002/status> for basic service metadata. The route-aware check is more meaningful:

```sh
pnpm routing:health
```

Stop the container and keep the graph volume with `pnpm routing:down`. On the next start, Valhalla reuses its persistent tile archive unless the input extract changes.

## Data license and attribution

OpenStreetMap data is licensed under the Open Database License (ODbL). Credit OpenStreetMap contributors, make the ODbL clear, and follow the license terms when distributing adapted data. Display “© OpenStreetMap contributors” and link to <https://www.openstreetmap.org/copyright> in user-facing maps. Check the selected Geofabrik extract page for its current timestamp and size before starting a larger build; regional extracts change over time.

## Route profiles and errors

- Walking requests use Valhalla `pedestrian` costing, which respects pedestrian access in the routing graph. A returned route is the engine's legal-access result, not a guarantee of real-world conditions or a legal determination.
- Running is currently pedestrian costing with an optional `walking_speed` preference. Valhalla has no separate running costing in this baseline.
- Cycling requests use `bicycle` costing and support bicycle type and `use_roads` preferences. They can choose a different route from walking when the network and access tags provide alternatives.
- The typed client distinguishes malformed input, disconnected paths, points outside the loaded graph, timeouts, caller cancellation, unavailable engine, and malformed responses. Network/server errors have bounded retries; invalid input and route misses do not.

## Tests

The standard `pnpm test` suite uses fixed response fixtures and does not need Docker. It verifies decoded geometry and distance, profile selection, bounded retries, cancellation, timeout, and normalized errors.

For an opt-in smoke test against the loaded local graph, run:

```sh
pnpm test:routing:integration
```

The smoke test checks pedestrian and bicycle A-to-B routes in Andorra la Vella, reports whether this extract selects different paths for the profiles, then checks a disconnected point outside the small fixture graph and an invalid coordinate. Override `VALHALLA_URL` when the service listens elsewhere. OSM is live and updated by Geofabrik, so tests assert route invariants rather than exact geometry.

## References

- [Valhalla Docker image guide](https://github.com/valhalla/valhalla/blob/master/docker/README.md)
- [Valhalla route API](https://valhalla.github.io/valhalla/api/route/api-reference/)
- [Geofabrik Andorra extract](https://download.geofabrik.de/europe/andorra.html)
- [Geofabrik Rhône-Alpes extract](https://download.geofabrik.de/europe/france/rhone-alpes.html)
