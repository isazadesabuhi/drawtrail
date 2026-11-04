import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  routeGenerationFailureSchema,
  routeGenerationRequestSchema,
  routeGenerationResponseSchema,
  routeGenerationSuccessSchema,
} from './index';

async function readFixture(name: string) {
  return JSON.parse(
    await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'),
  ) as unknown;
}

describe('route generation contracts', () => {
  it('accepts a generator request example with drawing, center, mode, distance, loop, bounds, and settings', async () => {
    const fixture = await readFixture('generator-request.json');
    expect(routeGenerationRequestSchema.parse(fixture)).toMatchObject({
      mode: 'walking',
      targetDistanceKm: 3,
      loop: true,
      settings: { maxWaypoints: 8 },
    });
  });

  it('accepts success and typed failure response examples', async () => {
    const success = await readFixture('generator-success.json');
    const failure = await readFixture('generator-failure.json');
    expect(routeGenerationSuccessSchema.parse(success).status).toBe('success');
    expect(routeGenerationFailureSchema.parse(failure).code).toBe(
      'missing_region',
    );
    expect(routeGenerationResponseSchema.parse(success).status).toBe('success');
    expect(routeGenerationResponseSchema.parse(failure).status).toBe('error');
  });

  it('rejects invalid distance, unsupported modes, and non-GeoJSON coordinate order', async () => {
    const fixture = await readFixture('generator-request.json');
    const request = routeGenerationRequestSchema.parse(fixture);
    expect(
      routeGenerationRequestSchema.safeParse({
        ...request,
        targetDistanceKm: 0,
      }),
    ).toHaveProperty('success', false);
    expect(
      routeGenerationRequestSchema.safeParse({ ...request, mode: 'driving' }),
    ).toHaveProperty('success', false);
    expect(
      routeGenerationRequestSchema.safeParse({
        ...request,
        center: [181, 1.5],
      }),
    ).toHaveProperty('success', false);
  });
});
