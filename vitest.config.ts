import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: [
      'packages/**/*.test.ts',
      'apps/web/**/*.test.tsx',
      'apps/web/**/*.test.ts',
    ],
    environment: 'node',
  },
});
