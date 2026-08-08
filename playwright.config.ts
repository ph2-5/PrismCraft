import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/helpers/**', '**/electron-integration.spec.ts', '**/electron-pages.spec.ts', '**/electron/**', '**/novel-pipeline-llm-demo.spec.ts'],
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
    toHaveScreenshot: {
      // 跨平台共用基线（去掉 -chromium-win32/linux 后缀）；0.02 容差容忍字体渲染差异
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    },
  },
  // 基线路径：去掉平台后缀，CI(linux) 与本地(win32) 共用同一份截图
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  outputDir: 'test-results/artifacts',
});
