'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from 'react';
import Image from 'next/image';
import type {
  Drawing,
  DrawingStroke,
  GeoJSONFeatureCollection,
  LngLat,
} from '@drawtrail/types';
import {
  changeDrawing,
  drawingToGeoJSON,
  drawingPreset,
  emptyDrawing,
  generatePlacementCandidates,
  redoDrawing,
  resampleStroke,
  simplifyStroke,
  transformDrawing,
  undoDrawing,
  type DrawingHistory,
  type DrawingTransform,
  type PresetName,
} from '@drawtrail/geo-utils';
import {
  apiEnvelopeSchema,
  drawingSchema,
  routeGenerationSuccessSchema,
  type RouteGenerationSuccess,
} from '@drawtrail/validation';
import {
  DEFAULT_ROUTE_SETTINGS,
  type RouteSettings,
} from '../lib/route-settings';
import { readDrawingDraft, writeDrawingDraft } from '../lib/drawing-draft';
import { importSvg, MAX_SVG_BYTES } from '../lib/svg-import';
import {
  loadRaster,
  traceRaster,
  type RasterPreview,
} from '../lib/raster-import';
import { DrawingCanvas, DrawingLines } from './drawing-canvas';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const presets: readonly PresetName[] = [
  'heart',
  'circle',
  'square',
  'star',
  'letter',
];

async function readGenerationResponse(
  response: Response,
  onProgress: (completed: number, total: number) => void,
): Promise<unknown> {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    return response.json().catch(() => null);
  }
  if (!response.body)
    throw new Error('The route service returned an empty stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      const type = event.match(/^event: (.+)$/m)?.[1];
      const data = event.match(/^data: (.+)$/m)?.[1];
      if (!type || !data) continue;
      const parsed: unknown = JSON.parse(data);
      if (
        type === 'progress' &&
        typeof parsed === 'object' &&
        parsed !== null
      ) {
        const progress = parsed as { completed?: number; total?: number };
        if (
          Number.isFinite(progress.completed) &&
          Number.isFinite(progress.total)
        ) {
          onProgress(progress.completed!, progress.total!);
        }
      } else if (type === 'result') {
        return parsed;
      } else if (type === 'error') {
        throw new Error(
          typeof parsed === 'object' && parsed !== null && 'message' in parsed
            ? String(parsed.message)
            : 'Route generation failed.',
        );
      }
    }
    if (done) break;
  }
  throw new Error('The route service ended before returning a result.');
}

