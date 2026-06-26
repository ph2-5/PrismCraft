import { defineConfig, devices } from '@playwright/test';

// Workers 策略：
// - 默认 1（串行，100% 稳定，避免 vite dev server 并发编译延迟导致测试超时）
// - PW_WORKERS=N 启用并发（实测 2-4 workers 会有 ~25% 测试因 vite 模块编译瓶颈超时失败）
// - CI 上固定 2 workers（配合 retries=2 容错）
// 并发瓶颈根因：vite dev server 单实例处理多 worker 并发请求时，首次访问页面的 chunk
// 编译会阻塞，导致 10s expect timeout 不够。这是 vite dev 模式限制，非测试本身 bug。
// 优化方向：改用 vite build + preview 模式可避免热编译瓶颈，但会失去 HMR 调试能力。
function resolveWorkers(): number {
  if (process.env.PW_WORKERS) return Number(process.env.PW_WORKERS);
  if (process.env.CI) return 2;
  return 1;
}

const WORKERS = resolveWorkers();

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/helpers/**', '**/electron-integration.spec.ts', '**/electron-pages.spec.ts', '**/electron/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: WORKERS,
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
        // workers > 1 时强制 headless，避免多个有头浏览器窗口争抢 GPU/CPU
        // 单 worker 时保留有头模式便于调试
        // 可通过 PW_HEADED=1 强制有头模式
        headless: WORKERS > 1 && !process.env.PW_HEADED,
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
    timeout: 120000,
  },
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  outputDir: 'test-results/artifacts',
});
