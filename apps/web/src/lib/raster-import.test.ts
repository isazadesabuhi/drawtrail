import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rasterHeader, loadRaster, RASTER_LIMITS } from './raster-import';

describe('bounded image headers', () => {
  it('rejects empty and oversized files before attempting image decoding', async () => {
    await expect(
      loadRaster(new File([], 'empty.png', { type: 'image/png' })),
    ).rejects.toThrow('5 MB');
    await expect(
      loadRaster(
        new File([new Uint8Array(RASTER_LIMITS.bytes + 1)], 'large.png', {
          type: 'image/png',
        }),
      ),
    ).rejects.toThrow('5 MB');
  });
  it('reads the fixed PNG fixture before decoding it', () => {
    const bytes = readFileSync(
      new URL(
        '../../../../tests/fixtures/drawing/silhouette-square.png',
        import.meta.url,
      ),
    );
    expect(rasterHeader(bytes)).toEqual({
      type: 'image/png',
      width: 32,
      height: 32,
    });
  });
  it('reads baseline and progressive JPEG dimensions', () => {
    for (const marker of [192, 194]) {
      const bytes = new Uint8Array([
        255,
        216,
        255,
        marker,
        0,
        8,
        8,
        0,
        20,
        0,
        30,
        3,
      ]);
      expect(rasterHeader(bytes)).toEqual({
        type: 'image/jpeg',
        width: 30,
        height: 20,
      });
    }
  });
  it('rejects invalid signatures, truncated chunks and oversized dimensions', () => {
    expect(() => rasterHeader(new Uint8Array([0, 1, 2]))).toThrow(
      'valid PNG or JPEG',
    );
    const bytes = new Uint8Array(
      readFileSync(
        new URL(
          '../../../../tests/fixtures/drawing/silhouette-square.png',
          import.meta.url,
        ),
      ),
    );
    new DataView(bytes.buffer).setUint32(16, 5000);
    expect(() => rasterHeader(bytes)).toThrow('dimensions');
    expect(() => rasterHeader(bytes.slice(0, 25))).toThrow('chunk');
  });
});
