// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LYON_CENTER, LYON_ZOOM } from '@drawtrail/geo-utils';
import { apiSuccessEnvelope } from '@drawtrail/api-client';
import type { Geocoder } from '../lib/geocoding';
import type { MapConfiguration } from '../lib/map-config';
import { MapWorkspace } from './map-workspace';
import { summarizeElevation } from '../lib/elevation';
import { SAVED_ROUTES_STORAGE_KEY } from '../lib/saved-routes';

type Point = [number, number];
type EventData = { lngLat: { lng: number; lat: number } };
interface FakeMap {
  center: Point;
  zoom: number;
  emit: (name: string, point?: Point) => void;
  remove: ReturnType<typeof vi.fn>;
  jumpTo: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  addControl: ReturnType<typeof vi.fn>;
  addSource: ReturnType<typeof vi.fn>;
  addLayer: ReturnType<typeof vi.fn>;
  getSource: ReturnType<typeof vi.fn>;
}
interface FakeMarker {
  point: Point;
  dragTo: (point: Point) => void;
  remove: ReturnType<typeof vi.fn>;
}
const engine = vi.hoisted(() => ({
  maps: [] as FakeMap[],
  markers: [] as FakeMarker[],
  sources: new Map<
    string,
    { data: unknown; setData: ReturnType<typeof vi.fn> }
  >(),
  fail: false,
}));
const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
);

vi.mock('maplibre-gl', () => {
  class Map {
    center: Point;
    zoom: number;
    handlers: Record<string, ((event: EventData) => void)[]> = {};
    canvas = document.createElement('canvas');
    addControl = vi.fn();
    addLayer = vi.fn();
    addSource = vi.fn((id: string, source: { data: unknown }) => {
      engine.sources.set(id, { data: source.data, setData: vi.fn() });
    });
    getSource = vi.fn((id: string) => engine.sources.get(id));
    remove = vi.fn(() => this.canvas.remove());
    resize = vi.fn();
    jumpTo = vi.fn(({ center, zoom }: { center: Point; zoom: number }) => {
      this.center = center;
      this.zoom = zoom;
      this.emit('moveend');
    });
    fitBounds = vi.fn((bounds: [Point, Point]) => {
      const [[west, south], [east, north]] = bounds;
      this.center = [(west + east) / 2, (south + north) / 2];
      this.zoom = 12;
      this.emit('moveend');
    });
    constructor(options: {
      container: HTMLElement;
      center: Point;
      zoom: number;
    }) {
      if (engine.fail) throw new Error('WebGL unavailable');
      this.center = options.center;
      this.zoom = options.zoom;
      options.container.append(this.canvas);
      engine.maps.push(this);
    }
    on(name: string, callback: (event: EventData) => void) {
      (this.handlers[name] ??= []).push(callback);
      return this;
    }
    emit(name: string, point = this.center) {
      this.handlers[name]?.forEach((callback) =>
        callback({ lngLat: { lng: point[0], lat: point[1] } }),
      );
    }
    getCanvas() {
      return this.canvas;
    }
    getCenter() {
      return { lng: this.center[0], lat: this.center[1] };
    }
    getZoom() {
      return this.zoom;
    }
    getBearing() {
      return 0;
    }
  }
  class Marker {
    point: Point = [0, 0];
    element = document.createElement('div');
    onDrag = () => {};
    remove = vi.fn();
    constructor() {
      engine.markers.push(this);
    }
    setLngLat(point: Point) {
      this.point = point;
      return this;
    }
    addTo() {
      return this;
    }
    getElement() {
      return this.element;
    }
    getLngLat() {
      return { lng: this.point[0], lat: this.point[1] };
    }
    on(_name: string, callback: () => void) {
      this.onDrag = callback;
      return this;
    }
    dragTo(point: Point) {
      this.point = point;
      this.onDrag();
    }
  }
  return {
    setWorkerUrl: vi.fn(),
    Map,
    Marker,
    NavigationControl: class NavigationControl {},
    FullscreenControl: class FullscreenControl {},
    AttributionControl: class AttributionControl {},
  };
});

