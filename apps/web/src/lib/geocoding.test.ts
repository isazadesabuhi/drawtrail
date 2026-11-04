import { describe, expect, it } from 'vitest';
import { localGeocoder } from './geocoding';

describe('local place provider', () => {
  it('finds local places with case/diacritic-insensitive matching and preserves GeoJSON order', async () => {
    const results = await localGeocoder.search(
      '  tete  ',
      new AbortController().signal,
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.center).toEqual([4.8536, 45.7794]);
    expect(
      (await localGeocoder.search('BELLECOUR', new AbortController().signal))[0]
        ?.id,
    ).toBe('bellecour');
  });
  it('returns no invented place for short or unknown queries', async () => {
    expect(
      await localGeocoder.search('', new AbortController().signal),
    ).toEqual([]);
    expect(
      await localGeocoder.search('Atlantis', new AbortController().signal),
    ).toEqual([]);
  });
  it('honors cancellation before returning results', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      localGeocoder.search('Lyon', controller.signal),
    ).rejects.toThrow();
  });
});
