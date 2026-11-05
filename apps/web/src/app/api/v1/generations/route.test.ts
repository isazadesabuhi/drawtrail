import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const jobs = vi.hoisted(() => ({
  createGeneration: vi.fn(),
  enqueueGeneration: vi.fn(),
  failGeneration: vi.fn(),
  IdempotencyConflictError: class extends Error {},
}));
vi.mock('@drawtrail/jobs', () => jobs);

import { POST } from './route';

const id = 'f9b1d832-7a22-4ac0-987b-c99c017fc472';
const status = {
  id,
  state: 'pending',
  progress: null,
  result: null,
  error: null,
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
  startedAt: null,
  completedAt: null,
};

async function requestFixture() {
  return JSON.parse(
    await readFile(
      new URL(
        '../../../../../../../packages/validation/fixtures/generator-request.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as unknown;
}

describe('POST /api/v1/generations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a job and queues it without waiting for route generation', async () => {
    jobs.createGeneration.mockResolvedValue({ status, created: true });
    jobs.enqueueGeneration.mockResolvedValue(undefined);
    const response = await POST(
      new Request('http://localhost/api/v1/generations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'client-retry-1',
        },
        body: JSON.stringify(await requestFixture()),
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      apiVersion: 'v1',
      status: 'success',
      data: {
        id,
        state: 'pending',
        statusUrl: `/api/v1/generations/${id}`,
        reused: false,
      },
      error: null,
    });
    expect(jobs.createGeneration).toHaveBeenCalledWith(
      expect.any(Object),
      'client-retry-1',
    );
    expect(jobs.enqueueGeneration).toHaveBeenCalledWith(id);
  });

  it('returns the same job for an idempotent retry without enqueuing twice', async () => {
    jobs.createGeneration.mockResolvedValue({ status, created: false });
    const response = await POST(
      new Request('http://localhost/api/v1/generations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'retry-key',
        },
        body: JSON.stringify(await requestFixture()),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { id, reused: true } });
    expect(jobs.enqueueGeneration).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key with a different request', async () => {
    jobs.createGeneration.mockRejectedValue(
      new jobs.IdempotencyConflictError('different request'),
    );
    const response = await POST(
      new Request('http://localhost/api/v1/generations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'retry-key',
        },
        body: JSON.stringify(await requestFixture()),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'idempotency_conflict' },
    });
  });

  it('rejects malformed requests and reports queue outages', async () => {
    const invalid = await POST(
      new Request('http://localhost/api/v1/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      status: 'error',
      error: { code: 'invalid_request' },
    });

    jobs.createGeneration.mockResolvedValue({ status, created: true });
    jobs.enqueueGeneration.mockRejectedValue(new Error('Redis unavailable'));
    const unavailable = await POST(
      new Request('http://localhost/api/v1/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(await requestFixture()),
      }),
    );
    expect(unavailable.status).toBe(503);
    expect(jobs.failGeneration).toHaveBeenCalledWith(
      id,
      'service_unavailable',
      expect.any(String),
    );
  });
});
