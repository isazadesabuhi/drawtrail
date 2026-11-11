import { describe, expect, it } from 'vitest';
import { getMapConfiguration } from './map-config';

describe('map provider configuration', () => {
  it('uses the attributed OSM standard source only in development', () => {
    const config = getMapConfiguration({ NODE_ENV: 'development' });
    expect(config.mode).toBe('development');
    expect(config.attribution).toContain('OpenStreetMap');
    expect(JSON.stringify(config)).toContain(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    );
    expect(getMapConfiguration({ NODE_ENV: 'production' }).mode).toBe(
      'unconfigured',
    );
    expect(getMapConfiguration({ NODE_ENV: 'test' }).mode).toBe('unconfigured');
  });
  it.each([
    '/maps/style.json',
    'https://tiles.example.test/style.json',
    'http://localhost:8080/style.json',
  ])(
    'accepts an explicit provider with plain-text attribution: %s',
    (style) => {
      expect(
        getMapConfiguration({
          NODE_ENV: 'production',
          NEXT_PUBLIC_MAP_STYLE_URL: style,
          NEXT_PUBLIC_MAP_ATTRIBUTION: 'Local provider',
        }),
      ).toEqual({ mode: 'configured', style, attribution: 'Local provider' });
    },
  );
  it('identifies MapTiler styles so its logo and linked attribution can be shown', () => {
    expect(
      getMapConfiguration({
        NODE_ENV: 'production',
        NEXT_PUBLIC_MAP_STYLE_URL:
          'https://api.maptiler.com/maps/streets-v4/style.json?key=public-key',
        NEXT_PUBLIC_MAP_ATTRIBUTION: 'MapTiler OpenStreetMap contributors',
      }),
    ).toMatchObject({ mode: 'configured', providerLogo: 'maptiler' });
  });
  it.each([
    'javascript:alert(1)',
    'file:///secret',
    '//remote.example/style.json',
    '/\\remote/style.json',
    'bad-url',
  ])('rejects unsupported URLs instead of attempting a request', (style) => {
    expect(
      getMapConfiguration({
        NEXT_PUBLIC_MAP_STYLE_URL: style,
        NEXT_PUBLIC_MAP_ATTRIBUTION: 'Provider',
      }).mode,
    ).toBe('unconfigured');
  });
  it('requires attribution and a style together, even in development', () => {
    expect(
      getMapConfiguration({
        NODE_ENV: 'development',
        NEXT_PUBLIC_MAP_STYLE_URL: '/style.json',
      }).mode,
    ).toBe('unconfigured');
    expect(
      getMapConfiguration({ NEXT_PUBLIC_MAP_ATTRIBUTION: 'Provider' }).mode,
    ).toBe('unconfigured');
  });
});
