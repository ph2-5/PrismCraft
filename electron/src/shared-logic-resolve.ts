import Module from "module";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

/**
 * shared-logic 模块解析器（彻底版）。
 *
 * 注意：electron/tsconfig.json 未通过 paths 别名配置 @shared-logic/*，因为
 * "../src/shared-logic/*" 在 rootDir "./src" 之外会触发 TS6059 错误。
 * 类型解析依赖 scripts/setup-shared-logic-symlink.mjs 创建的 node_modules/@shared-logic junction。
 *
 * 本文件处理运行时解析：Node.js CommonJS 模块解析不读取 tsconfig paths，
 * 主进程运行时通过 Module._resolveFilename 将 @shared-logic/* 重定向到
 * electron/dist/shared-logic/ 编译产物。
 *
 * 设计原则：
 * - shared-logic 编译产物始终位于 electron/dist/shared-logic/（跟主进程代码同目录）
 * - 编译后 __dirname = electron/dist/，所以 shared-logic 目录 = __dirname/shared-logic
 * - 不依赖 app.isPackaged、不检查 out/、不回退到 src/（src 是 .ts 源码，主进程无法 require）
 * - 打包后 __dirname 位于 resources/app.asar/electron/dist/，shared-logic 一起打包
 *
 * 自动恢复机制：
 * - 如果 electron/dist/shared-logic 不存在，自动同步触发 tsc 编译
 * - 这样无论从哪个路径启动 electron（npm script / playwright / npx electron），
 *   都能保证 shared-logic 已编译，彻底消除"directory not found"错误
 *
 * 编译命令：npm run build:shared-logic（tsc -p tsconfig.shared-logic.json）
 */

const SHARED_LOGIC_DIR = path.resolve(__dirname, "shared-logic");

if (!fs.existsSync(SHARED_LOGIC_DIR)) {
  // 自动同步编译 shared-logic（开发模式 fallback）
  const projectRoot = path.resolve(__dirname, "..", "..");
  const tsconfigPath = path.join(projectRoot, "tsconfig.shared-logic.json");
  try {
    execSync(`npx tsc -p "${tsconfigPath}"`, {
      cwd: projectRoot,
      stdio: "pipe",
      timeout: 60000,
    });
    // 模块加载早期 logger 尚未初始化，使用 process.stdout 输出诊断信息
    process.stdout.write("[shared-logic-resolve] Auto-compiled shared-logic to electron/dist/shared-logic\n");
  } catch (e) {
    throw new Error(
      `[shared-logic-resolve] Compiled shared-logic not found at "${SHARED_LOGIC_DIR}" and auto-compile failed. ` +
        `Run "npm run build:shared-logic" manually. ` +
        `Error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

const PREFIX = "@shared-logic/";

/**
 * Node.js 内部模块解析函数的类型（非公开 API，需手动声明）。
 * 使用 unknown[] 收集剩余参数，避免使用 any。
 */
type ResolveFilename = (request: string, ...args: unknown[]) => string;

const mod = Module as unknown as { _resolveFilename?: ResolveFilename };

if (typeof mod._resolveFilename !== "function") {
  throw new Error(
    "[shared-logic-resolve] Module._resolveFilename is not available. " +
      "This Node.js version may have changed the internal module API; " +
      "shared-logic resolver cannot be installed.",
  );
}

const originalResolveFilename: ResolveFilename = mod._resolveFilename;

mod._resolveFilename = function (request: string, ...args: unknown[]): string {
  if (request.startsWith(PREFIX)) {
    const subPath = request.slice(PREFIX.length);
    request = path.resolve(SHARED_LOGIC_DIR, subPath);
  }
  return originalResolveFilename.call(this, request, ...args);
};
