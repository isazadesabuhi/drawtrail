import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { expect, it } from 'vitest';
import configuration from '../../postcss.config.mjs';

it('resolves Tailwind from the web app when a dev transform omits its source filename', async () => {
  const options = configuration.plugins['@tailwindcss/postcss'];
  expect(resolve(options.base)).toBe(
    resolve(fileURLToPath(new URL('../../', import.meta.url))),
  );

  // Turbopack can omit `from`. Disable scanning so this checks resolution only.
  const result = await postcss([
    tailwindcss({ ...options, optimize: false }),
  ]).process(
    '@import "tailwindcss" source(none); @source inline("text-red-500");',
    { from: undefined },
  );
  expect(result.css).toContain('.text-red-500');
  expect(result.css).toContain('--color-red-500');
});
