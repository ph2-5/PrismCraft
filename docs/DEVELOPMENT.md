# 开发指南

本文档是 AI Animation Studio 项目的开发者入门指南，涵盖环境搭建、项目结构、开发工作流、核心模式、测试及调试等内容。

---

## 1. 快速开始

### 1.1 环境要求

| 工具 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | 18+ | 推荐 LTS 版本 |
| npm | 10+ | 包管理器 |
| PowerShell | 5+ | Windows 构建脚本依赖 |
| Git | 2.x | 版本控制 |

### 1.2 安装与首次运行

```bash
# 克隆仓库
git clone <repo-url>
cd ai-animation-studio-source-code

# 安装依赖（.npmrc 已配置 Electron 镜像）
npm install

# 仅启动渲染进程（Vite Dev Server，无需 Electron）
npm run dev

# 启动完整 Electron 应用（开发模式）
npm run build:electron && npx electron .
```

> **注意**：`npm run dev` 仅启动 Vite 开发服务器，不包含 Electron 主进程和数据库功能。需要完整功能时请使用 `build:electron` 后手动启动 Electron。

### 1.3 首次构建

```bash
# 完整 Electron 构建（Vite 构建 + Electron TS 编译 + 文件复制）
npm run build:electron

# 打包 Windows 安装程序
npm run build:win

# 打包 macOS DMG
npm run build:mac
```

构建产物输出到 `out/` 目录，Electron TypeScript 编译输出到 `electron/dist/`。

### 1.4 常用脚本速查

| 脚本 | 用途 |
|------|------|
| `npm run dev` | Vite 开发服务器（仅渲染进程） |
| `npm run build` | Vite 生产构建（Web 模式） |
| `npm run build:electron` | 完整 Electron 构建 |
| `npm run typecheck` | TypeScript 类型检查（根目录） |
| `npm run typecheck:electron` | TypeScript 类型检查（electron/） |
| `npm run lint` | ESLint 检查（src/） |
| `npm run lint:arch` | DDD 架构违规扫描 |
| `npm run test` | Vitest 单元测试 |
| `npm run validate` | 完整验证链（类型检查 + Lint + 架构 + 测试） |
| `npm run validate:full` | 完整验证 + 覆盖率报告 |

---

## 2. 项目结构详解

### 2.1 顶层目录

```
ai-animation-studio-source-code/
├── src/                    # 渲染进程源码（Vite 构建）
├── electron/src/           # 主进程源码（独立 TS 编译）
├── scripts/                # 构建与验证脚本
├── docs/                   # 项目文档
├── public/                 # 静态资源
├── out/                    # 构建产物
└── build-electron.ps1      # Electron 构建脚本（PowerShell）
```

### 2.2 渲染进程（src/）

```
src/
├── domain/          → 纯类型、Schema、Result 类型。禁止导入 modules/ 或 infrastructure/
├── modules/         → 9 个业务子域（story, video, shot, prompt, asset, sync, character, scene, persistence）
├── infrastructure/  → DI 容器、存储、网络、API 客户端、AI 提供商
├── shared/          → 跨模块 UI（Toast、Sidebar、ErrorBoundary）、工具函数、错误日志
├── app/             → 页面组件和布局（通过 Context 消费模块）
├── config/          → 常量、端口、共享配置
└── router.tsx       → 路由定义（React.lazy 懒加载）
```

**每个模块的标准结构**：

```
module-name/
├── index.ts           → 桶文件（公共 API）
├── MODULE.md          → 模块契约（用途、子域、依赖）
├── hooks/             → React Hooks
├── services/          → 业务逻辑服务
├── presentation/      → React 组件
└── domain/            → 模块专属领域类型（如需要）
```

### 2.3 主进程（electron/src/）

```
electron/src/
├── main.ts           → 应用生命周期、窗口管理、崩溃恢复
├── main-dev.ts       → 开发模式入口（含调试日志和 DevTools）
├── main-common.ts    → 共享逻辑：createWindow、静态服务器、gracefulShutdown
├── api-server.ts     → HTTP API 服务器（渲染进程↔主进程通信）
├── preload.ts        → IPC 桥接（5 级权限体系 + 限流）
├── database/         → SQLite 连接、Schema 构建器、迁移
├── handlers/         → IPC 处理器（数据库、配置、同步、安全配置）
├── plugins/          → 插件注册、用户插件加载、10 个 AI 提供商
├── security/         → SSRF 防护（仅云元数据拦截）、密钥存储
└── logging/          → 日志系统（ConsoleTransport + FileTransport）
```

