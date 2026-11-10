import { describe, expect, it } from 'vitest';
import type { RouteGenerationSuccess } from '@drawtrail/validation';
import {
  readSavedRoutes,
  removeSavedRoute,
  saveRouteLocally,
  SAVED_ROUTES_STORAGE_KEY,
  type RouteStorage,
} from './saved-routes';

class MemoryStorage implements RouteStorage {
  values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('storage full');
    this.values.set(key, value);
  }
}

const result: RouteGenerationSuccess = {
  status: 'success',
  targetGeometry: {
    type: 'LineString',
    coordinates: [
      [4.83, 45.76],
      [4.84, 45.77],
    ],
  },
  route: {
    type: 'Feature',
    properties: { mode: 'walking' },
    geometry: {
      type: 'LineString',
      coordinates: [
        [4.83, 45.76],
        [4.835, 45.765],
        [4.84, 45.77],
      ],
    },
  },
  distanceMeters: 1400,
  requestedDistanceMeters: 1500,
  similarityScore: 0.9,
  retracingMeters: 10,
  waypointCount: 4,
  warnings: [],
};

describe('local saved routes', () => {
  it('saves and reopens a named route with the selected alternative', () => {
    const storage = new MemoryStorage();
    const saved = saveRouteLocally(storage, '  Riverside  ', result, 0);
    expect(saved.error).toBeUndefined();
    expect(saved.routes[0]).toMatchObject({
      name: 'Riverside',
      selectedAlternativeIndex: 0,
      result,
    });
    expect(readSavedRoutes(storage)).toEqual(saved.routes);
  });

  it('rejects invalid names and ignores corrupt stored data', () => {
    const storage = new MemoryStorage();
    expect(saveRouteLocally(storage, '  ', result, 0).error).toContain(
      'route name',
    );
    storage.values.set(SAVED_ROUTES_STORAGE_KEY, '{bad json');
    expect(readSavedRoutes(storage)).toEqual([]);
  });

  it('removes a route and reports browser storage failures', () => {
    const storage = new MemoryStorage();
    const saved = saveRouteLocally(storage, 'Riverside', result, 0);
    const removed = removeSavedRoute(storage, saved.routes[0]!.id);
    expect(removed.routes).toEqual([]);
    storage.failWrites = true;
    expect(saveRouteLocally(storage, 'Hill loop', result, 0).error).toContain(
      'could not save',
    );
  });
});
