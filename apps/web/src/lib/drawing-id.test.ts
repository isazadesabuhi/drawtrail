import { afterEach, expect, it, vi } from 'vitest';
import { drawingStrokeId } from './drawing-id';

afterEach(() => vi.unstubAllGlobals());
it('uses randomUUID when available', () => {
  vi.stubGlobal('crypto', { randomUUID: () => 'fixed-id' });
  expect(drawingStrokeId()).toBe('stroke-fixed-id');
});
it('creates distinct bounded local IDs without secure-context crypto APIs', () => {
  vi.stubGlobal('crypto', undefined);
  const first = drawingStrokeId(),
    second = drawingStrokeId();
  expect(first).not.toBe(second);
  expect(first).toMatch(/^stroke-[a-z0-9-]+$/);
  expect(first.length).toBeLessThanOrEqual(80);
});
