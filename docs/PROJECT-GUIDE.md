# PrismCraft — 项目全方位指南

> 版本：1.3.0 | 许可证：AGPL-3.0-only（双协议，详见 LICENSE 与 COMMERCIAL_LICENSE.md） | 最后更新：2026-07-23

---

# 第一部分：项目总览

---

## 1. 项目定位与愿景

### 1.1 产品定位

PrismCraft 是一款**本地优先（local-first）、离线可用（offline-capable）**的 AI 动画制作桌面工具。它覆盖了从创意到成品的完整动画制作工作流：故事构思 → 角色设计 → 场景搭建 → 分镜编排 → AI 视频生成 → 导出成品。
与云端动画工具不同，PrismCraft 的核心理念是**数据主权**——所有用户数据（故事、角色、场景、视频任务、资产）都存储在本地 SQLite 数据库中，用户完全掌控自己的创作数据。AI 生成能力通过可插拔的 Provider 插件对接外部 API（火山引擎、快手、智谱、PixVerse、Seedance、Google、OpenAI Sora、MiniMax、Anthropic、OpenAI Compatible），用户可以选择任意 Provider 或同时使用多个。

### 1.2 目标用户

- 独立动画创作者：需要快速将创意转化为可视化动画
- 小型动画工作室：需要 AI 辅助提升制作效率
- 动画教育工作者：需要演示动画制作流程
- AI 创意爱好者：探索 AI 生成动画的可能性

### 1.3 核心价值主张

| 价值 | 实现方式 |
|------|---------|
| 数据主权 | 本地 SQLite 存储，不依赖云端数据库 |
| 离线可用 | 核心功能（编辑、浏览、导出）无需网络 |
| AI 多源 | 13 个 AI Provider 插件，用户自由选择 |
| 契约驱动 | 三级机器可读契约，AI 可全权维护 |
| 桌面原生 | Electron 原生窗口、文件系统、系统托盘 |

### 1.4 项目版本与规模

- **版本**：1.3.0
- **许可证**：CC-BY-NC-4.0（署名-非商业性使用 4.0 国际，商用需另行授权）
- **业务模块**：42 个（核心业务 25 / 基础设施 4 / 工具 13；完整清单参见 [MODULES.md](MODULES.md)）
- **子域**：56 个
- **AI Provider 插件**：13 个
- **数据库表**：30 张（14 业务表 + 5 关系表 + 6 缓存表 + 3 同步表 + 1 系统表 + 1 users 表）
- **回归防护规则**：151 条（R1-R151，8 大类）
- **i18n 键**：3076+

---

## 2. 设计哲学

### 2.1 机器可读契约驱动的 AI 维护

本项目的核心设计哲学是**"全权交由 AI 开发维护"**。这不是一个口号，而是通过工程化的契约体系实现的现实。

传统项目的文档与代码往往逐渐脱节——文档写了没人看，代码改了文档不更新。本项目通过三级机器可读契约体系解决这一问题：

```
MODULE.md（模块级）  →  contract.json（子域级）  →  .ai/modules/（维护指南级）
     约 50-150 行          约 30-80 行                详细修改规则
```

**第一级：MODULE.md**。每个模块根目录下的 Markdown 文件，包含模块概览、子域表、公共 API 列表、边界约束。AI 修改模块前先读此文件，了解模块的公共 API 和边界。

**第二级：contract.json**。每个子域一份 JSON 文件，包含名称、描述、依赖、公共 API、**不变量（invariants）**。不变量是**不可协商的业务规则**——例如"视频任务状态转换必须经过 TaskMachine"、"批量生成必须使用策略模式"、"持久化失败必须重新标记脏状态"。如果修改违反不变量，必须改变方案或显式更新不变量并说明理由。