### 2.4 路由结构

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | → 重定向到 `/story` | 默认入口 |
| `/story` | StoryPage | 故事创作与分镜管理 |
| `/quick-generate` | QuickGeneratePage | 快速视频生成 |
| `/video-tasks` | VideoTasksPage | 任务管理 |
| `/characters` | CharactersPage | 角色管理 |
| `/scenes` | ScenesPage | 场景管理 |
| `/assets` | AssetsPage | 资产管理 |
| `/settings` | SettingsPage | 设置 |
| `/about` | AboutPage | 关于 |

所有页面路由使用 `React.lazy()` 实现代码分割，仅在导航到该页面时加载。

---

## 3. 开发工作流

### 3.1 创建新功能

1. **确定所属模块**：新功能应归入现有 9 个模块之一。若无法归入，考虑创建新模块。
2. **阅读模块契约**：按顺序阅读 `MODULE.md` → `contract.json` → `.ai/modules/{module}.md` → `index.ts`。
3. **在对应子域中开发**：
   - 业务逻辑 → `services/`
   - React 状态逻辑 → `hooks/`
   - UI 组件 → `presentation/`
   - 类型定义 → `domain/`（如需模块专属类型）
4. **更新桶文件**：在 `index.ts` 中导出新增的公共 API。
5. **更新契约**：若公共 API 变更，同步更新 `MODULE.md` 和 `contract.json`。
6. **编写测试**：在 `__tests__/` 中添加单元测试。
7. **运行验证**：`npm run validate`。

### 3.2 修改现有模块

遵循 AI 维护工作流：

1. **先读契约再写代码**：阅读 `MODULE.md`（~50 行）→ `contract.json`（~80 行）→ `index.ts`，总计约 130 行。
2. **尊重不变量**：`contract.json` 中的 `invariants` 是不可协商的业务规则。若变更违反不变量，需调整方案或更新不变量并说明理由。
3. **遵守导入规则**：见下方依赖方向规则。
4. **更新契约**：公共 API 变更时，更新 `MODULE.md` + `contract.json` + `index.ts`，然后运行 `node scripts/check-module-api-consistency.mjs` 验证。
5. **验证变更**：`npm run validate:full`。

### 3.3 创建新模块

1. 在 `src/modules/` 下创建目录，遵循标准模块结构。
2. 编写 `MODULE.md` 和各子域的 `contract.json`。
3. 在 `index.ts` 中导出公共 API。
4. **在 `vite.config.ts` 中注册代码分割组**（新模块超过 50KB 时必须注册）：

```typescript
// vite.config.ts - build.rolldownOptions.output.codeSplitting.groups
{ name: "app-newmodule", test: /src[\\/]modules[\\/]newmodule/, priority: 15 }
```

5. 运行 `node scripts/check-module-api-consistency.mjs` 验证契约一致性。

---

## 4. 核心模式与约定

### 4.1 依赖方向（关键规则）

依赖必须**只向内流动**：

```
app → modules → domain
              → shared
              → infrastructure/di（仅通过容器）
infrastructure → domain, shared
shared → domain, infrastructure（仅代理导出）
domain → 无（纯类型）
```

**常见违规与正确做法**：

| 违规 | 正确做法 |
|------|---------|
| `shared/` 导入 `@/modules/*` | 禁止。将共享逻辑下沉到 `shared/` 或 `domain/` |
| `modules/` 直接导入 `@/infrastructure/*` | 使用 DI 容器或 `@/shared/` 代理导出 |
| `domain/` 导入 `@/infrastructure/*` | 禁止。domain 层必须是纯类型 |
| 跨模块深层路径导入 `@/modules/xxx/yyy/zzz` | 使用桶导入 `@/modules/xxx` |

### 4.2 DI 容器

用于获取有状态服务、Port 接口实现和需要测试替换的依赖：

```typescript
import { container } from "@/infrastructure/di";
const storage = container.videoTaskStorage;
```

**纯函数不走 DI**，而是通过 `@/shared/` 代理导出直接导入：

```typescript
import { sanitizeIdentifier } from "@/shared/sql-safety";
import { resolveImageUrl } from "@/shared/api-config";
```

### 4.3 代理导出

当模块需要 `infrastructure/` 中的纯函数时，通过 `@/shared/` 代理导出访问：

| 代理模块 | 来源 | 用途 |
|---------|------|------|
| `@/shared/db-core` | infrastructure/storage | 数据库安全操作（withRetry, safeQuery, safeRun, safeTransaction） |
| `@/shared/api-config` | infrastructure/network | API 配置、URL 解析 |
| `@/shared/video-cache` | infrastructure/cache | 视频缓存 |
| `@/shared/sql-safety` | infrastructure/storage | SQL 安全工具 |
| `@/shared/model-capabilities` | infrastructure/ai | AI 模型能力查询 |
| `@/shared/outfit` | infrastructure/ai | 角色服装工具 |
| `@/shared/video-utils` | infrastructure/ai | 视频工具函数 |

### 4.4 Result 类型

所有可能失败的操作应返回 `Result<T>`：

