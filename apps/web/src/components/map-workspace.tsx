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
import { activityModeSchema } from '@drawtrail/validation';
import { LYON_CENTER, LYON_ZOOM } from '@drawtrail/geo-utils';
import {
  lngLatSchema,
  type RouteGenerationSuccess,
  type RouteRepairSuccess,
} from '@drawtrail/validation';
import {
  localGeocoder,
  type Geocoder,
  type PlaceResult,
} from '../lib/geocoding';
import type { MapConfiguration } from '../lib/map-config';
import { MapCanvas, type ViewRequest } from './map-canvas';
import { DrawingEditor } from './drawing-editor';
import { ElevationProfile } from './elevation-profile';
import { MovingTimeEstimate } from './moving-time-estimate';
import { RouteRepairPanel } from './route-repair-panel';
import { SavedRouteLibrary } from './saved-route-library';
import type { SavedRoute } from '../lib/saved-routes';
import {
  DEFAULT_ROUTE_SETTINGS,
  type RouteSettings,
} from '../lib/route-settings';

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
  const [stage, setStage] = useState<'place' | 'options' | 'draw'>('place');
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
  const [repairUndo, setRepairUndo] = useState<{
    result: RouteGenerationSuccess;
    selectedAlternativeIndex: number;
  } | null>(null);
  const [routeSettings, setRouteSettings] = useState<RouteSettings>(
    DEFAULT_ROUTE_SETTINGS,
  );
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
      startPoint && routeSettings.searchRadiusMeters !== null
        ? searchCircle(startPoint, routeSettings.searchRadiusMeters)
        : EMPTY_FEATURES,
    [startPoint, routeSettings.searchRadiusMeters],
  );
  const activeAlternative =
    routeResult?.alternatives?.[selectedAlternativeIndex] ?? null;
  const activeRoute = activeAlternative?.route ?? routeResult?.route;
  const activeTargetGeometry =
    activeAlternative?.targetGeometry ?? routeResult?.targetGeometry;
  const activeElevation = activeAlternative
    ? activeAlternative.elevation
    : routeResult?.elevation;
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
    setRepairUndo(null);
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

  function openRouteOptions() {
    if (startPoint) setStage('options');
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

  function handleRouteRepaired(repaired: RouteRepairSuccess) {
    if (!routeResult || !activeRoute) return;
    setRepairUndo(
      (previous) =>
        previous ?? { result: routeResult, selectedAlternativeIndex },
    );
    const updatedMetrics = {
      route: repaired.route,
      distanceMeters: repaired.distanceMeters,
      similarityScore: repaired.similarityScore,
      retracingMeters: repaired.retracingMeters,
      waypointCount: repaired.waypointCount,
      warnings: repaired.warnings,
      elevation: repaired.elevation,
    };
    setRouteResult((previous) => {
      if (!previous) return previous;
      const alternatives = previous.alternatives?.map((alternative, index) => {
        if (index !== selectedAlternativeIndex) return alternative;
        const distancePenalty = previous.requestedDistanceMeters
          ? 0.25 *
            (Math.abs(
              repaired.distanceMeters - previous.requestedDistanceMeters,
            ) /
              previous.requestedDistanceMeters)
          : 0;
        const score =
          repaired.similarityScore -
          distancePenalty -
          0.15 *
            (repaired.distanceMeters > 0
              ? repaired.retracingMeters / repaired.distanceMeters
              : 0);
        return { ...alternative, ...updatedMetrics, score };
      });
      return selectedAlternativeIndex === 0 || !alternatives
        ? { ...previous, ...updatedMetrics, alternatives }
        : { ...previous, alternatives };
    });
    setRouteGeometry({ type: 'FeatureCollection', features: [repaired.route] });
    fitRoute(repaired.route);
  }

  function undoRouteRepair() {
    if (!repairUndo) return;
    const { result, selectedAlternativeIndex: previousIndex } = repairUndo;
    const alternative = result.alternatives?.[previousIndex];
    const previousRoute = alternative?.route ?? result.route;
    setRouteResult(result);
    setSelectedAlternativeIndex(previousIndex);
    setRouteGeometry({ type: 'FeatureCollection', features: [previousRoute] });
    setRepairUndo(null);
    fitRoute(previousRoute);
  }

  function openSavedRoute(saved: SavedRoute) {
    const result = saved.result;
    const alternativeIndex = Math.min(
      saved.selectedAlternativeIndex,
      Math.max(0, (result.alternatives?.length ?? 1) - 1),
    );
    const alternative = result.alternatives?.[alternativeIndex];
    const route = alternative?.route ?? result.route;
    setRouteResult(result);
    setSelectedAlternativeIndex(alternativeIndex);
    setRepairUndo(null);
    setTargetGeometry({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'generation-target',
          properties: { strokeId: 'target', label: 'Target shape' },
          geometry: alternative?.targetGeometry ?? result.targetGeometry,
        },
      ],
    });
    setRouteGeometry({ type: 'FeatureCollection', features: [route] });
    setStage('place');
    fitRoute(route);
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
              ? 'Choose a starting point.'
              : stage === 'options'
                ? 'Set up your route.'
                : 'Draw your idea.'}
          </h1>
          <p>
            {stage === 'place'
              ? 'Click the map or search for a place to choose where your route begins.'
              : stage === 'options'
                ? 'Choose an activity and distance. Add a search radius to find routes around your start point.'
                : 'Draw a shape or choose a preset. You can generate a route without previewing first.'}
          </p>
        </div>
        <div className="editor-heading-actions">
          {stage === 'place' && (
            <button
              className="primary-button"
              type="button"
              onClick={openRouteOptions}
              disabled={!startPoint}
            >
              Set route options
            </button>
          )}
          {stage === 'draw' && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setStage('options')}
            >
              Change route options
            </button>
          )}
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
          className={stage === 'options' ? 'current-step' : ''}
          aria-current={stage === 'options' ? 'step' : undefined}
        >
          <button
            type="button"
            disabled={!startPoint}
            onClick={openRouteOptions}
          >
            <span>02</span> Set your route
          </button>
        </li>
        <li
          className={stage === 'draw' ? 'current-step' : ''}
          aria-current={stage === 'draw' ? 'step' : undefined}
        >
          <button type="button" disabled={!startPoint} onClick={openDrawing}>
            <span>03</span> Draw your idea
          </button>
        </li>
        <li>
          <span>04</span> Find a street route{' '}
          <small>
            {routeResult
              ? 'Route ready'
              : stage === 'draw'
                ? 'Generate from your drawing'
                : 'Choose your options'}
          </small>
        </li>
      </ol>
      <div hidden={stage === 'draw'}>
        <div className="editor-grid">
          <aside className="editor-sidebar" aria-label="Start point settings">
            {stage === 'place' && (
              <section className="editor-panel">
                <p className="eyebrow">A PLACE TO BEGIN</p>
                <h2>Set your start point</h2>
                <p className="panel-description">
                  Click the map or enter coordinates. Drag the orange pin to
                  adjust it.
                </p>
                <form onSubmit={search} role="search" className="place-search">
                  <label htmlFor="place-query">Search local places</label>
                  <div className="search-field-row">
                    <input
                      id="place-query"
                      type="search"
                      value={query}
                      disabled={!geocoder}
                      maxLength={120}
                      placeholder="Try Bellecour"
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
                      ? `${geocoder.label} is a small place list, not full address search. Use coordinates for other places.`
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
                    Decimal degrees · latitude first. Routing only works where
                    the configured Valhalla graph has map data.
                  </p>
                  {selectionError && (
                    <p
                      id="selection-error"
                      role="alert"
                      className="field-error"
                    >
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
            )}
            {stage === 'options' && (
              <section
                className="editor-panel route-options-panel"
                aria-label="Route options"
              >
                <p className="eyebrow">YOUR ROUTE</p>
                <h2>What would you like?</h2>
                <p className="panel-description">
                  Choose the essentials. The search radius tells DrawTrail where
                  to look for a starting area; routes can extend beyond it.
                </p>
                <label htmlFor="route-activity">Activity</label>
                <select
                  id="route-activity"
                  value={routeSettings.mode}
                  onChange={(event) => {
                    const parsed = activityModeSchema.safeParse(
                      event.target.value,
                    );
                    if (parsed.success)
                      setRouteSettings((current) => ({
                        ...current,
                        mode: parsed.data,
                      }));
                  }}
                >
                  <option value="walking">Walking</option>
                  <option value="running">Running</option>
                  <option value="cycling">Cycling</option>
                </select>
                {!routeSettings.bestShapeMatch && (
                  <div className="route-option-field">
                    <label htmlFor="route-distance">Target distance (km)</label>
                    <input
                      id="route-distance"
                      type="number"
                      min="0.5"
                      max="100"
                      step="0.1"
                      value={routeSettings.targetDistanceKm}
                      onChange={(event) =>
                        setRouteSettings((current) => ({
                          ...current,
                          targetDistanceKm: event.target.value,
                        }))
                      }
                    />
                  </div>
                )}
                <label className="checkbox-row route-radius-toggle">
                  <input
                    type="checkbox"
                    checked={routeSettings.searchRadiusMeters !== null}
                    onChange={(event) =>
                      setRouteSettings((current) => ({
                        ...current,
                        searchRadiusMeters: event.target.checked ? 2000 : null,
                      }))
                    }
                  />
                  Search around my starting point
                </label>
                {routeSettings.searchRadiusMeters !== null && (
                  <div className="route-option-field">
                    <label htmlFor="route-radius">
                      Search radius from start (km)
                    </label>
                    <input
                      id="route-radius"
                      type="number"
                      min="0.5"
                      max="50"
                      step="0.5"
                      value={(
                        routeSettings.searchRadiusMeters / 1000
                      ).toString()}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value) && value > 0)
                          setRouteSettings((current) => ({
                            ...current,
                            searchRadiusMeters: Math.round(value * 1000),
                          }));
                      }}
                    />
                    <p className="field-hint">
                      The map circle shows the search area. The route may go
                      beyond it.
                    </p>
                  </div>
                )}
                <details className="advanced-route-options">
                  <summary>More options</summary>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={routeSettings.bestShapeMatch}
                      onChange={(event) =>
                        setRouteSettings((current) => ({
                          ...current,
                          bestShapeMatch: event.target.checked,
                        }))
                      }
                    />
                    Let DrawTrail choose the distance to best match my drawing
                  </label>
                  <p className="field-hint">
                    The distance can vary. Cycling routes may be longer than
                    walking or running routes.
                  </p>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={routeSettings.closeLoop}
                      onChange={(event) =>
                        setRouteSettings((current) => ({
                          ...current,
                          closeLoop: event.target.checked,
                        }))
                      }
                    />
                    Make it a loop
                  </label>
                  {routeSettings.searchRadiusMeters !== null &&
                    !routeSettings.bestShapeMatch && (
                      <>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={
                              routeSettings.maxDistanceDeviationPercent !== null
                            }
                            onChange={(event) =>
                              setRouteSettings((current) => ({
                                ...current,
                                maxDistanceDeviationPercent: event.target
                                  .checked
                                  ? '40'
                                  : null,
                              }))
                            }
                          />
                          Enforce a maximum distance difference
                        </label>
                        {routeSettings.maxDistanceDeviationPercent !== null && (
                          <div className="route-option-field">
                            <label htmlFor="maximum-distance-difference">
                              Maximum difference (%)
                            </label>
                            <input
                              id="maximum-distance-difference"
                              type="number"
                              min="5"
                              max="100"
                              step="5"
                              value={routeSettings.maxDistanceDeviationPercent}
                              onChange={(event) =>
                                setRouteSettings((current) => ({
                                  ...current,
                                  maxDistanceDeviationPercent:
                                    event.target.value,
                                }))
                              }
                            />
                          </div>
                        )}
                      </>
                    )}
                  <details className="route-preference-options">
                    <summary>Route preferences</summary>
                    <label htmlFor="hills-preference">Hill preference</label>
                    <select
                      id="hills-preference"
                      value={routeSettings.hills}
                      onChange={(event) =>
                        setRouteSettings((current) => ({
                          ...current,
                          hills: event.target.value as RouteSettings['hills'],
                        }))
                      }
                    >
                      <option value="balanced">Balanced</option>
                      <option value="flatter">Flatter</option>
                      <option value="hilly">Hilly</option>
                    </select>
                    {routeSettings.mode === 'cycling' && (
                      <>
                        <label htmlFor="cycling-roads">
                          Cycling road preference
                        </label>
                        <select
                          id="cycling-roads"
                          value={routeSettings.cyclingRoads}
                          onChange={(event) =>
                            setRouteSettings((current) => ({
                              ...current,
                              cyclingRoads: event.target
                                .value as RouteSettings['cyclingRoads'],
                            }))
                          }
                        >
                          <option value="balanced">Balanced</option>
                          <option value="paths">Prefer cycleways</option>
                          <option value="roads">Prefer roads</option>
                        </select>
                        <label htmlFor="cycling-surface">Cycling surface</label>
                        <select
                          id="cycling-surface"
                          value={routeSettings.cyclingSurface}
                          onChange={(event) =>
                            setRouteSettings((current) => ({
                              ...current,
                              cyclingSurface: event.target
                                .value as RouteSettings['cyclingSurface'],
                            }))
                          }
                        >
                          <option value="any">Any</option>
                          <option value="paved">Prefer paved</option>
                          <option value="rough">Prefer unpaved</option>
                        </select>
                      </>
                    )}
                  </details>
                </details>
                <button
                  className="primary-button set-start-button"
                  type="button"
                  onClick={openDrawing}
                >
                  Continue to draw
                </button>
              </section>
            )}
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
                      setRepairUndo(null);
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
              routeSettings.searchRadiusMeters !== null) && (
              <div className="geometry-legend" aria-label="Map geometry legend">
                {routeSettings.searchRadiusMeters !== null && (
                  <span>
                    <i className="search-area-legend-swatch" /> Search area ·{' '}
                    {(routeSettings.searchRadiusMeters / 1000).toFixed(2)} km
                    radius
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
                  {repairUndo && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={undoRouteRepair}
                    >
                      Undo repair
                    </button>
                  )}
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
                </dl>
                <MovingTimeEstimate
                  mode={activeRoute?.properties.mode ?? 'walking'}
                  distanceMeters={activeDistance ?? 0}
                />
                <details className="route-details">
                  <summary>Route details</summary>
                  <dl className="route-result-metrics">
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
                  <ElevationProfile
                    key={selectedAlternativeIndex}
                    elevation={activeElevation}
                  />
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
                </details>
                {activeRoute && activeTargetGeometry && (
                  <details className="route-repair-details">
                    <summary>Repair part of this route</summary>
                    <RouteRepairPanel
                      mode={activeRoute.properties.mode}
                      route={activeRoute}
                      targetGeometry={activeTargetGeometry}
                      onRepaired={handleRouteRepaired}
                    />
                  </details>
                )}
              </section>
            )}
            <SavedRouteLibrary
              currentResult={routeResult}
              selectedAlternativeIndex={selectedAlternativeIndex}
              onOpen={openSavedRoute}
            />
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
                ) : configuration.mode === 'configured' &&
                  configuration.providerLogo === 'maptiler' ? (
                  <>
                    <a
                      href="https://www.maptiler.com/copyright/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      &copy; MapTiler
                    </a>{' '}
                    <a
                      href="https://www.openstreetmap.org/copyright"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      &copy; OpenStreetMap contributors
                    </a>
                  </>
                ) : (
                  configuration.attribution
                )}
              </span>
              {configuration.mode === 'configured' &&
                configuration.providerLogo === 'maptiler' && (
                  <a
                    className="map-provider-logo"
                    href="https://www.maptiler.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="MapTiler"
                  >
                    {/* MapTiler documents this public logo asset for free-plan attribution. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="https://api.maptiler.com/resources/logo.svg"
                      alt="MapTiler"
                      width="86"
                      height="24"
                    />
                  </a>
                )}
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
                Choose a place, draw one stroke, then generate a route using
                available walking or bicycle street data.
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
            routeSettings={routeSettings}
            onEditRouteSettings={() => setStage('options')}
            onPreview={(geometry) => {
              setTargetGeometry(geometry);
              setRouteGeometry(EMPTY_FEATURES);
              setRouteResult(null);
              setRepairUndo(null);
              setStage('place');
            }}
            onGenerated={(result) => {
              setRouteResult(result);
              setRepairUndo(null);
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
