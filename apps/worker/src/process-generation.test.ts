import { readFile } from 'node:fs/promises';
import {
  routeGenerationRequestSchema,
  routeGenerationResponseSchema,
  type GenerationJobState,
} from '@drawtrail/validation';
import { describe, expect, it, vi } from 'vitest';
import {
  processGenerationTask,
  type GenerationProcessorDependencies,
} from './process-generation';

const generationId = 'f9b1d832-7a22-4ac0-987b-c99c017fc472';

async function readFixture(name: string) {
  return JSON.parse(
    await readFile(
      new URL(
        `../../../../packages/validation/fixtures/${name}.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  ) as unknown;
}

async function dependencies(
  overrides: Partial<GenerationProcessorDependencies> = {},
) {
  const request = routeGenerationRequestSchema.parse(
    await readFixture('generator-request'),
  );
  const success = routeGenerationResponseSchema.parse(
    await readFixture('generator-success'),
  );
  return {
    getState: vi.fn(async (): Promise<'pending'> => 'pending'),
    getRequest: vi.fn(async () => request),
    markRunning: vi.fn(async () => {}),
    updateProgress: vi.fn(async () => {}),
    generate: vi.fn(async (_request, _signal, progress) => {
      progress({ stage: 'searching', completed: 1, total: 2 });
      return success;
    }),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
    ...overrides,
  } satisfies GenerationProcessorDependencies;
}

describe('independent generation worker processor', () => {
  it('persists running, progress, and completed result states', async () => {
    const deps = await dependencies();
    const progress = vi.fn();
    const result = await processGenerationTask(
      generationId,
      new AbortController().signal,
      deps,
      progress,
    );
    expect(deps.markRunning).toHaveBeenCalledWith(generationId);
    expect(progress).toHaveBeenCalledWith({
      stage: 'searching',
      completed: 1,
      total: 2,
    });
    expect(deps.updateProgress).toHaveBeenCalledWith(generationId, {
      stage: 'searching',
      completed: 1,
      total: 2,
    });
    expect(deps.complete).toHaveBeenCalledWith(generationId, result);
    expect(deps.fail).not.toHaveBeenCalled();
  });

  it('persists typed failures and cooperatively cancelled work', async () => {
    const failed = await dependencies({
      generate: vi.fn(async () => ({
        status: 'error' as const,
        code: 'no_route' as const,
        message: 'No path.',
        warnings: [],
      })),
    });
    await processGenerationTask(
      generationId,
      new AbortController().signal,
      failed,
    );
    expect(failed.fail).toHaveBeenCalledWith(
      generationId,
      'no_route',
      'No path.',
    );
    expect(failed.complete).not.toHaveBeenCalled();

    const controller = new AbortController();
    const cancelled = await dependencies({
      generate: vi.fn(async () => {
        controller.abort();
        return routeGenerationResponseSchema.parse(
          await readFixture('generator-success'),
        );
      }),
    });
    await processGenerationTask(generationId, controller.signal, cancelled);
    expect(cancelled.fail).toHaveBeenCalledWith(
      generationId,
      'cancelled',
      'Generation was cancelled.',
    );
    expect(cancelled.complete).not.toHaveBeenCalled();
  });

  it('does not start missing, absent, or previously cancelled jobs', async () => {
    const cancelled = await dependencies({
      getState: vi.fn(async (): Promise<GenerationJobState> => 'cancelled'),
    });
    await processGenerationTask(
      generationId,
      new AbortController().signal,
      cancelled,
    );
    expect(cancelled.getRequest).not.toHaveBeenCalled();
    expect(cancelled.markRunning).not.toHaveBeenCalled();

    const missing = await dependencies({ getRequest: vi.fn(async () => null) });
    await processGenerationTask(
      generationId,
      new AbortController().signal,
      missing,
    );
    expect(missing.fail).toHaveBeenCalledWith(
      generationId,
      'internal_error',
      'Saved generation request is missing.',
    );
    expect(missing.markRunning).not.toHaveBeenCalled();
  });
});