```typescript
import { ok, err } from "@/domain/result";

function doSomething(): Result<Data> {
  if (failed) return err(new AppError("OPERATION_FAILED", "操作失败描述"));
  return ok(data);
}

// 使用时必须解包
const result = doSomething();
if (result.ok) {
  console.log(result.value);  // Data 类型
} else {
  console.log(result.error);  // 错误信息
}
```

**禁止将 `Result<T>` 直接赋值给期望 `T` 的变量**（R6 回归守卫）。

### 4.5 编码约定

| 约定 | 说明 |
|------|------|
| ID 生成 | 使用 `crypto.randomUUID()`，禁止 `Date.now() + Math.random()` |
| useEffect 稳定引用 | 使用 `useRef` 避免闭包陷阱 |
| 异步取消守卫 | 所有 useEffect 中的异步操作必须设置 `cancelled` 标志 |
| 错误类型 | 使用 `unknown` 而非 `any` 捕获错误，用 `instanceof Error` 安全访问属性 |
| 错误日志 | 使用 `errorLogger`（来自 `@/shared/error-logger`），禁止 `console.warn`/`console.error` |
| 嵌套点击 | 内部按钮必须调用 `e.stopPropagation()` 防止冒泡 |
| 用户提示 | 使用 `useToastHelpers`（React）或 `emitToast`（非 React 代码） |
| 国际化 | 所有用户可见字符串使用 `t()` 函数（来自 `@/shared/constants`） |
| 代码注释 | 除非明确要求，否则不添加注释 |

### 4.6 Electron 环境守卫

在 `useEffect` 中使用 `electronAPI` 时，必须在异步回调内部检查 `isElectron()`：

```typescript
useEffect(() => {
  let cancelled = false;
  (async () => {
    if (!isElectron()) {
      if (!cancelled) setIsLoading(false);
      return;
    }
    try {
      const data = await fetchData();
      if (!cancelled) setData(data);
    } catch (err) {
      if (!cancelled) errorLogger.error("Failed", err);
    } finally {
      if (!cancelled) setIsLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, []);
```

---

## 5. 状态管理策略

项目使用多种状态管理方案，各有适用场景：

### 5.1 Zustand（全局业务状态）

用于管理核心业务状态，如视频任务、脏状态等：

```typescript
import { useVideoTaskStore } from "@/modules/video";

const { tasks, addTask, updateTask } = useVideoTaskStore();
```

**关键规则**：使用函数式更新而非 `get() + set()`（R34）：

```typescript
// 错误
store.set({ count: store.getState().count + 1 });

// 正确
store.set((state) => ({ count: state.count + 1 }));
```

### 5.2 React Query（异步数据获取）

用于角色、场景、资产等需要从数据库异步加载的数据：

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";

const { data, isLoading } = useQuery({
  queryKey: ["characters"],
  queryFn: fetchCharacters,
});
```

### 5.3 usePreference（localStorage 持久化）

用于需要持久化到 localStorage 的用户偏好设置，避免水合不匹配：

```typescript
import { usePreference } from "@/shared/utils/preferences";

const [theme, setTheme] = usePreference<string>("theme", "dark");
```

**禁止**在 `useState` 初始化器中直接读取 `localStorage`（R52）。

### 5.4 页面级状态

页面级组件使用 `useReducer` 或局部 `useState` 管理页面专属状态。**页面级组件禁止调用全局 store 的 `cleanup()`**（R62），仅应用级初始化器可调用。

---

## 6. 测试指南

### 6.1 运行测试

```bash
# 首次运行前，重建 better-sqlite3
npm rebuild better-sqlite3

# 运行所有测试
npx vitest run

# 运行指定模块测试
npx vitest run src/modules/video

# 带覆盖率报告（80% 阈值，按文件强制）
npx vitest run --coverage
```

### 6.2 测试文件位置

| 测试对象 | 位置 |
|---------|------|
| 服务 | `src/modules/{module}/{subdomain}/services/__tests__/{service}.test.ts` |
| Hooks | `src/modules/{module}/{subdomain}/hooks/__tests__/{hook}.test.ts` |
| 组件 | `src/modules/{module}/presentation/__tests__/{Component}.test.tsx` |

### 6.3 测试结构模板

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// 1. 提升的 Mock（必须在模块导入前定义）
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }));

// 2. 模块 Mock
vi.mock("@/infrastructure/di", () => ({ container: { ...mockFn } }));

// 3. 导入被测模块
import { ComponentName } from "../ComponentName";

// 4. 工厂函数
function buildProps(overrides = {}) {
  return { ...defaults, ...overrides };
}

// 5. 测试套件
describe("ComponentName", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("does something", () => { ... });
});
```

### 6.4 Mock 策略

