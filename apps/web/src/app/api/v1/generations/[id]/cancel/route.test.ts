import { beforeEach, describe, expect, it, vi } from 'vitest';

const jobs = vi.hoisted(() => ({ cancelGeneration: vi.fn() }));
vi.mock('@drawtrail/jobs', () => jobs);

import { POST } from './route';

const id = 'f9b1d832-7a22-4ac0-987b-c99c017fc472';

describe('POST /api/v1/generations/:id/cancel', () => {
  beforeEach(() => vi.clearAllMocks());
  it('persists cancellation and returns the terminal state', async () => {
    jobs.cancelGeneration.mockResolvedValue({
      id,
      state: 'cancelled',
      progress: { stage: 'searching', completed: 1, total: 8 },
      result: null,
      error: { code: 'cancelled', message: 'Generation was cancelled.' },
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-05T10:00:02.000Z',
      startedAt: '2026-11-05T10:00:01.000Z',
      completedAt: '2026-11-05T10:00:02.000Z',
    });
    const response = await POST(
      new Request(`http://localhost/api/v1/generations/${id}/cancel`),
      {
        params: Promise.resolve({ id }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { id, state: 'cancelled' },
    });
  });
});
