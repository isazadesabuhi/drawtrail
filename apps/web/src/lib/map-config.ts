import type { StyleSpecification } from 'maplibre-gl';

export type MapConfiguration =
  | {
      mode: 'development' | 'configured';
      style: StyleSpecification | string;
      attribution: string;
    }
  | { mode: 'unconfigured'; attribution: string };

type MapEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_MAP_STYLE_URL?: string;
  NEXT_PUBLIC_MAP_ATTRIBUTION?: string;
};

function isStyleUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\'))
    return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function getMapConfiguration(
  environment: MapEnvironment,
): MapConfiguration {
  const style = environment.NEXT_PUBLIC_MAP_STYLE_URL?.trim();
  const attribution = environment.NEXT_PUBLIC_MAP_ATTRIBUTION?.trim();
  if (style || attribution) {
    if (style && attribution && isStyleUrl(style))
      return { mode: 'configured', style, attribution };
    return { mode: 'unconfigured', attribution: 'Map provider not configured' };
  }
  if (environment.NODE_ENV !== 'development')
    return { mode: 'unconfigured', attribution: 'Map provider not configured' };
  return {
    mode: 'development',
    attribution: '© OpenStreetMap contributors',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 19,
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
  };
}
