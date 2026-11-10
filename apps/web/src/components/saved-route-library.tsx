'use client';

import { useMemo, useState, useSyncExternalStore, type FormEvent } from 'react';
import type { RouteGenerationSuccess } from '@drawtrail/validation';
import {
  downloadTextFile,
  downloadRoutePng,
  safeExportName,
  toGeoJson,
  toGpx,
} from '../lib/route-exports';
import {
  parseSavedRoutes,
  removeSavedRoute,
  saveRouteLocally,
  SAVED_ROUTES_STORAGE_KEY,
  type SavedRoute,
} from '../lib/saved-routes';

const savedRoutesChanged = 'drawtrail:saved-routes-changed';
const unavailable = '__drawtrail-storage-unavailable__';

function subscribeToSavedRoutes(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(savedRoutesChanged, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(savedRoutesChanged, callback);
  };
}

function getSavedRoutesSnapshot() {
  try {
    return window.localStorage.getItem(SAVED_ROUTES_STORAGE_KEY) ?? '';
  } catch {
    return unavailable;
  }
}

function getServerSnapshot() {
  return '';
}

export function SavedRouteLibrary({
  currentResult,
  selectedAlternativeIndex,
  onOpen,
}: {
  currentResult: RouteGenerationSuccess | null;
  selectedAlternativeIndex: number;
  onOpen: (route: SavedRoute) => void;
}) {
  const storedRoutes = useSyncExternalStore(
    subscribeToSavedRoutes,
    getSavedRoutesSnapshot,
    getServerSnapshot,
  );
  const routes = useMemo(() => parseSavedRoutes(storedRoutes), [storedRoutes]);
  const [name, setName] = useState('My route');
  const [confirmSharing, setConfirmSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [message, setMessage] = useState(
    storedRoutes === unavailable
      ? 'Local route storage is unavailable in this browser.'
      : '',
  );

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentResult) return;
    try {
      const saved = saveRouteLocally(
        window.localStorage,
        name,
        currentResult,
        selectedAlternativeIndex,
      );
      if (!saved.error) window.dispatchEvent(new Event(savedRoutesChanged));
      setMessage(saved.error ?? `Saved ${name.trim()} on this device.`);
    } catch {
      setMessage('Local route storage is unavailable in this browser.');
    }
  }

  function remove(id: string) {
    try {
      const removed = removeSavedRoute(window.localStorage, id);
      if (!removed.error) window.dispatchEvent(new Event(savedRoutesChanged));
      setMessage(removed.error ?? 'Saved route removed from this device.');
    } catch {
      setMessage('Could not remove the saved route.');
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentResult || !confirmSharing) return;
    const alternative = currentResult.alternatives?.[selectedAlternativeIndex];
    const routeToPublish = alternative
      ? {
          ...currentResult,
          targetGeometry: alternative.targetGeometry,
          route: alternative.route,
          elevation: alternative.elevation,
          distanceMeters: alternative.distanceMeters,
          similarityScore: alternative.similarityScore,
          retracingMeters: alternative.retracingMeters,
          waypointCount: alternative.waypointCount,
          warnings: alternative.warnings,
        }
      : currentResult;
    setMessage('Publishing route...');
    try {
      const response = await fetch('/api/v1/shares', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          route: routeToPublish,
          locationSharingConfirmed: true,
        }),
      });
      const data = (await response.json()) as {
        id?: string;
        error?: string;
      };
      if (!response.ok || !data.id)
        throw new Error(data.error ?? 'Could not publish this route.');
      const url = new URL(
        `/shared/${data.id}`,
        window.location.origin,
      ).toString();
      setShareUrl(url);
      setMessage(
        'Route published. Anyone with the link can view it for 30 days.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not publish this route.',
      );
    }
  }

  async function exportRoute(format: 'gpx' | 'geojson' | 'png') {
    if (!currentResult) return;
    const alternative = currentResult.alternatives?.[selectedAlternativeIndex];
    const route = {
      name,
      mode:
        alternative?.route.properties.mode ??
        currentResult.route.properties.mode,
      distanceMeters:
        alternative?.distanceMeters ?? currentResult.distanceMeters,
      geometry: alternative?.route.geometry ?? currentResult.route.geometry,
    };
    const basename = safeExportName(name);
    if (format === 'gpx')
      downloadTextFile(`${basename}.gpx`, toGpx(route), 'application/gpx+xml');
    else if (format === 'geojson')
      downloadTextFile(
        `${basename}.geojson`,
        toGeoJson(route),
        'application/geo+json',
      );
    else {
      setMessage('Preparing route image...');
      try {
        await downloadRoutePng(`${basename}.png`, route);
        setMessage('Route image downloaded.');
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Could not create the PNG image.',
        );
      }
    }
  }

  return (
    <section
      className="saved-route-library"
      aria-labelledby="saved-routes-title"
    >
      <h2 id="saved-routes-title">Saved routes</h2>
      <p className="field-hint">
        Stored only in this browser. Clearing browser data removes these routes.
      </p>
      {currentResult && (
        <form className="saved-route-form" onSubmit={save}>
          <label htmlFor="saved-route-name">Route name</label>
          <div>
            <input
              id="saved-route-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <button className="secondary-button" type="submit">
              Save route
            </button>
          </div>
        </form>
      )}
      {currentResult && (
        <div className="saved-route-exports" aria-label="Export current route">
          <button
            className="text-button"
            type="button"
            onClick={() => exportRoute('gpx')}
          >
            Download GPX
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => exportRoute('geojson')}
          >
            Download GeoJSON
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => void exportRoute('png')}
          >
            Download route image
          </button>
        </div>
      )}
      {currentResult && (
        <form className="saved-route-form" onSubmit={publish}>
          <label className="share-location-consent">
            <input
              type="checkbox"
              checked={confirmSharing}
              onChange={(event) => setConfirmSharing(event.target.checked)}
            />
            <span>
              Publish the route for 30 days. Anyone with the link can see its
              full path, including the start and end locations.
            </span>
          </label>
          <button
            className="secondary-button"
            type="submit"
            disabled={!confirmSharing}
          >
            Create public link
          </button>
          {shareUrl && (
            <p>
              <a href={shareUrl}>{shareUrl}</a>
            </p>
          )}
        </form>
      )}
      {routes.length > 0 ? (
        <ul aria-label="Routes saved on this device">
          {routes.map((route) => (
            <li key={route.id}>
              <button
                type="button"
                className="saved-route-open"
                aria-label={`Open ${route.name}`}
                onClick={() => onOpen(route)}
              >
                <strong>{route.name}</strong>
                <span>
                  {(route.result.distanceMeters / 1000).toFixed(2)} km
                  {' · '}
                  {route.result.route.properties.mode}
                </span>
              </button>
              <button
                type="button"
                className="text-button saved-route-remove"
                aria-label={`Remove ${route.name}`}
                onClick={() => remove(route.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">No saved routes on this device yet.</p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
