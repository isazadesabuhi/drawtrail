import { beforeEach, describe, expect, it, vi } from 'vitest';

const jobs = vi.hoisted(() => ({ getGeneration: vi.fn() }));
vi.mock('@drawtrail/jobs', () => jobs);

import { GET } from './route';

const id = 'f9b1d832-7a22-4ac0-987b-c99c017fc472';
const context = { params: Promise.resolve({ id }) };

describe('GET /api/v1/generations/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns persisted status and progress in the v1 envelope', async () => {
    jobs.getGeneration.mockResolvedValue({
      id,
      state: 'running',
      progress: { stage: 'searching', completed: 3, total: 8 },
      result: null,
      error: null,
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-05T10:00:03.000Z',
      startedAt: '2026-11-05T10:00:01.000Z',
      completedAt: null,
    });
    const response = await GET(
      new Request(`http://localhost/api/v1/generations/${id}`),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      apiVersion: 'v1',
      status: 'success',
      data: { id, state: 'running', progress: { completed: 3, total: 8 } },
    });
  });

  it('returns 404 for unknown and malformed IDs', async () => {
    jobs.getGeneration.mockResolvedValue(null);
    const missing = await GET(
      new Request(`http://localhost/api/v1/generations/${id}`),
      context,
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: 'not_found' },
    });
    jobs.getGeneration.mockClear();
    const invalid = await GET(
      new Request('http://localhost/api/v1/generations/nope'),
      { params: Promise.resolve({ id: 'nope' }) },
    );
    expect(invalid.status).toBe(404);
    expect(jobs.getGeneration).not.toHaveBeenCalled();
  });
});
