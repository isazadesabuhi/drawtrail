# Drawing model and input pipeline

Phase 03 covers target art only. Drawing geometry is never presented or exported as a navigable street route. Geographic placement and router validation follow in later phases.

## Canonical model

`Drawing` in `packages/types` has schema version 1, a bounded name, an input-source label, and ordered strokes. Each stroke has a stable local ID, label, explicit `closed` flag and normalized `[x, y]` points: x grows rightward and y downward within `[0, 1]`. These are canvas coordinates, not WGS84 coordinates. A closed stroke repeats its first point exactly at the end. Distinct stroke arrays are never concatenated by the renderer or importers.

Zod validates the model at edit/import/draft boundaries. Limits are 24 strokes, 2048 points per stroke, and 8192 total points; IDs must be unique. Empty drawings are valid editor states. Zero-length strokes, non-finite/out-of-range coordinates, inconsistent closure and unknown schema versions are rejected. SVGs and silhouettes are fit to a centered square with 12% margin, preserving aspect ratio.

The SVG drawing surface records pointer events for mouse, pen and a single finger, with visible cursor/ink feedback and pointer capture. Cancelled gestures are discarded. Very detailed gestures stop with feedback. Near-closed freehand gestures are explicitly closed within a 2.5%-of-canvas endpoint tolerance. A focusable keyboard surface supplies an alternative: arrows move by 1% (Shift: 5%), Space adds a vertex, Enter commits a stroke and Escape cancels. Local IDs have a non-credential fallback when the secure-context [randomUUID API](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID) is absent, including some LAN HTTP setups.

## Editing and geometry

Every committed drawing edit creates an undoable snapshot; new edits discard redo. History is bounded to 50 snapshots and kept only in memory. Presets, freehand strokes, SVG import, clear, transforms, ordering, selection-based deletion/retention and cleanup all use the same history operations. Reload restores the current drawing, not its undo history.

- Presets are deterministic: heart, circle, square, star and an open single-stroke letter M. Fixed JSON fixtures are versioned under `packages/geo-utils/fixtures`.
- Iterative RDP simplification removes redundant vertices. Closed loops are split at a distant anchor to avoid collapsing their coincident endpoints; a degenerate result retains the original loop.
- Arc-length resampling inserts samples at uniform distance targets **and** retains original vertices, preserving corners and exact endpoint/closure identity. Zero-length inputs return a single point; editor validation prevents committing a degenerate stroke.
- Translation is 4% of canvas per button, rotation is 15°, scale factors are 0.85/1.15, and flips use the whole drawing's bounding-box center. Changes affect the complete drawing. An out-of-bounds transform fails without clipping or deforming the target; reduce its size first.
- Separate strokes can be selected, reordered, reversed, deleted, opened/closed, simplified/resampled, or explicitly reduced to the selected stroke. No implicit connectors or ordering optimization is performed.

## Restricted SVG import

Maximum input: 256 KB, 256 elements, 12 levels of nesting, plus canonical point/stroke limits. XML is parsed in a detached document, and only numeric geometry is retained; uploaded markup is never inserted into the application DOM.

Supported geometry: `path` with M/L/H/V/C/Q/Z (absolute or relative), `line`, `polyline`, `polygon`, plain `rect`, `circle`, and `ellipse`; simple `svg`/`g` containers and text-only `title`/`desc` metadata are accepted. Cubic/quadratic segments use 24 subdivisions. Multiple M subpaths remain separate strokes. Geometry is normalized to its content bounds; SVG viewport cropping, paint appearance and physical units are not reproduced.

DTD/entities, scripts, event attributes, external references, images, `use`, foreign content, styling, transforms, nested unsupported namespaces and unknown elements/attributes are rejected. Arcs and smooth shorthand commands must be converted to supported basic paths before upload. This is a bounded geometry importer, not a general SVG renderer. Invalid/oversized imports leave the prior drawing intact.

## PNG/JPEG preview and silhouette prototype

PNG/JPEG limits: 5 MB, at most 4096 pixels on either side, and 4 megapixels total. Signature and dimension headers are checked before browser decoding; MIME mismatches, malformed headers and animated PNG are rejected. JPEG dimension parsing supports baseline/extended sequential/progressive SOF headers. The browser decoder still has to accept the file. Object URLs are revoked on replacement/removal/unmount.

Uploading a raster leaves the drawing unchanged and provides a transient image preview. Tracing is an explicit second action; a third action, **Replace drawing with outline**, accepts the reviewed candidate as editable drawing geometry.

The prototype downsamples to at most 128×128 pixels, composites transparency over white, and classifies dark pixels at luminance <128. It rejects excessive midtones, empty images and images with over 90% dark coverage. A four-connected foreground flood fill requires a single component. Oriented exposed pixel edges are followed into one ordered closed contour; holes, corner-touch ambiguities, multiple boundaries and excessive detail are rejected. A 0.2-pixel simplification removes straight grid edges before normalized fitting.

This supports simple solid, dark silhouettes on light backgrounds, not shaded photos, portraits, multiple objects or holes. The 32×32 fixed PNG fixture contains a black square at pixels `[8,24) × [8,24)`. Unit and real browser tests verify its ordered five-point closed outline at normalized bounds 0.12–0.88 within numeric tolerance.

## Drafts and privacy

Only the versioned current drawing and selected stroke ID are stored under `drawtrail.drawing.v1` in browser localStorage, bounded to 1,000,000 characters. Map location, source filenames, raster bytes/object URLs, candidate previews and undo history are not persisted. The source label records the input family, not file metadata. No upload is sent to an API/server.

Drafts restore after client hydration. Invalid JSON, unsupported versions and invalid/oversized geometry reset safely with visible feedback. Writes are debounced and flushed on cleanup/page hide. Storage denial/quota errors produce a visible save status while editing remains usable. Clearing the drawing saves an empty model and is undoable during that session. Clear browser site data to remove local storage entirely.

## Test boundaries

Unit/component tests cover fixed fixtures, validation and limits, geometry, multi-stroke history, safe imports, tracing, transforms, draft restoration/corruption and storage denial. Browser journeys exercise actual mouse input, emulated trusted touch events, keyboard drawing, file uploads/decoding, silhouette review, selected map state across stages and local drafts across reloads. Screenshots cover desktop/phone layout. Phone emulation is not a physical-device field test; no street-routing claim follows from these checks.
