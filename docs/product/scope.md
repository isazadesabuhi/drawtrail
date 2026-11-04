# DrawTrail v1 scope

DrawTrail helps recreational walkers, runners, cyclists, and GPS artists turn a simple drawing into a route on a real street network. The first test area is Lyon, France.

## Web MVP

- Create a single ordered freehand stroke or choose a deterministic preset. Import a restricted, validated SVG.
- Place, rotate, and scale the target on a map; select an explicit start, activity, and requested distance in kilometers.
- Generate a continuous street route through a local Valhalla service. Running initially uses pedestrian access with documented preferences.
- Inspect the target and actual route separately, compare up to three alternatives and measured quality, and export only router-validated geometry as GPX or GeoJSON.
- Keep drafts locally until durable jobs and ownership are implemented. Explain unavailable routing, coverage limits, and no suitable route.

Raster uploads initially provide a preview only. High-contrast silhouette tracing is experimental and requires inspection before generation. Separate strokes must not be silently joined.

## Future scope

Expo Android/iOS clients reuse the versioned API once stable. Accounts, durable jobs, production hosting, activity recording, broader regions, advanced image tracing, and public sharing follow their backlog gates.

## Explicit exclusions

No turn-by-turn navigation, guarantee of physical safety, raw-photo-to-perfect-route promise, automatic publishing, paid routing subscription, or unrestricted SVG execution. A sketch is a target, never evidence of a traversable route. Router access is a data-based proxy; users must judge current conditions and signage in the field.

## Initial release boundary

Gate A delivers a tested local scaffold. Gate B adds drawing and map placement. Gate C is the first actual street-routing baseline. Until Gate C passes, the app must not offer navigable exports or display invented routing metrics.
