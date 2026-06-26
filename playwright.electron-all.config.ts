import { defineConfig } from "@playwright/test";

// 注意：Electron e2e 不能并发执行，原因：
// 1. APP_SERVER_PORT (3000) 和 API_SERVER_PORT (30100) 是硬编码的
// 2. 前端编译时静态嵌入 API_SERVER_PORT，无法运行时切换
// 3. 多实例共享同一 HTTP server 和 SQLite 数据库，破坏测试隔离
// 优化方向：electron-fixture.ts 添加 userDataDir 隔离 + 减少 Electron 启动次数
export default defineConfig({
  testDir: "./tests/electron",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/electron-results.json" }],
  ],
  use: {
    trace: "on-first-retry",
    viewport: { width: 1280, height: 720 },
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    baseURL: "http://localhost:3000",
  },
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  outputDir: "test-results/electron-artifacts",
});
