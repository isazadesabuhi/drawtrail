import { readFile } from 'node:fs/promises';
import {
  routeGenerationRequestSchema,
  routeGenerationResponseSchema,
} from '@drawtrail/validation';
import { apiSuccessEnvelope } from '@drawtrail/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
