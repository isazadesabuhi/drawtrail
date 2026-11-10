import { describe, expect, it, vi } from 'vitest';
import {
  ValhallaClient,
  ValhallaError,
  decodePolyline6,
} from './valhalla-client';

// Encoded precision-six route with two points: [1.5, 42.0], [1.50001, 42.00001].
const twoPointShape = '_gnboA_upzAAA';
const success = () =>
  new Response(
    JSON.stringify({
      trip: {
        legs: [
          {
            shape: twoPointShape,
            summary: { length: 1.25 },
          },
        ],
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

describe('Valhalla client', () => {
  it.each([
    { height: [100, 120], status: 'complete' },
    { height: [100, null], status: 'partial' },
    { height: [null, null], status: 'unavailable' },
    { height: [100], status: 'unavailable' },
  ])(
    'reads bounded elevation data with $status coverage ($height)',
    async ({ height, status }) => {
      const fetcher = vi.fn<typeof fetch>(async () =>
        Response.json({ height }),
      );
      const client = new ValhallaClient({
        baseUrl: 'http://localhost:8002',
        fetch: fetcher,
      });
      const profile = await client.elevation(
        [
          [1.5, 42],
          [1.50001, 42.00001],
        ],
        1250,
      );
      expect(profile.status).toBe(status);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(new URL(String(fetcher.mock.calls[0]![0])).pathname).toBe(
        '/height',
      );
      expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toMatchObject(
        {
          shape: [
            { lon: 1.5, lat: 42 },
            { lon: 1.50001, lat: 42.00001 },
          ],
          range: false,
          height_precision: 1,
        },
      );
      if (profile.status === 'complete') expect(profile.ascentMeters).toBe(20);
    },
  );

  it('keeps elevation service failures optional but respects user cancellation', async () => {
    const fetcher: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
    const client = new ValhallaClient({
      baseUrl: 'http://localhost:8002',
      timeoutMs: 10,
      fetch: fetcher,
    });
    await expect(
      client.elevation(
        [
          [1.5, 42],
          [1.50001, 42.00001],
        ],
        1250,
      ),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'service_unavailable',
    });
    const controller = new AbortController();
    const pending = client.elevation(
      [
        [1.5, 42],
        [1.50001, 42.00001],
      ],
      1250,
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('decodes a fixed precision-six shape and kilometers to meters', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => success());
    const client = new ValhallaClient({
      baseUrl: 'http://localhost:8002',
      fetch: fetcher,
    });
    const route = await client.route('walking', [1.5, 42], [1.50001, 42.00001]);

    expect(route.geometry.type).toBe('LineString');
    expect(route.geometry.coordinates).toHaveLength(2);
    expect(route.geometry.coordinates[0]?.[0]).toBeCloseTo(1.5);
    expect(route.geometry.coordinates[0]?.[1]).toBeCloseTo(42);
    expect(route.distanceMeters).toBe(1250);
  });

  it('requests walking/running with pedestrian costing and optional walking preferences', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => success());
    const client = new ValhallaClient({
      baseUrl: 'http://localhost:8002',
      fetch: fetcher,
    });
    await client.route('running', [1.5, 42], [1.50001, 42.00001], {
      walkingSpeedKph: 8,
    });

    const requestUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    const request = JSON.parse(requestUrl.searchParams.get('json') ?? '{}');
    expect(request.costing).toBe('pedestrian');
    expect(request.costing_options.pedestrian.walking_speed).toBe(8);
    expect(
      request.locations.map((location: { radius: number }) => location.radius),
    ).toEqual([250, 250]);
  });

  it('widens the road snap radius when Valhalla cannot find a routeable edge', async () => {
    const radii: number[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const requestUrl = new URL(String(input));
      const request = JSON.parse(requestUrl.searchParams.get('json') ?? '{}');
      radii.push(request.locations[0].radius);
      if (radii.length < 3) {
        return new Response(
          JSON.stringify({
            error_code: 171,
            error: 'No suitable edges near location',
          }),
          { status: 400 },
        );
      }
      return success();
    });
    const client = new ValhallaClient({
      baseUrl: 'http://localhost:8002',
      fetch: fetcher,
    });

    await expect(
      client.route('walking', [1.5, 42], [1.50001, 42.00001]),
    ).resolves.toMatchObject({ distanceMeters: 1250 });

    expect(radii).toEqual([250, 1000, 3000]);
  });

  it('requests bicycle costing and mode-specific options for cycling', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => success());
    const client = new ValhallaClient({
      baseUrl: 'http://localhost:8002',
      fetch: fetcher,
    });
    await client.route('cycling', [1.5, 42], [1.50001, 42.00001], {
      bicycleType: 'mountain',
      useRoads: 0.2,
    });

    const requestUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    const request = JSON.parse(requestUrl.searchParams.get('json') ?? '{}');
    expect(request.costing).toBe('bicycle');
    expect(request.costing_options.bicycle).toEqual({
      bicycle_type: 'mountain',
      use_roads: 0.2,
    });
  });

  it.each([
    {
      mode: 'cycling' as const,
      hills: 'flatter' as const,
      cyclingRoads: 'paths' as const,
      cyclingSurface: 'paved' as const,
      expected: {
        use_hills: 0,
        bicycle_type: 'road',
        avoid_bad_surfaces: 0.9,
        use_roads: 0,
      },
    },
    {
      mode: 'cycling' as const,
      hills: 'hilly' as const,
      cyclingRoads: 'roads' as const,
      cyclingSurface: 'rough' as const,
      expected: {
        use_hills: 1,
        bicycle_type: 'mountain',
        avoid_bad_surfaces: 0,
        use_roads: 0.8,
      },
    },
    {
      mode: 'running' as const,
      hills: 'flatter' as const,
      cyclingRoads: 'paths' as const,
      cyclingSurface: 'paved' as const,
      expected: { use_hills: 0 },
    },
  ])(
    'sends $mode preferences to the correct costing model ($cyclingSurface)',
    async ({ mode, hills, cyclingRoads, cyclingSurface, expected }) => {
      const fetcher = vi.fn<typeof fetch>(async () => success());
      const client = new ValhallaClient({
        baseUrl: 'http://localhost:8002',
        fetch: fetcher,
      });
      await client.route(mode, [1.5, 42], [1.50001, 42.00001], {
        preferences: { hills, cyclingRoads, cyclingSurface },
      });
      const requestUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
      const request = JSON.parse(requestUrl.searchParams.get('json') ?? '{}');
      expect(request.costing_options).toEqual({
        [mode === 'cycling' ? 'bicycle' : 'pedestrian']: expected,
      });
    },
  );

  it('rejects invalid coordinates before contacting Valhalla', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => success());
    const client = new ValhallaClient({
      baseUrl: 'http://localhost:8002',
      fetch: fetcher,
    });
    await expect(
      client.route('walking', [181, 42], [1.5, 42]),
    ).rejects.toMatchObject({
      code: 'invalid_waypoint',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('normalizes missing-region and no-route responses', async () => {
    for (const [message, code] of [
      ['No data found for location', 'missing_region'],
      ['No path could be found for input', 'no_route'],
    ] as const) {
      const client = new ValhallaClient({
        baseUrl: 'http://localhost:8002',
        fetch: async () =>
          new Response(JSON.stringify({ error: message }), { status: 400 }),
      });
      await expect(
        client.route('walking', [1.5, 42], [1.50001, 42.00001]),
      ).rejects.toMatchObject({
        code,
      });
    }
  });

  it('retries transient engine failures only within its configured bound', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(success());
    const client = new ValhallaClient({
      baseUrl: 'http://localhost:8002',
      retries: 1,
      fetch: fetcher,
    });
    await expect(
      client.route('walking', [1.5, 42], [1.50001, 42.00001]),
    ).resolves.toMatchObject({
      distanceMeters: 1250,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses Valhalla error codes to distinguish disconnected regions from missing tiles', async () => {
    const client = new ValhallaClient({
      baseUrl: 'http://localhost:8002',
      fetch: async () =>
        new Response(
          JSON.stringify({
            error_code: 170,
            error: 'Locations are in unconnected regions.',
          }),
          { status: 400 },
        ),
    });
    await expect(
      client.route('walking', [1.5, 42], [1.50001, 42.00001]),
    ).rejects.toMatchObject({
      code: 'no_route',
    });
  });

  it('maps a missing graph tile separately from a waypoint with no suitable edge', async () => {
    for (const [body, code] of [
      [
        { error_code: 171, error: 'No suitable edges near location' },
        'invalid_waypoint',
      ],
      [{ error: 'No data found for location' }, 'missing_region'],
    ] as const) {
      const client = new ValhallaClient({
        baseUrl: 'http://localhost:8002',
        fetch: async () => new Response(JSON.stringify(body), { status: 400 }),
      });
      await expect(
        client.route('walking', [1.5, 42], [1.50001, 42.00001]),
      ).rejects.toMatchObject({
        code,
      });
    }
  });

  it('reports engine-down after exhausting transient retries', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response('{}', { status: 503 }),
    );
    const client = new ValhallaClient({
      baseUrl: 'http://localhost:8002',
      retries: 2,
      fetch: fetcher,
    });
    await expect(
      client.route('walking', [1.5, 42], [1.50001, 42.00001]),
    ).rejects.toMatchObject({
      code: 'engine_down',
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('reports malformed success payloads as invalid responses', async () => {
    const client = new ValhallaClient({
      baseUrl: 'http://localhost:8002',
      fetch: async () =>
        new Response(JSON.stringify({ trip: { legs: [] } }), { status: 200 }),
    });
    await expect(
      client.route('walking', [1.5, 42], [1.50001, 42.00001]),
    ).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('maps timeouts and caller cancellation to distinct error codes', async () => {
    const stalledFetch: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
    const timeoutClient = new ValhallaClient({
      baseUrl: 'http://localhost:8002',
      timeoutMs: 10,
      retries: 0,
      fetch: stalledFetch,
    });
    await expect(
      timeoutClient.route('walking', [1.5, 42], [1.50001, 42.00001]),
    ).rejects.toMatchObject({
      code: 'timeout',
    });

    const abortController = new AbortController();
    const cancelClient = new ValhallaClient({
      baseUrl: 'http://localhost:8002',
      timeoutMs: 1_000,
      retries: 0,
      fetch: stalledFetch,
    });
    const pending = cancelClient.route(
      'walking',
      [1.5, 42],
      [1.50001, 42.00001],
      {
        signal: abortController.signal,
      },
    );
    abortController.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('rejects malformed encoded route geometry', () => {
    expect(() => decodePolyline6('!')).toThrow(ValhallaError);
  });
});
