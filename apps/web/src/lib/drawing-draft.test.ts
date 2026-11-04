import { describe, expect, it, vi } from 'vitest';
import { drawingPreset } from '@drawtrail/geo-utils';
import {
  DRAWING_DRAFT_KEY,
  readDrawingDraft,
  writeDrawingDraft,
} from './drawing-draft';

describe('versioned local drawing drafts', () => {
  it('round trips validated drawing/selection without storing image or location data', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    const drawing = drawingPreset('heart');
    writeDrawingDraft(storage, drawing, 'preset-heart');
    expect(readDrawingDraft(storage).drawing).toEqual(drawing);
    expect(readDrawingDraft(storage).selectedStrokeId).toBe('preset-heart');
    expect(
      Object.keys(JSON.parse(data.get(DRAWING_DRAFT_KEY)!)).sort(),
    ).toEqual(['drawing', 'selectedStrokeId', 'version']);
  });
  it.each(['{broken', '{"version":2}', 'x'.repeat(1_000_001)])(
    'resets corrupt, incompatible and oversized drafts safely',
    (text) => {
      const result = readDrawingDraft({ getItem: () => text });
      expect(result.drawing.strokes).toEqual([]);
      expect(result.notice).not.toBe('');
    },
  );
  it('keeps editor initialization safe when storage is denied, and reports writes failing', () => {
    expect(
      readDrawingDraft({
        getItem: () => {
          throw new Error('denied');
        },
      }).drawing.strokes,
    ).toEqual([]);
    expect(() =>
      writeDrawingDraft(
        {
          setItem: vi.fn(() => {
            throw new Error('quota');
          }),
        },
        drawingPreset('square'),
        null,
      ),
    ).toThrow('quota');
  });
});
