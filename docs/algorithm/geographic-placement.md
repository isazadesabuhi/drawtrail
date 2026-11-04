# Geographic drawing placement

Phase 04 converts normalized drawing strokes into map geometry around the selected Lyon start point. It previews **target art**, not a navigable route.

## Coordinate rules

Map/API values use WGS84 GeoJSON order: `[longitude, latitude]`. The coordinate form labels latitude and longitude separately, then constructs this order. The Lyon editor validator checks both WGS84 numeric ranges and the local editor bounds, so common swapped coordinate pairs fail.

The optimizer uses a local equirectangular East/North plane anchored at the chosen point. East is `R × Δlongitude × cos(anchor latitude)` and north is `R × Δlatitude`, with spherical mean Earth radius `6,371,008.8 m`. Distances beyond 100 km from the anchor and anchors above 85° latitude are rejected. Use a regional projection or geodesic calculations for larger distances; this helper does not promise survey-grade measurements.

The round-trip fixture near Lyon is tested to less than 1 mm numerical error. Projection and inverse projection use the same local model; this tolerance describes their numeric round-trip, not the model's Earth-surface distortion.

## Footprint and candidates

`drawingToGeoJSON` fits the complete drawing bounding box into a requested width/height in metres, preserving proportions. It centers the drawing, maps canvas-down y to geographic south, and then applies candidate scale, rotation and East/North offset. A horizontal or vertical stroke uses the available dimension without stretching into the other axis. Degenerate points, non-finite transforms, empty drawings and unnormalized points throw range errors.

Candidate generation uses a seeded 32-bit generator. The same seed and options produce the same ordered transforms, with translations constrained to the supplied East/North bounds and rotation/scale constrained to their requested intervals. These candidates are previews, not optimized street matches; Phase 07 owns route-aware placement search.

Current UI previews the first of 12 candidates within ±150 m, with rotation ±30°, scale 0.8–1.2 and an 800 m maximum footprint box. **Try another placement** advances through the same repeatable list. The map anchor is the start point. Changing that point clears the old target preview.

## Geometry validity

The route-like geometry checker returns typed errors for no strokes, too few points, non-finite/out-of-range points, adjacent duplicates, zero-length lines, unclosed closed strokes and closed strokes with zero area. Proper self-crossings are warnings because they can be intentional drawing geometry; they are not silently repaired. The figure-eight fixture verifies this distinction.

## Map overlays

Target strokes and route geometry have separate GeoJSON FeatureCollection sources and MapLibre line layers. The target uses a solid clay line. The future route uses a dashed forest-green line. In Phase 04 the route source is deliberately empty and the legend labels the actual street route as not generated. It is populated only after a later routing phase supplies a path.

## Fixtures and checks

Canonical normalized JSON and restricted SVG fixtures cover a heart, circle, letter M, open stroke and figure-eight. The shared geometry utilities test metric round trips, 1 km proportion, transforms, deterministic search, invalid geometry and intentional crossing warnings. Component/browser tests verify the separate map sources, layer styles, candidate changes and visible target/route legend. Browser tests use a synthetic local map style and do not request public map tiles.
