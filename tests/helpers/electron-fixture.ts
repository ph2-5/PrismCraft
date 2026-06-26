import { test as base, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

type ElectronTestFixture = {
  app: ElectronApplication;
  page: Page;
};

/**
 * Electron e2e fixture。
 *
 * userDataDir 隔离：每个 test 创建独立的临时 userDataDir，避免：
 * 1. 测试污染用户日常使用的 Electron userData（PrismCraft 应用数据）
 * 2. 多次运行之间状态残留
 *
 * 关于并发：Electron e2e 仍串行执行（workers=1），原因：
 * - APP_SERVER_PORT (3000) 和 API_SERVER_PORT (30100) 是硬编码的
 * - 前端编译时静态嵌入 API_SERVER_PORT，无法运行时切换
 * - 多实例共享同一 HTTP server 和 SQLite 数据库，破坏测试隔离
 * 详见 playwright.electron-all.config.ts 的注释。
 *
 * 优化方向：前端 e2e（playwright.config.ts）已启用 fullyParallel + 多 workers 并发。
 */
export const test = base.extend<ElectronTestFixture>({
  app: async ({}, use) => {
    const userDataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "prismcraft-e2e-"));
    const app = await electron.launch({
      args: ["./electron/dist/main.js", `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        NODE_ENV: "test",
      },
    });
    await use(app);
    await app.close();
    await fs.promises.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await use(page);
  },
});

export { expect } from "@playwright/test";
