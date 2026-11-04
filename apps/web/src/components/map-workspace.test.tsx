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
}
interface FakeMarker {
  point: Point;
  dragTo: (point: Point) => void;
  remove: ReturnType<typeof vi.fn>;
}
const engine = vi.hoisted(() => ({
  maps: [] as FakeMap[],
  markers: [] as FakeMarker[],
  fail: false,
}));

vi.mock('maplibre-gl', () => {
  class Map {
    center: Point;
    zoom: number;
    handlers: Record<string, ((event: EventData) => void)[]> = {};
    canvas = document.createElement('canvas');
    addControl = vi.fn();
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
  engine.fail = false;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('map workspace with a mocked renderer', () => {
  it('starts in Lyon, exposes attributed loading/ready states, and cleans up', async () => {
    const page = render(<MapWorkspace configuration={configuration} />);
    expect(screen.getByText('Finding your view of Lyon…')).toBeInTheDocument();
    const map = await mountedMap();
    expect(map.center).toEqual(LYON_CENTER);
    expect(map.zoom).toBe(LYON_ZOOM);
    expect(map.addControl).toHaveBeenCalledTimes(2);
    act(() => map.emit('load'));
    expect(
      screen.getByText('Lyon · click to set your start'),
    ).toBeInTheDocument();
    expect(screen.getByText('Test map attribution')).toBeVisible();
    act(() => map.emit('click', [4.84, 45.77]));
    const marker = engine.markers[0]!;
    page.unmount();
    expect(marker.remove).toHaveBeenCalledOnce();
    expect(map.remove).toHaveBeenCalledOnce();
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

  it('rejects swapped, missing, and out-of-area coordinates without losing a valid start', async () => {
    render(<MapWorkspace configuration={configuration} />);
    await mountedMap();
    fireEvent.click(screen.getByRole('button', { name: 'Set start point' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter both latitude and longitude',
    );
    enterCoordinates('45.764', '4.8357');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    enterCoordinates('4.8357', '45.764');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'inside the Lyon test area',
    );
    expect(screen.getByLabelText('Selected start point')).toHaveTextContent(
      '45.764000° N, 4.835700° E',
    );
    act(() => engine.markers[0]!.dragTo([3, 44]));
    expect(engine.markers[0]!.point).toEqual([4.8357, 45.764]);
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