const configuration: MapConfiguration = {
  mode: 'configured',
  attribution: 'Test map attribution',
  style: { version: 8, sources: {}, layers: [] },
};
async function mountedMap() {
  await waitFor(() => expect(engine.maps.length).toBeGreaterThan(0));
  return engine.maps.at(-1)!;
}
function enterCoordinates(latitude: string, longitude: string) {
  fireEvent.change(screen.getByLabelText('Latitude', { exact: true }), {
    target: { value: latitude },
  });
  fireEvent.change(screen.getByLabelText('Longitude', { exact: true }), {
    target: { value: longitude },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Set start point' }));
}
function enterRouteOptions() {
  fireEvent.click(screen.getByRole('button', { name: 'Set route options' }));
}
function continueToDrawing() {
  fireEvent.click(screen.getByRole('button', { name: 'Continue to draw' }));
}
function enterDrawing() {
  enterRouteOptions();
  continueToDrawing();
}

beforeEach(() => {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
  engine.maps.length = 0;
  engine.markers.length = 0;
  engine.sources.clear();
  engine.fail = false;
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalScrollIntoView)
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollIntoView',
      originalScrollIntoView,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  if (originalStorage)
    Object.defineProperty(window, 'localStorage', originalStorage);
});

describe('map workspace with a mocked renderer', () => {
  it('smoothly scrolls to the next workspace step', async () => {
    const scrolledElements: HTMLElement[] = [];
    const scrollIntoView = vi.fn(function (this: HTMLElement) {
      scrolledElements.push(this);
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    render(<MapWorkspace configuration={configuration} />);
    const map = await mountedMap();
    act(() => map.emit('load'));

    enterCoordinates('45.764', '4.8357');
    expect(scrolledElements.at(-1)?.textContent).toContain('Set route options');
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      block: 'center',
    });

    enterRouteOptions();
    expect(scrolledElements.at(-1)).toHaveClass('route-options-panel');
    continueToDrawing();
    expect(scrolledElements.at(-1)).toHaveClass('drawing-stage');
  });

  it('shows the basic draw controls first and keeps advanced tools collapsed', async () => {
    render(<MapWorkspace configuration={configuration} />);
    const map = await mountedMap();
    act(() => map.emit('load'));
    enterCoordinates('45.764', '4.8357');
    enterRouteOptions();
    expect(screen.getByLabelText('Activity')).toBeVisible();
    expect(screen.getByLabelText('Target distance (km)')).toBeVisible();
    expect(
      screen.getByLabelText('Search around my starting point'),
    ).toBeVisible();
    expect(screen.getByLabelText('Hill preference')).not.toBeVisible();
    expect(screen.getByText('More options').closest('details')).toHaveProperty(
      'open',
      false,
    );
    continueToDrawing();
    expect(
      screen.getByRole('button', { name: 'Generate street route' }),
    ).toBeVisible();
    expect(screen.getByText('Move & shape').closest('details')).toHaveProperty(
      'open',
      false,
    );
    expect(
      screen.getByText('Import a shape or image').closest('details'),
    ).toHaveProperty('open', false);
    expect(
      screen.getByText('Adjust placement or preview on map').closest('details'),
    ).toHaveProperty('open', false);
  });

  it('starts in Lyon, exposes attributed loading/ready states, and cleans up', async () => {
    const page = render(<MapWorkspace configuration={configuration} />);
    expect(screen.getByText('Finding your map view…')).toBeInTheDocument();
    const map = await mountedMap();
    expect(map.center).toEqual(LYON_CENTER);
    expect(map.zoom).toBe(LYON_ZOOM);
    expect(map.addControl).toHaveBeenCalledTimes(2);
    act(() => map.emit('load'));
    expect(map.addSource).toHaveBeenCalledWith(
      'drawtrail-target-geometry',
      expect.objectContaining({ type: 'geojson' }),
    );
    expect(map.addSource).toHaveBeenCalledWith(
      'drawtrail-route-geometry',
      expect.objectContaining({ type: 'geojson' }),
    );
    expect(map.addSource).toHaveBeenCalledWith(
      'drawtrail-search-area',
      expect.objectContaining({ type: 'geojson' }),
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'drawtrail-route-line',
        source: 'drawtrail-route-geometry',
      }),
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'drawtrail-target-line',
        source: 'drawtrail-target-geometry',
      }),
    );
    expect(
      screen.getByText('Map · click to set your area center'),
    ).toBeInTheDocument();
    expect(screen.getByText('Test map attribution')).toBeVisible();
    act(() => map.emit('click', [4.84, 45.77]));
    const marker = engine.markers[0]!;
    page.unmount();
    expect(marker.remove).toHaveBeenCalledOnce();
    expect(map.remove).toHaveBeenCalledOnce();
  });

  it('shows the MapTiler logo and linked credits for MapTiler styles', () => {
    render(
      <MapWorkspace
        configuration={{ ...configuration, providerLogo: 'maptiler' }}
      />,
    );

    expect(screen.getByRole('img', { name: 'MapTiler' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: /OpenStreetMap contributors/ }),
    ).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    expect(screen.getByRole('link', { name: 'MapTiler' })).toHaveAttribute(
      'href',
      'https://www.maptiler.com/',
    );
  });

  it('previews the selected drawing on the map using a distinct target source', async () => {
    render(<MapWorkspace configuration={configuration} />);
    const map = await mountedMap();
    act(() => map.emit('load'));
    enterCoordinates('45.764', '4.8357');
    enterDrawing();
    fireEvent.click(screen.getByRole('button', { name: 'Heart' }));
    fireEvent.click(screen.getByText('Adjust placement or preview on map'));
    expect(screen.getByText('Position 1 of 12')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try another' }));
    expect(screen.getByText('Position 2 of 12')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview placement on map' }),
    );
    expect(screen.getByLabelText('Map geometry legend')).toBeVisible();
    expect(screen.getByText('Target drawing')).toBeVisible();
    expect(
      screen.getByText('Actual street route (not generated yet)'),
    ).toBeVisible();
    expect(
      engine.sources.get('drawtrail-target-geometry')?.setData,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'FeatureCollection',
        features: expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({ strokeId: 'preset-heart' }),
          }),
        ]),
      }),
    );
  });

  it('posts one selected stroke and displays the generated route and measured metrics', async () => {
    const result = {
      status: 'success',
      elevation: summarizeElevation([0, 900, 1800], [100, 130, 110]),
      targetGeometry: {
        type: 'LineString',
        coordinates: [
          [4.84, 45.77],
          [4.8401, 45.7701],
        ],
      },
      route: {
        type: 'Feature',
        properties: { mode: 'walking' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [4.84, 45.77],
            [4.84005, 45.7702],
            [4.8401, 45.7701],
          ],
        },
      },
      distanceMeters: 1800,
      requestedDistanceMeters: 3000,
      similarityScore: 0.82,
      retracingMeters: 0,
      waypointCount: 8,
      alternatives: [
        {
          id: 'route-1',
          elevation: summarizeElevation([0, 900, 1800], [100, 130, 110]),
          targetGeometry: {
            type: 'LineString',
            coordinates: [
              [4.84, 45.77],
              [4.8401, 45.7701],
            ],
          },
          route: {
            type: 'Feature',
            properties: { mode: 'walking' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [4.84, 45.77],
                [4.84005, 45.7702],
                [4.8401, 45.7701],
              ],
            },
          },
          distanceMeters: 1800,
          similarityScore: 0.82,
          retracingMeters: 0,
          score: 0.72,
          waypointCount: 8,
          warnings: [],
        },
        {
          id: 'route-2',
          targetGeometry: {
            type: 'LineString',
            coordinates: [
              [4.841, 45.771],
              [4.8411, 45.7711],
            ],
          },
          route: {
            type: 'Feature',
            properties: { mode: 'walking' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [4.841, 45.771],
                [4.84105, 45.7712],
                [4.8411, 45.7711],
              ],
            },
          },
          distanceMeters: 2200,
          similarityScore: 0.66,
          retracingMeters: 200,
          score: 0.61,
          waypointCount: 8,
          warnings: [
            'The street route repeats approximately 9% of its distance.',
          ],
        },
      ],
      warnings: [
        'Routed distance differs from the requested distance by more than 20%.',
      ],
    };
    const repaired = {
      status: 'success',
      route: {
        type: 'Feature',
        properties: { mode: 'walking' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [4.841, 45.771],
            [4.84105, 45.77115],
            [4.8411, 45.7711],
          ],
        },
      },
      distanceMeters: 1600,
      similarityScore: 0.9,
      retracingMeters: 10,
      waypointCount: 19,
      warnings: [],
    };
    const fetcher = vi.fn<typeof fetch>(
      async (input) =>
        new Response(
          JSON.stringify(
            apiSuccessEnvelope(
              String(input).includes('/repair') ? repaired : result,
            ),
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    render(<MapWorkspace configuration={configuration} />);
    const map = await mountedMap();
    act(() => map.emit('load'));
    enterCoordinates('45.77', '4.84');
    enterRouteOptions();
    fireEvent.click(screen.getByLabelText('Search around my starting point'));
    expect(screen.getByLabelText('Search radius from start (km)')).toHaveValue(
      2,
    );
    expect(
      engine.sources.get('drawtrail-search-area')?.setData,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'FeatureCollection',
        features: [
          expect.objectContaining({ properties: { kind: 'search-area' } }),
        ],
      }),
    );
    fireEvent.click(screen.getByText('More options'));
    fireEvent.click(
      screen.getByLabelText('Enforce a maximum distance difference'),
    );
    expect(screen.getByLabelText('Maximum difference (%)')).toHaveValue(40);
    continueToDrawing();
    fireEvent.click(screen.getByRole('button', { name: 'Heart' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate street route' }),
    );

    expect(await screen.findByText('Generated street route')).toBeVisible();
    expect(screen.getByText('1.80 km')).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'Estimated moving time' }),
    ).toHaveTextContent('18 min');
    expect(screen.getByText('Route details').closest('details')).toHaveProperty(
      'open',
      false,
    );
    expect(
      screen.getByText('Repair part of this route').closest('details'),
    ).toHaveProperty('open', false);
    fireEvent.click(screen.getByText('Route details'));
    expect(screen.getByText('82%')).toBeVisible();
    expect(screen.getByText('30 m')).toBeVisible();
    expect(
      screen.getByRole('img', { name: 'Route elevation profile' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Option 2 · 2.20 km/ }));
    expect(screen.getByText('2.20 km')).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'Estimated moving time' }),
    ).toHaveTextContent('22 min');
    expect(screen.getByText('66%')).toBeVisible();
    expect(
      screen.queryByRole('img', { name: 'Route elevation profile' }),
    ).toBeNull();
    expect(screen.getByText(/Ascent and descent are unknown/)).toBeVisible();
    expect(screen.getByText('9%')).toBeVisible();
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      [
        [4.841, 45.771],
        [4.8411, 45.7712],
      ],
      { padding: 56, maxZoom: 15, duration: 450 },
    );
    fireEvent.click(screen.getByRole('button', { name: /Option 1 · 1.80 km/ }));
    expect(screen.getByText('1.80 km')).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'Estimated moving time' }),
    ).toHaveTextContent('18 min');
    fireEvent.click(screen.getByText('Repair part of this route'));
    fireEvent.click(screen.getByRole('button', { name: 'Repair a section' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Reroute selected section' }),
    );
    await screen.findByRole('button', { name: 'Undo repair' });
    expect(
      screen.getByRole('status', { name: 'Estimated moving time' }),
    ).toHaveTextContent('16 min');
    fireEvent.click(screen.getByRole('button', { name: 'Undo repair' }));
    expect(
      screen.getByRole('status', { name: 'Estimated moving time' }),
    ).toHaveTextContent('18 min');
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      [
        [4.84, 45.77],
        [4.8401, 45.7702],
      ],
      { padding: 56, maxZoom: 15, duration: 450 },
    );
    expect(screen.getByLabelText('Map geometry legend')).toHaveTextContent(
      'Actual street route (generated)',
    );
    expect(
      screen.getByRole('img', { name: 'Route elevation profile' }),
    ).toBeVisible();
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(request).toMatchObject({
      center: [4.84, 45.77],
      mode: 'walking',
      targetDistanceKm: 3,
      loop: true,
      settings: {
        maxWaypoints: 16,
        searchArea: {
          radiusMeters: 2000,
          candidateCount: 8,
          maxDistanceDeviationRatio: 0.4,
          maxRuntimeMs: 30000,
          maxRouterRequests: 160,
        },
      },
    });
    expect(request.bounds.radiusMeters).toBeGreaterThan(3000);
    expect(request.drawing.strokes).toHaveLength(1);
    expect(
      engine.sources.get('drawtrail-route-geometry')?.setData,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'FeatureCollection',
        features: [
          expect.objectContaining({ properties: { mode: 'walking' } }),
        ],
      }),
    );
  });

  it('shows a typed routing failure without adding a route overlay', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            apiVersion: 'v1',
            status: 'error',
            data: null,
            error: {
              code: 'missing_region',
              message: 'No routing graph covers one of these waypoints.',
              warnings: [],
            },
          }),
          { status: 404 },
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    render(<MapWorkspace configuration={configuration} />);
    const map = await mountedMap();
    act(() => map.emit('load'));
    enterCoordinates('45.77', '4.84');
    enterDrawing();
    fireEvent.click(screen.getByRole('button', { name: 'Heart' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate street route' }),
    );

    expect(
      await screen.findByRole('alert', { name: 'Drawing feedback' }),
    ).toHaveTextContent('No routing graph covers one of these waypoints.');
    expect(
      screen.queryByText('Generated street route'),
    ).not.toBeInTheDocument();
    expect(
      engine.sources.get('drawtrail-route-geometry')?.setData,
    ).not.toHaveBeenCalled();
  });

  it('offers best-shape-match mode without a target distance and fits the result', async () => {
    const result = {
      status: 'success',
      targetGeometry: {
        type: 'LineString',
        coordinates: [
          [4.84, 45.77],
          [4.841, 45.771],
        ],
      },
      route: {
        type: 'Feature',
        properties: { mode: 'cycling' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [4.84, 45.77],
            [4.8405, 45.7705],
            [4.841, 45.771],
          ],
        },
      },
      distanceMeters: 7200,
      requestedDistanceMeters: null,
      similarityScore: 0.91,
      retracingMeters: 0,
      waypointCount: 8,
      warnings: [],
    };
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(apiSuccessEnvelope(result)), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    render(<MapWorkspace configuration={configuration} />);
    const map = await mountedMap();
    act(() => map.emit('load'));
    enterCoordinates('45.77', '4.84');
    enterRouteOptions();
    expect(screen.queryByLabelText('Cycling surface')).toBeNull();
    fireEvent.change(screen.getByLabelText('Activity'), {
      target: { value: 'cycling' },
    });
    fireEvent.click(screen.getByText('More options'));
    fireEvent.click(screen.getByText('Route preferences'));
    fireEvent.change(screen.getByLabelText('Hill preference'), {
      target: { value: 'flatter' },
    });
    fireEvent.change(screen.getByLabelText('Cycling road preference'), {
      target: { value: 'paths' },
    });
    fireEvent.change(screen.getByLabelText('Cycling surface'), {
      target: { value: 'paved' },
    });
    fireEvent.click(
      screen.getByLabelText(
        'Let DrawTrail choose the distance to best match my drawing',
      ),
    );
    expect(screen.queryByLabelText('Target distance (km)')).toBeNull();
    expect(screen.getByText(/cycling routes may be longer/i)).toBeVisible();
    continueToDrawing();
    fireEvent.click(screen.getByRole('button', { name: 'Heart' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate street route' }),
    );

    expect(await screen.findByText('7.20 km')).toBeVisible();
    fireEvent.click(screen.getByText('Route details'));
    expect(screen.getByText('Best shape match')).toBeVisible();
    expect(screen.getByText('cycling')).toBeVisible();
    const payload = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(payload).not.toHaveProperty('targetDistanceKm');
    expect(payload.mode).toBe('cycling');
    expect(payload.settings.preferences).toEqual({
      hills: 'flatter',
      cyclingRoads: 'paths',
      cyclingSurface: 'paved',
    });
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      [
        [4.84, 45.77],
        [4.841, 45.771],
      ],
      { padding: 56, maxZoom: 15, duration: 450 },
    );
  });

  it('stores clicks and drags in editor state with explicit GeoJSON order', async () => {
    render(<MapWorkspace configuration={configuration} />);
    const map = await mountedMap();
    act(() => map.emit('click', [4.84, 45.77]));
    expect(screen.getByLabelText('Selected start point')).toHaveTextContent(
      '45.770000° N, 4.840000° E',
    );
    expect(screen.getByText('[4.840000, 45.770000]')).toBeVisible();
    act(() => engine.markers[0]!.dragTo([4.85, 45.78]));
    expect(screen.getByLabelText('Latitude', { exact: true })).toHaveValue(
      45.78,
    );
    expect(screen.getByLabelText('Longitude', { exact: true })).toHaveValue(
      4.85,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to Lyon' }));
    expect(map.jumpTo).toHaveBeenLastCalledWith({
      center: LYON_CENTER,
      zoom: LYON_ZOOM,
      bearing: 0,
      pitch: 0,
    });
    expect(screen.getByLabelText('Selected start point')).toHaveTextContent(
      '45.780000° N, 4.850000° E',
    );
  });

  it('accepts WGS84 coordinates anywhere and rejects invalid coordinates without losing a valid start', async () => {
    render(<MapWorkspace configuration={configuration} />);
    await mountedMap();
    fireEvent.click(screen.getByRole('button', { name: 'Set start point' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter both latitude and longitude',
    );
    enterCoordinates('45.764', '4.8357');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    enterCoordinates('45.764', '181');
    expect(screen.getByRole('alert')).toHaveTextContent('valid WGS84');
    expect(screen.getByLabelText('Selected start point')).toHaveTextContent(
      '45.764000° N, 4.835700° E',
    );
    act(() => engine.markers[0]!.dragTo([181, 44]));
    expect(engine.markers[0]!.point).toEqual([4.8357, 45.764]);
  });

  it('allows a start point in another world region for area search', async () => {
    render(<MapWorkspace configuration={configuration} />);
    await mountedMap();
    enterCoordinates('42.5063', '1.5218');
    expect(screen.getByLabelText('Selected start point')).toHaveTextContent(
      '42.506300° N, 1.521800° E',
    );
  });

  it('keeps manual selection and disabled-search fallback working when tiles fail, including retry', async () => {
    render(<MapWorkspace configuration={configuration} geocoder={null} />);
    const map = await mountedMap();
    expect(screen.getByRole('searchbox')).toBeDisabled();
    enterCoordinates('45.758', '4.832');
    act(() => map.emit('error'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The map is unavailable',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry map' }));
    await waitFor(() => expect(engine.maps).toHaveLength(2));
    expect(map.remove).toHaveBeenCalledOnce();
    expect(engine.markers.at(-1)!.point).toEqual([4.832, 45.758]);
    expect(engine.maps.at(-1)!.center).toEqual([4.832, 45.758]);
    expect(screen.getByLabelText('Selected start point')).toHaveTextContent(
      '45.758000',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Selected start point')).toHaveTextContent(
      'No start point selected',
    );
    expect(engine.markers.at(-1)!.remove).toHaveBeenCalledOnce();
  });

  it('supports the coordinate fallback when production tiles are unconfigured', () => {
    render(
      <MapWorkspace
        configuration={{ mode: 'unconfigured', attribution: 'No map' }}
      />,
    );
    expect(screen.getByText('Map provider not configured')).toBeVisible();
    enterCoordinates('45.764', '4.8357');
    expect(screen.getByLabelText('Selected start point')).toHaveTextContent(
      '45.764000',
    );
    expect(engine.maps).toHaveLength(0);
  });

  it('reopens a saved route from local storage after a reload', async () => {
    const savedResult = {
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
    window.localStorage.setItem(
      SAVED_ROUTES_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        routes: [
          {
            id: 'saved-riverside',
            name: 'Riverside loop',
            savedAt: '2026-11-10T12:00:00.000Z',
            selectedAlternativeIndex: 0,
            result: savedResult,
          },
        ],
      }),
    );
    render(<MapWorkspace configuration={configuration} />);
    const map = await mountedMap();
    act(() => map.emit('load'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Riverside loop' }),
    );
    expect(screen.getByText('Generated street route')).toBeVisible();
    expect(screen.getByText('1.40 km')).toBeVisible();
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      [
        [4.83, 45.76],
        [4.84, 45.77],
      ],
      { padding: 56, maxZoom: 15, duration: 450 },
    );
  });

  it('handles WebGL initialization failure without taking down coordinate selection', async () => {
    engine.fail = true;
    render(<MapWorkspace configuration={configuration} />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The map is unavailable',
      ),
    );
    enterCoordinates('45.764', '4.8357');
    expect(screen.getByLabelText('Selected start point')).toHaveTextContent(
      '45.764000',
    );
  });

  it('finds a local place, handles empty results, and places the selected result', async () => {
    render(<MapWorkspace configuration={configuration} />);
    const map = await mountedMap();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'unknown' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    await screen.findByText(/No local place found/);
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Bellecour' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Place Bellecour' }),
    );
    expect(screen.getByLabelText('Selected start point')).toHaveTextContent(
      '45.757900° N, 4.832000° E',
    );
    expect(map.center).toEqual([4.832, 45.7579]);
  });

  it('does not let an older, cancelled provider response replace newer results', async () => {
    let finishOld:
      | ((results: readonly import('../lib/geocoding').PlaceResult[]) => void)
      | undefined;
    const provider: Geocoder = {
      label: 'Test provider',
      search: vi.fn<Geocoder['search']>((query) =>
        query === 'old'
          ? new Promise<readonly import('../lib/geocoding').PlaceResult[]>(
              (resolve) => {
                finishOld = resolve;
              },
            )
          : Promise.resolve([
              { id: 'new', name: 'New place', center: LYON_CENTER },
            ]),
      ),
    };
    render(<MapWorkspace configuration={configuration} geocoder={provider} />);
    await mountedMap();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'old' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'new' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    await screen.findByRole('button', { name: 'New place' });
    await act(async () =>
      finishOld?.([{ id: 'old', name: 'Old place', center: LYON_CENTER }]),
    );
    expect(
      screen.queryByRole('button', { name: 'Old place' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New place' })).toBeVisible();
  });
});
