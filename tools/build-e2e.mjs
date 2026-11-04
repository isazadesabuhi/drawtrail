import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The browser suite intercepts this style URL and serves a local fixture.
// No automated pan/zoom tests should request public map tiles.
const result = spawnSync(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'build'],
  {
    cwd: fileURLToPath(new URL('../apps/web/', import.meta.url)),
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_MAP_STYLE_URL: '/__test__/map-style.json',
      NEXT_PUBLIC_MAP_ATTRIBUTION: 'Synthetic test geometry — no street data',
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
