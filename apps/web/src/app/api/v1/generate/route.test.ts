import { readFile } from 'node:fs/promises';
import {
  routeGenerationRequestSchema,
  routeGenerationResponseSchema,
} from '@drawtrail/validation';
import { apiSuccessEnvelope } from '@drawtrail/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValhallaClient } from '../../../../lib/valhalla-client';

vi.mock('../../../../lib/route-generator', () => ({
  generateRoute: vi.fn(),
}));

import { generateRoute } from '../../../../lib/route-generator';
import { POST } from './route';

async function fixture(name: string) {
  return JSON.parse(
    await readFile(
      new URL(
        `../../../../../../../packages/validation/fixtures/${name}.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  ) as unknown;
}

describe('POST /api/v1/generate progress streaming', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it.each(['application/json', 'text/event-stream'])(
    'forwards preferences through the %s router adapter',
    async (accept) => {
      const requestBody = routeGenerationRequestSchema.parse(
        await fixture('generator-request'),
      );
      requestBody.mode = 'cycling';
      requestBody.settings.preferences = {
        hills: 'flatter',
        cyclingRoads: 'paths',
        cyclingSurface: 'paved',
      };
      const result = routeGenerationResponseSchema.parse(
        await fixture('generator-success'),
      );
      const from = [1.5, 42] as const;
      const to = [1.50001, 42.00001] as const;
      const route = vi
        .spyOn(ValhallaClient.prototype, 'route')
        .mockResolvedValue({
          mode: 'cycling',
          geometry: { type: 'LineString', coordinates: [from, to] },
          distanceMeters: 1250,
        });
      vi.mocked(generateRoute).mockImplementation(
        async (body, router, signal) => {
          await router(body.mode, from, to, signal, body.settings.preferences);
          return result;
        },
      );
      const response = await POST(
        new Request('http://localhost/api/v1/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept },
          body: JSON.stringify(requestBody),
        }),
      );
      await response.text();
      expect(route).toHaveBeenCalledWith(
        'cycling',
        from,
        to,
        expect.objectContaining({
          preferences: requestBody.settings.preferences,
        }),
      );
    },
  );

  it('streams discrete progress and the standard result event when requested', async () => {
    const requestBody = routeGenerationRequestSchema.parse(
      await fixture('generator-request'),
    );
    const result = routeGenerationResponseSchema.parse(
      await fixture('generator-success'),
    );
    vi.mocked(generateRoute).mockImplementation(
      async (_request, _router, _signal, onProgress) => {
        onProgress?.({ stage: 'searching', completed: 1, total: 2 });
        onProgress?.({ stage: 'searching', completed: 2, total: 2 });
        return result;
      },
    );

    const response = await POST(
      new Request('http://localhost/api/v1/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
      }),
    );
    const stream = await response.text();

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(stream).toContain(
      'event: progress\ndata: {"stage":"searching","completed":1,"total":2}',
    );
    expect(stream).toContain(
      'event: progress\ndata: {"stage":"searching","completed":2,"total":2}',
    );
    expect(stream).toContain(
      `event: result\ndata: ${JSON.stringify(apiSuccessEnvelope(result))}`,
    );
  });
});
