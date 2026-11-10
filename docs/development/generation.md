# First GPS-art route generation

In `/workspace`, choose a map center anywhere using the map or WGS84 coordinates, select or draw one stroke, choose walking/running/cycling, set a target distance, and request a street route. Closed strokes are routed as loops. Separate strokes remain separate; select one stroke at a time rather than silently drawing a connector. Routing only works where the configured Valhalla graph contains data and supports the selected activity.

To search for a better placement, enable **Search for the shape around my chosen area** and choose a radius from 0.25 to 25 km. The circle is shown on the map around the selected pin. The server tests eight deterministic candidate centers inside that circle, with varied rotation and scale, routes each viable candidate, and returns the highest-scoring result. The score combines shape similarity with a penalty for distance deviation. The currently selected area is a circle for possible shape centers; the drawing footprint itself may extend beyond the circle.

The server creates a metric target shape around the selected center, samples up to eight ordered points while retaining strong corners, and asks Valhalla to route each adjacent pair in the selected mode. The editor scales the overall waypoint search radius with the requested distance and placement offset (minimum 1.5 km, maximum 50 km). Each sampled waypoint starts with a 250 m road snap radius; if Valhalla finds no suitable edge, the server retries that segment with radii of 1 km, 3 km, and at most 5 km. Larger snaps can move the street route farther from the drawing, so the returned similarity and distance warnings remain important. The server checks that waypoints stay inside the overall radius, rejects engine failures and disconnected segment joins, uses the router's segment distances, scores similarity, and returns measured distance and warnings. Only engine-returned street geometry is drawn as the route. The score is `clamp(1 - symmetricMeanNearestDistance / targetBoundingBoxDiagonal, 0, 1)` from 64 evenly spaced samples on each line; it is a shape comparison, not a safety or legality guarantee. The initial warning thresholds follow [route quality metrics](../algorithm/metrics.md).

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

The **Saved routes** panel stores up to 20 named route results in the current browser, including alternatives and their elevation profiles. Select **Open** to restore a route after reload; **Remove** deletes a saved entry. Browser storage is local to that browser profile and device, so these routes are not synced or shared.