**第三级：.ai/modules/**。详细的 AI 维护指南，包含每个子域的修改规则、注意事项、常见陷阱。这些指南是 AI 在实际维护过程中积累的经验。

三级契约的总阅读量约 130 行/子域。AI 修改代码时，先读契约，再读实现。自动化验证脚本（`check-architecture.mjs`、`check-module-api-consistency.mjs`、`validate-contracts.mjs`）在 CI 中强制执行契约一致性，确保文档与代码不会漂移。

### 2.2 契约驱动的价值

契约驱动不是文档驱动。传统文档是给人看的，容易过时；契约是给机器读的，可以被自动化验证。具体来说：

- **MODULE.md ↔ index.ts 一致性**：`check-module-api-consistency.mjs` 脚本检查 MODULE.md 中列出的公共 API 是否与 index.ts 的实际导出一致
- **contract.json 结构验证**：`validate-contracts.mjs` 脚本验证每个 contract.json 的结构完整性和不变量声明
- **架构违规检测**：`check-architecture.mjs` 脚本检测 DDD 分层违规、裸 SQL、深层路径导入

这三层验证在 CI 和 pre-commit hook 中执行，任何违规都会被拦截。

### 2.3 为什么"AI 全权维护"需要契约

AI 代码助手（如 Cursor、Trae）在修改代码时，面临的核心挑战是**上下文窗口有限**。一个 80,000 行的项目，AI 不可能一次读完所有代码。契约体系解决了这个问题：

1. AI 先读契约（130 行/子域），快速理解模块边界和约束
2. 只读需要修改的子域实现代码
3. 修改后运行验证脚本，确保不违反架构规则

没有契约，AI 只能靠猜测和全文搜索来理解模块边界，这在 42 个模块、56 个子域的规模下极易出错。

---

## 3. 技术栈选型理由

### 3.1 为什么选择 Electron

桌面端需要以下能力，浏览器 Web 应用无法满足：

- **本地文件系统访问**：导入/导出视频、图片、项目文件
- **SQLite 数据库**：本地数据持久化，WAL 模式支持并发读写
- **原生窗口管理**：多窗口、系统托盘、原生菜单
- **安全密钥存储**：通过 electron-store 加密存储 API Key
- **HTTP API Server**：渲染进程与主进程的 HTTP 通信

Electron 提供完整的 Node.js 运行时和原生 API 访问，是桌面应用的事实标准。

### 3.2 为什么选择 Vite（而非 Next.js）

项目曾使用 Next.js（`output: "export"` 模式），但存在以下问题：

| 问题 | Next.js | Vite + React Router |
|------|---------|---------------------|
| 功能利用率 | ~15%（仅用了静态导出和路由） | 100% |
| 构建步骤 | 5 步（含 API 路由 hack） | 3 步 |
| SSR | 不需要但框架强制处理 | 不存在 |
| API 路由 | 需要 hack 移除/恢复 | 不存在 |
| webpack 配置 | 需要覆盖 | 不存在 |
| HMR 速度 | 较慢 | 极速（基于 ESM） |
| 代码分割 | manualChunks（webpack） | rolldown codeSplitting API |

迁移到 Vite + React Router 后，构建流程从 5 步简化为 3 步，消除了 API 路由移除/恢复的 hack，功能利用率从 15% 提升到 100%。

### 3.3 为什么选择 React 19

React 19 提供了并发渲染、Suspense、Transitions 等现代特性。对于本项目：

- **并发渲染**：视频生成轮询不会阻塞 UI 交互
- **Suspense**：页面级懒加载配合 `React.lazy()` 实现代码分割
- **Transitions**：批量生成等耗时操作使用 transition 降低优先级
- **useSyncExternalStore**：`usePreference` hook 基于此实现，解决 hydration 问题

### 3.4 为什么选择 Zustand（而非 Redux）

Zustand 5 的优势：

- **极简 API**：`create()` + `set()` / `get()`，无 reducer/action 样板代码
- **轻量**：~1KB gzipped，Redux Toolkit ~11KB
- **函数式更新**：`set(state => ({ count: state.count + 1 }))`，避免 get()+set() 竞态（R34）
- **选择性订阅**：`useStore(state => state.xxx)` 自动浅比较，避免不必要渲染
- **中间件**：persist、devtools 等中间件按需使用

本项目仅 3 个 Zustand store（useVideoTaskStore、useDirtyState、appStore），大部分状态由 React Query 和 React Context 管理。

### 3.5 为什么选择 better-sqlite3

- **同步 API**：避免 async/await 链，代码更简洁，错误处理更直接
- **WAL 模式**：读写不互斥，适合 Electron 单进程多连接场景
- **性能**：C++ 原生绑定，比 sql.js（WASM）快 10-100 倍
- **版本锁定**：12.10.0（非 ^12.10.0），避免原生模块编译问题

### 3.6 为什么选择 TypeScript strict 模式

strict 模式启用所有严格类型检查选项：

- `strictNullChecks`：杜绝 null/undefined 运行时错误
- `noImplicitAny`：强制显式类型标注，提高代码可读性
- `strictFunctionTypes`：函数参数逆变检查
- `noUncheckedIndexedAccess`：数组/对象索引返回 T | undefined

生产代码中 `@typescript-eslint/no-explicit-any` 为 error 级别，测试代码为 warn 级别。

---

## 4. 项目规模与代码统计

### 4.1 整体规模

| 指标 | 数值 |
|------|------|
| 业务模块 | 9 |
| 子域 | 44 |
| AI Provider 插件 | 13 |
| 数据库表 | 29 |
| 回归防护规则 | 142 |
| i18n 键 | 3076+ |

### 4.2 模块规模分布

| 模块 | 代码行 | 占比 | 子域数 |
|------|--------|------|--------|
| storyboard | 19,878 | 32.5% | 5 |
| video | 10,725 | 23.1% | 4 |
| shot | 4,548 | 9.8% | 7 |
| prompt | 4,037 | 8.7% | 8 |
| asset | 2,697 | 5.8% | 5 |
| sync | 2,286 | 4.9% | 2 |
| character | 1,231 | 2.6% | 3 |
| scene | 886 | 1.9% | 3 |
| persistence | 434 | 0.9% | 2 |

storyboard 模块占比 32.5%，是最大的模块，也是已知架构债务之一。shot 模块虽然代码量中等，但子域数最多（7 个），体现了细粒度子域划分的设计。完整模块清单（42 个）参见 [MODULES.md](MODULES.md)。

### 4.3 代码分割后 Chunk 大小

| Chunk | 内容 | 大小 |
|-------|------|------|
| vendor-react | react, react-dom, react-router-dom, scheduler | ~284 KB |
| vendor-state | zustand, @tanstack/react-query | ~36 KB |
| vendor-ui | lucide-react, clsx, tailwind-merge, class-variance-authority | ~48 KB |
| vendor-misc | 其他 node_modules | 不定 |
| app-storyboard | src/modules/storyboard/ | ~351 KB |
| app-shot | src/modules/shot/ | ~145 KB |
| app-video | src/modules/video/ | ~88 KB |
| app-infra | asset, sync, persistence 模块 | ~47 KB |
| app-infra-core | src/infrastructure/ | ~241 KB |
| app-shared | src/shared/ | ~260 KB |
| app-domain | src/domain/ | ~14 KB |
| app-character | src/modules/character/ | ~20 KB |
| app-scene | src/modules/scene/ | ~12 KB |
| app-prompt | src/modules/prompt/ | 不定 |
| page-* | 懒加载页面组件 | 不定 |

---

# 第二部分：架构设计

---

## 5. 四层架构详解

### 5.1 架构总览

PrismCraft 采用 DDD（领域驱动设计）四层架构，依赖方向严格向内流动：

```
┌─────────────────────────────────────────────────┐
│  app/ — 页面组件和布局                            │
│  消费所有层，组合模块提供的 Context                  │
├─────────────────────────────────────────────────┤
│  modules/ — 42 个业务子域模块                      │
│  每个：hooks/ + services/ + presentation/         │
│  只导入 domain、shared、infrastructure/di          │
├─────────────────────────────────────────────────┤
│  shared/ — 跨切面工具层                            │
│  UI 组件、工具函数、infrastructure 代理导出          │
│  只导入 domain、infrastructure（代理导出）           │
├─────────────────────────────────────────────────┤
│  infrastructure/ — 基础设施层                      │
│  DI 容器、存储、网络、AI Provider、数据库            │
│  只导入 domain、shared                            │
├─────────────────────────────────────────────────┤
│  domain/ — 纯类型层                               │
│  类型、Schema、Result 类型、错误码                   │
│  零外部依赖                                       │
└─────────────────────────────────────────────────┘
```

### 5.2 domain 层

domain 层是整个系统的核心，定义了所有业务语义的类型和规则。

**核心内容**：

- **业务类型**：Story、Character、Scene、VideoTask、Shot、Asset 等所有实体类型
- **Result 类型**：`ok(value)` / `err(error)` 二值返回类型，替代异常抛出
- **语义化错误类**：11 个错误类，每个对应一个错误域
- **结构化错误码**：35 个错误码，每个有唯一标识和描述
- **JSON Schema**：各实体的 JSON 容器解析函数（parseConfig、parseProvider 等）

**零依赖原则**：domain 层不得导入任何外部模块。这意味着：

```typescript
// ✅ 正确：domain 只定义纯类型
export interface StoryBeat {
  id: string;
  title: string;
  keyframe?: StoryBeatKeyframe;
}

// ❌ 错误：domain 导入了 modules 或 infrastructure
import { videoTaskStorage } from "@/infrastructure/di"; // 违反！
```

**Result 类型设计**：

```typescript
type Result<T> = Ok<T> | Err;

function ok<T>(value: T): Ok<T>;
function err<E extends AppError>(error: E): Result<never, E>;

// 使用示例
const result = generateBeatKeyframe(beat);
if (result.ok) {
  beat.keyframe = result.value; // 安全访问
} else {
  errorLogger.error("Keyframe generation failed", undefined, { code: result.error.code });
}
```

Result 类型强制调用方处理错误路径，避免"安慰剂错误处理"反模式（R50）。

**11 个语义化错误类**：

| 错误类 | 用途 |
|--------|------|
| DatabaseError | 数据库操作失败 |
| ValidationError | 数据验证失败 |
| ApiError | 外部 API 调用失败 |
| NotFoundError | 资源不存在 |
| NetworkError | 网络连接问题 |
| StorageError | 本地存储操作失败 |
| ConfigurationError | 配置错误 |
| GenerationError | AI 生成失败 |
| TimeoutError | 操作超时 |
| RateLimitError | API 速率限制 |
| AuthenticationError | 认证失败 |

### 5.3 modules 层

modules 层包含 42 个业务模块，每个模块遵循统一的结构：

```
module-name/
  index.ts           → 桶文件（公共 API）
  MODULE.md          → 模块契约
  domain/            → 模块特有领域类型（如需要）
  hooks/             → React hooks
  services/          → 业务逻辑服务
  presentation/      → React 组件
```

**桶文件规则**：

- `index.ts` 必须重新导出所有公共 API
- 内部实现细节不得导出
- 其他模块只能通过 `@/modules/xxx` 导入
- 深层路径导入（`@/modules/xxx/yyy/zzz`）被 ESLint 规则拦截

**模块间通信**：

模块间不允许直接导入。需要跨模块通信时，使用以下方式：

1. **React Context**：StoryProvider 提供 story 数据给子组件
2. **DI 容器**：通过 container 获取其他模块的存储实例
3. **事件总线**：eventBus 发布/订阅跨模块事件

### 5.4 infrastructure 层

infrastructure 层提供所有基础设施实现：

- **DI 容器**：46 个 token，6 个分类（A-F，详见 [di-tokens.md](di-tokens.md)）
- **存储**：15 个存储模块，每个对应一个或多个数据库表
- **网络**：API 客户端、熔断器、弹性 Fetch、重试引擎
- **AI Provider**：13 个视频生成插件
- **数据库**：SQLite 连接、Schema 构建、迁移框架

infrastructure 层不得导入 `@/modules/*`，确保基础设施不依赖业务逻辑。

### 5.5 shared 层

shared 层是跨切面工具层，包含：

- **跨切面 UI**：Toast、Sidebar、ErrorBoundary、DeleteConfirmDialog、AssetSelectorDialog
- **工具函数**：getErrorMessage、resolveImageUrl、emitToast 等
- **infrastructure 代理导出**：db-core、api-config、video-cache、outfit、sql-safety、model-capabilities、user-facing-error、file-http

**代理导出模式**：

modules 不能直接导入 infrastructure（除了 DI 容器），但有时需要 infrastructure 的纯函数。解决方案是在 shared 中创建代理导出：

```typescript
// shared/db-core.ts — 代理导出
export { withRetry, safeQuery, safeRun, safeTransaction } from "@/infrastructure/storage/utils";

// modules 中使用
import { withRetry } from "@/shared/db-core"; // ✅ 正确
import { withRetry } from "@/infrastructure/storage/utils"; // ❌ 违反！
```

关键约束：`shared/` 不得导入 `@/modules/*`。

#### 5.5.1 统一文件操作通信层 (`@/shared/file-http`)

`src/shared/file-http/index.ts` 提供统一的文件操作 API，采用 **HTTP 优先 + IPC 回退** 双轨设计：

- **HTTP 优先**：通过 `http://localhost:${API_SERVER_PORT}/api/*` 调用主进程 HTTP API Server，享受流式传输、标准状态码、Zod schema 校验等优势
- **IPC 回退**：当 HTTP API Server 不可用（启动早期、降级模式）时，自动回退到 `window.electronAPI` IPC 通道

**公开函数** (7 个)：

| 函数 | 说明 | HTTP 路由 |
|------|------|----------|
| `writeFile` | 写入文件 (JSON 路径受 `MAX_WRITE_SIZE = 100MB` 限制；octet-stream 路径 `file/write-binary` 受 `MAX_WRITE_BINARY_SIZE = 500MB` 限制；流式下载走 `/api/download/to-file` 无内存上限) | `POST /api/file/write` |
| `readFile` | 读取文件内容 | IPC 回退 |
| `getFileInfo` | 查询文件元信息 | IPC 回退 |
| `getCacheDirectory` | 查询缓存目录路径 | `GET /api/file/cache-directory` |
| `getDiskSpace` | 查询磁盘可用空间 | `GET /api/file/disk-space` |
| `fileExists` | 判断文件是否存在 | IPC 回退 |
| `deleteFile` | 删除文件 | IPC 回退 |

> 测试用 `_resetHttpCache` 不属于公开 API。

**已迁移的调用方**：`src/modules/video/cache/services/video-cache.ts` 与 `image-cache.ts` 已全部改用 `@/shared/file-http`，不再直接调用 `window.electronAPI` 或 fetch。

### 5.6 app 层

app 层是页面组件和布局层：

- **页面组件**：StoryPage、QuickGeneratePage、VideoTasksPage、CharactersPage、ScenesPage、AssetsPage、SettingsPage、AboutPage
- **布局**：AppLayout（Sidebar + Content）
- **路由配置**：React Router 7，所有页面使用 React.lazy 懒加载

app 层可以导入所有层，但不得使用模块的深层路径（`@/modules/*/*/*`）。

---

## 6. 依赖方向与规则

### 6.1 依赖方向图

```
app ──→ modules ──→ domain
  │         │
  │         ├──→ shared
  │         │
  │         └──→ infrastructure/di（通过 container）
  │
  ├──→ shared
  │
  └──→ domain

infrastructure ──→ domain
       │
       └──→ shared

shared ──→ domain
    │
    └──→ infrastructure（代理导出 only）

domain ──→ NOTHING
```

### 6.2 违规处理

| 违规 | 后果 | 正确做法 |
|------|------|---------|
| shared 导入 modules | 模块边界模糊 | 将共享逻辑提取到 domain 或 shared |
| domain 导入 infrastructure | 类型依赖实现 | 将类型定义移到 domain |
| modules 直接导入 infrastructure | 绕过 DI 容器 | 使用 DI 容器或 shared 代理导出 |
| 跨模块深层路径导入 | 破坏封装 | 使用桶文件 `@/modules/xxx` |

### 6.3 执行机制

依赖规则通过三层机制执行：

1. **ESLint 规则**：`@typescript-eslint/no-restricted-imports` 配置限制导入路径
2. **架构扫描脚本**：`check-architecture.mjs` 检测 DDD 违规、裸 SQL、深层路径导入
3. **CI 强制**：GitHub Actions 中执行 lint + architecture check，违规则构建失败

深层路径导入规则：

- 生产代码：error 级别（`@/modules/xxx/yyy/zzz` 禁止）
- 测试代码：warn 级别（允许，因为测试需要访问内部实现）

---

## 7. 模块系统

### 7.1 storyboard 模块

**规模**：19,878 行，5 个子域（planning、beat-editor、generation、template、prompt-editor）

> 故事创作流水线设计详见 [story-pipeline-design.md](story-pipeline-design.md) — 10 步流水线（7 Phase）、单入口 `/story` 路由、三栏布局设计。

**子域详解**：

**planning（规划）**：故事的整体规划，包括故事创建、故事列表、故事元数据管理。这是 storyboard 模块的入口子域，负责故事的生命周期管理。

**beat-editor（节拍编辑器）**：故事节拍（StoryBeat）的增删改查、排序、内容编辑。节拍是故事的最小叙事单元，包含标题、描述、关键帧（keyframe）等。

**generation（生成）**：批量 AI 生成故事内容。使用策略模式（Strategy Pattern）支持不同的生成策略。关键设计：脏状态抑制使用计数器（counter）而非布尔值——`suppressDirtyCountRef`，因为批量操作中多个异步操作可能同时抑制和恢复脏状态，布尔值无法处理嵌套场景。

**template（模板）**：故事模板的管理和应用。模板是预定义的故事结构，用户可以基于模板快速创建故事。

**prompt-editor（提示词编辑器）**：故事级别的提示词编辑，包括节拍提示词的定制和优化。

**关键设计决策**：

1. **脏状态计数器**：`useStoryState` 中的 `suppressDirtyCountRef` 使用计数器而非布尔值。原因：批量生成时，多个异步操作可能同时抑制脏状态标记，使用布尔值会导致先完成的操作错误地恢复脏状态标记，而后完成的操作仍在进行中。

```typescript
// 脏状态抑制机制
const suppressDirtyCountRef = useRef(0);

function suppressDirty() {
  suppressDirtyCountRef.current += 1;
}

function restoreDirty() {
  suppressDirtyCountRef.current = Math.max(0, suppressDirtyCountRef.current - 1);
}

function isDirtySuppressed() {
  return suppressDirtyCountRef.current > 0;
}
```

2. **批量生成策略模式**：不同的生成场景（全部节拍、选中节拍、空白节拍）使用不同的策略，策略通过 DI 注入或函数参数传递。

3. **storyboard 模块占比 32.5%**：这是已知架构债务，未来可能需要进一步拆分。

### 7.2 video 模块

**规模**：10,725 行，4 个子域（task-management、cache、recovery、utils）

**子域详解**：

**task-management（任务管理）**：视频任务的全生命周期管理，包括创建、查询、更新、删除、轮询、重试。核心组件：

- **VideoTaskManagerInitializer**：应用级初始化器，在 App 组件中挂载。页面组件**绝不能**调用 cleanup()（R62）
- **useVideoTaskStore**：Zustand store，管理视频任务状态。Quick 模式和 Story 模式共享此 store
- **TaskMachine**：视频任务状态机（详见第 9 节）
- **轮询引擎**：5-15 秒间隔，轮询 pending/generating/retrying 状态的任务

**cache（缓存）**：双层缓存架构：

- **第一层：内存 Object URL**：`URL.createObjectURL(blob)` 生成的临时 URL，页面刷新后失效
- **第二层：IndexedDB**：持久化存储视频 Blob，页面刷新后仍可用

缓存查找顺序：内存 URL → IndexedDB → 远程下载。命中缓存时避免重复下载，节省带宽和时间。

**recovery（恢复）**：智能重试引擎，根据错误类型差异化重试：

- 网络超时：指数退避重试
- 速率限制（429）：等待 min 5 秒后重试
- 认证失败：不重试，提示用户检查 API Key
- 服务端错误（5xx）：指数退避重试，最多 3 次

**utils（工具）**：视频相关的工具函数，包括 `mapApiStatus` 等。

**关键设计决策**：

1. **mapApiStatus(apiStatus, videoUrl?)**：当 videoUrl 存在时，即使 apiStatus 不是 "completed"，也返回 "completed"。这是因为某些 Provider 的状态更新延迟，但视频 URL 已经可用。

```typescript
function mapApiStatus(apiStatus: string, videoUrl?: string): VideoTaskStatus {
  if (videoUrl) return "completed";
  // ... 其他状态映射
}
```

2. **VideoTaskManagerInitializer 是应用级组件**：它管理轮询引擎的启动和停止。页面组件不得调用 cleanup()，否则会导致轮询引擎在页面切换时意外停止（R62）。

3. **13 个 AI Provider 插件**：volcengine、kuaishou、zhipu、pixverse、seedance、google、openai-sora、minimax、anthropic、openai-compatible、runway、luma、pika。每个插件实现 IVideoProvider 接口，通过 DI 容器注册。

### 7.3 shot 模块

**规模**：4,548 行，7 个子域

**子域详解**：

- **consistency-check（一致性检查）**：检查分镜之间的一致性，确保角色、场景等元素在连续分镜中保持一致
- **element-binding（元素绑定）**：管理分镜与角色、场景等元素的绑定关系
- **feature-extraction（特征提取）**：从分镜中提取视觉特征，用于一致性检查和参考图生成
- **reference-check（参考检查）**：检查分镜的参考图是否符合要求
- **shot-generation（分镜生成）**：AI 生成分镜图像
- **shot-instruction（分镜指令）**：管理分镜的 AI 生成指令（prompt）
- **shot-reference（分镜参考）**：管理分镜的参考图

**关键设计决策**：

1. **7 个子域的细粒度划分**：shot 模块虽然代码量中等，但子域数最多。这是因为分镜涉及多个独立关注点（一致性、元素绑定、特征提取、参考检查、生成、指令、参考），每个关注点有独立的演化节奏。

2. **elementManager 和 referenceEngine 是 DI 懒加载（Category E）**：这两个模块体积较大且不是所有场景都需要，因此使用懒加载避免循环依赖和不必要的初始化开销。

### 7.4 prompt 模块

**规模**：4,037 行，8 个子域（base、character、scene、beat-image、video、server-prompts、builder、presentation）

**子域详解**：

- **base**：Prompt 基础设施，定义 Prompt 模板和变量系统
- **character**：角色相关的 Prompt 生成
- **scene**：场景相关的 Prompt 生成
- **beat-image**：节拍图像相关的 Prompt 生成
- **video**：视频相关的 Prompt 生成
- **server-prompts**：服务端 Prompt 模板管理
- **builder**：PromptBuilder 单例，组合各子域的 Prompt 片段
- **presentation**：Prompt 相关的 UI 组件

**关键设计决策**：

1. **分层依赖结构**：base → character/scene/beat-image/video → builder。下层提供基础能力，上层组合使用。

2. **PromptBuilder 单例**：通过 DI 容器获取，确保全局只有一个实例。PromptBuilder 负责将各子域的 Prompt 片段组合成完整的 Prompt。

### 7.5 asset 模块

**规模**：2,697 行，5 个子域（asset-library、media-assets、import-export、hooks、presentation）

**子域详解**：

- **asset-library**：资产库管理，包括资产分类、标签、搜索
- **media-assets**：媒体资产管理，包括图片、视频、音频
- **import-export**：数据导入导出
- **hooks**：资产相关的 React hooks
- **presentation**：资产相关的 UI 组件

**关键设计决策**：

1. **Write-Then-Clean 模式**：导入数据时，先写入数据库，再清理无效数据。这确保导入过程的原子性——如果清理失败，数据仍然存在，可以手动清理。

2. **ASA 格式导出**：自定义的资产打包格式，包含资产元数据和媒体文件。

### 7.6 sync 模块

**规模**：2,286 行，2 个子域（engine、presentation）

**子域详解**：

- **engine**：同步引擎，负责数据同步的核心逻辑
- **presentation**：同步相关的 UI 组件

**关键设计决策**：

1. **向量时钟而非时间戳**：使用向量时钟（Vector Clock）判断数据的新旧关系，而非简单的时间戳比较。时间戳在时钟偏移或并发修改时可能产生错误判断，向量时钟能正确处理并发场景。

2. **engine 和 presentation 独立**：同步引擎不依赖 UI，可以在后台独立运行。

3. **`getDeviceId()` 异步化**：`src/modules/sync/engine/changelog.ts:74` 中的 `getDeviceId()` 为 `async function getDeviceId(): Promise<string>`，采用 **HTTP 优先 + IPC 回退 + 内存缓存** 策略：优先通过 HTTP `/api/config/get` 获取设备 ID，HTTP 不可用时回退到 `window.electronAPI` IPC，首次解析后缓存到内存。调用方必须 `await getDeviceId()`，不能同步使用。

### 7.7 character 模块

**规模**：1,231 行，3 个子域（services、hooks、presentation）

**子域详解**：

- **services**：角色 CRUD、服装管理、角色一致性检查
- **hooks**：角色相关的 React hooks（useCharacters、useCharacterDetail 等）
- **presentation**：角色相关的 UI 组件

**关键设计决策**：

1. **服装管理作为角色子功能**：服装（Outfit）是角色的子资源，不是独立实体。通过 `@/shared/outfit` 代理导出服装相关的纯函数。

2. **Result 模式贯穿**：所有 service 方法返回 `Result<T>`，调用方必须处理错误路径。

### 7.8 scene 模块

**规模**：886 行，3 个子域（services、hooks、presentation）

**子域详解**：

- **services**：场景 CRUD、场景一致性检查
- **hooks**：场景相关的 React hooks
- **presentation**：场景相关的 UI 组件

**关键设计决策**：

1. **与 character 模块对称设计**：scene 模块的结构和 API 与 character 模块保持对称，降低学习成本。

2. **脏状态时机精度**：场景修改的脏状态标记时机需要精确控制——过早标记会导致不必要的自动保存，过晚标记可能导致数据丢失。

### 7.9 persistence 模块

**规模**：434 行，2 个子域（hooks、services）

**子域详解**：

- **hooks**：useAutoSave、BeforeUnloadGuard
- **services**：持久化服务

**关键设计决策**：

1. **useAutoSave**：MAX_RETRY=3，MIN_INTERVAL=1s，支持 isDirty() 回调。自动保存使用乐观锁（ON CONFLICT...WHERE timestamp < excluded.timestamp），避免覆盖更新的数据。

2. **持久化失败必须重新标记脏状态（markDirty）**：如果自动保存失败，数据仍然需要保存，必须重新标记脏状态，确保下次自动保存时重试。

3. **BeforeUnloadGuard**：只拦截浏览器关闭事件，**不拦截路由切换**。路由切换时数据由自动保存处理，不需要额外拦截。

4. **事务性删除**：删除操作在事务中执行，同时清理本地文件（视频、图片等）。如果文件清理失败，数据库回滚，确保数据一致性。

```typescript
// 自动保存乐观锁
const sql = `
  INSERT INTO stories (id, data, timestamp)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    data = excluded.data,
    timestamp = excluded.timestamp
  WHERE timestamp < excluded.timestamp
`;
```

---

## 8. 数据模型与存储层

### 8.1 SQLite 配置

- **引擎**：better-sqlite3 12.10.0（版本锁定）
- **模式**：WAL（Write-Ahead Logging）
- **参数化查询**：所有 SQL 使用参数化语句，绝不使用字符串拼接
- **DDL 拦截**：preload 和主进程双重拦截 DDL 语句（DROP、ALTER、CREATE、TRUNCATE、ATTACH、DETACH）
- **SQL 注释剥离**：DDL 检测前先剥离 SQL 注释，防止通过注释绕过

### 8.2 7 字段基础列

所有业务表自动包含以下 7 个基础列：

| 列名 | 类型 | 用途 |
|------|------|------|
| owner_id | TEXT | 数据所有者 ID |
| created_at | TEXT | 创建时间（ISO 8601） |
| updated_at | TEXT | 更新时间（ISO 8601） |
| is_deleted | INTEGER | 软删除标记（0/1） |
| deleted_at | TEXT | 删除时间 |
| version | INTEGER | 乐观锁版本号 |
| sync_id | TEXT | 同步标识 |

基础列由 `schema-builder.ts` 的 `BASE_COLUMNS` 常量定义，`generateTableSQL()` 自动添加到每张业务表。

### 8.3 JSON 容器模式

易变字段存储在 JSON 列中，避免 ALTER TABLE：

| 容器名 | 用途 | 对应接口 |
|--------|------|---------|
| config | 任务配置 | VideoTaskConfig |
| provider | Provider 信息 | VideoTaskProvider |
| media_refs | 媒体引用 | MediaRefs |
| tracking | 追踪信息 | TrackingData |
| camera | 相机参数 | CameraData |
| generation | 生成参数 | GenerationData |
| meta | 元数据 | MetaData |
| appearance | 外观数据 | AppearanceData |

**更新模式**：使用 `json_set(COALESCE(container, '{}'), '$.key', ?)` 进行部分 JSON 容器更新，避免全量覆盖。

```typescript
// 部分更新 JSON 容器
const sql = `
  UPDATE video_tasks
  SET config = json_set(COALESCE(config, '{}'), '$.model', ?)
  WHERE id = ?
`;
```

**解析模式**：使用 `parseXxx()` 函数安全解析 JSON 容器。

```typescript
import { parseConfig, parseProvider, parseMediaRefs } from "@/infrastructure/storage/video-tasks/json-schemas";

const config = parseConfig(record.config); // 安全解析，无效 JSON 返回默认值
```

### 8.4 数据库表分类

**14 张业务表**：

stories、story_beats、characters、scenes、video_tasks、story_versions、character_outfits、elements、media_assets、video_templates、storyboard_assets、collections、ast_templates、generation_tasks

**5 张关系表**：

story_characters、story_scenes、story_elements、collection_assets、asset_tags

**6 张缓存表**：

video_cache、image_cache、error_logs、sessions、auto_saves、file_index

**3 张同步表**：

sync_changelog、sync_meta、sync_conflict_backup

**1 张系统表**：

users（独立创建，非 TableDef 模式）

### 8.5 Schema 版本与迁移

- **当前版本**：CURRENT_SCHEMA_VERSION=4
- **迁移框架**：`migrations.ts` 中的 `runMigrations(db, currentVersion)`
- **事务安全**：迁移在 `db.transaction()` 中执行，失败自动回滚
- **v3 迁移**：添加 local_video_path、local_keyframe_path、local_first_frame_path、local_last_frame_path 列
- **v4 迁移**：添加 collection_assets 表的 created_at、updated_at 列

```typescript
// 迁移执行
const MIGRATIONS: Record<number, (db: MigrationDb) => void> = {
  3: (db) => {
    // 添加本地路径列
  },
  4: (db) => {
    // 添加 collection_assets 时间戳列
  },
};

function runMigrations(db: MigrationDb, currentVersion: number): void {
  db.transaction(() => {
    for (let v = currentVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
      const migrate = MIGRATIONS[v];
      if (migrate) migrate(db);
    }
  });
}
```

### 8.6 索引策略

30+ 索引覆盖热查询路径：

- **主键索引**：所有表的 id 列
- **外键索引**：story_id、beat_id、task_id 等关联列
- **状态索引**：video_tasks 的 status 列（轮询引擎高频查询）
- **软删除索引**：is_deleted 列（过滤已删除记录）
- **时间索引**：created_at、updated_at 列（排序和范围查询）
- **复合索引**：(owner_id, is_deleted) 等常用过滤组合

### 8.7 SQL 安全

**参数化查询**：

```typescript
// ✅ 正确：参数化查询
const stmt = db.prepare("SELECT * FROM stories WHERE id = ?");
const story = stmt.get(storyId);

// ❌ 错误：字符串拼接
const story = db.get(`SELECT * FROM stories WHERE id = '${storyId}'`);
```

**DDL 拦截**：

preload.ts 和主进程双重拦截 DDL 语句：

```typescript
const DDL_PATTERNS = /\b(DROP|ALTER|CREATE|TRUNCATE|ATTACH|DETACH)\b/i;

function containsDDL(sql: string): boolean {
  // 先剥离 SQL 注释，防止通过注释绕过
  const stripped = sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return DDL_PATTERNS.test(stripped);
}
```

**安全更新/删除**：

`sql-sanitizer.ts` 提供 `buildSafeUpdate` 和 `buildSafeDelete`，确保 UPDATE/DELETE 语句始终包含 WHERE 条件：

```typescript
import { buildSafeUpdate, buildSafeDelete } from "@/shared/sql-safety";

const { sql, params } = buildSafeUpdate("video_tasks", {
  status: "completed",
  updated_at: new Date().toISOString(),
}, { id: taskId });
```

---

## 9. 视频任务状态机

### 9.1 状态定义

视频任务有 7 种状态：

| 状态 | 描述 | 可轮询 | 终态 | 可恢复 |
|------|------|--------|------|--------|
| pending | 等待生成 | ✓ | | |
| generating | 生成中 | ✓ | | |
| completed | 已完成 | | ✓ | |
| failed | 生成失败 | | | ✓ |
| cancelled | 已取消 | | ✓ | |
| retrying | 重试中 | ✓ | | |
| timeout | 生成超时 | | | ✓ |

**终态**：completed、cancelled（不可恢复）。failed 和 timeout 是可恢复状态，用户可手动重试。

### 9.2 状态转换图

```
pending ──→ generating ──→ completed
  │              │
  │              ↓
  │           failed ──→ retrying ──→ generating
  │              │
  │              ↓
  │           timeout ──→ retrying ──→ generating
  │              │
  ↓              ↓
cancelled    cancelled
```

**合法转换**：

- pending → generating：任务开始执行
- generating → completed：生成成功
- generating → failed：生成失败
- generating → timeout：生成超时（超时策略标记，非直接标 failed）
- generating → cancelled：用户取消
- failed → retrying：用户或自动重试
- timeout → retrying：用户重试超时任务
- retrying → generating：重试开始执行
- retrying → failed：重试失败
- retrying → cancelled：用户取消重试
- pending → cancelled：用户取消等待中的任务

### 9.3 状态转换副作用

| 转换 | 副作用 |
|------|--------|
| → generating | 重置 pollFailureCount 为 0 |
| → completed | 设置 progress=100，设置 videoUrl |
| → failed | 设置 message 为错误信息 |
| → timeout | 设置 message 为超时信息 |
| → pending | 清除 videoUrl 和 progress |

### 9.4 网络错误识别

`isNetworkError()` 函数识别 14 种网络错误模式（ECONNREFUSED、ECONNRESET、ENOTFOUND、ETIMEDOUT、EPIPE、EAI_AGAIN、ENETUNREACH、EHOSTUNREACH、SOCKET_HANG_UP、ECONNABORTED、fetch failed、network error、Failed to fetch、NetworkError），网络错误**不累计** pollFailureCount，避免因临时网络问题导致任务误判为失败。

### 9.5 可恢复状态

`isRecoverable()` 函数判断任务是否可恢复：failed 和 timeout 状态返回 true，用户可手动重试这些任务。completed 和 cancelled 是终态，不可恢复。

### 9.6 轮询引擎

轮询引擎负责定期检查 pending/generating/retrying 状态的任务：

- **轮询间隔**：5-15 秒（根据任务数量动态调整）
- **轮询条件**：存在 pending/generating/retrying 状态的任务时才轮询
- **轮询流程**：查询任务状态 → 调用 Provider API 获取最新状态 → 更新本地状态
- **错误处理**：单个任务轮询失败不影响其他任务（R46：轮询引擎状态标志必须按正确顺序重置，顶层 catch 捕获）
- **超时处理**：超时策略将超时任务标记为 timeout 状态（而非直接标 failed），用户可手动重试

### 9.7 withTransitionGuard

状态转换使用 `withTransitionGuard` 保护：

- **开发模式**：非法状态转换抛出 `TransitionError`，立即暴露问题
- **生产模式**：非法状态转换静默剥离 status 字段，不崩溃

```typescript
function withTransitionGuard(
  current: VideoTaskStatus,
  target: VideoTaskStatus,
  transition: () => void
): void {
  if (isValidTransition(current, target)) {
    transition();
  } else {
    if (import.meta.env.DEV) {
      throw new TransitionError(`Invalid: ${current} → ${target}`);
    }
    // 生产模式：静默忽略
  }
}
```

---

## 10. 网络韧性层

### 10.1 三层架构

网络韧性层由三个独立但协作的层组成：

```
┌─────────────────────────────────────────┐
│  第 1 层：Circuit Breaker（熔断器）       │
│  防止向故障 Provider 发送请求             │
├─────────────────────────────────────────┤
│  第 2 层：Resilient Fetch（弹性获取）     │
│  自动重试 + 指数退避 + 抖动 + 断点续传     │
├─────────────────────────────────────────┤
│  第 3 层：API Retry（API 重试）           │
│  429 最小 5 秒延迟 + 指数退避 + 抖动      │
└─────────────────────────────────────────┘
```

### 10.2 Circuit Breaker

熔断器防止向故障 Provider 持续发送请求，避免资源浪费和级联故障。

**三种状态**：

- **CLOSED**：正常状态，请求正常通过
- **OPEN**：熔断状态，请求直接失败，不发送到 Provider
- **HALF_OPEN**：半开状态，允许少量请求通过以测试 Provider 是否恢复

**参数**：

| 参数 | 值 | 说明 |
|------|-----|------|
| failureThreshold | 3 | 连续失败 3 次后熔断 |
| recoveryTimeout | 30s | 熔断 30 秒后进入半开状态 |
| halfOpenMaxRequests | 1 | 半开状态允许 1 个请求通过 |

**Per-Provider 隔离**：每个 Provider 有独立的熔断器实例，一个 Provider 故障不影响其他 Provider。

```typescript
class CircuitBreaker {
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = "HALF_OPEN";
      } else {
        throw new CircuitOpenError();
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
    }
  }
}
```

### 10.3 Resilient Fetch

弹性 Fetch 提供自动重试、指数退避、抖动、分块下载和断点续传能力。

**特性**：

- **自动重试**：失败后自动重试，最多 3 次
- **指数退避**：重试间隔按指数增长（1s, 2s, 4s）
- **抖动（Jitter）**：在退避间隔上添加随机抖动，避免多个客户端同时重试（雷群效应）
- **分块下载**：大文件分块下载，支持进度回调
- **断点续传**：下载中断后可从上次位置继续

```typescript
async function resilientFetch(
  url: string,
  options?: ResilientFetchOptions
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelay ?? 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status === 429) {
        const retryAfter = Math.max(5, parseInt(response.headers.get("Retry-After") ?? "5"));
        await sleep(retryAfter * 1000 + jitter());
        continue;
      }
      if (response.status >= 500 && attempt < maxRetries) {
        await sleep(baseDelay * Math.pow(2, attempt) + jitter());
        continue;
      }
      return response;
    } catch (error) {
      if (attempt < maxRetries) {
        await sleep(baseDelay * Math.pow(2, attempt) + jitter());
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}
```

### 10.4 API Retry

API 调用级别的重试机制，处理 429 速率限制和服务端错误。

**特性**：

- **429 最小 5 秒延迟**：遇到 429 时，至少等待 5 秒再重试
- **指数退避 + 抖动**：重试间隔按指数增长，添加随机抖动
- **最大重试次数**：3 次

```typescript
async function apiCallWithRetry<T>(
  fn: () => Promise<T>,
  options?: ApiRetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelay ?? 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof RateLimitError) {
        const delay = Math.max(5000, baseDelay * Math.pow(2, attempt) + jitter());
        await sleep(delay);
        continue;
      }
      if (error instanceof ApiError && error.statusCode >= 500 && attempt < maxRetries) {
        await sleep(baseDelay * Math.pow(2, attempt) + jitter());
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}
```

### 10.5 错误分类体系

**12 个错误域**：

| 域 | 描述 |
|----|------|
| database | 数据库操作 |
| validation | 数据验证 |
| api | 外部 API |
| network | 网络连接 |
| storage | 本地存储 |
| generation | AI 生成 |
| recovery | 错误恢复 |
| cache | 缓存管理 |
| config | 配置管理 |
| auth | 认证授权 |
| state | 状态管理 |
| system | 系统级操作 |

**35 个结构化错误码**：每个错误码有唯一标识符和描述，例如 `API_TIMEOUT`、`RATE_LIMIT_ERROR`、`AUTHENTICATION_ERROR` 等。

**9 个错误类别**：

| 类别 | 描述 |
|------|------|
| timeout | 超时类错误 |
| rate_limit | 速率限制 |
| quota | 配额不足 |
| invalid_params | 参数无效 |
| network | 网络问题 |
| server_error | 服务端错误 |
| database_busy | 数据库繁忙 |
| auth | 认证失败 |
| unknown | 未知错误 |

**两阶段分类**：

1. **ERROR_CATEGORY_MAP（精确匹配）**：根据错误码精确映射到类别
2. **CATEGORY_PATTERNS（正则回退）**：错误码不匹配时，使用正则表达式匹配错误消息

```typescript
const ERROR_CATEGORY_MAP: Record<string, ErrorCategory> = {
  TIMEOUT_ERROR: "timeout",
  RATE_LIMIT_ERROR: "rate_limit",
  NETWORK_ERROR: "network",
  DATABASE_ERROR: "database_busy",
  AUTHENTICATION_ERROR: "auth",
  VALIDATION_ERROR: "invalid_params",
  API_ERROR: "server_error",
  // ...
};

const CATEGORY_PATTERNS: Array<{ category: ErrorCategory; patterns: RegExp[] }> = [
  { category: "timeout", patterns: [/timeout/i, /ETIMEDOUT/] },
  { category: "rate_limit", patterns: [/rate[\s_-]?limit/i, /429/] },
  { category: "quota", patterns: [/quota/i, /insufficient/i] },
  // ...
];

function classifyError(errorCode?: string, errorMessage?: string): ErrorCategory {
  if (errorCode && ERROR_CATEGORY_MAP[errorCode]) {
    return ERROR_CATEGORY_MAP[errorCode];
  }
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    if (patterns.some(p => p.test(errorMessage ?? ""))) {
      return category;
    }
  }
  return "unknown";
}
```

这种两阶段分类避免了脆弱的字符串匹配反模式（参见编码规范中的"脆弱字符串匹配"反模式）。

---

# 第三部分：基础设施

---

## 11. Electron 主进程架构

### 11.1 进程模型

PrismCraft 使用 Electron 的标准双进程模型：

```
┌──────────────────────────────────────────────────────┐
│  Main Process（Node.js）                              │
│  - 窗口管理（createWindow）                            │
│  - 生命周期（app 事件）                                │
│  - IPC 处理（database、config、sync、secure-config）    │
│  - 数据库（better-sqlite3）                            │
│  - HTTP API Server（渲染进程通信）                      │
│  - 安全（SSRF guard、密钥存储）                         │
│  - 日志（ConsoleTransport + FileTransport）             │
│  - 插件（Plugin registry、Provider loader）             │
├──────────────────────────────────────────────────────┤
│  Preload Script                                       │
│  - IPC bridge（contextBridge.exposeInMainWorld）       │
│  - 权限系统（5 级）                                    │
│  - 速率限制（per-channel）                             │
│  - DDL 拦截                                           │
│  - 安全日志（log:security）                            │
├──────────────────────────────────────────────────────┤
│  Renderer Process（Chromium）                          │
│  - Vite SPA（React 19 + React Router 7）              │
│  - 通过 electronAPI 调用主进程                          │
│  - 通过 HTTP API Server 通信                           │
└──────────────────────────────────────────────────────┘
```

### 11.2 入口文件

- **main.ts**：生产模式入口，minLevel: info，日志文件名: app
- **main-dev.ts**：开发模式入口，minLevel: debug，日志文件名: dev
- **main-common.ts**：共享逻辑：createWindow、静态服务器、gracefulShutdown、config IPC

### 11.3 窗口管理

```typescript
function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 开发模式：加载 Vite dev server
  // 生产模式：加载静态文件服务器
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    startStaticServer(mainWindow);
  }

  return mainWindow;
}
```

### 11.4 HTTP API Server

渲染进程与主进程通过 HTTP API Server 通信（而非纯 IPC），原因：

- HTTP 请求/响应模型更清晰，支持流式响应
- 可以使用标准 HTTP 状态码和错误处理
- 支持请求追踪和连接管理

**模块化结构**（从原单文件 api-server.ts 拆分为 5 个模块）：

| 模块 | 职责 |
|------|------|
| `api/types.ts` | Route、RouteHandler、ApiResponse 类型定义，含 `defineRoute()` 辅助函数 |
| `api/middleware.ts` | 限流、CORS、X-Electron-App 鉴权、连接追踪 |
| `api/schemas.ts` | 40+ 路由的 Zod schema 定义，请求体运行时类型校验 |
| `api/routes.ts` | 路由注册表，连接 schema 与 handler |
| `api/server.ts` | HTTP 服务器启停、请求分发、schema 验证 |

`api-server.ts` 改为 re-export，保持向后兼容。

**路由组** (`api/route-groups/`，共 7 个)：

| 路由组 | 说明 |
|--------|------|
| `core-routes.ts` | 核心路由（含 `config/get`、`config/set`） |
| `db-routes.ts` | 数据库路由 |
| `file-routes.ts` | 文件路由（`file/write`、`file/write-binary`、`file/cache-directory`、`file/disk-space`；JSON 限 `MAX_WRITE_SIZE = 100MB`，octet-stream 限 `MAX_WRITE_BINARY_SIZE = 500MB`；流式下载 `/api/download/to-file`） |
| `generation-routes.ts` | AI 生成路由 |
| `plugin-routes.ts` | 插件管理路由 |
| `shot-routes.ts` | 分镜系统路由 |
| `storyboard-routes.ts` | 分镜板生成路由 |

**新增 HTTP 路由**（5 个）：

| 路由 | 说明 | 所属路由组 |
|------|------|-----------|
| `POST /api/config/get` | 单键配置查询 | core-routes.ts |
| `POST /api/config/set` | 单键配置写入 | core-routes.ts |
| `POST /api/file/write` | 文件写入（JSON 路径限 `MAX_WRITE_SIZE = 100MB`；`file/write-binary` 路径限 `MAX_WRITE_BINARY_SIZE = 500MB`；流式下载 `/api/download/to-file` 无内存上限） | file-routes.ts |
| `GET /api/file/cache-directory` | 缓存目录查询 | file-routes.ts |
| `GET /api/file/disk-space` | 磁盘空间查询 | file-routes.ts |

**Zod Schema 验证流程**：

1. 路由注册时关联 Zod schema（`Route.schema` 字段）
2. 请求到达时，先经 `schema.safeParse(body)` 验证
3. 验证失败返回 400 + 字段级错误（`path` + `message`）
4. 验证成功后，handler 接收的 `body` 已是经过类型推断的精确类型
5. `defineRoute()` 辅助函数提供泛型重载，使 handler 自动从 schema 推断参数类型

**连接追踪**：

```typescript
const activeConnections: Set<net.Socket> = new Set();

server.on("connection", (socket) => {
  activeConnections.add(socket);
  socket.on("close", () => activeConnections.delete(socket));
});

// 优雅关闭时销毁所有连接
function stopApiServer(): void {
  for (const socket of activeConnections) {
    socket.destroy();
  }
  server.close();
}
```

### 11.5 插件系统

主进程管理 AI Provider 插件，支持三种插件形式：

| 插件类型 | 格式 | 位置 | 加载器 |
|----------|------|------|--------|
| 内置 | TypeScript 类 | `electron/src/plugins/providers/` | 直接导入 |
| 声明式 | `.plugin.json` | `~/PrismCraft/UserPlugins/` | `UserPluginAdapter` |
| 代码 | `.plugin.js` | `~/PrismCraft/CodePlugins/` | `CodePluginAdapter`（进程隔离） |

13 个内置 Provider 插件：

1. volcengine（火山引擎）
2. kuaishou（快手）
3. zhipu（智谱）
4. pixverse
5. seedance
6. google
7. openai-sora
8. minimax
9. anthropic
10. openai-compatible（通用 OpenAI 兼容接口）
11. runway
12. luma
13. pika

**代码插件进程隔离**：

代码插件通过 `PluginProcessManager` 在独立子进程中运行（`child_process.fork()`），提供 OS 级安全隔离。子进程内部使用 `vm.createContext()` 沙箱作为纵深防御：

- 资源限制：`--max-old-space-size=64`、`--max-semi-space-size=16`
- 崩溃保护：60 秒窗口内最多 3 次崩溃，超限自动禁用
- 调用超时：10 秒
- 优雅关闭：发送 `shutdown` 消息，等待 3 秒后 `SIGKILL`
- 沙箱预扫描：拒绝包含 `__proto__`、`Reflect`、`Proxy` 等逃逸模式的插件

---

## 12. IPC 安全体系

### 12.1 五级权限系统

所有 IPC 通道必须在 `preload.ts` 的 `IPC_PERMISSIONS` 中注册，权限分为 5 级：

| 级别 | 描述 | 典型用途 |
|------|------|---------|
| READONLY | 只读操作 | 查询数据、读取配置 |
| READWRITE | 读写操作 | 创建、更新数据 |
| DANGEROUS | 危险操作 | 删除数据、执行 SQL |
| SYSTEM | 系统操作 | 窗口控制、应用退出 |
| SECURE | 安全操作 | API Key 读写（加密存储） |

### 12.2 速率限制

每个 IPC 通道有独立的速率限制：

```typescript
const IPC_PERMISSIONS: Record<string, IPCPermission> = {
  "db:query": { level: "READONLY", rateLimit: { max: 100, window: 60000 } },
  "db:run": { level: "READWRITE", rateLimit: { max: 50, window: 60000 } },
  "db:transaction": { level: "DANGEROUS", rateLimit: { max: 20, window: 60000 } },
  "secure-config:get": { level: "SECURE", rateLimit: { max: 30, window: 60000 } },
  "secure-config:set": { level: "SECURE", rateLimit: { max: 10, window: 60000 } },
};
```

### 12.3 DDL 拦截

preload 和主进程双重拦截 DDL 语句：

1. **preload 层**：在 IPC 调用前检查 SQL 是否包含 DDL 语句
2. **主进程层**：在执行 SQL 前再次检查

SQL 注释在 DDL 检测前被剥离，防止通过注释绕过：

```typescript
// 剥离注释后的 DDL 检测
function containsDDL(sql: string): boolean {
  const stripped = sql
    .replace(/--.*$/gm, "")      // 单行注释
    .replace(/\/\*[\s\S]*?\*\//g, ""); // 多行注释
  return /\b(DROP|ALTER|CREATE|TRUNCATE|ATTACH|DETACH)\b/i.test(stripped);
}
```

### 12.4 安全日志

preload 中的安全事件通过 `log:security` IPC 通道转发到主进程日志：

- 速率限制触发
- DDL 拦截
- 权限不足的 IPC 调用
- 异常的 IPC 调用模式

---

## 13. 依赖注入体系

### 13.1 DI 容器设计

DI 容器使用 `createToken()` 模式，每个 token 有唯一的标识符和类型：

```typescript
import { createToken } from "@/infrastructure/di";

const container = {
  // Category A: Domain Port 实现
  videoTaskStorage: createToken<IVideoTaskStorage>("videoTaskStorage"),
  characterStorage: createToken<ICharacterStorage>("characterStorage"),
  // ...

  // Category B: 有状态服务
  eventBus: createToken("eventBus"),
  apiClient: createToken("apiClient"),
  // ...

  // Category C: Storage 实例
  versionStorage: createToken("versionStorage"),
  // ...

  // Category D: Repository 实例
  mediaAssetRepository: createToken("mediaAssetRepository"),

  // Category E: 懒加载模块
  elementManager: createToken("elementManager"), // 懒加载，避免循环依赖
  referenceEngine: createToken("referenceEngine"), // 懒加载，避免循环依赖
};
```

### 13.2 六类 Token

| 分类 | 数量 | 描述 | 示例 |
|------|------|------|------|
| A. Domain Port 实现 | 13 | Port 接口的实现 | videoProvider, characterStorage |
| B. 有状态服务 | 6 | 需要测试替换的单例 | eventBus, apiClient |
| C. Storage 实例 | 18 | 有状态的存储模块 | versionStorage, videoCacheStorage |
| D. Repository 实例 | 1 | Drizzle ORM 仓库 | mediaAssetRepository |
| E. 懒加载模块 | 4 | 动态 import 加载，避免循环依赖 | elementManager, referenceEngine, syncEngine |
| F. Agent 服务 | 4 | Agent 模块动态导入（E 类特化） | agentToolRegistry, agentToolExecutor |
| **合计** | **46** | | |

### 13.3 使用方式

**获取实例**：

```typescript
import { container } from "@/infrastructure/di";

const storage = container.videoTaskStorage;
const tasks = await storage.getByStoryId(storyId);
```

**测试中替换**：

```typescript
import { overrideToken } from "@/infrastructure/di";
import { container } from "@/infrastructure/di";

const mockStorage = {
  getByStoryId: vi.fn().mockResolvedValue([]),
  // ...
};

overrideToken(container.videoTaskStorage, () => mockStorage);
```

### 13.4 DI Token 准则

仅注册以下类型的依赖：

1. **Port 接口实现**：模块定义 Port 接口，infrastructure 提供实现
2. **有状态服务**：单例，需要测试替换
3. **Storage 实例**：有状态，不能直接导入

**不注册 DI 的**：

- `@/shared/*` 的纯函数（如 `resolveImageUrl`、`getErrorMessage`）→ 直接导入
- `@/infrastructure/*` 的纯函数 → 通过 `@/shared/` 代理导出

### 13.5 代理导出清单

| 代理模块 | 导出内容 | 来源 |
|----------|---------|------|
| @/shared/db-core | withRetry, safeQuery, safeRun, safeTransaction | @/infrastructure/storage/utils |
| @/shared/api-config | API 配置相关 | @/infrastructure/api |
| @/shared/video-cache | 视频缓存相关 | @/infrastructure/storage/video-cache |
| @/shared/file-http | 统一文件操作通信层 (HTTP 优先 + IPC 回退) | @/shared/file-http (导出 `writeFile`, `readFile`, `getFileInfo`, `getCacheDirectory`, `getDiskSpace`, `fileExists`, `deleteFile`) |
| @/shared/outfit | 服装管理纯函数 | @/infrastructure/outfit |
| @/shared/sql-safety | buildSafeUpdate, buildSafeDelete, sanitizeIdentifier, sanitizeTable | @/infrastructure/sql-sanitizer |
| @/shared/model-capabilities | 模型能力查询 | @/infrastructure/ai-providers |
| @/shared/user-facing-error | mapUserFacingError | @/infrastructure/error-mapping |

---

## 14. 日志系统

### 14.1 双传输架构

日志系统使用 Transport 模式，支持多种输出目标：

- **ConsoleTransport**：输出到控制台（开发调试）
- **FileTransport**：输出到文件（生产排查）

### 14.2 初始化

```typescript
// main.ts（生产模式）
loggerRegistry.setDefaultTransports([
  new ConsoleTransport({ minLevel: "info" }),
  new FileTransport({ minLevel: "info", filename: "app" }),
]);

// main-dev.ts（开发模式）
loggerRegistry.setDefaultTransports([
  new ConsoleTransport({ minLevel: "debug" }),
  new FileTransport({ minLevel: "debug", filename: "dev" }),
]);
```

### 14.3 日志文件位置

| 模式 | 路径 |
|------|------|
| 生产 | %APPDATA%/ai-animation-studio/logs/app-YYYY-MM-DD.log |
| 开发 | %APPDATA%/ai-animation-studio/logs/dev-YYYY-MM-DD.log |

### 14.4 日志轮转

- **文件大小限制**：10MB
- **轮转策略**：超过 10MB 时重命名为 `.1` 备份
- **最大文件数**：5 个
- **清理策略**：超过 5 个日志文件时删除最旧的

### 14.5 刷新策略

- **定时刷新**：5 秒间隔
- **立即刷新**：队列中条目超过 100 条时立即刷新

### 14.6 Logger 方法签名

```typescript
logger.info(message: string, context?: LogContext)   // 2 参数
logger.warn(message: string, context?: LogContext)   // 2 参数
logger.error(message: string, error?: Error, context?: LogContext)  // 3 参数
```

### 14.7 生产代码日志规范

生产代码必须使用 `errorLogger` 而非 `console.warn` / `console.error`：

```typescript
// ✅ 正确
import { errorLogger } from "@/shared/utils/error-logger";
errorLogger.error("Failed to save video task", error, { taskId });

// ❌ 错误
console.error("Failed to save video task", error);
```

### 14.8 日志脱敏

错误日志在写入前自动脱敏，移除 API Key 模式：

```typescript
const API_KEY_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,      // OpenAI 格式
  /AK[a-zA-Z0-9]{16,}/g,       // 阿里云格式
  /[a-f0-9]{32}/g,              // 通用 Hex 格式
];

function sanitizeLog(message: string): string {
  return API_KEY_PATTERNS.reduce(
    (msg, pattern) => msg.replace(pattern, "[REDACTED]"),
    message
  );
}
```

---

## 15. 安全机制

### 15.1 API Key 存储

#### 15.1.1 双层存储架构（v0.12.1+）

API Key 采用**双层存储**架构，分离元数据与敏感数据：

| 层 | 存储介质 | 内容 | 加密方式 |
|----|---------|------|---------|
| 元数据层 | `electron-store` (`config-metadata.json`) | provider 配置、baseUrl、model | electron-store encryptionKey（基于 safeStorage 派生） |
| 敏感数据层 | `keyStorage`（`keys.enc`） | apiKey 明文 | Electron safeStorage + AES-256-GCM |

**`$secure:` 引用机制**：元数据层不存明文 apiKey，只存引用 `$secure:providerId`，运行时由 `loadConfigAsync()` 解析为真实 apiKey。

```typescript
// config-metadata.json（脱敏后）
{
  "openai": {
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "$secure:openai"   // ← 引用，非明文
  }
}
```

#### 15.1.2 saveConfigAsync 异步持久化流程

前端 `saveConfig` → HTTP `/api/config/set` → `applyConfigValue` → `saveConfigAsync` → `keyStorage.save`：

```typescript
// 1. 前端 storage.ts
saveConfig(config) → httpConfigSet("ai_animation_studio_api_config", JSON.stringify(config))

// 2. /api/config/set 路由（core-routes.ts）
const config = await loadConfigAsync();
applyConfigValue(config, "ai_animation_studio_api_config", value);  // value 可能是 JSON 字符串
const saved = await saveConfigAsync(config);  // ✅ 异步持久化到 keyStorage

// 3. applyConfigValue 必须正确解析字符串（R182）
if (typeof value === "string") {
  apiConfig = JSON.parse(value);  // ❌ 不解析会导致 typeof "object" 永远 false
}

// 4. saveConfigAsync 提取 apiKey 字段，存入 keyStorage，替换为 $secure: 引用
for (const [providerId, provider] of Object.entries(config.providers)) {
  if (provider.apiKey && !provider.apiKey.startsWith("$secure:")) {
    await keyStorage.save(`$secure:${providerId}`, provider.apiKey);
    provider.apiKey = `$secure:${providerId}`;
  }
}
```

#### 15.1.3 sync vs async 持久化 API

| 函数 | 同步性 | 行为 | 使用场景 |
|------|--------|------|---------|
| `saveConfig(config)` | sync | 检测到明文 apiKey 必须 **throw**（R182） | 仅用于无 apiKey 的配置项 |
| `saveConfigAsync(config)` | async | 提取 apiKey 存入 keyStorage，写入 `$secure:` 引用 | **所有含 apiKey 的配置必须用此函数** |
| `loadConfig()` | sync | 不解析 `$secure:` 引用，返回引用字符串 | 仅历史兼容 |
| `loadConfigAsync()` | async | 解析 `$secure:` 引用，返回真实 apiKey | **运行时读取必须用此函数** |

#### 15.1.4 keyStorage 策略层

```typescript
// SafeStorageStrategy（主策略）
- Electron safeStorage + AES-256-GCM
- dataCache 内存缓存 + writeChain Promise 链串行化（防并发覆盖）
- 文件格式：{ iv, ciphertext } 二进制

// PlaintextFallbackStrategy（回退策略，v0.12.1 改为 fail-close）
- safeStorage 不可用时回退
- ❌ v0.12.1 前：接受明文 JSON（安全漏洞）
- ✅ v0.12.1 后：fail-close，仅接受加密格式
```

#### 15.1.5 旧版 secure-config IPC（兼容层）

历史 API，仍可用但推荐迁移到 `/api/config/*` HTTP 路由：

```typescript
// 渲染进程
await window.electronAPI.invoke("secure-config:set", { key: "volcengine-api-key", value: apiKey });

// 主进程（electron-store 加密存储）
ipcMain.handle("secure-config:set", async (_event, { key, value }) => {
  secureStore.set(key, value);
});
```

**禁止**将 API Key 存储在 localStorage 或使用 XOR 混淆。

#### 15.1.6 API Key 自动检测（v0.12.1+）

ProviderCard 组件提供四态 API Key 状态指示器：

| 状态 | 图标 | 触发条件 |
|------|------|---------|
| idle | — | 初始状态或未配置 apiKey |
| verifying | Loader2 | 正在调用 testConnection 验证 |
| valid | CheckCircle2 | testConnection 返回 success |
| invalid | AlertCircle | testConnection 返回 failure |

`maskApiKeyForDisplay(apiKey)` 函数检测 `$secure:` 引用前缀并显示占位符 `••••••••`，避免引用字符串泄露给用户。

### 15.2 SSRF 防护

主进程所有 HTTP 请求经过 SSRF guard，**对非 loopback 主机启用 SSRF 校验，loopback 主机信任**（与 ARCHITECTURE.md 一致，对应回归规则 R105）：

- **IPv4**：阻止 10.0.0.0/8、172.16.0.0/12、192.168.0.0/16、127.0.0.0/8
- **IPv6**：阻止 ::1/128、fe80::/10（链路本地）
- **IPv6 链路本地检测**：使用第一个 hextet解析，`(value & 0xffc0) === 0xfe80`
- **Loopback 信任**：目标主机为 loopback (127.0.0.0/8、::1) 时跳过 SSRF 校验，允许本地 HTTP API Server 通信

```typescript
function isIPv6LinkLocal(address: string): boolean {
  const firstHextet = parseInt(address.split(":")[0], 16);
  return (firstHextet & 0xffc0) === 0xfe80;
}
```

### 15.3 X-Electron-App Header

所有 API 请求必须携带 `X-Electron-App` header，服务端验证：

```typescript
import { ELECTRON_APP_HEADERS } from "@/config/constants";

fetch(url, {
  headers: {
    ...ELECTRON_APP_HEADERS,
    "Content-Type": "application/json",
  },
});
```

### 15.4 错误日志脱敏

参见 14.8 节。API Key 模式在日志写入前自动脱敏。

### 15.5 IPC 权限与速率限制

参见第 12 节。5 级权限系统 + per-channel 速率限制。

### 15.6 Context Isolation

Electron 启用 context isolation，preload 脚本通过 `contextBridge.exposeInMainWorld` 暴露有限的 API：

```typescript
contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!isPermittedChannel(channel)) {
      logSecurity("blocked-channel", { channel });
      throw new Error("IPC channel not permitted");
    }
    if (isRateLimited(channel)) {
      logSecurity("rate-limited", { channel });
      throw new Error("Rate limit exceeded");
    }
    return ipcRenderer.invoke(channel, ...args);
  },
});
```

---

# 第四部分：开发指南

---

## 16. 快速开始

### 16.1 环境要求

| 工具 | 最低版本 | 推荐版本 |
|------|---------|---------|
| Node.js | 18.x | 20.x LTS |
| npm | 9.x | 10.x |
| PowerShell | 5.1 | 7.x |
| Git | 2.x | 最新 |

### 16.2 克隆与安装

```bash
git clone <repository-url>
cd prismcraft
npm install
```

**注意**：`npm install` 会根据 `.npmrc` 中的镜像配置下载 Electron 二进制文件。如果镜像不可用，可以手动设置环境变量：

```bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

### 16.3 开发模式

```bash
# 仅前端开发（Vite dev server，无 Electron）
npm run dev

# Electron 开发模式
npm run dev:electron
```

### 16.4 构建

```bash
# Vite 生产构建（web 模式）
npm run build

# 完整 Electron 构建（Vite + Electron TS + 文件复制）
npm run build:electron

# Windows 安装包
npm run build:win

# macOS DMG
npm run build:mac
```

### 16.5 验证

```bash
# 完整验证（typecheck + lint + architecture + tests）
npm run validate

# 含覆盖率报告的完整验证
npm run validate:full
```

### 16.6 测试

```bash
# 运行所有测试
npm run test

# 带覆盖率
npm run test:coverage

# 运行特定模块测试
npx vitest run src/modules/storyboard

# better-sqlite3 需要为 Node.js 重建
npm rebuild better-sqlite3
```

---

## 17. 项目结构详解

### 17.1 根目录

```
prismcraft/
├── src/                    → 前端源码
├── electron/               → Electron 主进程源码
├── public/                 → 静态资源
├── out/                    → 构建输出
├── docs/                   → 文档
├── scripts/                → 构建和验证脚本
├── .github/workflows/      → CI/CD 配置
├── .husky/                 → Git hooks
├── .trae/rules/            → AI 规则
├── vite.config.ts          → Vite 配置
├── tsconfig.json           → TypeScript 配置（前端）
├── electron/tsconfig.json  → TypeScript 配置（主进程）
├── tsconfig.test.json      → TypeScript 配置（测试）
├── vitest.config.ts        → Vitest 配置
├── eslint.config.js        → ESLint 配置
├── package.json            → 项目配置
├── .npmrc                  → npm 镜像配置
└── build-electron.ps1      → Electron 构建脚本
```

### 17.2 src/ 目录

```
src/
├── domain/                 → 纯类型、Schema、Result 类型
│   ├── types/              → 业务类型定义
│   ├── result.ts           → Result 类型（ok/err）
│   ├── errors.ts           → 语义化错误类和错误码
│   └── index.ts            → 桶文件
├── modules/                → 42 个业务模块（完整清单见 MODULES.md）
│   ├── storyboard/         → 分镜板模块（原 story 模块）
│   │   ├── index.ts        → 公共 API
│   │   ├── MODULE.md       → 模块契约
│   │   ├── planning/       → 规划子域
│   │   ├── beat-editor/    → 节拍编辑子域
│   │   ├── generation/     → 生成子域
│   │   ├── template/       → 模板子域
│   │   └── prompt-editor/  → 提示词编辑子域
│   ├── video/              → 视频模块
│   ├── shot/               → 分镜模块
│   ├── prompt/             → Prompt 模块
│   ├── asset/              → 资产模块
│   ├── sync/               → 同步模块
│   ├── character/          → 角色模块
│   ├── scene/              → 场景模块
│   └── persistence/        → 持久化模块
├── infrastructure/         → 基础设施
│   ├── di/                 → DI 容器
│   ├── storage/            → 存储模块
│   ├── api/                → API 客户端
│   ├── ai-providers/       → AI Provider 插件
│   └── network/            → 网络韧性层
├── shared/                 → 跨切面工具
│   ├── ui/                 → 跨切面 UI 组件
│   ├── utils/              → 工具函数
│   ├── constants/          → 常量和 i18n
│   ├── db-core.ts          → 数据库代理导出
│   ├── api-config.ts       → API 配置代理导出
│   ├── video-cache.ts      → 视频缓存代理导出
│   ├── file-http/          → 统一文件操作通信层代理导出 (HTTP 优先 + IPC 回退)
│   ├── outfit.ts           → 服装管理代理导出
│   ├── sql-safety.ts       → SQL 安全代理导出
│   ├── model-capabilities.ts → 模型能力代理导出
│   └── user-facing-error.ts  → 用户错误映射代理导出
├── app/                    → 页面和布局
│   ├── pages/              → 页面组件
│   ├── layouts/            → 布局组件
│   └── routes.tsx          → 路由配置
└── config/                 → 配置
    ├── constants.ts        → 常量
    └── ports.ts            → 端口配置
```

### 17.3 electron/ 目录

```
electron/
├── src/
│   ├── main.ts             → 生产入口
│   ├── main-dev.ts         → 开发入口
│   ├── main-common.ts      → 共享逻辑
│   ├── api-server.ts       → Re-export（向后兼容入口）
│   ├── api/                → HTTP API Server（模块化）
│   │   ├── types.ts        → Route/RouteHandler/ApiResponse 类型 + defineRoute()
│   │   ├── middleware.ts    → 限流、CORS、鉴权、连接追踪
│   │   ├── schemas.ts      → 40+ 路由的 Zod schema 定义
│   │   ├── routes.ts       → 路由注册表
│   │   └── server.ts       → HTTP 服务器启停、请求分发、schema 验证
│   ├── preload.ts          → IPC bridge
│   ├── database/           → 数据库
│   │   ├── connection.ts   → SQLite 连接
│   │   ├── schema-builder.ts → Schema 构建器
│   │   ├── schema.ts       → Schema 定义
│   │   └── migrations.ts   → 迁移框架
│   ├── handlers/           → IPC 处理器
│   │   ├── database.ts     → 数据库 IPC
│   │   ├── config.ts       → 配置 IPC
│   │   ├── sync.ts         → 同步 IPC
│   │   └── secure-config.ts → 安全配置 IPC
│   ├── plugins/            → 插件系统
│   │   ├── registry.ts     → 插件注册
│   │   ├── loader.ts       → 用户插件加载
│   │   ├── plugin-process-manager.ts → 代码插件进程管理
│   │   ├── plugin-worker.ts → 代码插件工作进程（vm 沙箱）
│   │   └── providers/      → 内置 Provider
│   ├── security/           → 安全
│   │   ├── ssrf-guard.ts   → SSRF 防护
│   │   └── key-storage.ts  → 密钥存储
│   └── logging/            → 日志
│       ├── logger.ts       → Logger 实现
│       ├── transports/     → Transport 实现
│       └── registry.ts     → Logger 注册表
└── tsconfig.json           → TypeScript 配置
```

---

## 18. 核心模式与约定

### 18.1 Result 模式

所有可能失败的操作返回 `Result<T>`，调用方必须处理错误路径：

```typescript
import { ok, err } from "@/domain/result";
import type { Result } from "@/domain/result";
import { ValidationError } from "@/domain/result";

function createStory(data: StoryData): Result<Story> {
  if (!data.title) {
    return err(new ValidationError("Title is required"));
  }
  return ok({ id: crypto.randomUUID(), ...data });
}

// 使用
const result = createStory(data);
if (result.ok) {
  // 使用 result.value
} else {
  // 处理 result.error
}
```

**反模式：安慰剂错误处理**（R50）：

```typescript
// ❌ 错误：失败时返回"成功"
catch {
  return { passed: true, recommendation: "accept" };
}

// ✅ 正确：失败时返回失败
catch {
  return { passed: false, recommendation: "adjust" };
}
```

### 18.2 DI 容器使用

```typescript
import { container } from "@/infrastructure/di";

// 获取实例
const storage = container.videoTaskStorage;
const tasks = await storage.getByStoryId(storyId);

// 测试中替换
import { overrideToken } from "@/infrastructure/di";
overrideToken(container.videoTaskStorage, () => mockStorage);
```

### 18.3 代理导出使用

```typescript
// ✅ 正确：通过 shared 代理导出
import { withRetry, safeQuery } from "@/shared/db-core";
import { buildSafeUpdate } from "@/shared/sql-safety";
import { mapUserFacingError } from "@/shared/user-facing-error";

// ❌ 错误：直接导入 infrastructure
import { withRetry } from "@/infrastructure/storage/utils";
```

### 18.4 JSON 容器模式

```typescript
import { parseConfig, parseProvider, parseMediaRefs } from "@/infrastructure/storage/video-tasks/json-schemas";

// 解析 JSON 容器（安全，无效 JSON 返回默认值）
const config = parseConfig(record.config);
const provider = parseProvider(record.provider);

// 部分更新 JSON 容器
const sql = `
  UPDATE video_tasks
  SET config = json_set(COALESCE(config, '{}'), '$.model', ?)
  WHERE id = ?
`;
```

### 18.5 React Router 导航

```typescript
import { Link, useNavigate, useLocation, useSearchParams, useParams } from "react-router-dom";

const navigate = useNavigate();
const pathname = useLocation().pathname;
const [searchParams] = useSearchParams(); // 注意：返回元组，必须解构
const { beatId } = useParams();

navigate("/story");
<Link to="/settings">Settings</Link>
```

**注意**：React Router 的 `useSearchParams()` 返回元组，必须解构为 `[searchParams]`（R58）。

### 18.6 usePreference Hook

```typescript
import { usePreference, preferencesStorage } from "@/shared/utils/preferences";

// React 组件中使用
const [value, setValue] = usePreference<SettingsType>("storage-key", defaultValue);
setValue({ ...value, field: newValue });

// 非 React 代码中使用
preferencesStorage.get("key", defaultValue);
preferencesStorage.set("key", value);
preferencesStorage.remove("key");
```

`usePreference` 内部使用 `useSyncExternalStore`，支持跨标签页同步（通过 `storage` 事件监听器），解决 hydration 问题（R52）。

### 18.7 Electron 环境守卫

useEffect 中使用 electronAPI 的操作必须检查 `isElectron()`：

```typescript
useEffect(() => {
  let cancelled = false;
  (async () => {
    if (!isElectron()) {
      if (!cancelled) setIsLoading(false);
      return;
    }
    try {
      const data = await fetchPlugins();
      if (!cancelled) setPlugins(data);
    } catch (err) {
      if (!cancelled) errorLogger.error("Failed", err);
    } finally {
      if (!cancelled) setIsLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, []);
```

**关键**：`isElectron()` 检查必须在异步回调内部（不是 effect 体中的同步检查），避免 ESLint `react-hooks/set-state-in-effect` 违规（R51）。

### 18.8 事件冒泡隔离

嵌套点击处理器必须使用 `e.stopPropagation()`：

```tsx
<div onClick={onClick}>
  <button onClick={(e) => { e.stopPropagation(); onDelete(e); }}>Delete</button>
</div>
```

### 18.9 Electron App Headers

所有 API 请求必须携带 `X-Electron-App` header：

```typescript
import { ELECTRON_APP_HEADERS } from "@/config/constants";

fetch(url, {
  headers: {
    ...ELECTRON_APP_HEADERS,
    "Content-Type": "application/json",
  },
});
```

### 18.10 安全存储操作

```typescript
import { withRetry, safeQuery, safeRun, safeTransaction } from "@/shared/db-core";

await withRetry(() => storage.run(sql, params));
const result = safeQuery(() => storage.query(sql, params));
await safeTransaction(() => {
  storage.run(sql1, params1);
  storage.run(sql2, params2);
});
```

### 18.11 Schema Builder

```typescript
import { generateTableSQL, BASE_COLUMNS } from "../../../electron/src/database/schema-builder";

const tableDef: TableDef = {
  name: "video_tasks",
  featureGroup: "core",
  columns: [
    { name: "id", type: "TEXT PRIMARY KEY" },
    { name: "story_id", type: "TEXT NOT NULL" },
    { name: "status", type: "TEXT NOT NULL DEFAULT 'pending'" },
    { name: "config", type: "TEXT" },  // JSON 容器
    { name: "provider", type: "TEXT" }, // JSON 容器
  ],
};

const sql = generateTableSQL(tableDef); // 自动添加 BASE_COLUMNS
```

### 18.12 Domain Port + DI 解耦

模块在 `domain/` 中定义 Port 接口，infrastructure 提供实现并通过 DI 容器注册：

```typescript
// modules/video/domain/video-provider.port.ts
export interface IVideoProvider {
  generateVideo(params: VideoGenerationParams): Promise<Result<VideoGenerationResponse>>;
  checkStatus(taskId: string): Promise<Result<VideoStatusResponse>>;
}

// infrastructure/ai-providers/volcengine/index.ts
export class VolcengineProvider implements IVideoProvider {
  // ...
}

// infrastructure/di/container.ts
container.videoProvider.register(() => new VolcengineProvider());

// modules 中使用
const provider = container.videoProvider;
const result = await provider.generateVideo(params);
```

### 18.13 i18n 模式

所有用户可见字符串使用 `t()` 函数：

```typescript
import { t } from "@/shared/constants";

// Toast 通知
emitToast("success", t("video.task.created"));

// 确认对话框
if (confirm(t("video.task.deleteConfirm"))) { ... }

// 错误提示
showError(t("video.task.generationFailed"));
```

**不迁移的内容**：AI 提示词模板、error-codes 业务数据、日志文本。

---

## 19. 状态管理策略

### 19.1 四层状态管理

本项目使用四种状态管理方案，各司其职：

| 方案 | 用途 | 文件数 | 示例 |
|------|------|--------|------|
| React Query | 服务端状态（CRUD 数据） | 16 | 角色、场景、资产 |
| Zustand | 跨组件客户端状态 | 3 stores | 视频任务、脏状态、应用全局 |
| React Context | UI 组合状态 | 3 providers | Story 组合、主题、Toast |
| usePreference | localStorage 依赖状态 | - | 用户偏好设置 |

### 19.2 React Query

React Query 管理所有服务端状态的获取、缓存和同步：

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

function useCharacters() {
  return useQuery({
    queryKey: ["characters"],
    queryFn: () => container.characterStorage.getAll(),
  });
}

function useCreateCharacter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CharacterData) => container.characterStorage.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
    },
  });
}
```

### 19.3 Zustand

3 个 Zustand store：

**useVideoTaskStore**：视频任务状态

```typescript
interface VideoTaskState {
  tasks: Map<string, VideoTask>;
  isPolling: boolean;
  addTask: (task: VideoTask) => void;
  updateTask: (id: string, updates: Partial<VideoTask>) => void;
  removeTask: (id: string) => void;
  startPolling: () => void;
  stopPolling: () => void;
}
```

**useDirtyState**：脏状态管理

```typescript
interface DirtyState {
  dirtyMap: Map<string, boolean>;
  markDirty: (id: string) => void;
  markClean: (id: string) => void;
  isDirty: (id: string) => boolean;
  hasAnyDirty: () => boolean;
}
```

**appStore**：应用全局状态

```typescript
interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  currentTheme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
}
```

**Zustand 函数式更新**（R34）：

```typescript
// ✅ 正确：函数式更新
set(state => ({ count: state.count + 1 }));

// ❌ 错误：get()+set() 竞态
const current = get();
set({ count: current.count + 1 });
```

### 19.4 React Context

3 个 Context Provider：

- **StoryProvider**：提供 story 数据和操作方法给子组件树
- **ThemeProvider**：提供主题切换能力
- **Toast**：提供 Toast 通知能力

### 19.5 usePreference

```typescript
// 内部使用 useSyncExternalStore
function usePreference<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener("storage", callback);
    return () => window.removeEventListener("storage", callback);
  }, []);

  const getSnapshot = useCallback(() => {
    return preferencesStorage.get(key, defaultValue);
  }, [key, defaultValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setValue = useCallback((newValue: T) => {
    preferencesStorage.set(key, newValue);
  }, [key]);

  return [value, setValue];
}
```

---

## 20. 测试指南

### 20.1 测试框架

- **框架**：Vitest
- **覆盖率阈值**：70%（branches、functions、lines、statements，per file）
- **测试文件命名**：`*.test.ts` 或 `*.test.tsx`

### 20.2 测试文件位置

| 类型 | 位置 |
|------|------|
| Services | `src/modules/{module}/{subdomain}/services/__tests__/{service}.test.ts` |
| Hooks | `src/modules/{module}/{subdomain}/hooks/__tests__/{hook}.test.ts` |
| Components | `src/modules/{module}/presentation/__tests__/{Component}.test.tsx` |

### 20.3 测试结构模板

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// 1. Hoisted mocks（必须在模块导入前定义）
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }));

// 2. Module mocks
vi.mock("@/infrastructure/di", () => ({
  container: { videoTaskStorage: mockFn },
}));

// 3. 导入被测模块
import { ComponentName } from "../ComponentName";

// 4. 工厂函数
function buildProps(overrides = {}) {
  return { ...defaultProps, ...overrides };
}

// 5. 测试套件
describe("ComponentName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does something", () => {
    // Arrange
    const props = buildProps();
    // Act
    render(<ComponentName {...props} />);
    // Assert
    expect(screen.getByText("Expected")).toBeInTheDocument();
  });
});
```

### 20.4 Mock 策略

**vi.hoisted()**：用于必须在模块导入前存在的 mock 函数。

```typescript
const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    getAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "test" }),
  },
}));
```

**vi.mock()**：用于模块级别的 mock。

```typescript
vi.mock("@/infrastructure/di", () => ({
  container: { videoTaskStorage: mockStorage },
}));

vi.mock("@/shared/presentation/*", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));
```

**overrideToken()**：用于替换 DI 容器中的特定 token。

```typescript
import { overrideToken } from "@/infrastructure/di";
import { container } from "@/infrastructure/di";

overrideToken(container.videoTaskStorage, () => mockStorage);
```

### 20.5 测试 IPC Mock

测试中 mock IPC 返回格式必须与生产契约一致（R61）：

```typescript
// 生产契约
window.electronAPI.invoke("db:query", sql, params) → { rows: T[], columns: string[] }
window.electronAPI.invoke("db:run", sql, params) → { changes: number, lastInsertRowid: number }
window.electronAPI.invoke("db:transaction", operations) → { success: boolean }

// Mock 必须匹配
vi.mocked(window.electronAPI.invoke).mockResolvedValue({
  rows: [{ id: "1", name: "test" }],
  columns: ["id", "name"],
});
```

### 20.6 better-sqlite3 测试准备

better-sqlite3 是原生模块，需要为 Node.js 重建后才能在测试中使用：

```bash
npm rebuild better-sqlite3
```

Electron 打包前，`@electron/rebuild` 会自动重建。

### 20.7 运行测试

```bash
# 运行所有测试
npm run test

# 带覆盖率
npm run test:coverage

# 运行特定模块
npx vitest run src/modules/storyboard

# 运行特定文件
npx vitest run src/modules/video/task-management/services/__tests__/video-task-manager.test.ts

# 监听模式
npx vitest src/modules/storyboard
```

---

## 21. 编码规范

### 21.1 通用规范

| 规范 | 说明 |
|------|------|
| 无注释 | 除非明确要求，不在代码中添加注释 |
| crypto.randomUUID() | ID 生成，不使用 Date.now + Math.random |
| unknown over any | 捕获的错误使用 unknown 类型，用 instanceof Error 安全访问 |
| errorLogger | 生产代码使用 errorLogger，不使用 console.warn/error |
| t() | 用户可见字符串使用 t() 函数 |

### 21.2 React 规范

| 规范 | 说明 |
|------|------|
| useRef | useEffect 中使用 useRef 保存稳定引用，避免闭包陷阱 |
| 取消守卫 | useEffect 中的异步操作必须有取消守卫 |
| e.stopPropagation() | 嵌套点击处理器必须阻止事件冒泡 |
| withTransitionGuard | 状态机转换使用 withTransitionGuard |
| ErrorBoundary | 所有页面级组件使用 ErrorBoundary 包裹 |
| React.memo | 高频渲染组件使用 React.memo 优化 |

### 21.3 状态管理规范

| 规范 | 说明 |
|------|------|
| Zustand 函数式更新 | 使用 set(state => ...) 而非 get()+set()（R34） |
| usePreference | localStorage 依赖状态使用 usePreference（R52） |
| emitToast() | 非 React 代码使用 emitToast()，不使用 useToastHelpers |

### 21.4 错误处理规范

| 规范 | 说明 |
|------|------|
| Result 类型 | 可能失败的操作返回 Result<T> |
| 错误诚实 | 错误路径返回失败指示，不返回"安慰剂"成功 |
| 结构化错误码 | 使用错误码分类，不使用字符串匹配 |
| mapUserFacingError | 用户可见错误使用 mapUserFacingError（R44） |

### 21.5 安全规范

| 规范 | 说明 |
|------|------|
| API Key 加密 | 通过 electron-store 加密存储，不使用 localStorage 或 XOR |
| SSRF guard | 主进程 HTTP 请求经过 SSRF guard |
| X-Electron-App | 所有 API 请求携带 X-Electron-App header |
| DDL 拦截 | preload + 主进程双重 DDL 拦截 |
| 日志脱敏 | API Key 模式在日志写入前脱敏 |

### 21.6 反模式清单

#### 反模式 1：安慰剂错误处理

```typescript
// ❌ 错误：失败时返回"成功"
catch {
  return { passed: true, recommendation: "accept" };
}

// ✅ 正确：失败时返回失败
catch {
  return { passed: false, recommendation: "adjust" };
}
```

#### 反模式 2：脆弱字符串匹配

```typescript
// ❌ 错误：子串匹配分类错误
if (error.message.includes("timeout")) return "timeout";

// ✅ 正确：结构化错误码 + 正则回退
const ERROR_CATEGORY_MAP = {
  TIMEOUT: "timeout",
  ETIMEDOUT: "timeout",
};
```

#### 反模式 3：DI 容器滥用

```typescript
// ❌ 错误：纯函数注册到 DI
container.sanitizeIdentifier  // 纯函数，无状态

// ✅ 正确：直接导入 shared
import { sanitizeIdentifier } from "@/shared/sql-safety";
```

#### 反模式 4：不必要的动态导入

```typescript
// ❌ 错误：总是需要的模块使用动态导入
const { saveVideoTask } = await import("@/modules/video/recovery");

// ✅ 正确：使用静态导入
import { saveVideoTask } from "@/modules/video/recovery";
```

#### 反模式 5：事件冒泡未隔离

```tsx
// ❌ 错误：嵌套按钮未阻止冒泡
<div onClick={onClick}>
  <button onClick={onDelete}>Delete</button>
</div>

// ✅ 正确：阻止冒泡
<div onClick={onClick}>
  <button onClick={(e) => { e.stopPropagation(); onDelete(e); }}>Delete</button>
</div>
```

#### 反模式 6：Result 类型未解包

```typescript
// ❌ 错误：直接赋值 Result
beat.keyframe = generateBeatKeyframe(...);  // 返回 Result<StoryBeatKeyframe>

// ✅ 正确：先解包
const result = generateBeatKeyframe(...);
if (result.ok) {
  beat.keyframe = result.value;
}
```

#### 反模式 7：useEffect 中未守卫 Electron 操作

```typescript
// ❌ 错误：未检查 isElectron()
useEffect(() => {
  fetchPlugins().then(setPlugins);
}, []);

// ✅ 正确：检查 isElectron()
useEffect(() => {
  let cancelled = false;
  (async () => {
    if (!isElectron()) {
      if (!cancelled) setIsLoading(false);
      return;
    }
    try {
      const data = await fetchPlugins();
      if (!cancelled) setPlugins(data);
    } catch (err) {
      if (!cancelled) errorLogger.error("Failed", err);
    } finally {
      if (!cancelled) setIsLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, []);
```

#### 反模式 8：useState 中使用 localStorage

```typescript
// ❌ 错误：hydration 不匹配
const [theme, setTheme] = useState(() => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("theme") || "dark";
  }
  return "dark";
});

// ✅ 正确：使用 usePreference
const [theme, setTheme] = usePreference<string>("theme", "dark");
```

---

# 第五部分：部署与运维

---

## 22. 构建流程

### 22.1 构建脚本

构建脚本 `build-electron.ps1`（PowerShell）执行以下步骤：

```
步骤 1：Vite 生产构建
  → vite build（BUILD_TARGET=electron）
  → 生成静态 SPA 到 out/
  → 使用相对路径 base（"./"）
  → rolldown codeSplitting 分块

步骤 2：Electron TypeScript 编译
  → tsc -p electron/tsconfig.json
  → 编译主进程代码到 out/main/

步骤 3：文件复制
  → 编译产物复制到输出目录
  → 插件文档复制到 out/docs/
```

### 22.2 Vite 构建配置

```typescript
const isElectron = process.env.BUILD_TARGET === "electron";

export default defineConfig({
  base: isElectron ? "./" : "/",
  build: {
    outDir: "out",
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Vendor chunks（priority 30 = 最高）
            { name: "vendor-react", test: /node_modules[\\/]react/, priority: 30 },
            { name: "vendor-state", test: /node_modules[\\/]zustand/, priority: 10 },
            { name: "vendor-ui", test: /node_modules[\\/]lucide-react/, priority: 10 },
            { name: "vendor-misc", test: /node_modules/, priority: 5 },

            // App chunks（priority 15）
            { name: "app-storyboard", test: /src[\\/]modules[\\/]storyboard[\\/]/, priority: 15 },
            { name: "app-shot", test: /src[\\/]modules[\\/]shot/, priority: 15 },
            { name: "app-video", test: /src[\\/]modules[\\/]video/, priority: 15 },
            { name: "app-infra", test: /src[\\/]modules[\\/](asset|sync|persistence)/, priority: 15 },
            { name: "app-infra-core", test: /src[\\/]infrastructure/, priority: 15 },
            { name: "app-shared", test: /src[\\/]shared/, priority: 15 },
            { name: "app-domain", test: /src[\\/]domain/, priority: 15 },
            { name: "app-character", test: /src[\\/]modules[\\/]character/, priority: 15 },
            { name: "app-scene", test: /src[\\/]modules[\\/]scene/, priority: 15 },
            { name: "app-prompt", test: /src[\\/]modules[\\/]prompt/, priority: 15 },
          ],
        },
      },
    },
  },
});
```

### 22.3 新模块构建规则

当添加新模块（>50KB）时，必须在 `vite.config.ts` 中添加对应的 `codeSplitting.groups` 条目（R60）：

```typescript
{ name: "app-newmodule", test: /src[\\/]modules[\\/]newmodule/, priority: 15 },
```

### 22.4 构建环境要求

- **PowerShell**：构建脚本使用 PowerShell
- **C:\Windows\System32**：electron-builder 需要 cmd.exe（在 PATH 中）
- **.npmrc**：Electron 镜像配置，不得包含非标准键（npm 10+ 会警告）

---

## 23. 打包与分发

### 23.1 electron-builder 配置

```json
{
  "build": {
    "appId": "com.prismcraft.app",
    "productName": "PrismCraft",
    "files": [
      "out/**/*",
      "!out/docs/**/*"
    ],
    "asarUnpack": [
      "**/*.node",
      "**/better-sqlite3/**"
    ],
    "win": {
      "target": "nsis",
      "icon": "public/icon.ico"
    },
    "mac": {
      "target": "dmg",
      "icon": "public/icon.icns"
    },
    "linux": {
      "target": "AppImage",
      "icon": "public/icon.png"
    }
  }
}
```

### 23.2 打包步骤

```bash
# Windows NSIS 安装包
npm run build:win

