# Map development and provider configuration

Phase 02 adds `/workspace`: a browser-only MapLibre 6.16.0 map, Lyon viewport, native navigation/fullscreen controls, local place catalog, manual coordinate entry, and a draggable start marker. It does not generate a street route or establish routing coverage.

## Interactive local development

Run `pnpm dev` and open <http://localhost:3000/workspace>. In development only, the default style uses OpenStreetMap's standard raster endpoint. Attribution is visible both inside the map and in the permanent credit strip. No map credentials are needed.

Use this community service only for modest interactive development, following the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/). Requests use HTTPS and normal browser identification, referrer, and HTTP cache behavior. The app offers no bulk download, tile archive, offline tile feature, or public-service proxy. Do not strip the referrer, disable caching, or automate requests to public tiles. Availability is best-effort; use an appropriate provider or self-hosting for production traffic.

## Production or another map provider

Set both public settings in `apps/web/.env.local` before starting/building:

```dotenv
NEXT_PUBLIC_MAP_STYLE_URL=https://your-map-host.example/style.json
NEXT_PUBLIC_MAP_ATTRIBUTION=© OpenStreetMap contributors · Your provider
```

A same-origin path such as `/maps/style.json` is supported. The style must be a MapLibre style with accessible tiles and correct source attribution. The credit text is rendered as plain text; HTML is not executed. Provider settings are public browser configuration. Use a provider/hosting arrangement whose terms and attribution meet the intended traffic and usage; choosing a paid service or deployment is outside this phase.

`pnpm build` has no public/demo tile fallback. Without both settings, the production workspace explains that maps are unconfigured, and manual coordinates/local place selection remain usable. Invalid or partial settings use this same fallback. Changing these settings requires rebuilding because the workspace is prerendered.

Map loading, tile/style errors, missing WebGL, and timeouts offer coordinate fallback; failed maps can be retried without losing the selected start point. No raw engine error, configured URL, or location is printed by application error handling.

## Coordinates and editor state

The form labels latitude then longitude for humans. Model values use WGS84/GeoJSON `[longitude, latitude]`; the selected-point card shows both representations. Global finite/range checks and a separate Lyon-area check reject invalid/swapped local coordinates. The bounded test area is longitude 4.65–5.02, latitude 45.63–45.90. These bounds are editor scope, not a routing data guarantee.

Map clicks, marker drags, manual entry, and local search update one React editor state. Resetting the viewport does not move the selected point. Invalid drags return to the last valid position. The point survives switching between place/drawing stages. Task 03-11 now persists the drawing only; map locations remain transient and reset on reload.

## Search providers

`Geocoder` in `apps/web/src/lib/geocoding.ts` defines cancellable search. The default catalog includes a few named Lyon places; it is not address geocoding and sends no search requests outside the browser. Supply a different provider to `MapWorkspace`, or `null` to disable search. Coordinates and map interaction remain independent. Aborted/stale results cannot overwrite a newer search.

## Browser and mocked tests

```sh
pnpm test
pnpm test:e2e:dev
pnpm build:e2e
pnpm test:e2e
```

`build:e2e` creates a production build configured with a test style URL; Playwright intercepts it and supplies synthetic local GeoJSON. No test claims that those lines are actual streets. Public OSM tile requests are blocked by test routing. Run `pnpm build` again to replace the test-configured build before ordinary production use.

`test:e2e:dev` starts the root development command on port 3130 with the same fixture configuration and runs the browser suite without a production build. Close any other development server for this checkout before running it. Development uses Webpack to avoid the observed Windows Turbopack CSS-worker failure; production remains on Turbopack.

The mocked-renderer suite verifies marker state, cleanup, configuration/search failures, coordinate validation, and retry. Browser tests exercise real WebGL/MapLibre workers, navigation controls, keyboard behavior, dragging, responsive layout, and style failure/recovery against the fixture. Phone viewport emulation does not replace physical device testing. See README for using an installed Chrome when Playwright Chromium is unavailable.

MapLibre's [installation guidance](https://maplibre.org/maplibre-gl-js/docs/#installation) requires the explicit worker asset URL used here with Turbopack. The worker and CSS are bundled locally from the pinned dependency. Browser teardown removes the map, marker, observer, and timeout; no routing engine is contacted.
