import { describe, expect, it } from 'vitest';
import { readServerConfig } from './env.mjs';

describe('server environment', () => {
  it('starts without services for the scaffold', () => {
    expect(readServerConfig({})).toEqual({
      VALHALLA_URL: undefined,
      VALHALLA_API_KEY: undefined,
    });
  });
  it('explains missing routing configuration when requested', () => {
    expect(() => readServerConfig({}, true)).toThrow(
      'VALHALLA_URL is required',
    );
  });
  it('rejects invalid configuration without exposing its value', () => {
    expect(() => readServerConfig({ VALHALLA_URL: 'secret-value' })).toThrow(
      'expected an HTTP(S) URL',
    );
  });
  it.each(['http://127.0.0.1:8002', 'https://router.example.test'])(
    'accepts a configured HTTP(S) router: %s',
    (url) => {
      expect(readServerConfig({ VALHALLA_URL: url }, true).VALHALLA_URL).toBe(
        url,
      );
    },
  );
  it('accepts an optional routing service key', () => {
    const key = 'a'.repeat(32);
    expect(readServerConfig({ VALHALLA_API_KEY: key }).VALHALLA_API_KEY).toBe(
      key,
    );
  });
  it('rejects short routing service keys', () => {
    expect(() => readServerConfig({ VALHALLA_API_KEY: 'too-short' })).toThrow();
  });
  it.each(['file:///private/router', 'ftp://router.example.test', ''])(
    'rejects an unsupported router URL',
    (url) => {
      expect(() => readServerConfig({ VALHALLA_URL: url })).toThrow(
        'Invalid VALHALLA_URL',
      );
    },
  );
});
