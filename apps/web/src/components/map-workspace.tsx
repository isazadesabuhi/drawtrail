'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { GeoJSONFeatureCollection, LngLat } from '@drawtrail/types';
import { LYON_CENTER, LYON_ZOOM } from '@drawtrail/geo-utils';
import {
  lngLatSchema,
  type RouteGenerationSuccess,
} from '@drawtrail/validation';
import {
  localGeocoder,
  type Geocoder,
  type PlaceResult,
} from '../lib/geocoding';
import type { MapConfiguration } from '../lib/map-config';
import { MapCanvas, type ViewRequest } from './map-canvas';
import { DrawingEditor } from './drawing-editor';

const EMPTY_FEATURES: GeoJSONFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

function searchCircle(center: LngLat, radiusMeters: number) {
  const earthRadiusMeters = 6_371_008.8;
  const latitude = (center[1] * Math.PI) / 180;
  const longitude = (center[0] * Math.PI) / 180;
  const angularDistance = radiusMeters / earthRadiusMeters;
  const coordinates: LngLat[] = [];
  for (let index = 0; index <= 64; index += 1) {
    const bearing = (index / 64) * Math.PI * 2;
    const nextLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance) +
        Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const nextLongitude =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
        Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(nextLatitude),
      );
    coordinates.push([
      (((nextLongitude * 180) / Math.PI + 540) % 360) - 180,
      (nextLatitude * 180) / Math.PI,
    ]);
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'search-area' },
        geometry: { type: 'LineString', coordinates },
      },
    ],
  } satisfies GeoJSONFeatureCollection;
}

function formatLocation([longitude, latitude]: LngLat) {
  return `${Math.abs(latitude).toFixed(6)}\u00b0 ${latitude < 0 ? 'S' : 'N'}, ${Math.abs(longitude).toFixed(6)}\u00b0 ${longitude < 0 ? 'W' : 'E'}`;
}

