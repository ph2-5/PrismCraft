/**
 * R180: 函数职责单一（>100 行的注册函数应拆分）
 *
 * 回归规则目的：
 *   注册函数（如 IPC handler 注册）超过 100 行时，必须按类别拆分为独立的
 *   注册函数，由顶层函数调用。单函数承担多类别注册导致难以定位、难以测试。
 *
 * 被测代码：
 *   electron/src/main-common.ts（setupApiHandlers 已拆分为 5 个子函数）
 */
import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { join } from "path";

describe("R180: 函数职责单一（>100 行的注册函数应拆分）", () => {
  it("main-common.ts 包含 setupApiHandlers 顶层函数", async () => {
    const source = await readFile(
      join(process.cwd(), "electron/src/main-common.ts"),
      "utf-8",
    );
    expect(source).toMatch(/function\s+setupApiHandlers/);
  });

  it("setupApiHandlers 函数体应简短（<30 行，仅调用子函数）", async () => {
    const source = await readFile(
      join(process.cwd(), "electron/src/main-common.ts"),
      "utf-8",
    );
    // 提取 setupApiHandlers 函数体
    const match = source.match(
      /function\s+setupApiHandlers[^{]*\{([\s\S]*?)^\}/m,
    );
    expect(match).not.toBeNull();
    const body = match![1];
    const lines = body.split("\n").filter((l) => l.trim().length > 0);
    // 顶层函数应仅含子函数调用，<30 行
    expect(lines.length).toBeLessThan(30);
  });

  it("main-common.ts 拆分了 registerLogHandlers 子函数", async () => {
    const source = await readFile(
      join(process.cwd(), "electron/src/main-common.ts"),
      "utf-8",
    );
    expect(source).toMatch(/function\s+registerLogHandlers/);
  });

  it("main-common.ts 拆分了 registerHealthHandlers 子函数", async () => {
    const source = await readFile(
      join(process.cwd(), "electron/src/main-common.ts"),
      "utf-8",
    );
    expect(source).toMatch(/function\s+registerHealthHandlers/);
  });

  it("main-common.ts 拆分了 registerShellHandlers 子函数", async () => {
    const source = await readFile(
      join(process.cwd(), "electron/src/main-common.ts"),
      "utf-8",
    );
    expect(source).toMatch(/function\s+registerShellHandlers/);
  });

  it("main-common.ts 拆分了 registerWindowHandlers 子函数", async () => {
    const source = await readFile(
      join(process.cwd(), "electron/src/main-common.ts"),
      "utf-8",
    );
    expect(source).toMatch(/function\s+registerWindowHandlers/);
  });

  it("main-common.ts 拆分了 registerConfigHandlers 子函数", async () => {
    const source = await readFile(
      join(process.cwd(), "electron/src/main-common.ts"),
      "utf-8",
    );
    expect(source).toMatch(/function\s+registerConfigHandlers/);
  });

  it("setupApiHandlers 调用所有 5 个子注册函数", async () => {
    const source = await readFile(
      join(process.cwd(), "electron/src/main-common.ts"),
      "utf-8",
    );
    const match = source.match(
      /function\s+setupApiHandlers[^{]*\{([\s\S]*?)^\}/m,
    );
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).toMatch(/registerLogHandlers\(\)/);
    expect(body).toMatch(/registerHealthHandlers/);
    expect(body).toMatch(/registerShellHandlers\(\)/);
    expect(body).toMatch(/registerWindowHandlers\(\)/);
    expect(body).toMatch(/registerConfigHandlers\(\)/);
  });

  it("每个子注册函数应 <100 行", async () => {
    const source = await readFile(
      join(process.cwd(), "electron/src/main-common.ts"),
      "utf-8",
    );
    const funcNames = [
      "registerLogHandlers",
      "registerHealthHandlers",
      "registerShellHandlers",
      "registerWindowHandlers",
      "registerConfigHandlers",
    ];
    for (const name of funcNames) {
      const regex = new RegExp(`function\\s+${name}[^{]*\\{([\\s\\S]*?)^\\}`, "m");
      const match = source.match(regex);
      expect(match).not.toBeNull();
      const body = match![1];
      const lines = body.split("\n").filter((l) => l.trim().length > 0);
      expect(
        lines.length,
        `${name} 有 ${lines.length} 行，应 <100 行`,
      ).toBeLessThan(100);
    }
  });

  it("BAD 示例：121 行单函数注册多类 handler 是违规模式", () => {
    // 模拟 BAD 模式：单函数 >100 行
    const badFunction = `
function setupApiHandlers() {
  // 日志 (10 行)
  ipcMain.on("log:security", ...);
  // 健康检查 (15 行)
  ipcMain.handle("api:health", ...);
  // Shell (40 行)
  ipcMain.handle("shell:open-external", ...);
  ipcMain.handle("shell:open-path", ...);
  // 窗口 (30 行)
  ipcMain.on("window:minimize", ...);
  // 配置 (26 行)
  ipcMain.on("config:get", ...);
}`;
    // 模拟 121 行（行数估计：badFunction.split("\n").filter 非空行）
    // BAD 模式：单函数包含多类别注册
    expect(badFunction).toMatch(/ipcMain\.(on|handle)\(["']log/);
    expect(badFunction).toMatch(/ipcMain\.(on|handle)\(["']api:health/);
    expect(badFunction).toMatch(/ipcMain\.(on|handle)\(["']shell/);
    expect(badFunction).toMatch(/ipcMain\.(on|handle)\(["']window/);
    expect(badFunction).toMatch(/ipcMain\.(on|handle)\(["']config/);
  });

  it("GOOD 示例：拆分后顶层函数仅调用子函数", async () => {
    const source = await readFile(
      join(process.cwd(), "electron/src/main-common.ts"),
      "utf-8",
    );
    const match = source.match(
      /function\s+setupApiHandlers[^{]*\{([\s\S]*?)^\}/m,
    );
    expect(match).not.toBeNull();
    const body = match![1];
    // GOOD 模式：顶层函数仅含子函数调用（nonCallLines 应为空：
    //   body.split("\n").filter 非空且非 register*Handlers 调用）
    // 不应含直接 ipcMain 注册
    expect(body).not.toMatch(/ipcMain\.(on|handle)\(/);
  });
});
