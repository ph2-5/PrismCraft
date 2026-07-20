import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/helpers/**', '**/electron-integration.spec.ts', '**/electron-pages.spec.ts', '**/electron/**'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // CI 环境（ubuntu）无显示器，必须 headless；本地保留 headed 便于调试
        headless: !!process.env.CI,
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
        },
      },
    },
  ],
  webServer: {
    command: 'npx vite --port 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    // CI 上首次构建 vite 较慢，给足启动时间
    timeout: process.env.CI ? 300000 : 120000,
  },
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  outputDir: 'test-results/artifacts',
});
