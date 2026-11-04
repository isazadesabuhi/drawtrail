'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { LngLat } from '@drawtrail/types';
import { LYON_CENTER, LYON_ZOOM, isInsideLyon } from '@drawtrail/geo-utils';
import { lngLatSchema } from '@drawtrail/validation';
import {
  localGeocoder,
  type Geocoder,
  type PlaceResult,
} from '../lib/geocoding';
import type { MapConfiguration } from '../lib/map-config';
import { MapCanvas, type ViewRequest } from './map-canvas';

export function MapWorkspace({
  configuration,
  geocoder = localGeocoder,
}: {
  configuration: MapConfiguration;
  geocoder?: Geocoder | null;
}) {
  const [startPoint, setStartPoint] = useState<LngLat | null>(null);
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

  useEffect(() => () => searchController.current?.abort(), []);

  const selectPoint = useCallback((point: LngLat): boolean => {
    if (!lngLatSchema.safeParse(point).success || !isInsideLyon(point)) {
      setSelectionError(
        'Choose a point inside the Lyon test area: latitude 45.63–45.90, longitude 4.65–5.02.',
      );
      return false;
    }
    setSelectionError('');
    setStartPoint(point);
    setLatitude(point[1].toFixed(6));
    setLongitude(point[0].toFixed(6));
    return true;
  }, []);

  function centerOn(center: LngLat, zoom = LYON_ZOOM) {
    setView((previous) => ({ center, zoom, revision: previous.revision + 1 }));
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
          <h1>Find your little corner of Lyon.</h1>
          <p>Choose where you’ll begin. A new way to see familiar streets.</p>
        </div>
        <span className="editor-region">
          <span aria-hidden="true">↗</span> Lyon, France
        </span>
      </div>
      <ol className="editor-steps" aria-label="Creation stages">
        <li className="current-step" aria-current="step">
          <span>01</span> Choose your place
        </li>
        <li>
          <span>02</span> Draw your idea <small>Coming next</small>
        </li>
        <li>
          <span>03</span> Find a street route <small>Coming later</small>
        </li>
      </ol>
      <div className="editor-grid">
        <aside className="editor-sidebar" aria-label="Start point settings">
          <section className="editor-panel">
            <p className="eyebrow">A PLACE TO BEGIN</p>
            <h2>Set your start point</h2>
            <p className="panel-description">
              Click the map or enter coordinates. Drag the orange pin to adjust
              it.
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
                  ? `${geocoder.label} · a small place catalog, not address search.`
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
                    min="45.63"
                    max="45.9"
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
                    min="4.65"
                    max="5.02"
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
                Decimal degrees · latitude first in this form.
              </p>
              {selectionError && (
                <p id="selection-error" role="alert" className="field-error">
                  {selectionError}
                </p>
              )}
              <button className="primary-button set-start-button" type="submit">
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
                ? `${startPoint[1].toFixed(6)}° N, ${startPoint[0].toFixed(6)}° E`
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
              <strong>Explore Lyon</strong>
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
              Start with a place you love. Drawing and real street routing are
              the next chapters.
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
        Your point stays in this workspace while you edit. Saving drafts across
        reloads comes with the drawing editor.
      </p>
    </>
  );
}