export function MapWorkspace({
  configuration,
  geocoder = localGeocoder,
}: {
  configuration: MapConfiguration;
  geocoder?: Geocoder | null;
}) {
  const [stage, setStage] = useState<'place' | 'draw'>('place');
  const [drawingVisited, setDrawingVisited] = useState(false);
  const [startPoint, setStartPoint] = useState<LngLat | null>(null);
  const [targetGeometry, setTargetGeometry] =
    useState<GeoJSONFeatureCollection>(EMPTY_FEATURES);
  const [routeGeometry, setRouteGeometry] =
    useState<GeoJSONFeatureCollection>(EMPTY_FEATURES);
  const [routeResult, setRouteResult] = useState<RouteGenerationSuccess | null>(
    null,
  );
  const [selectedAlternativeIndex, setSelectedAlternativeIndex] = useState(0);
  const [searchAreaRadiusMeters, setSearchAreaRadiusMeters] = useState<
    number | null
  >(null);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [view, setView] = useState<ViewRequest>({
    center: LYON_CENTER,
    zoom: LYON_ZOOM,
    revision: 0,
  });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly PlaceResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<
    'idle' | 'loading' | 'empty' | 'error'
  >('idle');
  const searchController = useRef<AbortController | null>(null);
  const searchAreaGeometry = useMemo(
    () =>
      startPoint && searchAreaRadiusMeters !== null
        ? searchCircle(startPoint, searchAreaRadiusMeters)
        : EMPTY_FEATURES,
    [startPoint, searchAreaRadiusMeters],
  );
  const activeAlternative =
    routeResult?.alternatives?.[selectedAlternativeIndex] ?? null;
  const activeRoute = activeAlternative?.route ?? routeResult?.route;
  const activeDistance =
    activeAlternative?.distanceMeters ?? routeResult?.distanceMeters;
  const activeSimilarity =
    activeAlternative?.similarityScore ?? routeResult?.similarityScore;
  const activeRetracing =
    activeAlternative?.retracingMeters ?? routeResult?.retracingMeters;
  const activeWarnings = activeAlternative?.warnings ?? routeResult?.warnings;

  useEffect(() => () => searchController.current?.abort(), []);

  const selectPoint = useCallback((point: LngLat): boolean => {
    if (!lngLatSchema.safeParse(point).success) {
      setSelectionError('Enter a valid WGS84 latitude and longitude.');
      return false;
    }
    setSelectionError('');
    setTargetGeometry(EMPTY_FEATURES);
    setRouteGeometry(EMPTY_FEATURES);
    setRouteResult(null);
    setStartPoint(point);
    setLatitude(point[1].toFixed(6));
    setLongitude(point[0].toFixed(6));
    return true;
  }, []);

  function centerOn(center: LngLat, zoom = LYON_ZOOM) {
    setView((previous) => ({ center, zoom, revision: previous.revision + 1 }));
  }

  function fitRoute(route: RouteGenerationSuccess['route']) {
    const coordinates = route.geometry.coordinates;
    const longitudes = coordinates.map(([longitude]) => longitude);
    const latitudes = coordinates.map(([, latitude]) => latitude);
    let west = Math.min(...longitudes);
    let east = Math.max(...longitudes);
    let south = Math.min(...latitudes);
    let north = Math.max(...latitudes);
    if (east - west < 0.000001) {
      west -= 0.00005;
      east += 0.00005;
    }
    if (north - south < 0.000001) {
      south -= 0.00005;
      north += 0.00005;
    }
    setView((previous) => ({
      center: [(west + east) / 2, (south + north) / 2],
      zoom: previous.zoom,
      revision: previous.revision + 1,
      bounds: [
        [west, south],
        [east, north],
      ],
    }));
  }

  function openDrawing() {
    setDrawingVisited(true);
    setStage('draw');
  }

  function showAlternative(index: number) {
    const alternative = routeResult?.alternatives?.[index];
    if (!alternative) return;
    setSelectedAlternativeIndex(index);
    setTargetGeometry({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'generation-target',
          properties: { strokeId: 'target', label: 'Target shape' },
          geometry: alternative.targetGeometry,
        },
      ],
    });
    setRouteGeometry({
      type: 'FeatureCollection',
      features: [alternative.route],
    });
    fitRoute(alternative.route);
  }

  function applyCoordinates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!latitude.trim() || !longitude.trim()) {
      setSelectionError('Enter both latitude and longitude.');
      return;
    }
    const point: LngLat = [Number(longitude), Number(latitude)];
    if (selectPoint(point)) centerOn(point, 15);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!geocoder) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setResults([]);
    setSearchStatus('loading');
    try {
      const found = await geocoder.search(query, controller.signal);
      if (controller.signal.aborted) return;
      setResults(found);
      setSearchStatus(found.length ? 'idle' : 'empty');
    } catch {
      if (!controller.signal.aborted) setSearchStatus('error');
    }
  }

  return (
    <>
      <div className="editor-heading">
        <div>
          <p className="eyebrow">YOUR IDEA STARTS SOMEWHERE</p>
          <h1>
            {stage === 'place'
              ? 'Choose an area for your route.'
              : 'Draw a little adventure.'}
          </h1>
          <p>
            {stage === 'place'
              ? 'Set a point anywhere on the map. Routes can only use streets in the loaded map graph.'
              : 'A few simple lines today. A different way to move tomorrow.'}
          </p>
        </div>
        <div className="editor-heading-actions">
          <button
            className="primary-button"
            type="button"
            onClick={openDrawing}
          >
            Start drawing <span aria-hidden="true">↗</span>
          </button>
          <span className="editor-region">
            <span aria-hidden="true">↗</span> Choose an area
          </span>
        </div>
      </div>
      <ol className="editor-steps" aria-label="Creation stages">
        <li
          className={stage === 'place' ? 'current-step' : ''}
          aria-current={stage === 'place' ? 'step' : undefined}
        >
          <button type="button" onClick={() => setStage('place')}>
            <span>01</span> Choose your place
          </button>
        </li>
        <li
          className={stage === 'draw' ? 'current-step' : ''}
          aria-current={stage === 'draw' ? 'step' : undefined}
        >
          <button type="button" onClick={openDrawing}>
            <span>02</span> Draw your idea
          </button>
        </li>
        <li>
          <span>03</span> Find a street route{' '}
          <small>
            {routeResult ? 'Baseline generated' : 'Generate from a stroke'}
          </small>
        </li>
      </ol>
      <div hidden={stage !== 'place'}>
        <div className="editor-grid">
          <aside className="editor-sidebar" aria-label="Start point settings">
            <section className="editor-panel">
              <p className="eyebrow">A PLACE TO BEGIN</p>
              <h2>Set your start point</h2>
              <p className="panel-description">
                Click the map or enter coordinates. Drag the orange pin to
                adjust it.
              </p>
              <form onSubmit={search} role="search" className="place-search">
                <label htmlFor="place-query">Search Lyon places</label>
                <div className="search-field-row">
                  <input
                    id="place-query"
                    type="search"
                    value={query}
                    disabled={!geocoder}
                    maxLength={120}
                    placeholder="Try Bellecour or Terreaux"
                    onChange={(event) => {
                      searchController.current?.abort();
                      setQuery(event.target.value);
                      setResults([]);
                      setSearchStatus('idle');
                    }}
                  />
                  <button
                    className="secondary-button"
                    type="submit"
                    disabled={
                      !geocoder ||
                      query.trim().length < 2 ||
                      searchStatus === 'loading'
                    }
                  >
                    Find
                  </button>
                </div>
                <p className="field-hint">
                  {geocoder
                    ? `${geocoder.label} Â· a small place catalog, not address search. Coordinates work anywhere.`
                    : 'Place search is disabled. The map and coordinates still work.'}
                </p>
              </form>
              {searchStatus === 'loading' && (
                <p role="status" className="field-hint">
                  Looking for your place…
                </p>
              )}
              {searchStatus === 'empty' && (
                <p role="status" className="search-feedback">
                  No local place found. Try another name or use coordinates.
                </p>
              )}
              {searchStatus === 'error' && (
                <p role="alert" className="search-feedback">
                  Place search is unavailable. Try again, or use coordinates.
                </p>
              )}
              {results.length > 0 && (
                <ul className="place-results" aria-label="Place results">
                  {results.map((place) => (
                    <li key={place.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectPoint(place.center)) {
                            centerOn(place.center, 15);
                            setResults([]);
                            setQuery(place.name);
                          }
                        }}
                      >
                        <span>{place.name}</span>
                        <span aria-hidden="true">↗</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="coordinate-divider">
                <span>or use coordinates</span>
              </div>
              <form
                className="coordinate-form"
                onSubmit={applyCoordinates}
                noValidate
              >
                <div className="coordinate-fields">
                  <div>
                    <label htmlFor="start-latitude">Latitude</label>
                    <input
                      id="start-latitude"
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={latitude}
                      placeholder="45.764000"
                      aria-invalid={Boolean(selectionError)}
                      aria-describedby={
                        selectionError ? 'selection-error' : 'coordinate-help'
                      }
                      onChange={(event) => setLatitude(event.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="start-longitude">Longitude</label>
                    <input
                      id="start-longitude"
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={longitude}
                      placeholder="4.835700"
                      aria-invalid={Boolean(selectionError)}
                      aria-describedby={
                        selectionError ? 'selection-error' : 'coordinate-help'
                      }
                      onChange={(event) => setLongitude(event.target.value)}
                    />
                  </div>
                </div>
                <p className="field-hint" id="coordinate-help">
                  Decimal degrees · latitude first. Routing only works where the
                  configured Valhalla graph has map data.
                </p>
                {selectionError && (
                  <p id="selection-error" role="alert" className="field-error">
                    {selectionError}
                  </p>
                )}
                <button
                  className="primary-button set-start-button"
                  type="submit"
                >
                  Set start point <span aria-hidden="true">↗</span>
                </button>
              </form>
            </section>
            <section
              className="selected-point-card"
              aria-labelledby="selected-point-title"
            >
              <div className="selected-point-heading">
                <h2 id="selected-point-title">Your starting point</h2>
                {startPoint && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setStartPoint(null);
                      setTargetGeometry(EMPTY_FEATURES);
                      setRouteGeometry(EMPTY_FEATURES);
                      setRouteResult(null);
                      setLatitude('');
                      setLongitude('');
                      setSelectionError('');
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <output aria-label="Selected start point">
                {startPoint
                  ? formatLocation(startPoint)
                  : 'No start point selected yet.'}
              </output>
              {startPoint && (
                <p className="coordinate-order">
                  GeoJSON [longitude, latitude]
                  <br />
                  <code>
                    [{startPoint[0].toFixed(6)}, {startPoint[1].toFixed(6)}]
                  </code>
                </p>
              )}
              <p className="field-hint">
                A start point is a placement, not a validated street route.
              </p>
            </section>
          </aside>
          <section className="editor-map-panel" aria-label="Map workspace">
            <div className="map-toolbar">
              <div>
                <span className="map-toolbar-dot" />
                <strong>Explore the map</strong>
                <span className="map-toolbar-hint">
                  Pan, zoom, find your place
                </span>
              </div>
              <button
                type="button"
                className="secondary-button reset-view-button"
                onClick={() => centerOn(LYON_CENTER)}
              >
                Back to Lyon <span aria-hidden="true">↺</span>
              </button>
            </div>
            <MapCanvas
              configuration={configuration}
              startPoint={startPoint}
              view={view}
              onSelect={selectPoint}
              targetGeometry={targetGeometry}
              routeGeometry={routeGeometry}
              searchAreaGeometry={searchAreaGeometry}
            />
            {(targetGeometry.features.length > 0 ||
              searchAreaRadiusMeters !== null) && (
              <div className="geometry-legend" aria-label="Map geometry legend">
                {searchAreaRadiusMeters !== null && (
                  <span>
                    <i className="search-area-legend-swatch" /> Search area ·{' '}
                    {(searchAreaRadiusMeters / 1000).toFixed(2)} km radius
                  </span>
                )}
                {targetGeometry.features.length > 0 && (
                  <>
                    <span>
                      <i className="target-legend-swatch" /> Target drawing
                    </span>
                    <span>
                      <i className="route-legend-swatch" /> Actual street route
                      ({routeResult ? 'generated' : 'not generated yet'})
                    </span>
                  </>
                )}
              </div>
            )}
            {routeResult && (
              <section
                className="route-result-card"
                aria-label="Generated route results"
              >
                <div className="selected-point-heading">
                  <h2>Generated street route</h2>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setRouteGeometry(EMPTY_FEATURES);
                      setRouteResult(null);
                    }}
                  >
                    Clear route
                  </button>
                </div>
                {(routeResult.alternatives?.length ?? 0) > 1 && (
                  <div
                    className="route-alternative-list"
                    role="group"
                    aria-label="Route alternatives"
                  >
                    {routeResult.alternatives!.map((alternative, index) => (
                      <button
                        key={alternative.id}
                        type="button"
                        className="secondary-button"
                        aria-pressed={selectedAlternativeIndex === index}
                        onClick={() => showAlternative(index)}
                      >
                        Option {index + 1} ·{' '}
                        {(alternative.distanceMeters / 1000).toFixed(2)} km ·{' '}
                        {Math.round(alternative.similarityScore * 100)}% match
                      </button>
                    ))}
                  </div>
                )}
                <dl className="route-result-metrics">
                  <div>
                    <dt>Activity</dt>
                    <dd>{activeRoute?.properties.mode}</dd>
                  </div>
                  <div>
                    <dt>Route distance</dt>
                    <dd>{((activeDistance ?? 0) / 1000).toFixed(2)} km</dd>
                  </div>
                  {routeResult.requestedDistanceMeters === null ? (
                    <div>
                      <dt>Distance preference</dt>
                      <dd>Best shape match</dd>
                    </div>
                  ) : (
                    <div>
                      <dt>Requested</dt>
                      <dd>
                        {(routeResult.requestedDistanceMeters / 1000).toFixed(
                          2,
                        )}{' '}
                        km
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Shape similarity</dt>
                    <dd>{Math.round((activeSimilarity ?? 0) * 100)}%</dd>
                  </div>
                  <div>
                    <dt>Retraced</dt>
                    <dd>
                      {activeDistance
                        ? `${Math.round(((activeRetracing ?? 0) / activeDistance) * 100)}%`
                        : '0%'}
                    </dd>
                  </div>
                  <div>
                    <dt>Waypoints routed</dt>
                    <dd>{routeResult.waypointCount}</dd>
                  </div>
                </dl>
                {(activeWarnings?.length ?? 0) > 0 && (
                  <ul
                    className="route-result-warnings"
                    aria-label="Route warnings"
                  >
                    {activeWarnings?.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            <div className="map-attribution">
              <span>
                {configuration.mode === 'development' ? (
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    © OpenStreetMap contributors
                  </a>
                ) : (
                  configuration.attribution
                )}
              </span>
              <a
                href="https://maplibre.org/"
                target="_blank"
                rel="noopener noreferrer"
              >
                MapLibre
              </a>
            </div>
            <div className="map-bottom-note">
              <span aria-hidden="true">✳</span>
              <p>
                Choose a place, draw one stroke, then generate a route using the
                local walking or bicycle street network.
              </p>
              <a
                href="https://www.openstreetmap.org/fixthemap"
                target="_blank"
                rel="noopener noreferrer"
              >
                Report a map issue ↗
              </a>
            </div>
          </section>
        </div>
        <p className="editor-footer-note">
          Your start point stays here while switching stages. Drawing drafts are
          saved on this device; the map location is not saved across reloads.
        </p>
      </div>
      <div hidden={stage !== 'draw'}>
        {drawingVisited && (
          <DrawingEditor
            startPoint={startPoint}
            searchAreaRadiusMeters={searchAreaRadiusMeters}
            onSearchAreaRadiusChange={setSearchAreaRadiusMeters}
            onPreview={(geometry) => {
              setTargetGeometry(geometry);
              setRouteGeometry(EMPTY_FEATURES);
              setRouteResult(null);
              setStage('place');
            }}
            onGenerated={(result) => {
              setRouteResult(result);
              setSelectedAlternativeIndex(0);
              setTargetGeometry({
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    id: 'generation-target',
                    properties: { strokeId: 'target', label: 'Target shape' },
                    geometry: result.targetGeometry,
                  },
                ],
              });
              setRouteGeometry({
                type: 'FeatureCollection',
                features: [result.route],
              });
              fitRoute(result.route);
              setStage('place');
            }}
          />
        )}
      </div>
    </>
  );
}
