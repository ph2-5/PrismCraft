import Module from "module";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";

/**
 * 主进程运行时模块别名解析器。
 *
 * 处理两类 tsconfig paths 别名（Node.js CJS 运行时不读 tsconfig paths）：
 *
 * 1. `@shared-logic/*` → `electron/dist/shared-logic/*`
 *    shared-logic 层位于 rootDir 之外，编译产物单独放置。
 *
 * 2. `@shared/*` → `electron/dist/shared/*`
 *    electron/src/shared/ 内的模块（如 i18n），编译后位于 dist/shared/。
 *
 * 3. `@domain/*` → `electron/dist/domain/*`
 *    electron/src/domain/ 内的模块（如 types），编译后位于 dist/domain/。
 *
 * 设计原则：
 * - 编译产物始终位于 electron/dist/（与主进程代码同目录）
 * - 编译后 __dirname = electron/dist/，所以子目录 = __dirname/<subdir>
 * - 不依赖 app.isPackaged、不检查 out/、不回退到 src/（src 是 .ts 源码，主进程无法 require）
 * - 打包后 __dirname 位于 resources/app.asar/electron/dist/，子目录一起打包
 *
 * 自动恢复机制：
 * - 如果 electron/dist/shared-logic 不存在，自动同步触发 tsc 编译
 * - 这样无论从哪个路径启动 electron（npm script / playwright / npx electron），
 *   都能保证 shared-logic 已编译，彻底消除"directory not found"错误
 *
 * 编译命令：npm run build:shared-logic（tsc -p tsconfig.shared-logic.json）
 */

const DIST_DIR = __dirname;
const SHARED_LOGIC_DIR = path.resolve(DIST_DIR, "shared-logic");

if (!fs.existsSync(SHARED_LOGIC_DIR)) {
  // 自动同步编译 shared-logic（开发模式 fallback）
  const projectRoot = path.resolve(DIST_DIR, "..", "..");
  const tsconfigPath = path.join(projectRoot, "tsconfig.shared-logic.json");
  try {
    // 使用 execFileSync + 数组参数（shell: false），避免 shell 注入风险
    // 注：Windows 上 npx 实为 npx.cmd，shell:false 直接调用会失败；此处通过 node 直接执行 tsc 入口
    const tscBin = path.join(projectRoot, "node_modules", "typescript", "bin", "tsc");
    execFileSync(process.execPath, [tscBin, "-p", tsconfigPath], {
      cwd: projectRoot,
      stdio: "pipe",
      timeout: 60000,
      shell: false,
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

// 运行时别名前缀 → dist 子目录映射
const ALIAS_MAP: Record<string, string> = {
  "@shared-logic/": "shared-logic",
  "@shared/": "shared",
  "@domain/": "domain",
};

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
  for (const prefix of Object.keys(ALIAS_MAP)) {
    if (request.startsWith(prefix)) {
      const subPath = request.slice(prefix.length);
      const targetDir = ALIAS_MAP[prefix]!;
      request = path.resolve(DIST_DIR, targetDir, subPath);
      break;
    }
  }
  return originalResolveFilename.call(this, request, ...args);
};
