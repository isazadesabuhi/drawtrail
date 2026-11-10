'use client';

import { useMemo, useState, useSyncExternalStore, type FormEvent } from 'react';
import type { RouteGenerationSuccess } from '@drawtrail/validation';
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
