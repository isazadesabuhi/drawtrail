import { defineConfig, devices } from '@playwright/test';

const development = process.env.PLAYWRIGHT_SERVER_MODE === 'development';
const baseURL = development ? 'http://127.0.0.1:3130' : 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: {
    command: development
      ? 'npm run dev -- --hostname 127.0.0.1 --port 3130'
      : 'node apps/web/node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1',
    url: baseURL,
    reuseExistingServer: !process.env.CI && !development,
    timeout: 120_000,
  },
});