export function DrawingEditor({
  startPoint = null,
  routeSettings = DEFAULT_ROUTE_SETTINGS,
  onEditRouteSettings = () => {},
  onPreview = () => {},
  onGenerated = () => {},
}: {
  startPoint?: LngLat | null;
  routeSettings?: RouteSettings;
  onEditRouteSettings?: () => void;
  onPreview?: (geometry: GeoJSONFeatureCollection) => void;
  onGenerated?: (result: RouteGenerationSuccess) => void;
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  return hydrated ? (
    <DrawingSession
      startPoint={startPoint}
      routeSettings={routeSettings}
      onEditRouteSettings={onEditRouteSettings}
      onPreview={onPreview}
      onGenerated={onGenerated}
    />
  ) : (
    <p role="status">Preparing your drawing canvas…</p>
  );
}

function loadInitialDraft() {
  try {
    return readDrawingDraft(window.localStorage);
  } catch {
    return {
      drawing: emptyDrawing(),
      selectedStrokeId: null,
      notice: 'Local storage is unavailable. You can still draw.',
    };
  }
}

function DrawingSession({
  startPoint,
  routeSettings,
  onEditRouteSettings,
  onPreview,
  onGenerated,
}: {
  startPoint: LngLat | null;
  routeSettings: RouteSettings;
  onEditRouteSettings: () => void;
  onPreview: (geometry: GeoJSONFeatureCollection) => void;
  onGenerated: (result: RouteGenerationSuccess) => void;
}) {
  const [initial] = useState(loadInitialDraft);
  const [history, setHistory] = useState<DrawingHistory>(() => ({
    past: [],
    present: initial.drawing,
    future: [],
  }));
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.selectedStrokeId,
  );
  const [feedback, setFeedback] = useState({
    error: false,
    text: initial.notice,
  });
  const [saveStatus, setSaveStatus] = useState('Saving…');
  const [raster, setRaster] = useState<RasterPreview | null>(null);
  const [candidate, setCandidate] = useState<Drawing | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [placementIndex, setPlacementIndex] = useState(0);
  const uploadTicket = useRef(0);
  const generationController = useRef<AbortController | null>(null);
  const rasterRef = useRef<RasterPreview | null>(null);
  const drawing = history.present;
  const selected =
    drawing.strokes.find((stroke) => stroke.id === selectedId) ??
    drawing.strokes[0] ??
    null;
  const placements = useMemo(() => {
    if (!startPoint || !drawing.strokes.length) return [];
    return generatePlacementCandidates({
      seed: JSON.stringify({
        name: drawing.name,
        strokes: drawing.strokes.map(({ closed, points }) => ({
          closed,
          points,
        })),
      }),
      count: 12,
      bounds: {
        minEastMeters: -150,
        maxEastMeters: 150,
        minNorthMeters: -150,
        maxNorthMeters: 150,
      },
      minRotationDegrees: -30,
      maxRotationDegrees: 30,
      minScale: 0.8,
      maxScale: 1.2,
    });
  }, [drawing, startPoint]);

  useEffect(() => () => generationController.current?.abort(), []);

  async function generateStreetRoute() {
    if (!startPoint || !selected) {
      setFeedback({
        error: true,
        text: 'Choose a start point and one stroke first.',
      });
      return;
    }
    const candidate = placements[placementIndex];
    if (!candidate) {
      setFeedback({
        error: true,
        text: 'Create a drawing placement before routing.',
      });
      return;
    }
    generationController.current?.abort();
    const controller = new AbortController();
    generationController.current = controller;
    setGenerating(true);
    setFeedback({ error: false, text: 'Finding a connected street route…' });
    const boundsDistanceKm = routeSettings.bestShapeMatch
      ? 18
      : Number(routeSettings.targetDistanceKm);
    try {
      const response = await fetch('/api/v1/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream, application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          drawing: { ...drawing, strokes: [selected] },
          center: startPoint,
          mode: routeSettings.mode,
          ...(routeSettings.bestShapeMatch
            ? {}
            : { targetDistanceKm: Number(routeSettings.targetDistanceKm) }),
          loop: routeSettings.closeLoop || selected.closed,
          bounds: {
            radiusMeters: Math.min(
              50_000,
              Math.max(
                1500,
                (routeSettings.searchRadiusMeters ?? 0) +
                  boundsDistanceKm * 1200 +
                  (routeSettings.searchRadiusMeters === null
                    ? Math.hypot(
                        candidate.offsetEastMeters,
                        candidate.offsetNorthMeters,
                      )
                    : 0) +
                  100,
              ),
            ),
            continuityToleranceMeters: 2,
          },
          settings: {
            // More control points keep routed streets closer to bends in the sketch.
            maxWaypoints: 16,
            seed: `${drawing.name}:${selected.id}:${placementIndex}`,
            preferences: {
              hills: routeSettings.hills,
              cyclingRoads: routeSettings.cyclingRoads,
              cyclingSurface: routeSettings.cyclingSurface,
            },
            placement: {
              rotationDegrees: candidate.rotationDegrees,
              scale: candidate.scale,
              offsetEastMeters: candidate.offsetEastMeters,
              offsetNorthMeters: candidate.offsetNorthMeters,
            },
            ...(routeSettings.searchRadiusMeters === null
              ? {}
              : {
                  searchArea: {
                    radiusMeters: routeSettings.searchRadiusMeters,
                    candidateCount: 8,
                    maxRuntimeMs: 30_000,
                    maxRouterRequests: 160,
                    ...(routeSettings.maxDistanceDeviationPercent === null ||
                    routeSettings.bestShapeMatch
                      ? {}
                      : {
                          maxDistanceDeviationRatio:
                            Number(routeSettings.maxDistanceDeviationPercent) /
                            100,
                        }),
                  },
                }),
          },
        }),
      });
      const result = apiEnvelopeSchema(routeGenerationSuccessSchema).safeParse(
        await readGenerationResponse(response, (completed, total) => {
          setFeedback({
            error: false,
            text: `Searching route placements ${completed} of ${total}…`,
          });
        }),
      );
      if (!result.success) {
        throw new Error('The route service returned an unreadable response.');
      }
      if (result.data.status === 'error') {
        throw new Error(result.data.error.message);
      }
      onGenerated(result.data.data);
      setFeedback({
        error: false,
        text: 'Street route generated. Review its distance, similarity, and warnings on the map.',
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setFeedback({
        error: true,
        text:
          error instanceof Error
            ? error.message
            : 'Route generation failed. Check the routing service and try again.',
      });
    } finally {
      if (generationController.current === controller) {
        generationController.current = null;
        setGenerating(false);
      }
    }
  }

  useEffect(() => {
    const persist = () => {
      try {
        writeDrawingDraft(window.localStorage, drawing, selected?.id ?? null);
        return true;
      } catch {
        return false;
      }
    };
    const timer = window.setTimeout(
      () =>
        setSaveStatus(
          persist() ? 'Saved on this device' : 'Local saving unavailable',
        ),
      350,
    );
    const flush = () => {
      persist();
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', flush);
      persist();
    };
  }, [drawing, selected?.id]);

  useEffect(
    () => () => {
      uploadTicket.current++;
      if (rasterRef.current) URL.revokeObjectURL(rasterRef.current.url);
    },
    [],
  );

  function commit(next: Drawing, message = 'Drawing updated.') {
    const parsed = drawingSchema.safeParse(next);
    if (!parsed.success) {
      setFeedback({
        error: true,
        text:
          parsed.error.issues[0]?.message ??
          'The drawing is invalid or too detailed.',
      });
      return;
    }
    setHistory((previous) => changeDrawing(previous, parsed.data));
    setSaveStatus('Saving…');
    setFeedback({ error: false, text: message });
  }
  function undo() {
    setHistory(undoDrawing);
    setSaveStatus('Saving…');
    setFeedback({ error: false, text: 'Undid the last change.' });
  }
  function redo() {
    setHistory(redoDrawing);
    setSaveStatus('Saving…');
    setFeedback({ error: false, text: 'Redid the last change.' });
  }
  function addStroke(stroke: DrawingStroke) {
    commit(
      { ...drawing, source: 'freehand', strokes: [...drawing.strokes, stroke] },
      'Stroke added. Separate strokes have no connecting line.',
    );
    setSelectedId(stroke.id);
  }
  function transform(options: DrawingTransform) {
    try {
      commit(transformDrawing(drawing, options));
    } catch (error) {
      setFeedback({ error: true, text: (error as Error).message });
    }
  }
  function replaceSelected(update: (stroke: DrawingStroke) => DrawingStroke) {
    if (!selected) return;
    try {
      commit({
        ...drawing,
        strokes: drawing.strokes.map((stroke) =>
          stroke.id === selected.id ? update(stroke) : stroke,
        ),
      });
    } catch (error) {
      setFeedback({ error: true, text: (error as Error).message });
    }
  }
  function reorder(index: number, offset: number) {
    const strokes = [...drawing.strokes],
      to = index + offset;
    if (to < 0 || to >= strokes.length) return;
    [strokes[index], strokes[to]] = [strokes[to]!, strokes[index]!];
    commit(
      { ...drawing, strokes },
      'Stroke order updated. No connectors were added.',
    );
  }
  function releasePreview() {
    if (rasterRef.current) URL.revokeObjectURL(rasterRef.current.url);
    rasterRef.current = null;
    setRaster(null);
    setCandidate(null);
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const ticket = ++uploadTicket.current;
    setBusy(true);
    setCandidate(null);
    try {
      if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') {
        if (file.size > MAX_SVG_BYTES)
          throw new Error('SVG must be 256 KB or smaller.');
        const next = importSvg(await file.text());
        if (ticket !== uploadTicket.current) return;
        releasePreview();
        commit(next, 'SVG imported as separate editable strokes.');
        setSelectedId(next.strokes[0]?.id ?? null);
      } else {
        const preview = await loadRaster(file);
        if (ticket !== uploadTicket.current) {
          URL.revokeObjectURL(preview.url);
          return;
        }
        releasePreview();
        rasterRef.current = preview;
        setRaster(preview);
        setFeedback({
          error: false,
          text: 'Image preview loaded. Your drawing is unchanged; trace and review a silhouette before using it.',
        });
      }
    } catch (error) {
      if (ticket === uploadTicket.current)
        setFeedback({ error: true, text: (error as Error).message });
    } finally {
      if (ticket === uploadTicket.current) setBusy(false);
    }
  }
  const transforms: { label: string; options: DrawingTransform }[] = [
    { label: 'Move left', options: { dx: -0.04 } },
    { label: 'Move right', options: { dx: 0.04 } },
    { label: 'Move up', options: { dy: -0.04 } },
    { label: 'Move down', options: { dy: 0.04 } },
    { label: 'Rotate left', options: { degrees: -15 } },
    { label: 'Rotate right', options: { degrees: 15 } },
    { label: 'Make smaller', options: { scale: 0.85 } },
    { label: 'Make larger', options: { scale: 1.15 } },
    { label: 'Flip horizontally', options: { flipX: true } },
    { label: 'Flip vertically', options: { flipY: true } },
  ];

  return (
    <section
      className="drawing-editor"
      aria-labelledby="drawing-title"
      onKeyDown={(event) => {
        if (
          !(event.ctrlKey || event.metaKey) ||
          (event.target instanceof HTMLElement &&
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))
        )
          return;
        if (event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
        }
        if (event.key.toLowerCase() === 'y') {
          event.preventDefault();
          redo();
        }
      }}
    >
      <div className="drawing-editor-heading">
        <div>
          <p className="eyebrow">A SHAPE ONLY YOU COULD MAKE</p>
          <h2 id="drawing-title">Make your mark.</h2>
          <p>Keep it simple. A few good lines can go a long way.</p>
        </div>
        <output
          className="draft-status"
          role="status"
          aria-label="Draft storage"
        >
          {saveStatus}
        </output>
      </div>
      <div className="drawing-editor-grid">
        <aside className="drawing-tools" aria-label="Drawing tools">
          <section className="drawing-tool-card">
            <h3>Start with a little inspiration</h3>
            <div className="preset-buttons">
              {presets.map((name) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => {
                    const preset = drawingPreset(name);
                    commit(preset, `${preset.name} preset loaded.`);
                    setSelectedId(preset.strokes[0]!.id);
                  }}
                >
                  <svg viewBox="0 0 1 1" aria-hidden="true">
                    <DrawingLines drawing={drawingPreset(name)} />
                  </svg>
                  <span>
                    {name === 'letter'
                      ? 'Letter M'
                      : name[0]!.toUpperCase() + name.slice(1)}
                  </span>
                </button>
              ))}
            </div>
            <p className="field-hint">
              Presets replace the current drawing. Undo brings it back.
            </p>
          </section>
          <section
            className="drawing-tool-card placement-tool-card"
            aria-labelledby="placement-title"
          >
            <h3 id="placement-title">Place it near your start</h3>
            {startPoint ? (
              <>
                <p>The shape is placed near your start point automatically.</p>
                <details className="placement-options">
                  <summary>Adjust placement or preview on map</summary>
                  <div className="placement-actions">
                    <span aria-live="polite">
                      Position {placementIndex + 1} of {placements.length}
                    </span>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setPlacementIndex(
                          (index) => (index + 1) % placements.length,
                        )
                      }
                      disabled={!placements.length}
                    >
                      Try another
                    </button>
                  </div>
                  <button
                    type="button"
                    className="secondary-button preview-target-button"
                    disabled={!drawing.strokes.length || !placements.length}
                    onClick={() => {
                      const candidate = placements[placementIndex]!;
                      onPreview(
                        drawingToGeoJSON(drawing, startPoint, {
                          widthMeters: 800,
                          heightMeters: 800,
                          scale: candidate.scale,
                          rotationDegrees: candidate.rotationDegrees,
                          offsetEastMeters: candidate.offsetEastMeters,
                          offsetNorthMeters: candidate.offsetNorthMeters,
                        }),
                      );
                    }}
                  >
                    Preview placement on map
                  </button>
                </details>
                <section
                  className="route-plan-summary"
                  aria-label="Route setup summary"
                >
                  <p className="eyebrow">ROUTE SETUP</p>
                  <h3>
                    {routeSettings.mode === 'cycling'
                      ? 'Cycling'
                      : routeSettings.mode === 'running'
                        ? 'Running'
                        : 'Walking'}
                    {' · '}
                    {routeSettings.bestShapeMatch
                      ? 'Best match to drawing'
                      : `${routeSettings.targetDistanceKm} km`}
                  </h3>
                  <p>
                    {routeSettings.searchRadiusMeters === null
                      ? 'Starting near your selected point.'
                      : `Searching within ${(routeSettings.searchRadiusMeters / 1000).toFixed(2)} km of your selected point. The route may go beyond the search radius.`}
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={onEditRouteSettings}
                  >
                    Change route options
                  </button>
                </section>
                <div className="generation-settings">
                  <button
                    type="button"
                    className="primary-button generate-route-button"
                    disabled={!selected || generating || busy}
                    onClick={generateStreetRoute}
                  >
                    {generating
                      ? 'Routing your shape…'
                      : 'Generate street route'}
                  </button>
                </div>
              </>
            ) : (
              <p>
                Choose a start point in the place step before previewing the
                drawing on the map.
              </p>
            )}
          </section>
          <details className="drawing-tool-card">
            <summary>Move & shape</summary>
            <div className="transform-buttons">
              {transforms.map(({ label, options }) => (
                <button
                  type="button"
                  className="secondary-button"
                  key={label}
                  disabled={!drawing.strokes.length}
                  onClick={() => transform(options)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="field-hint">
              Moves: 4% · turns: 15°. Geometry stays inside the canvas.
            </p>
          </details>
          <details className="drawing-tool-card">
            <summary>Import a shape or image</summary>
            <label className="upload-label" htmlFor="drawing-upload">
              Choose SVG, PNG or JPEG
            </label>
            <input
              id="drawing-upload"
              type="file"
              accept=".svg,image/svg+xml,image/png,image/jpeg"
              onChange={upload}
              disabled={busy}
            />
            <p className="field-hint">
              SVG: up to 256 KB, basic geometry only. PNG/JPEG: up to 5 MB and 4
              megapixels.
            </p>
            {busy && <p role="status">Reading your file…</p>}
            {raster && (
              <div className="raster-preview">
                <Image
                  unoptimized
                  src={raster.url}
                  width={raster.width}
                  height={raster.height}
                  alt="Uploaded image preview"
                />
                <p>
                  Image preview · {raster.width} × {raster.height}
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    try {
                      setCandidate(traceRaster(raster));
                      setFeedback({
                        error: false,
                        text: 'Review the outline, then choose whether to use it.',
                      });
                    } catch (error) {
                      setCandidate(null);
                      setFeedback({
                        error: true,
                        text: (error as Error).message,
                      });
                    }
                  }}
                >
                  Trace silhouette
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={releasePreview}
                >
                  Remove image preview
                </button>
              </div>
            )}
            {candidate && (
              <div className="trace-review">
                <h4>Review extracted outline</h4>
                <svg
                  viewBox="0 0 1 1"
                  role="img"
                  aria-label="Extracted silhouette outline"
                >
                  <DrawingLines drawing={candidate} />
                </svg>
                <p className="field-hint">
                  Experimental: one solid dark shape, no holes or separate
                  contours.
                </p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    commit(
                      candidate,
                      'Reviewed silhouette added as an editable outline.',
                    );
                    setSelectedId(candidate.strokes[0]!.id);
                    setCandidate(null);
                  }}
                >
                  Replace drawing with outline
                </button>
              </div>
            )}
          </details>
        </aside>
        <div className="drawing-paper-panel">
          <div className="drawing-toolbar">
            <strong>Drawing canvas</strong>
            <div>
              <button
                type="button"
                className="secondary-button"
                disabled={!history.past.length}
                onClick={undo}
              >
                Undo
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!history.future.length}
                onClick={redo}
              >
                Redo
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!drawing.strokes.length}
                onClick={() =>
                  commit(
                    emptyDrawing(),
                    'Drawing cleared. Undo can restore it.',
                  )
                }
              >
                Clear drawing
              </button>
            </div>
          </div>
          <DrawingCanvas
            drawing={drawing}
            selectedId={selected?.id ?? null}
            onStroke={addStroke}
            onMessage={(text) => setFeedback({ error: false, text })}
          />
          {feedback.text && (
            <p
              className={
                feedback.error
                  ? 'drawing-feedback field-error'
                  : 'drawing-feedback'
              }
              role={feedback.error ? 'alert' : 'status'}
              aria-label="Drawing feedback"
            >
              {feedback.text}
            </p>
          )}
          <section
            className="stroke-panel"
            aria-labelledby="stroke-panel-title"
          >
            <div className="stroke-panel-heading">
              <h3 id="stroke-panel-title">Your strokes</h3>
              <output aria-label="Stroke count">
                {drawing.strokes.length}{' '}
                {drawing.strokes.length === 1 ? 'stroke' : 'strokes'}
              </output>
            </div>
            {drawing.strokes.length > 1 && (
              <p className="multi-stroke-notice">
                These are separate strokes, in the order below. No connecting
                lines are added. Select one stroke to use alone for the first
                routing baseline.
              </p>
            )}
            {!drawing.strokes.length ? (
              <p className="field-hint">
                Draw with a pointer, use the keyboard, import an SVG, or choose
                a preset.
              </p>
            ) : (
              <ol className="stroke-list">
                {drawing.strokes.map((stroke, index) => (
                  <li key={stroke.id}>
                    <button
                      className={
                        stroke.id === selected?.id
                          ? 'stroke-select active'
                          : 'stroke-select'
                      }
                      aria-pressed={stroke.id === selected?.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(stroke.id);
                        setSaveStatus('Saving…');
                      }}
                    >
                      {index + 1}. {stroke.label} ·{' '}
                      {stroke.closed ? 'closed' : 'open'} ·{' '}
                      {stroke.points.length} points
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      aria-label={`Move stroke ${index + 1} earlier`}
                      disabled={index === 0}
                      onClick={() => reorder(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      aria-label={`Move stroke ${index + 1} later`}
                      disabled={index === drawing.strokes.length - 1}
                      onClick={() => reorder(index, 1)}
                    >
                      ↓
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {selected && (
              <div className="stroke-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={drawing.strokes.length < 2}
                  onClick={() =>
                    commit(
                      { ...drawing, strokes: [selected] },
                      'Kept only the selected stroke. Undo can restore the others.',
                    )
                  }
                >
                  Use only selected stroke
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    replaceSelected((stroke) => ({
                      ...stroke,
                      points: [...stroke.points].reverse(),
                    }))
                  }
                >
                  Reverse selected stroke
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    replaceSelected((stroke) => ({
                      ...stroke,
                      closed: !stroke.closed,
                      points: stroke.closed
                        ? stroke.points.slice(0, -1)
                        : [...stroke.points, stroke.points[0]!],
                    }))
                  }
                >
                  {selected.closed
                    ? 'Open selected stroke'
                    : 'Close selected stroke'}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    replaceSelected((stroke) => ({
                      ...stroke,
                      points: resampleStroke(
                        simplifyStroke(stroke.points, 0.003, stroke.closed),
                        0.025,
                      ),
                    }))
                  }
                >
                  Simplify & resample
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    commit(
                      {
                        ...drawing,
                        strokes: drawing.strokes.filter(
                          (stroke) => stroke.id !== selected.id,
                        ),
                      },
                      'Selected stroke removed.',
                    )
                  }
                >
                  Delete selected stroke
                </button>
              </div>
            )}
          </section>
          <p className="drawing-privacy-note">
            Only your drawing and stroke selection are saved on this device. Map
            location and source image files are not stored. Geographic placement
            and real street routing come next.
          </p>
        </div>
      </div>
    </section>
  );
}
