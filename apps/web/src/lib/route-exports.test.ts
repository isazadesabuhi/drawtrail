// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  downloadRoutePng,
  routePreviewSvg,
  safeExportName,
  toGeoJson,
  toGpx,
  type RouteExport,
} from './route-exports';

const route: RouteExport = {
  name: 'A & B <Loop>',
  mode: 'cycling',
  distanceMeters: 2345,
  geometry: {
    type: 'LineString',
    coordinates: [
      [4.83, 45.76],
      [4.84, 45.77],
      [4.85, 45.78],
    ],
  },
};

describe('route exports', () => {
  it('creates parseable GPX 1.1 with metadata and longitude/latitude preserved', () => {
    const xml = new DOMParser().parseFromString(
      toGpx(route),
      'application/xml',
    );
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(xml.documentElement.getAttribute('version')).toBe('1.1');
    expect(xml.querySelector('metadata name')?.textContent).toBe(route.name);
    expect(xml.querySelectorAll('trkpt')).toHaveLength(3);
    expect(xml.querySelector('trkpt')?.getAttribute('lat')).toBe('45.76');
    expect(xml.querySelector('trkpt')?.getAttribute('lon')).toBe('4.83');
  });

  it('exports a GeoJSON LineString without changing the coordinates', () => {
    const exported = JSON.parse(toGeoJson(route));
    expect(exported).toMatchObject({
      type: 'Feature',
      properties: {
        name: route.name,
        activity: 'cycling',
        distanceMeters: 2345,
      },
      geometry: route.geometry,
    });
  });

  it('sanitizes download filenames', () => {
    expect(safeExportName('  Caf\u00e9 Trail / East  ')).toBe(
      'Cafe-Trail-East',
    );
    expect(safeExportName('!')).toBe('drawtrail-route');
  });

  it('creates an attributed route image preview without private draft data', () => {
    const svg = routePreviewSvg(route);
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(document.querySelector('parsererror')).toBeNull();
    expect(svg).toContain('OpenStreetMap contributors');
    expect(svg).toContain('2.35 km');
    expect(svg).toContain('A &amp; B &lt;Loop&gt;');
  });

  it('downloads the rendered PNG card', async () => {
    const originalCreate = Object.getOwnPropertyDescriptor(
      URL,
      'createObjectURL',
    );
    const originalRevoke = Object.getOwnPropertyDescriptor(
      URL,
      'revokeObjectURL',
    );
    const originalDecode = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      'decode',
    );
    const originalGetContext = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      'getContext',
    );
    const originalToBlob = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      'toBlob',
    );
    const originalClick = Object.getOwnPropertyDescriptor(
      HTMLAnchorElement.prototype,
      'click',
    );
    const click = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:drawtrail'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: async () => undefined,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => ({ drawImage: vi.fn() }),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: (callback: BlobCallback) => callback(new Blob(['png'])),
    });
    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
      configurable: true,
      value: click,
    });
    try {
      await downloadRoutePng('loop.png', route);
      expect(click).toHaveBeenCalledOnce();
    } finally {
      for (const [target, key, descriptor] of [
        [URL, 'createObjectURL', originalCreate],
        [URL, 'revokeObjectURL', originalRevoke],
        [HTMLImageElement.prototype, 'decode', originalDecode],
        [HTMLCanvasElement.prototype, 'getContext', originalGetContext],
        [HTMLCanvasElement.prototype, 'toBlob', originalToBlob],
        [HTMLAnchorElement.prototype, 'click', originalClick],
      ] as const) {
        if (descriptor) Object.defineProperty(target, key, descriptor);
        else Reflect.deleteProperty(target, key);
      }
    }
  });
});