- **`vi.hoisted()`**：用于必须在模块导入前存在的 mock 函数
- **`vi.mock()`**：模块级 mock（DI 容器、外部包、UI 组件）
- **`overrideToken()`**：从 DI 替换特定容器 token，用于服务级 mock
- **UI 组件 Mock**：将 `@/shared/ui/*` mock 为简单 HTML 元素
- **路由 Mock**：将 `react-router-dom` 的 `Link` mock 为 `<a>` 标签

### 6.5 覆盖率要求

- 分支覆盖率：80%
- 函数覆盖率：80%
- 行覆盖率：80%
- 语句覆盖率：80%
- 按**单文件**强制（`perFile: true`）

---

## 7. 调试技巧

### 7.1 日志系统

主进程日志输出到文件：

- **生产环境**：`%APPDATA%/ai-animation-studio/logs/app-YYYY-MM-DD.log`
- **开发环境**：`%APPDATA%/ai-animation-studio/logs/dev-YYYY-MM-DD.log`

日志轮转：单文件 10MB 触发重命名，最多保留 5 个日志文件。

渲染进程使用 `errorLogger`（来自 `@/shared/error-logger`），**禁止**在生产代码中使用 `console.warn`/`console.error`。

### 7.2 开发模式

`main-dev.ts` 提供增强的开发体验：
- `minLevel: "debug"` 级别日志
- 自动打开 DevTools
- 更详细的错误堆栈

### 7.3 Electron DevTools

开发模式下 DevTools 自动打开。生产模式下可通过快捷键 `Ctrl+Shift+I` 打开。

### 7.4 数据库调试

SQLite 数据库位于 `%APPDATA%/ai-animation-studio/` 目录下。可使用 DB Browser for SQLite 等工具直接查看。

数据库使用 WAL 模式，所有查询使用参数化语句，DDL 语句（DROP, ALTER, CREATE 等）在渲染进程中被阻止。

### 7.5 崩溃恢复

应用内置崩溃恢复机制：
- 渲染进程崩溃后 1 秒自动重建窗口
- GPU 进程崩溃后自动 `reload()`
- `uncaughtException` 和 `unhandledRejection` 仅记录日志，不退出应用

---

## 8. 常见问题

### Q1: `npm install` 失败，Electron 下载超时

确保 `.npmrc` 中的镜像配置正确：
```
electron_mirror=https://npmmirror.com/mirrors/electron/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/
```

### Q2: 测试报错 `better-sqlite3` 绑定失败

better-sqlite3 是原生模块，需要针对当前 Node.js 版本重新编译：

```bash
npm rebuild better-sqlite3
```

Electron 打包时会由 `@electron/rebuild` 自动处理。

### Q3: ESLint 报深层路径导入错误

跨模块导入必须使用桶路径，禁止深层路径：

```typescript
// 错误
import { something } from "@/modules/video/hooks/useVideoTask";

// 正确
import { useVideoTask } from "@/modules/video";
```

### Q4: 架构检查报 DDD 违规

运行 `node scripts/check-architecture.mjs` 查看详细违规信息。常见原因：
- `shared/` 导入了 `@/modules/*`
- `domain/` 导入了 `@/infrastructure/*`
- `modules/` 直接导入了 `@/infrastructure/*`（应使用 DI 容器或 `@/shared/` 代理导出）

### Q5: 构建后白屏或路由 404

确保使用 `npm run build:electron` 而非 `npm run build`。Electron 模式需要 `BUILD_TARGET=electron` 环境变量以生成相对路径的 SPA 包。

### Q6: `useEffect` 中访问 `electronAPI` 报错

在浏览器开发模式下 `electronAPI` 不可用。必须在异步回调内部检查 `isElectron()`：

```typescript
if (!isElectron()) {
  setIsLoading(false);
  return;
}
```

### Q7: 新模块打包后体积过大

新模块超过 50KB 时，必须在 `vite.config.ts` 的 `codeSplitting.groups` 中注册对应分组，否则会被打包到 `vendor-misc` 中影响加载性能。

### Q8: Zustand 状态更新不生效或闪烁

确保使用函数式更新而非 `get() + set()` 模式（R34）。函数式更新保证基于最新状态计算，避免竞态条件。

### Q9: localStorage 导致水合不匹配

禁止在 `useState` 初始化器中读取 `localStorage`。使用 `usePreference` hook（基于 `useSyncExternalStore`），支持跨标签页同步且避免水合问题。

### Q10: 如何添加新的 DI Token

1. 确定所属类别（A-E）：
   - **A**：Domain Port 实现
   - **B**：有状态服务
   - **C**：Storage 实例
   - **D**：Repository 实例
   - **E**：懒加载模块（需注释说明为何不能直接导入）

2. 在 `src/infrastructure/di/container.ts` 中注册
3. 若为类别 E，添加注释说明循环依赖原因
4. 运行 `npm run di-docs` 更新 `docs/di-tokens.md`
