import { describe, expect, it } from 'vitest';
import { API_VERSION, apiErrorEnvelope, apiSuccessEnvelope } from './index';

describe('versioned API envelopes', () => {
  it('creates stable success and error response wrappers', () => {
    expect(API_VERSION).toBe('v1');
    expect(apiSuccessEnvelope({ id: 'job-1' })).toEqual({
      apiVersion: 'v1',
      status: 'success',
      data: { id: 'job-1' },
      error: null,
    });
    expect(apiErrorEnvelope('not_found', 'Missing.')).toEqual({
      apiVersion: 'v1',
      status: 'error',
      data: null,
      error: { code: 'not_found', message: 'Missing.', warnings: [] },
    });
  });
});
