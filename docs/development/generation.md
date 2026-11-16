# First GPS-art route generation

In `/workspace`, either choose a route start using the map or WGS84 coordinates, or choose **Search for a route inside an area instead**. A pinned start is snapped to a routeable street within 250 m; loops return to that same street location. In area-only mode, click the map to set the search-area center; this is not a route start. Choose the required radius, then select or draw one stroke, choose walking/running/cycling, and set a target distance. Distance flexibility can be set to exact, ±5%, ±10%, or ±20%; the default compares routes up to 10% shorter or longer. Closed strokes are routed as loops. Separate strokes remain separate; select one stroke at a time rather than silently drawing a connector. Routing only works where the configured Valhalla graph contains data and supports the selected activity.

With a chosen route start, the optional search radius looks for nearby drawing placements while keeping the route start pinned; the route may extend outside that circle. In area-only mode, the radius is required (0.5 to 25 km), the route can start anywhere inside the circle, and the entire routed geometry must stay inside it. Both modes sample up to 48 deterministic placements using a coarse waypoint pass, then reroute up to eight leading candidates with full waypoint detail. The largest gaps between the route and drawing can receive up to four additional ordered waypoints. This is a bounded search of sampled placements, not an exhaustive search of every possible point in the circle. Results and warnings report viable candidates and any exhausted time/request budget. Area search allows up to 35 seconds and 512 routing calls from the workspace; the Vercel route allows 60 seconds so it can return its final result.

The server creates a metric target shape around each candidate center, samples up to 16 ordered points while retaining strong corners, and asks Valhalla to route each adjacent pair in the selected mode. Fixed-distance searches include candidate drawing sizes around the requested distance and rank measured street routes using shape fit, distance error, and retracing. The editor scales the overall waypoint search radius with the requested distance and placement offset (minimum 1.5 km, maximum 50 km). Each sampled waypoint starts with a 250 m road snap radius; if Valhalla finds no suitable edge, the server retries that segment with radii of 1 km, 3 km, and at most 5 km. A pinned start farther than 250 m from the routed geometry is rejected. The estimated fit combines symmetric nearest-sample distance, ordered discrete Frechet distance, and corner error. Results also report average and 95th-percentile geometry gaps; the map marks the largest sampled gap. Area-only mode rejects candidates whose routed coordinates leave the selected circle. Only engine-returned street geometry is drawn as the route; estimates do not establish safety or legality.

## Test the baseline

Run the ordinary deterministic tests first:

```sh
pnpm test
pnpm typecheck
```

For a real route against the loaded Lyon or Andorra graph, keep Valhalla running and start the web app in a second terminal:

```sh
pnpm routing:health
pnpm dev
```

Then in a third terminal run:

```sh
pnpm test:generation:integration
```

This detects which supported local graph is loaded, submits the fixed heart fixture to `/api/v1/generate` in that region, and checks ordered waypoints, a real measured route, similarity range, and loop closure. Override the app URL with `DRAWTRAIL_URL` when it is not at `http://127.0.0.1:3000`.

The local place-name catalog contains Lyon places only, but map clicks and coordinates accept any valid WGS84 location. The default small Andorra graph can route only within Andorra; choose an area inside its coverage or configure the Rhône-Alpes extract for Lyon as documented in [local routing](routing.md). Fixed request and response fixtures plus mocked segment routes keep normal tests stable as OSM changes.

## Current limits

The web and worker enrich only the final shortlist (at most three alternatives) with optional elevation metadata. Each route gets one `/height` request with at most 1024 samples and a 2.5-second timeout, without retries; this adds at most 7.5 seconds after the routing search budget. Samples follow the actual routed polyline at approximately 30 m intervals, with wider spacing on long routes, and include both endpoints. Chart distance is scaled to the router's measured distance. Caller cancellation stops enrichment; missing terrain, malformed elevation, or a failed elevation service keeps the street route available. Each alternative stores its own profile in the existing result JSON, including durable jobs; older results can omit elevation. See [elevation setup](routing.md#enable-elevation).

Area search is bounded by candidate count, elapsed runtime, and router-request budgets. The user chooses the search center and radius. The synchronous generation API uses a versioned response envelope and can stream completed-placement counts over server-sent events. Successful searches return up to three distinct ranked routes; the workspace lets the user switch between them. Requested length remains a target unless a hard deviation limit is configured, so actual street length can differ; the UI displays the measurement and warnings instead of claiming an exact match. If no placement can be routed, the API returns a typed no-route failure and the workspace keeps the failed attempt out of the navigable route display. For durable asynchronous requests, use the job API documented in [durable jobs](jobs.md).

The drawing controls also offer an optional best-shape-match mode. It omits the requested distance, compares several physical drawing sizes, and prioritizes shape similarity while retaining a retracing penalty. The selected activity controls router access, so walking, running, and cycling can produce different actual distances; cycling can be longer. The results show the measured distance without a “requested” value. Selecting an alternative fits the map to that route's bounds.

Each result also shows an estimated moving time using editable walking/running pace (minutes per kilometre) or cycling speed (kilometres per hour). The estimate follows the selected alternative and excludes stops. **Repair a section** selects the portion to replace, with an optional WGS84 via waypoint; the server rebuilds the route through retained waypoints using Valhalla and refreshes route metrics/elevation. Nearby streets may shift elsewhere on the route. **Undo repair** restores the original result.

When elevation is available, the profile lists sustained steep sections estimated at 8% or more over at least 60 m. Missing samples break a section; the estimate does not imply road surface, accessibility, or safety.

The **Saved routes** panel stores up to 20 named route results in the current browser, including alternatives and their elevation profiles. Select **Open** to restore a route after reload; **Remove** deletes a saved entry. Browser storage is local to that browser profile and device, so these routes are not synced or shared. To publish a route, check the separate location-sharing consent and create a public link. Anyone with the link can view the exact path, including its start and end locations; links expire after 30 days. Public sharing requires the database migration and a running PostgreSQL service.