# macOS DMG
npm run build:mac
```

打包流程：

1. `npm run build:electron` — Vite 构建 + Electron TS 编译 + 文件复制
2. `npm run rebuild` — 为 Electron 重建 better-sqlite3 原生模块
3. `electron-builder` — 打包为安装包

### 23.3 asar 打包注意事项

- `out/` 目录打包到 asar
- better-sqlite3 原生模块通过 `asarUnpack` 解包（原生模块无法在 asar 内加载）
- 构建时依赖（vite、@vitejs/plugin-react、sharp）排除在 electron-builder `files` 之外，减小包体积

---

## 24. CI/CD 流水线

### 24.1 CI 流水线

`.github/workflows/ci.yml`：

```
lint → typecheck → architecture check → module API consistency → unit tests → Electron build (Win + Mac)
```

**触发条件**：push 到 main/master 分支，或 pull request

**步骤详解**：

1. **lint**：`npx eslint src/` — 检查代码风格和导入规则
2. **typecheck**：`npx tsc --noEmit` + `npx tsc -p electron/tsconfig.json --noEmit` — 类型安全
3. **architecture check**：`node scripts/check-architecture.mjs` — DDD 违规、裸 SQL、深层路径
4. **module API consistency**：`node scripts/check-module-api-consistency.mjs` — MODULE.md ↔ index.ts 同步
5. **unit tests**：`npx vitest run` — 单元测试
6. **Electron build**：Windows + macOS 构建（仅 main/master）

### 24.2 Release 流水线

`.github/workflows/release.yml`：

**触发条件**：推送 `v*` tag

**步骤**：

1. `npm run build:electron` — 构建
2. `npm run rebuild` — 重建原生模块
3. `electron-builder --publish always` — 打包并发布

### 24.3 Pre-commit Hook

`.husky/pre-commit`：

```
typecheck → architecture check → lint-staged
```

- **typecheck**：快速类型检查
- **architecture check**：架构违规检测
- **lint-staged**：只检查暂存文件的 lint

---

## 25. 发布流程

### 25.1 版本号规范

遵循语义化版本（Semantic Versioning）：

- **主版本号**：不兼容的 API 变更
- **次版本号**：向后兼容的功能新增
- **修订号**：向后兼容的问题修复

当前版本：1.3.0

### 25.2 发布步骤

1. 更新 `package.json` 中的版本号
2. 更新 `CHANGELOG.md`（如有）
3. 提交版本变更：`git commit -m "chore: bump version to x.y.z"`
4. 创建 tag：`git tag vx.y.z`
5. 推送：`git push origin main --tags`
6. CI 自动构建并发布

### 25.3 发布产物

| 平台 | 格式 | 位置 |
|------|------|------|
| Windows | NSIS 安装包 (.exe) | GitHub Releases |
| macOS | DMG | GitHub Releases |
| Linux | AppImage | GitHub Releases |

---

## 26. 运维监控

### 26.1 日志监控

生产环境日志位于 `%APPDATA%/ai-animation-studio/logs/app-YYYY-MM-DD.log`，包含：

- 应用启动/关闭事件
- IPC 调用统计
- 数据库操作耗时
- AI Provider 调用结果
- 错误和异常

### 26.2 错误追踪

- **errorLogger**：所有错误通过 errorLogger 记录
- **ErrorBoundary**：React 渲染错误被 ErrorBoundary 捕获
- **uncaughtException**：未捕获异常只记录日志，不退出应用
- **unhandledRejection**：未处理的 Promise 拒绝只记录日志，不退出应用

### 26.3 性能监控

- **React.memo**：5 个高频组件使用 memo 优化
- **@tanstack/react-virtual**：虚拟列表 hook，处理大量数据渲染
- **useReducer**：复杂状态管理使用 useReducer 替代 useState
- **代码分割**：所有页面使用 React.lazy 懒加载

### 26.4 崩溃恢复

参见 11.5 节。关键策略：

- 未捕获异常：日志记录，继续运行
- 渲染进程崩溃：自动重建窗口（1 秒延迟）
- GPU 进程崩溃：重载页面
- 优雅关闭：销毁窗口 → 关闭静态服务器 → 停止 API 服务器 → 关闭数据库 → app.quit()

---

# 第六部分：质量保障

---

## 27. 回归防护体系

### 27.1 概述

151 条回归防护规则（R1-R151）是从历史 Bug 中抽象出的检测规则，防止已知 Bug 模式重现。这些规则是**回归防护**，不是发现工具——下一次审计必须从零开始发现新问题。

规则按 8 大类组织：

| 类别 | 规则数 | 核心关注 |
|------|--------|---------|
| 数据一致性 | 17 | 数据不丢、不脏、不冲突 |
| 异步安全 | 14 | 并发、竞态、轮询、生命周期 |
| 错误处理 | 12 | 错误不吞、不假成功、用户可理解 |
| UI 健壮性 | 9 | 界面不崩、有反馈、无泄漏 |
| 工程质量 | 14 | 依赖合规、构建安全、测试可靠 |
| 平台兼容 | 6 | IPC、Electron 环境、进程模型 |
| 用户安全防护 | 7 | 破坏性操作需确认、数据清除需保护 |
| 系统安全 | 7 | 沙箱隔离、并发保护、资源生命周期、DOM 安全 |

### 27.2 数据一致性（16 条）

> 核心关注：数据不丢、不脏、不冲突

**R1：持久化先于状态更新**

在更新 UI 状态之前，必须先将数据持久化到数据库。如果先更新状态再持久化，持久化失败时 UI 显示的数据与数据库不一致。

**R2：级联删除必须完整**

删除实体时，必须同时删除所有关联数据。例如删除故事时，必须同时删除节拍、视频任务、分镜等关联数据。

**R8：自动保存覆盖无 ID 新实体**

自动保存不得仅因实体缺少持久化 ID 而禁用，新实体也必须可自动保存。

**R9：乐观更新失败必须回滚**

乐观 UI 更新失败时，必须回滚到之前状态并显示错误反馈。

**R13：导入使用先写后清模式**

"替换"策略导入时，先写入新数据再清理旧数据，避免写入中途失败导致数据丢失。

**R14：AI 分析结果选择性合并**

异步 AI 分析完成时，必须只合并 AI 实际产生的字段，不得展开覆盖整个实体。

**R30：级联删除必须原子**

级联删除的所有语句必须在同一事务中执行。

**R37：动态 SQL 表名验证**

动态表名必须通过标识符模式验证，防止 SQL 注入。

**R42：自动保存乐观锁**

自动保存使用乐观锁（ON CONFLICT...WHERE timestamp < excluded.timestamp），避免覆盖更新的数据。

**R45：实体更新不得删除无关数据**

更新实体子集合时，只删除实际移除的子项关联数据，不得批量删除后重新插入。

**R64：路由切换不得清除脏状态**

路由导航不得自动清除脏状态，只有用户显式操作（保存、确认对话框）才能清除。

**R65：自动保存必须检查 isDirty**

自动保存定时器触发前必须检查是否有未保存修改，无修改时跳过保存。

**R66：持久化失败必须重新标记脏状态**

持久化失败时，必须重新标记脏状态（markDirty），确保下次自动保存时重试。

**R68：页面重载必须从持久化存储恢复 UI 状态**

Provider 组件从持久化存储加载数据时，必须恢复完整的 UI 状态——不仅是列表，还包括当前选中的实体及其子项。只加载列表不恢复选中实体会导致 UI 不一致：列表显示数据但详情面板为空或显示过期数据。

**R69：破坏性实体删除必须要求输入确认**

删除导致不可逆级联删除的实体时（如故事及其所有节拍、视频任务、缓存媒体），确认对话框必须要求用户输入实体名称（或类似唯一标识符）后删除按钮才可用。简单的"确认删除？"对话框对于永久销毁多条关联记录的操作是不够的。

**R72：自动保存不得因业务数据缺失而禁用**

自动保存条件不得包含对特定业务数据是否存在的检查（如 `beats.length > 0`）。如果用户对任何字段（标题、描述、设置）有未保存的修改，自动保存必须处于激活状态，无论子实体是否存在。基于子实体存在性禁用自动保存意味着对父实体元数据的修改永远不会被持久化，直到创建子实体。

### 27.3 异步安全（13 条）

> 核心关注：并发、竞态、轮询、生命周期

**R4：去重优于中止**

并发操作使用去重（返回已有 Promise）而非中止（AbortController），避免浪费 API 配额。

**R10：异步保存并发守卫**

异步保存操作必须使用 ref 守卫防止并发调用，React state 不适用（闭包捕获旧值）。

**R11：跨实体异步回调所有权验证**

异步回调更新状态前，必须验证实体 ID 与当前上下文匹配。

**R12：破坏性覆盖必须警告进行中操作**

覆盖集合前，必须检查是否有进行中的异步操作并警告用户。

**R29：异步回调实体 ID 一致性**

异步操作完成后更新实体状态前，必须验证实体 ID 未变。

**R31：保存后上下文验证**

用户显式保存完成后，必须验证当前实体 ID 与保存开始时一致。

**R32：批量生成循环卸载取消**

批量生成循环必须在组件卸载时设置取消标志，每次迭代前后检查。

**R34：Zustand 函数式更新**

Zustand store 使用 `set(state => ...)` 函数式更新，避免 `get()+set()` 竞态。

**R38：视频 URL 持久化必须先于故事切换**

切换故事前，必须确保当前故事的视频 URL 已持久化，避免数据丢失。

**R46：轮询引擎状态标志重置顺序**

轮询引擎的状态标志必须按正确顺序重置（pollingInProgress 先于 isPollingScheduled），顶层 catch 捕获所有异常。

**R48：useEffect 卸载保护**

useEffect 中的异步操作必须在组件卸载时取消，避免在已卸载组件上调用 setState。

**R62：页面组件不得调用全局 store cleanup()**

只有应用级初始化器（VideoTaskManagerInitializer）可以调用全局 store 的 cleanup()，页面组件不得调用。

**R67：并发守卫 ref 必须在验证后设置**

savingRef 必须在输入验证通过后设置为 true，验证失败提前 return 会导致 ref 永久锁死。

### 27.4 错误处理（11 条）

> 核心关注：错误不吞、不假成功、用户可理解

**R5：后台操作失败必须通知用户**

后台操作（自动保存、轮询、同步）耗尽重试后必须通知用户。

**R6：用户可见错误使用可识别标签**

错误通知使用人类可读标签（节拍标题、故事标题），不使用截断 UUID。

**R15：批量删除部分失败韧性**

批量删除中每项独立 try-catch，成功删除的项从 store 移除，失败的项单独报告。

**R17：级联更新部分失败韧性**

级联更新中每个关联实体独立处理，单个失败不得中止整个级联。

**R18：存储配额错误必须通知用户**

QuotaExceededError 必须通知用户，不得静默失败。

**R44：用户可见错误使用 mapUserFacingError**

用户可见的错误消息必须使用 `mapUserFacingError` 映射，不显示原始技术错误。

**R47：catch 块不得静默吞没错误**

catch 块中必须至少记录错误日志，不得空 catch。生产代码必须使用 errorLogger。

**R50：浮动 Promise 必须有 .catch()**

未 await 的 Promise 必须有 .catch() 处理，避免未处理的 Promise 拒绝。

**R53：Result 错误路径必须使用 err()**

Result 类型的错误路径必须使用 err() 返回，不得返回 ok()（安慰剂错误处理）。

**R56：用户可见字符串使用 t()**

所有 Toast/确认/错误提示/对话框标题/占位符/标签文本必须使用 `t()` 函数。

**R63：API 状态必须验证实际资源存在**

映射 API 状态时必须检查实际资源（如 videoUrl）是否已存在，资源存在则直接判定完成。

### 27.5 UI 健壮性（7 条）

> 核心关注：界面不崩、有反馈、无泄漏

**R7：视频 onError 守卫**

所有 `<video>` 标签必须有 onError 处理器，使用 `data-retried` 属性防止无限重试。

**R16：ErrorBoundary 重试限制**

ErrorBoundary 的重试次数必须有限制，避免无限重试循环。适用于所有 ErrorBoundary 实现（页面级和组件级）。

**R22：异步删除按钮加载状态**

删除确认按钮必须有加载状态，防止重复点击。

**R23：异步保存按钮加载状态**

保存/确认按钮必须有加载状态，防止重复提交。

**R24：操作反馈必须包含成功 Toast**

显式用户操作必须提供成功 Toast 反馈。

**R25：数据加载指示器**

数据依赖的 UI 必须在数据加载期间显示加载指示器。

**R35：Blob URL 卸载时释放**

组件卸载时必须释放 Blob URL（`URL.revokeObjectURL()`），避免内存泄漏。

### 27.6 工程质量（14 条）

> 核心关注：依赖合规、构建安全、测试可靠

**R3：跨上下文状态更新验证**

useEffect 更新状态时，必须验证实体 ID 与当前上下文匹配。

**R26：不必要的动态导入替换为静态导入**

总是需要的模块使用静态导入，不使用动态导入（除非有循环依赖证明）。

**R27：DDD 层违规使用 DI 容器**

app 层访问 infrastructure 必须通过 DI 容器，不得直接导入。

**R28：批量查询优于 N+1**

避免 N+1 查询问题，使用批量查询代替循环中的单条查询。

**R33：消除写入前的存在性检查**

不要在写入前检查记录是否存在再决定 INSERT/UPDATE，直接使用 UPSERT。

**R39：批量 DB 操作优于逐项 IPC**

批量数据库操作使用事务，而非逐项 IPC 调用。

**R40：延迟元数据更新**

非关键元数据更新可以延迟批量处理，减少 IPC 调用频率。

**R41：并行 trackChange**

独立的 trackChange 操作使用 Promise.allSettled 并行执行。

**R54：生产代码不得使用 any**

生产代码中 `@typescript-eslint/no-explicit-any` 为 error 级别。

**R55：测试文件类型安全**

测试文件必须通过 TypeScript 类型检查，`vi.fn()` 必须有泛型参数。

**R57：不使用 next/* 导入**

迁移到 Vite 后，不得使用任何 Next.js 导入。

**R58：useSearchParams 解构**

React Router 的 `useSearchParams()` 返回元组，必须解构为 `[searchParams]`。

**R59：无效动态导入**

模块不得同时被静态导入和动态导入。

**R60：新模块代码分割**

新模块 >50KB 必须在 vite.config.ts 中注册 codeSplitting group。

### 27.7 平台兼容（6 条）

> 核心关注：IPC、Electron 环境、进程模型

**R21：不使用 fetch("/api/...")**

所有内部通信使用 DI/IPC/代理导出，不使用 fetch("/api/...")。Electron 渲染进程没有 HTTP 服务器，fetch("/api/...") 会失败。

**R43：破坏性操作必须用户确认**

永久删除数据的操作必须调用 confirm() 且 variant: "danger"。

**R49：使用 e.currentTarget 而非 e.target**

React 事件处理器中使用 `e.currentTarget` 而非 `e.target`，因为 `e.target` 可能是子元素。

**R51：Electron 环境守卫**

useEffect 中使用 electronAPI 的操作必须检查 `isElectron()`，且检查必须在异步回调内部。

**R52：localStorage 依赖状态使用 usePreference**

localStorage 依赖的初始状态使用 `usePreference` hook（基于 useSyncExternalStore），避免 hydration 不匹配。

**R61：测试 IPC Mock 格式**

测试中 mock IPC 返回格式必须与生产契约一致。

### 27.8 用户安全防护（6 条）

> 核心关注：破坏性操作需确认、数据清除需保护

**R70：不可逆数据清除必须二次确认**

UI 操作永久删除用户数据时（如自动保存恢复记录、缓存数据、会话状态），必须要求二次确认。单次点击不得触发不可逆的数据销毁。确认对话框必须明确说明操作是永久性的且无法撤销。

**R71：路由导航必须在脏状态存在时拦截**

用户有未保存修改（脏状态）时，应用必须拦截所有导航事件——包括浏览器前进/后退按钮，不仅是通过 `guardedPush` 的编程式导航。使用 react-router-dom 的 `useBlocker` 确保浏览器发起的导航也被拦截和确认。

**R73：跨域资源下载必须使用 fetch+blob**

从跨域 URL 下载资源时（如 AI Provider 视频URL），`<a download="filename">` 方式不起作用——浏览器对跨域链接忽略 `download` 属性，改为在新标签页中打开资源。必须使用 `fetch()` + `Blob` + `URL.createObjectURL()` 进行跨域下载。

**R74：错误恢复不得因次数移除重试选项**

错误边界或错误恢复 UI 不得根据错误次数移除重试按钮。即使多次失败后，用户也应始终有重试选项。移除重试按钮迫使用户重新加载页面（丢失当前状态）或重置（丢失所有会话数据）。应在多次失败后显示警告提示，但保持重试按钮可用。

**R75：会话清除必须只删除应用前缀的键**

"重置"或"恢复"操作清除 session/local storage 时，必须只删除带应用前缀（如 `ai-animation-`）的键。使用 `sessionStorage.clear()` 或 `localStorage.clear()` 会销毁同一源下所有存储数据，包括其他应用的数据，这是破坏性和意外的。

**R76：Toast 去重必须包含消息内容**

去重 Toast 通知时，去重键必须包含消息内容，不仅是类型和标题。仅按类型+标题去重意味着具有相同标题的多个不同错误（如不同节拍的"生成失败"）被合并为单个"(3次)"通知，隐藏了哪些具体项目失败。

---

## 28. Bug 审计方法论

### 28.1 三阶段工作流

Bug 审计遵循三阶段工作流：

**阶段 1：场景发现**

AI 模拟真实用户，从使用场景中发现断点。不使用预设检查清单，从零开始发现新问题。

**阶段 2：定向验证**

对每个场景找到代码证据，分类为：
- [Confirmed]：确认存在 Bug
- [Ruled Out]：已排除，不存在 Bug
- [Needs Confirmation]：需要进一步确认

**阶段 3：规则整合**

将确认的 Bug 抽象为可复用的检测规则，写入 regression-guards.md。

### 28.2 关键隔离原则

阶段 3 的规则是**回归防护**，不是发现工具。下一次审计的阶段 1 必须从零开始——不得引用阶段 3 的规则作为检查清单。这是因为：

- 回归防护规则只覆盖已知 Bug 模式
- 新 Bug 可能是全新的模式，不在现有规则中
- 使用规则作为检查清单会导致"确认偏差"——只发现规则描述的问题

### 28.3 审计产出

每次 Bug 审计的产出包括：

1. **Bug 审计报告**：`docs/archive/bug-audit-report.md`，记录所有发现的问题
2. **回归防护规则**：`.trae/rules/regression-guards.md`，新增的检测规则
3. **代码修复**：修复确认的 Bug

---

## 29. 契约验证体系

### 29.1 三层验证

| 验证脚本 | 检查内容 | 运行时机 |
|----------|---------|---------|
| check-architecture.mjs | DDD 违规、裸 SQL、深层路径导入 | CI + pre-commit |
| check-module-api-consistency.mjs | MODULE.md ↔ index.ts 同步 | CI + pre-commit |
| validate-contracts.mjs | contract.json 结构 + 不变量 + 大小 | CI |

### 29.2 check-architecture.mjs

检查以下违规：

1. **DDD 分层违规**：
   - shared 导入 modules
   - domain 导入 modules 或 infrastructure
   - modules 直接导入 infrastructure（除 DI）

2. **裸 SQL**：modules 和 shared 中的直接 SQL 字符串（应使用 sql-safety 工具）

3. **深层路径导入**：`@/modules/xxx/yyy/zzz` 格式的导入

### 29.3 check-module-api-consistency.mjs

检查 MODULE.md 中列出的公共 API 是否与 index.ts 的实际导出一致：

- MODULE.md 中列出但 index.ts 未导出 → 错误
- index.ts 导出但 MODULE.md 未列出 → 警告

### 29.4 validate-contracts.mjs

检查每个 contract.json：

- **结构完整性**：必须包含 name、description、dependencies、publicAPI、invariants 字段
- **不变量声明**：invariants 数组不得为空
- **大小限制**：contract.json 文件大小不得超过合理范围

---

## 30. 代码质量门禁

### 30.1 完整验证命令

```bash
npm run validate:full
```

等价于：

```bash
npx tsc --noEmit                                     # 前端类型安全
npx tsc -p electron/tsconfig.json --noEmit           # Electron 类型安全
npx tsc -p tsconfig.test.json --noEmit               # 测试类型安全
npx eslint src/                                      # 代码风格 + 导入规则
node scripts/check-architecture.mjs                  # DDD 违规检测
node scripts/check-module-api-consistency.mjs         # MODULE.md ↔ index.ts 同步
node scripts/validate-contracts.mjs                  # 契约结构验证
npx vitest run                                       # 单元测试
```

### 30.2 快速验证命令

```bash
npm run validate
```

等价于 validate:full 但不含覆盖率报告。

### 30.3 单项验证

| 命令 | 用途 |
|------|------|
| `npm run typecheck` | 前端 TypeScript 检查 |
| `npm run typecheck:electron` | Electron TypeScript 检查 |
| `npm run typecheck:test` | 测试 TypeScript 检查 |
| `npm run lint` | ESLint 检查 |
| `npm run lint:electron` | Electron ESLint 检查 |
| `npm run lint:arch` | 架构违规扫描 |
| `npm run test` | 单元测试 |
| `npm run test:coverage` | 单元测试 + 覆盖率 |

### 30.4 修改后验证流程

每次代码修改后，执行以下验证：

1. `npx tsc --noEmit` — 类型安全
2. `npx eslint src/` — 代码风格
3. `npx vitest run` — 单元测试
4. 如果修改了模块公共 API，运行 `node scripts/check-module-api-consistency.mjs`

---

# 第七部分：附录

---

## 31. 完整路由表

| 路径 | 组件 | 描述 | 懒加载 |
|------|------|------|--------|
| / | — | 重定向到 /story | — |
| /story | StoryPage | 故事编辑页面 | ✓ |
| /quick-generate | QuickGeneratePage | 快速生成页面 | ✓ |
| /video-tasks | VideoTasksPage | 视频任务页面 | ✓ |
| /characters | CharactersPage | 角色管理页面 | ✓ |
| /scenes | ScenesPage | 场景管理页面 | ✓ |
| /assets | AssetsPage | 资产管理页面 | ✓ |
| /settings | SettingsPage | 设置页面 | ✓ |
| /about | AboutPage | 关于页面 | ✓ |

所有页面路由使用 `React.lazy()` 实现代码分割，页面只在导航到时才加载。

---

## 32. DI Token 参考表

### A. Domain Port 实现（9 个）

| Token | 类型 | 来源 |
|-------|------|------|
| videoTaskStorage | IVideoTaskStorage | @/infrastructure/storage/video-tasks |
| characterStorage | ICharacterStorage | @/infrastructure/storage/characters |
| sceneStorage | ISceneStorage | @/infrastructure/storage/scenes |
| storyStorage | IStoryStorage | @/infrastructure/storage/stories |
| videoProvider | IVideoProvider | — |
| imageProvider | IImageProvider | — |
| textProvider | ITextProvider | — |
| fileUploader | IFileUploader | — |
| syncStorage | ISyncStorage | — |

### B. 有状态服务（6 个）

| Token | 类型 | 来源 |
|-------|------|------|
| eventBus | unknown | @/shared/event-bus |
| apiClient | unknown | @/infrastructure/api |
| imageApi | unknown | @/infrastructure/api |
| videoApi | unknown | @/infrastructure/api |
| textApi | unknown | @/infrastructure/api |
| preferencesStorage | unknown | @/shared/utils/preferences |

### C. Storage 实例（11 个）

| Token | 类型 | 来源 |
|-------|------|------|
| versionStorage | unknown | @/infrastructure/storage/versions |
| elementStorage | unknown | @/infrastructure/storage/elements |
| videoCacheStorage | unknown | @/infrastructure/storage/video-cache (服务层已迁移到 `@/shared/file-http`) |
| imageCacheStorage | unknown | @/infrastructure/storage/image-cache (服务层已迁移到 `@/shared/file-http`) |
| collectionStorage | unknown | @/infrastructure/storage/collections |
| storyboardStorage | unknown | @/infrastructure/storage/storyboard |
| importExportStorage | unknown | @/infrastructure/storage/import-export |
| templateStorage | unknown | @/infrastructure/storage/templates |
| autoSaveStorage | unknown | @/infrastructure/storage/auto-save |
| errorLogStorage | unknown | @/infrastructure/storage/error-logs |
| sessionStorage | unknown | @/infrastructure/storage/sessions |

### D. Repository 实例（1 个）

| Token | 类型 | 来源 |
|-------|------|------|
| mediaAssetRepository | unknown | — |

### E. 懒加载模块（2 个）

| Token | 类型 | 懒加载 | 原因 |
|-------|------|--------|------|
| elementManager | unknown | ✓ | 避免循环依赖 |
| referenceEngine | unknown | ✓ | 避免循环依赖 |

---

## 33. 代理导出清单

| 代理模块 | 导出函数/类型 | 原始来源 | 用途 |
|----------|-------------|---------|------|
| @/shared/db-core | withRetry, safeQuery, safeRun, safeTransaction | @/infrastructure/storage/utils | 数据库安全操作 |
| @/shared/api-config | API 配置相关函数 | @/infrastructure/api | API 配置 |
| @/shared/video-cache | 视频缓存相关函数 | @/infrastructure/storage/video-cache | 视频缓存管理 |
| @/shared/file-http | writeFile, readFile, getFileInfo, getCacheDirectory, getDiskSpace, fileExists, deleteFile | @/shared/file-http | 统一文件操作通信层 (HTTP 优先 + IPC 回退) |
| @/shared/outfit | 服装管理纯函数 | @/infrastructure/outfit | 角色服装管理 |
| @/shared/sql-safety | buildSafeUpdate, buildSafeDelete, sanitizeIdentifier, sanitizeTable | @/infrastructure/sql-sanitizer | SQL 安全工具 |
| @/shared/model-capabilities | 模型能力查询函数 | @/infrastructure/ai-providers | AI 模型能力查询 |
| @/shared/user-facing-error | mapUserFacingError | @/infrastructure/error-mapping | 用户错误映射 |

---

## 34. 错误码参考表

### 34.1 错误域（12 个）

| 域 | 标识 | 描述 |
|----|------|------|
| database | DB | 数据库操作错误 |
| validation | VAL | 数据验证错误 |
| api | API | 外部 API 调用错误 |
| network | NET | 网络连接错误 |
| storage | STO | 本地存储错误 |
| generation | GEN | AI 生成错误 |
| recovery | REC | 错误恢复 |
| cache | CHE | 缓存管理错误 |
| config | CFG | 配置管理错误 |
| auth | AUTH | 认证授权错误 |
| state | STA | 状态管理错误 |
| system | SYS | 系统级操作错误 |

### 34.2 错误类别（9 个）

| 类别 | 描述 | 典型错误码 |
|------|------|-----------|
| timeout | 超时 | TIMEOUT_ERROR |
| rate_limit | 速率限制 | RATE_LIMIT_ERROR |
| quota | 配额不足 | — |
| invalid_params | 参数无效 | VALIDATION_ERROR, NOT_FOUND |
| network | 网络问题 | NETWORK_ERROR |
| server_error | 服务端错误 | API_ERROR, GENERATION_ERROR |
| database_busy | 数据库繁忙 | DATABASE_ERROR, STORAGE_ERROR |
| auth | 认证失败 | AUTHENTICATION_ERROR |
| unknown | 未知错误 | — |

### 34.3 两阶段分类

1. **ERROR_CATEGORY_MAP**：根据错误码精确映射
2. **CATEGORY_PATTERNS**：正则表达式回退匹配

---

## 35. 已知架构债务

| 债务项 | 严重度 | 说明 | 状态 |
|--------|--------|------|------|
| 硬编码中文 | 中 | 已修复：R56 全量迁移完成，48+ 文件 ~560 处中文→t() 调用 | ✅ 已修复 |
| 大文件 | 中 | 已修复：18 个 >400 行文件全部拆分，拆分出 35+ 子组件/hooks | ✅ 已修复 |
| 非空断言 | 中 | 已修复：生产代码 0 处 `!.`，`as unknown as` 仅存在于测试文件 | ✅ 已修复 |
| 性能基础设施 | 低 | 已铺设：React.memo 5 个高频组件、@tanstack/react-virtual 虚拟列表 hook、useReducer 状态管理重构 | ✅ 已铺设 |
| WASM 依赖膨胀 | 低 | better-sqlite3 原生模块，打包时 asarUnpack 解压 .node 文件，无害 | 活跃 |
| tsconfig 排除测试 | 中 | 已修复：新增 tsconfig.test.json，测试文件参与类型检查 | ✅ 已修复 |
| Next.js output:"export" | 高 | 已修复：迁移到 Vite + React Router，功能利用率从 15% 提升到 100% | ✅ 已修复 |
| Electron 镜像依赖 | 低 | .npmrc 配置国内镜像（有注释说明），海外构建可用环境变量覆盖 | 活跃 |
| 版本锁定策略 | 低 | better-sqlite3 精确锁定 12.10.0（原生模块必须精确锁定） | 活跃 |
| app-character chunk 过大 | 低 | 已修复：rolldown codeSplitting API 替代 manualChunks，character chunk 从 784KB 降至 20KB | ✅ 已修复 |
| storyboard 模块过大 | 低 | 19,878 行，占比 32.5%，未来可能需要进一步拆分 | 活跃 |

---

## 36. 术语表

| 术语 | 英文 | 定义 |
|------|------|------|
| DDD | Domain-Driven Design | 领域驱动设计，以业务领域为核心的软件设计方法 |
| 子域 | Sub-domain | 模块内的独立关注点，有独立的契约和演化节奏 |
| 桶文件 | Barrel file | index.ts 文件，重新导出模块的公共 API |
| 契约 | Contract | 机器可读的模块接口规范（MODULE.md + contract.json） |
| 不变量 | Invariant | 不可协商的业务规则，违反不变量的修改必须改变方案或显式更新 |
| 代理导出 | Proxy export | shared 层重新导出 infrastructure 纯函数的模式 |
| Port | Port | 模块定义的接口，由 infrastructure 层实现 |
| Result 类型 | Result type | ok(value) / err(error) 二值返回类型 |
| 熔断器 | Circuit Breaker | 防止向故障服务持续发送请求的保护机制 |
| 弹性获取 | Resilient Fetch | 自动重试 + 指数退避 + 抖动的 HTTP 请求机制 |
| 乐观锁 | Optimistic Locking | 假设并发冲突不频繁，更新时检查版本号的并发控制策略 |
| WAL | Write-Ahead Logging | SQLite 的预写日志模式，支持并发读写 |
| JSON 容器 | JSON Container | 将易变字段存储在 JSON 列中的模式，避免 ALTER TABLE |
| 向量时钟 | Vector Clock | 分布式系统中判断事件先后顺序的数据结构 |
| 脏状态 | Dirty State | 数据已被修改但尚未持久化的状态 |
| 代码分割 | Code Splitting | 将应用拆分为多个 chunk，按需加载 |
| 懒加载 | Lazy Loading | 延迟加载模块，直到实际需要时才加载 |
| DDL | Data Definition Language | 数据定义语言（CREATE、ALTER、DROP 等） |
| SSRF | Server-Side Request Forgery | 服务端请求伪造，攻击者利用服务端发起请求访问内部资源 |
| IPC | Inter-Process Communication | 进程间通信 |
| HMR | Hot Module Replacement | 热模块替换，开发时无需刷新页面即可更新代码 |
| SPA | Single Page Application | 单页应用 |
| NSIS | Nullsoft Scriptable Install System | Windows 安装包格式 |
| DMG | Disk Image | macOS 磁盘镜像格式 |
| AppImage | — | Linux 便携应用格式 |
| asar | Atom Shell Archive | Electron 的归档格式，类似 tar |
| useSyncExternalStore | — | React 18+ 的 hook，用于订阅外部数据源 |
| emitToast | — | 非 React 代码中显示 Toast 通知的函数 |
| withTransitionGuard | — | 状态机转换保护函数，开发模式抛出错误，生产模式静默忽略 |
| mapApiStatus | — | 将 API 状态映射为视频任务状态的函数，videoUrl 存在时返回 "completed" |
| markDirty | — | 标记数据为脏状态的函数，持久化失败时调用 |
| overrideToken | — | DI 容器中替换 token 实现的函数，用于测试 |
| createToken | — | DI 容器中创建 token 的函数 |
| parseConfig / parseProvider | — | 安全解析 JSON 容器的函数，无效 JSON 返回默认值 |
| buildSafeUpdate / buildSafeDelete | — | 构建安全 UPDATE/DELETE 语句的函数，确保始终有 WHERE 条件 |
| suppressDirtyCountRef | — | 脏状态抑制计数器，使用 useRef 保存，处理嵌套抑制场景 |
| VideoTaskManagerInitializer | — | 视频任务管理器初始化组件，应用级，页面不得调用 cleanup() |
| BeforeUnloadGuard | — | 浏览器关闭守卫，只拦截关闭事件，不拦截路由切换 |
| PromptBuilder | — | Prompt 构建器单例，组合各子域的 Prompt 片段 |
| Write-Then-Clean | — | 先写入再清理的导入模式，确保导入过程的原子性 |
| ASA | — | 自定义资产打包格式 |
| TransitionError | — | 状态机非法转换时抛出的错误（仅开发模式） |
| errorLogger | — | 生产代码的错误日志记录器，替代 console.warn/error |
| t() | — | i18n 翻译函数，从 @/shared/constants 导入 |
| isElectron() | — | 检测当前是否运行在 Electron 环境中的函数 |
| timeout | — | 视频任务超时状态，超时策略标记，用户可手动重试 |
| isNetworkError() | — | 识别 14 种网络错误模式的函数，网络错误不累计 pollFailureCount |
| isRecoverable() | — | 判断任务是否可恢复（failed/timeout 可恢复，completed/cancelled 不可恢复） |
| defineRoute() | — | API 路由辅助函数，泛型重载使 handler 自动从 Zod schema 推断参数类型 |
| Zod Schema | — | HTTP API 请求体运行时类型校验，40+ 路由关联 schema，验证失败返回 400 + 字段级错误 |
| VersionConflictError | — | 乐观锁冲突错误，update 传入 version 且 changes===0 时抛出，UI 层通过 mapUserFacingError 映射为 t("error.versionConflict") |

---

## 37. 相关文档

本指南为项目全方位概览，以下专题文档提供更深入的信息：

| 文档 | 用途 |
|------|------|
| [MODULES.md](MODULES.md) | 42 个模块全景图（子域、Public API、依赖详情） |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 全局架构、依赖方向、状态机、数据流 |
| [di-tokens.md](di-tokens.md) | DI 容器 46 个 Token 清单（6 类 A-F） |
| [ports.md](ports.md) | Port 接口清单（含分类、依赖方向图） |
| [agent-tools-architecture.md](agent-tools-architecture.md) | 智能体工具架构（154 个工具，20 个域） |
| [novel-pipeline-guide.md](novel-pipeline-guide.md) | 小说导入流水线指南（10 阶段状态机） |
| [timeline-implementation.md](timeline-implementation.md) | 时间线实现（8 维变体参数系统） |
| [AI-MAINTENANCE-GUIDE.md](AI-MAINTENANCE-GUIDE.md) | AI 维护操作手册 |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 开发者入门指南 |

归档文档位于 `docs/archive/` 目录，包括 `bug-audit-report.md`、`phase-agent.md`、`phase-polish.md`、`ui-migration-plan.md` 等历史文档。

---

> 本文档是 PrismCraft 项目的唯一全方位指南，涵盖从设计哲学到实现细节的所有内容。如有与代码不一致之处，以代码为准，并更新本文档。
