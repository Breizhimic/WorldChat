import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4173/WorldChat/' },
  webServer: {
    command: 'npm run build:test && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/WorldChat/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
    { name: 'webkit', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
  ],
});
