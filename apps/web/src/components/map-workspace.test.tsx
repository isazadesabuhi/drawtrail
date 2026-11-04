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
import type { Geocoder } from '../lib/geocoding';
import type { MapConfiguration } from '../lib/map-config';
import { MapWorkspace } from './map-workspace';

type Point = [number, number];
type EventData = { lngLat: { lng: number; lat: number } };
interface FakeMap {
  center: Point;
  zoom: number;
  emit: (name: string, point?: Point) => void;
  remove: ReturnType<typeof vi.fn>;
  jumpTo: ReturnType<typeof vi.fn>;
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

beforeEach(() => {
  engine.maps.length = 0;
  engine.markers.length = 0;
  engine.sources.clear();
  engine.fail = false;
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('map workspace with a mocked renderer', () => {
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

  it('previews the selected drawing on the map using a distinct target source', async () => {
    render(<MapWorkspace configuration={configuration} />);
    const map = await mountedMap();
    act(() => map.emit('load'));
    enterCoordinates('45.764', '4.8357');
    fireEvent.click(screen.getByRole('button', { name: /Draw your idea/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Heart' }));
    expect(screen.getByText('Candidate 1 of 12')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Try another placement' }),
    );
    expect(screen.getByText('Candidate 2 of 12')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview target on map' }),
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
      waypointCount: 8,
      warnings: [
        'Routed distance differs from the requested distance by more than 20%.',
      ],
    };
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(result), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetcher);
    render(<MapWorkspace configuration={configuration} />);
    const map = await mountedMap();
    act(() => map.emit('load'));
    enterCoordinates('45.77', '4.84');
    fireEvent.click(screen.getByRole('button', { name: /Draw your idea/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Heart' }));
    fireEvent.click(
      screen.getByLabelText('Search for the shape around my chosen area'),
    );
    expect(
      screen.getByLabelText('Search radius around the map pin (km)'),
    ).toHaveValue(2);
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
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate street route' }),
    );

    expect(await screen.findByText('Generated street route')).toBeVisible();
    expect(screen.getByText('1.80 km')).toBeVisible();
    expect(screen.getByText('82%')).toBeVisible();
    expect(screen.getByLabelText('Map geometry legend')).toHaveTextContent(
      'Actual street route (generated)',
    );
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(request).toMatchObject({
      center: [4.84, 45.77],
      mode: 'walking',
      targetDistanceKm: 3,
      loop: true,
      settings: {
        searchArea: { radiusMeters: 2000, candidateCount: 8 },
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
            status: 'error',
            code: 'missing_region',
            message: 'No routing graph covers one of these waypoints.',
            warnings: [],
          }),
          { status: 404 },
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    render(<MapWorkspace configuration={configuration} />);
    const map = await mountedMap();
    act(() => map.emit('load'));
    enterCoordinates('45.77', '4.84');
    fireEvent.click(screen.getByRole('button', { name: /Draw your idea/ }));
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
