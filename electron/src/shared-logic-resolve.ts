import Module from "module";
import path from "path";
import fs from "fs";
import { app } from "electron";

/**
 * 解析 shared-logic 目录的物理路径。
 *
 * 路径策略：
 * - 开发模式（未打包）：repo/src/shared-logic（.ts 源码，由 vite alias 或 vitest 处理）
 * - 打包模式：app.asar/out/shared-logic（build-electron.ps1 复制的 .js 编译产物）
 *
 * 注意：打包后 __dirname 位于 resources/app.asar/electron/dist，
 * 向上两级得到 resources/app.asar（即 app 包根目录）。
 */
function getSharedLogicDir(): string {
  const projectRoot = path.resolve(__dirname, "..", "..");

  if (app.isPackaged) {
    // 打包模式：使用 out/shared-logic（build-electron.ps1 复制的编译产物）
    const builtPath = path.join(projectRoot, "out", "shared-logic");
    if (fs.existsSync(builtPath)) {
      return builtPath;
    }
    throw new Error(
      `[shared-logic-resolve] Packaged shared-logic directory not found: ${builtPath}. ` +
        `Ensure build-electron.ps1 copies shared-logic to out/shared-logic.`,
    );
  }

  // 开发模式：使用 src/shared-logic（源码目录）
  const devPath = path.join(projectRoot, "src", "shared-logic");
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  throw new Error(
    `[shared-logic-resolve] Dev shared-logic directory not found: ${devPath}.`,
  );
}

const SHARED_LOGIC_DIR = getSharedLogicDir();
const PREFIX = "@shared-logic/";

/**
 * Node.js 内部模块解析函数的类型（非公开 API，需手动声明）。
 * 使用 unknown[] 收集剩余参数，避免使用 any。
 */
type ResolveFilename = (request: string, ...args: unknown[]) => string;

const mod = Module as unknown as { _resolveFilename: ResolveFilename };
const originalResolveFilename: ResolveFilename = mod._resolveFilename;

mod._resolveFilename = function (request: string, ...args: unknown[]): string {
  if (request.startsWith(PREFIX)) {
    const subPath = request.slice(PREFIX.length);
    request = path.resolve(SHARED_LOGIC_DIR, subPath);
  }
  return originalResolveFilename.call(this, request, ...args);
};
