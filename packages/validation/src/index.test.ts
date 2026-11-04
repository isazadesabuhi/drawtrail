import { describe, expect, it } from 'vitest';
import { activityModeSchema } from './index';

describe('shared activity validation', () => {
  it.each(['walking', 'running', 'cycling'])('accepts %s', (activity) => {
    expect(activityModeSchema.parse(activity)).toBe(activity);
  });
  it('rejects an unsupported activity', () => {
    expect(activityModeSchema.safeParse('driving').success).toBe(false);
  });
});
