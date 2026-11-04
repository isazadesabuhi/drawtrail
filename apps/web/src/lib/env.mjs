import { z } from 'zod';

const environmentSchema = z.object({
  VALHALLA_URL: z.url({ protocol: /^https?$/ }).optional(),
});

/**
 * Startup validates only selected fields and never prints secret values.
 * This native module is also loaded by `next start`, without a TS import hook.
 * @param {Record<string, string | undefined>} environment
 * @param {boolean} requireRouter
 */
export function readServerConfig(environment, requireRouter = false) {
  const result = environmentSchema.safeParse({
    VALHALLA_URL: environment.VALHALLA_URL,
  });
  if (!result.success)
    throw new Error('Invalid VALHALLA_URL: expected an HTTP(S) URL.');
  if (requireRouter && !result.data.VALHALLA_URL) {
    throw new Error(
      'VALHALLA_URL is required for routing. Configure apps/web/.env.local.',
    );
  }
  return result.data;
}
