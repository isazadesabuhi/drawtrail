import type {
  GenerationJobState,
  GenerationProgress,
  RouteGenerationRequest,
  RouteGenerationResponse,
} from '@drawtrail/validation';

export type GenerationProcessorDependencies = {
  getState: (id: string) => Promise<GenerationJobState | null>;
  getRequest: (id: string) => Promise<RouteGenerationRequest | null>;
  markRunning: (id: string) => Promise<void>;
  updateProgress: (id: string, progress: GenerationProgress) => Promise<void>;
  generate: (
    request: RouteGenerationRequest,
    signal: AbortSignal,
    progress: (value: GenerationProgress) => void,
  ) => Promise<RouteGenerationResponse>;
  complete: (
    id: string,
    result: Extract<RouteGenerationResponse, { status: 'success' }>,
  ) => Promise<void>;
  fail: (id: string, code: string, message: string) => Promise<void>;
};

export async function processGenerationTask(
  id: string,
  signal: AbortSignal,
  dependencies: GenerationProcessorDependencies,
  onProgress: (progress: GenerationProgress) => void = () => {},
) {
  const state = await dependencies.getState(id);
  if (
    !state ||
    state === 'completed' ||
    state === 'failed' ||
    state === 'cancelled'
  )
    return;
  const request = await dependencies.getRequest(id);
  if (!request) {
    await dependencies.fail(
      id,
      'internal_error',
      'Saved generation request is missing.',
    );
    return;
  }
  await dependencies.markRunning(id);
  try {
    let progressWrites = Promise.resolve();
    const result = await dependencies.generate(request, signal, (progress) => {
      onProgress(progress);
      progressWrites = progressWrites.then(() =>
        dependencies.updateProgress(id, progress),
      );
    });
    await progressWrites;
    if (signal.aborted || result.status === 'error') {
      const failure =
        result.status === 'error'
          ? result
          : { code: 'cancelled', message: 'Generation was cancelled.' };
      await dependencies.fail(id, failure.code, failure.message);
      return result;
    }
    await dependencies.complete(id, result);
    return result;
  } catch (error) {
    await dependencies.fail(
      id,
      'internal_error',
      error instanceof Error
        ? error.message
        : 'Worker failed to process generation.',
    );
    throw error;
  }
}
