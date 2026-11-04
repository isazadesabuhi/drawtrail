import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL('../node_modules/@playwright/test/cli.js', import.meta.url),
    ),
    'test',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      PLAYWRIGHT_SERVER_MODE: 'development',
      NEXT_PUBLIC_MAP_STYLE_URL: '/__test__/map-style.json',
      NEXT_PUBLIC_MAP_ATTRIBUTION: 'Synthetic test geometry — no street data',
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
