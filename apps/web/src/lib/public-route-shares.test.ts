import { describe, expect, it, vi } from 'vitest';
import type { RouteGenerationSuccess } from '@drawtrail/validation';
import {
  getPublishedRoute,
  publishRoute,
  type ShareDatabase,
} from './public-route-shares';

const route: RouteGenerationSuccess = {
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

describe('public route sharing', () => {
  it('requires explicit location consent and a valid route', async () => {
    const query = vi.fn();
    const database = { query } as unknown as ShareDatabase;
    await expect(
      publishRoute(database, {
        name: 'Loop',
        route,
        locationSharingConfirmed: false,
      }),
    ).resolves.toBeNull();
    await expect(
      publishRoute(database, {
        name: 'Loop',
        route: { status: 'error' },
        locationSharingConfirmed: true,
      }),
    ).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('publishes the selected route with a 30 day database expiry', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ expires_at: new Date('2026-12-10T00:00:00.000Z') }],
    });
    const published = await publishRoute(
      { query } as unknown as ShareDatabase,
      { name: ' Loop ', route, locationSharingConfirmed: true },
    );
    expect(published).toMatchObject({
      name: 'Loop',
      expiresAt: '2026-12-10T00:00:00.000Z',
    });
    expect(query.mock.calls[0]?.[0]).toContain(
      'INSERT INTO public_route_shares',
    );
    expect(query.mock.calls[0]?.[1]?.[1]).toBe('Loop');
  });

  it('only returns unexpired records with valid ids and route data', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ name: 'Loop', route_json: route, expires_at: new Date() }],
    });
    const database = { query } as unknown as ShareDatabase;
    await expect(getPublishedRoute(database, 'bad-id')).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
    await expect(
      getPublishedRoute(database, '650fd6f4-44b1-4d90-8c95-78910e1c3df0'),
    ).resolves.toMatchObject({ name: 'Loop', route });
    expect(query.mock.calls[0]?.[0]).toContain('expires_at > now()');
  });
});
