# AI Animation Studio — 架构与设计文档

## 一、项目定位与设计哲学

AI Animation Studio 是一款本地优先的 AI 动画制作桌面工具，覆盖从创意到成品的完整工作流：故事构思、角色设计、场景搭建、分镜编排、AI 视频生成、导出成品。项目不依赖云端服务运行，所有数据存储在本地 SQLite 数据库中，AI 生成能力通过可插拔的 Provider 插件对接外部 API。

### 设计哲学：机器可读契约驱动的 AI 维护

本项目的核心设计哲学是"全权交由 AI 开发维护"。传统项目的文档与代码往往逐渐脱节，而本项目通过三级机器可读契约体系解决这一问题：

- **MODULE.md**：模块概览、子域表、公共 API 列表、边界约束，约 50-150 行
- **contract.json**：每个子域一份，包含名称、描述、依赖、公共 API、不变量（invariants），约 30-80 行
- **.ai/modules/**：详细的 AI 维护指南，包含修改规则和子域细节

AI 修改代码时，先读契约（约 130 行/子域），再读实现。契约中的 invariants 是不可协商的业务规则，违反不变量的修改必须改变方案或显式更新不变量。自动化验证脚本（check-architecture.mjs、check-module-api-consistency.mjs、validate-contracts.mjs）在 CI 中强制执行契约一致性，确保文档与代码不会漂移。

### 为什么选择 Electron + Vite

桌面端需要本地文件系统访问、SQLite 数据库、原生窗口管理、系统托盘等能力，浏览器 Web 应用无法满足。Electron 提供完整的 Node.js 运行时和原生 API 访问。Vite 提供极速的 HMR 开发体验和高效的构建输出。Electron 渲染进程通过静态文件服务器加载 Vite 构建的 SPA，不需要服务端运行时，从而避免了在 Electron 中运行 Node.js 服务器的冗余开销。

项目曾使用 Next.js（`output: "export"` 模式），但 Next.js 的服务端功能利用率仅约 15%（仅用了静态导出和路由），而其构建流程（API 路由 hack、webpack 配置覆盖、output 兼容性）带来了不必要的复杂度。迁移到 Vite + React Router 后，功能利用率提升到 100%，构建流程从 5 步简化为 3 步，消除了 API 路由移除/恢复的 hack。

### 为什么选择 DDD

项目包含 9 个业务模块（story、video、shot、prompt、asset、sync、character、scene、persistence），每个模块有独立的演化节奏。story 模块 16502 行代码、4 个子域，而 persistence 模块仅 434 行、2 个子域。DDD 的子域划分确保大模块内部不会因无序依赖而腐化，跨模块的依赖必须通过桶文件（barrel file）的公共 API，深层路径导入被 ESLint 规则和架构扫描脚本双重拦截。这种约束在 9 个模块、43 个子域的规模下是必要的——没有它，模块边界会在数周内模糊消失。

## 二、技术栈与构建体系

### 前端技术栈

- **Vite 8**：SPA 构建工具，Electron 模式使用相对路径 base，HMR 极速
- **React 19**：并发渲染、Suspense、Transitions
- **React Router 7**：客户端路由，所有页面使用 React.lazy 代码分割
- **Zustand 5**：轻量状态管理，用于跨组件共享的客户端状态（视频任务、脏状态、应用全局状态）
- **React Query**：服务端状态管理，用于数据获取、缓存和同步（角色、场景、资产等 CRUD 数据）
- **React Context**：UI 组合状态，用于组件树级别的状态注入（Story 组合、主题、Toast）
- **Tailwind CSS 4**：原子化 CSS，避免样式冲突

### 后端技术栈

- **Electron 主进程**：窗口管理、生命周期、IPC、数据库、HTTP API Server
- **better-sqlite3 12.10.0**（版本锁定，非 ^12.10.0）：同步 API 的 SQLite 绑定，WAL 模式
- **HTTP API Server**：渲染进程与主进程的 HTTP 通信层

### 语言与类型安全

TypeScript strict mode 贯穿全栈。根目录 `tsconfig.json` 覆盖 `src/`，`electron/tsconfig.json` 覆盖 `electron/src/`，两者独立编译。测试文件被 tsconfig 排除，由 Vitest 独立处理类型。

### 构建流程

构建脚本 `build-electron.ps1`（PowerShell）执行以下步骤：

1. **Vite 生产构建**：`vite build`（`BUILD_TARGET=electron`）生成静态 SPA 到 `out/`，使用相对路径 base
2. **Electron TypeScript 编译**：`tsc -p electron/tsconfig.json` 编译主进程代码
3. **文件复制**：编译产物、插件文档复制到输出目录
4. **electron-builder 打包**：`out/` 打包为 asar，better-sqlite3 原生模块通过 `asarUnpack` 解包（原生模块无法在 asar 内加载）

Vite 构建使用 rolldown 的 `codeSplitting` API 进行分块优化，将 vendor 库（react、zustand、lucide-react）和业务模块（story、video、shot 等）拆分为独立 chunk，避免单个包过大。所有页面路由使用 `React.lazy()` 实现按需加载。

### CI/CD

GitHub Actions 执行完整验证链：lint → typecheck → architecture check → module API consistency → unit tests → Electron build（Win + Mac，仅 main/master 分支）。发布流程由 `v*` tag 触发，自动构建并发布安装包。Pre-commit hook 执行 typecheck → architecture check → lint-staged，在提交前拦截问题。

## 三、分层架构与依赖方向

### 3.1 四层架构

```
app/             → React Router 页面和布局，消费模块提供的 Context
modules/         → 9 个业务子域模块，每个有 hooks/services/presentation
infrastructure/  → DI 容器、存储、网络、AI Provider、数据库
shared/          → 跨切面 UI（Toast、Sidebar、ErrorBoundary、DeleteConfirmDialog、AssetSelectorDialog）、工具函数、infrastructure 代理导出
domain/          → 纯类型、Schema、Result 类型、错误码。零外部依赖
```

**domain 层**是整个系统的核心。它定义了所有业务类型（Story、Character、Scene、VideoTask 等）、Result 类型（`ok(value)` / `err(code, message)`）、12 个语义化错误类（DatabaseError、ValidationError、ApiError 等）和 28 个结构化错误码。domain 层零依赖意味着类型定义不会因基础设施变更而被迫修改——这是 DDD 中"依赖必须向内流动"原则的基石。

**modules 层**包含 9 个业务模块，每个模块遵循 `index.ts`（桶文件）+ `MODULE.md`（契约）+ 子域目录的结构。模块只能导入 `@/domain/*`、`@/shared/*` 和 `@/infrastructure/di`（通过 DI 容器获取基础设施实例）。

**infrastructure 层**提供存储、网络、AI Provider 等基础设施。它只能导入 `@/domain/*` 和 `@/shared/*`，不得导入 `@/modules/*`——这确保基础设施不依赖业务逻辑。

**shared 层**是跨切面工具层。它可以直接导入 `@/domain/*`，也可以通过代理导出（proxy export）重新导出 `@/infrastructure/*` 的纯函数。关键约束：`shared/` 不得导入 `@/modules/*`。代理导出模式解决了 modules 不能直接导入 infrastructure 的约束，同时保持依赖方向正确。

### 3.2 依赖方向规则

依赖必须向内流动：

```
app → modules → domain
              → shared
              → infrastructure/di（通过 container）
infrastructure → domain, shared
shared → domain, infrastructure（代理导出）
domain → NOTHING（纯类型）
```

违反规则的典型情况及处理方式：

| 违反 | 后果 | 正确做法 |
|------|------|---------|
| `shared/` 导入 `@/modules/*` | 模块边界被打破，shared 成为耦合点 | 将功能移入模块或通过事件总线解耦 |
| `domain/` 导入 `@/infrastructure/*` | 类型定义与基础设施耦合 | 在 domain 定义 Port 接口，infrastructure 提供实现 |
| `modules/` 直接导入 `@/infrastructure/*` | 绕过 DI 容器，无法测试替换 | 通过 DI 容器获取，或通过 `@/shared/` 代理导出 |
| 跨模块深层路径导入 | 模块内部实现被外部依赖，重构困难 | 通过桶文件 `@/modules/xxx` 导入 |

### 3.3 为什么这样分层

**domain 零依赖**的决策源于一个实际教训：早期版本中 domain 类型曾导入 infrastructure 的存储接口，导致修改存储实现时类型定义被迫变更，引发全项目级联编译错误。将 domain 完全隔离后，基础设施可以自由替换而不影响业务类型。

**@/shared/ 代理导出模式**的必要性：modules 不能直接导入 `@/infrastructure/*`（除 DI 容器），但某些 infrastructure 的纯函数（如 `safeQuery`、`safeRun`、`safeTransaction`、`resolveImageUrl`、`sanitizeIdentifier`）是 modules 运行所必需的。将这些纯函数注册到 DI 容器是过度设计——DI 容器只应注册有状态或需测试替换的依赖。代理导出模式（如 `@/shared/db-core` 重新导出 `@/infrastructure/storage/sqlite-core` 的函数）既保持了依赖方向正确，又避免了 DI 容器膨胀。

**DI 容器的克制使用**：只有满足以下条件之一的依赖才注册到 DI 容器：是 Port 接口的实现、有状态、需要测试替换。纯函数直接从 `@/shared/` 导入，类型用 `export type` 导出，常量从源直接导入。这种克制避免了 DI 容器成为无所不包的"服务定位器"反模式。

## 四、模块系统详解

### 4.1 模块总览表

| 模块 | 代码行数 | 子域数 | 核心职责 |
|------|---------|--------|---------|
| story | 16502 | 4 | 故事创作与分镜管理、提示词生成与编排、批量视频生成 |
| video | 10725 | 4 | 视频任务管理、缓存、恢复、编解码检测、帧提取 |
| shot | 4548 | 7 | 分镜系统：一致性检查、元素绑定、特征提取、镜头指令 |
| prompt | 4037 | 7 | 提示词生成与管理：角色/场景/分镜/视频提示词构建 |
| asset | 2697 | 5 | 资产库管理：媒体资产、导入导出、项目备份与恢复 |
| sync | 2286 | 2 | 多设备数据同步：变更追踪、向量时钟、冲突检测与解决 |
| character | 1231 | 2 | 角色管理：角色 CRUD、服装管理、角色图片生成 |
| scene | 886 | 2 | 场景管理：场景 CRUD、图片生成 |
| persistence | 434 | 2 | 自动保存、持久化守护、事务性删除 |

### 4.2 各模块详细说明

#### story 模块

**职责**：故事创作与分镜管理、提示词生成与编排、批量视频生成。这是项目中最大的模块，承载了从故事构思到视频生成的核心工作流。

**子域结构**：

| 子域 | 职责 |
|------|------|
| planning | 故事规划、分镜列表、大纲编辑 |
| beat-editor | 分镜编辑器、镜头配置、元素绑定、镜头指令 |
| generation | 分镜生成、提示词构建、批量任务编排、进度展示 |
| template | 模板管理、版本控制、样式预设 |

**关键设计决策**：

1. **Dirty 状态抑制使用计数器而非布尔值**：`useStoryState` 使用 `suppressDirtyCountRef`（计数器）而非布尔值标记。原因是保存操作和 beats 变更可能在同一事件循环中发生多次——布尔值只能处理一次抑制，后续变更会导致 dirty 状态残留，阻止页面跳转。计数器确保每次保存后的多次 beats 变更都能被正确抑制。

2. **批量生成采用策略模式**：`BatchStrategy` 和 `GenerationLevel` 允许用户选择"逐个生成"或"批量生成"，以及"仅关键帧"或"完整视频"等不同生成级别。这种设计使得同一套生成逻辑可以适配不同的使用场景，从快速预览到高质量成品。

**边界约束**：子域之间只能通过各自的 `index.ts` 导出的 API 通信，禁止直接引用其他子域的内部文件。

#### video 模块

**职责**：视频任务管理、缓存、恢复、编解码检测、帧提取、模板、追踪、导出。

**子域结构**：

| 子域 | 职责 |
|------|------|
| task-management | 任务状态管理、UI 展示、任务追踪 |
| cache | 视频 Blob 缓存、内存/IndexedDB 双层缓存 |
| recovery | 视频验证、重复检测、智能重试、恢复工作流 |
| utils | 编解码检测、帧提取、文件导出、视频模板 |

**关键设计决策**：

1. **双层缓存架构**：cache 子域实现了内存（Object URL）+ IndexedDB 双层缓存。内存层提供即时访问，IndexedDB 层提供持久化。这种设计是因为视频文件通常较大（数十 MB），每次从磁盘或网络加载都有明显延迟，双层缓存将重复访问的延迟降至零。

2. **智能重试引擎**：recovery 子域的 `smartRetryEngine` 不是简单的固定间隔重试，而是基于 AI 提供商错误类型做出差异化决策——超时重试（指数退避）、限流重试（延迟 >= 60s）、余额不足不重试、参数错误不重试、网络错误重试（低 tokenWasteRisk）、验证失败重试（可能是假成功）。这种设计避免了无意义的重试浪费 API 配额。

**边界约束**：`cache` 和 `utils` 子域是最底层，不依赖其他子域。所有跨子域引用必须通过 `../subdomain` 导入。

#### shot 模块

**职责**：分镜系统——一致性检查、元素绑定、特征提取、镜头指令、引用引擎。

**子域结构**：

| 子域 | 职责 |
|------|------|
| consistency-check | 视觉一致性检查 |
| element-binding | 元素绑定、元素管理器 |
| feature-extraction | 特征锚定 |
| reference-check | 引用检查 |
| shot-generation | 分镜生成、动态少样本、验证器 |
| shot-instruction | 镜头指令转换 |
| shot-reference | 镜头引用引擎 |

**关键设计决策**：

1. **7 个子域的细粒度划分**：shot 模块虽然只有 4548 行代码，却划分了 7 个子域。这是因为分镜系统涉及多个独立关注点——一致性检查需要理解视觉特征，元素绑定需要管理跨实体关系，镜头指令需要将自然语言转换为结构化参数。这些关注点各自独立演化，混合在一起会导致职责纠缠。

2. **元素管理器和引用引擎作为 DI 懒加载**：`elementManager` 和 `referenceEngine` 是 DI 容器中仅有的两个 E 类 Token（懒加载模块）。它们通过 `await import()` 动态加载，原因是这两个模块与 story 模块存在双向依赖——story 需要 shot 的元素绑定能力，shot 的引用引擎需要 story 的角色/场景数据。懒加载打破了初始化阶段的循环依赖。

**边界约束**：子域之间只能通过各自的 `index.ts` 导出的 API 通信。

#### prompt 模块

**职责**：提示词生成与管理——角色/场景/分镜/视频提示词构建、基础关键词常量、提示词优化。

**子域结构**：

| 子域 | 职责 |
|------|------|
| base | 关键词常量、描述构建工具 |
| character | 角色提示词生成 |
| scene | 场景提示词生成 |
| beat-image | 分镜图片提示词生成 |
| video | 视频提示词生成 |
| server-prompts | 服务器端提示词 |
| builder | PromptBuilder 类、故事计划、快速模式 |

**关键设计决策**：

1. **分层依赖结构**：prompt 模块的子域有明确的依赖层次——`base` 是最底层，提供关键词常量和描述构建工具；`character`、`scene`、`video` 依赖 `base`；`builder` 依赖 `character` 和 `scene`。`server-prompts` 和 `beat-image` 是独立的。这种分层确保了修改基础关键词时的影响范围可控。

2. **PromptBuilder 单例模式**：`promptBuilder` 作为单例存在，维护跨请求的构建状态和缓存。提示词构建涉及大量字符串拼接和模板替换，单例模式避免了重复初始化的开销。

**边界约束**：`base` 子域是最底层，其他子域依赖它。禁止跨层级直接引用（如 builder 直接引用 character 内部实现）。

#### asset 模块

**职责**：资产库管理——媒体资产管理、角色/场景/分镜资源的导入导出、项目备份与恢复。

**子域结构**：

| 子域 | 职责 |
|------|------|
| asset-library | 资产库服务：角色、场景、分镜资源、收藏集 CRUD |
| media-assets | 媒体资产管理 |
| import-export | 项目数据导入导出 |
| hooks | React Query Hooks 封装 |
| presentation | UI 组件 |

**关键设计决策**：

1. **导入导出的 Write-Then-Clean 模式**：当使用"替换"策略导入数据时，绝不在写入新数据前删除旧数据。如果写入过程中途失败，旧数据将永久丢失。正确做法是先写入所有新数据，收集成功导入的 ID，然后仅删除不在新 ID 集合中的旧记录。这是回归防护 R13 的来源——一次真实的部分导入失败导致了数据丢失事故。

2. **ASA 格式导出**：`assetExportService` 使用专有的 ASA（AI Animation Studio Archive）格式进行项目导出，将角色、场景、分镜、故事等数据打包为单一文件，支持完整的项目迁移。

**边界约束**：hooks 子域依赖 asset-library、media-assets、import-export 子域；presentation 子域依赖 hooks 子域。依赖方向是单向的。

#### sync 模块

**职责**：多设备数据同步——变更追踪、向量时钟、冲突检测与解决。

**子域结构**：

| 子域 | 职责 |
|------|------|
| engine | 同步引擎核心、变更追踪、向量时钟、冲突解决 |
| presentation | 冲突解决面板、同步设置、状态指示器 |

**关键设计决策**：

1. **向量时钟而非时间戳**：多设备同步不能依赖物理时钟——不同设备的系统时间可能不同步，导致"后写入覆盖先写入"的错误。向量时钟通过逻辑时钟追踪因果关系，`compareVectorClocks` 可以判断两个变更是否并发（冲突），`mergeVectorClocks` 合并时钟状态。

2. **engine 和 presentation 互不依赖**：同步引擎是纯逻辑层，不依赖任何 UI 代码。冲突解决面板通过回调函数（`setConflictCallback`）与引擎交互，而非直接导入引擎内部状态。这种解耦使得引擎可以在无 UI 的环境中运行（如后台同步）。

**边界约束**：engine 和 presentation 子域互不依赖，所有交互通过公共 API。

#### character 模块

**职责**：角色管理——角色 CRUD、服装管理、角色图片生成。

**子域结构**：

| 子域 | 职责 |
|------|------|
| services | 角色 CRUD 服务、Result 模式 |
| hooks | React Query Hooks 封装 |

**关键设计决策**：

1. **服装管理作为角色子功能**：`character_outfits` 表通过 `character_id` 外键关联角色，`useOutfitManagement` Hook 提供 addOutfit、updateOutfit、deleteOutfit 操作。服装没有独立为模块，因为它的生命周期完全绑定于角色——删除角色时服装必须级联删除，不存在没有角色的服装。

2. **Result 模式贯穿 CRUD**：所有 service 方法返回 `Result<T>` 而非抛出异常。调用方必须显式处理成功和失败路径，编译器强制执行。这避免了"安慰剂错误处理"——吞掉异常返回看似成功的结果。

**边界约束**：hooks 子域依赖 services 子域，禁止 hooks 直接引用 services 内部的实现细节。

#### scene 模块

**职责**：场景管理——场景 CRUD、图片生成。

**子域结构**：

| 子域 | 职责 |
|------|------|
| services | 场景 CRUD 服务、Result 模式 |
| hooks | React Query Hooks 封装 |

**关键设计决策**：

1. **Dirty 状态管理的精确时序**：`useSceneCRUD` 中 `markClean("scenes")` 必须在保存成功且 `setCurrentScene` 之后调用。如果时序错误——比如在保存前调用 markClean——保存失败时 dirty 状态已被清除，用户不会收到未保存修改的警告。这个看似简单的时序约束，是回归防护 R1（持久化优先于状态更新）的具体体现。

2. **与 character 模块的对称设计**：scene 模块的结构与 character 模块几乎完全对称——相同的 services + hooks 子域划分、相同的 Result 模式、相同的 React Query Hooks 封装。这种对称性降低了认知负担，开发者理解一个模块后可以快速理解另一个。

**边界约束**：hooks 子域依赖 services 子域。Dirty 状态管理时序必须严格遵守。

#### persistence 模块

**职责**：自动保存、持久化守护、事务性删除。

**子域结构**：

| 子域 | 职责 |
|------|------|
| hooks | useAutoSave、usePersistenceGuard |
| services | transactionalDelete（级联删除+文件清理） |

**关键设计决策**：

1. **自动保存的双重限制**：`useAutoSave` 有 MAX_RETRY（3 次）和 MIN_INTERVAL（1 秒）两个限制。重试限制防止网络故障时无限重试消耗资源，最小间隔防止快速连续修改触发过于频繁的保存。超过重试限制后停止重试并通过 toast 通知用户（回归防护 R5）。

2. **自动保存乐观锁**：`createAutoSave` 使用 `ON CONFLICT(id) DO UPDATE SET ... WHERE timestamp < excluded.timestamp` 而非 `INSERT OR REPLACE`。当用户在自动保存快照与实际写入之间进行了新修改，乐观锁确保新修改不被覆盖。写入影响 0 行时，二次查询确认现有记录是否更新，若是则静默跳过。这是回归防护 R42 的来源。

3. **事务性删除同步清理本地文件**：`deleteCharacterWithRefs` 和 `deleteSceneWithRefs` 不仅删除数据库记录，还同步清理本地图片文件。如果只删除数据库记录而保留文件，磁盘空间会逐渐被孤立文件占满。这个设计是回归防护 R2（删除必须级联）的实现。

**边界约束**：自动保存有 MAX_RETRY（3 次）和 MIN_INTERVAL（1 秒）限制。`usePersistenceGuard` 的 `cancelledRef` 防止组件卸载后继续保存。

## 五、依赖注入体系

### 5.1 DI 容器设计

DI 容器采用 Proxy-based property access 模式：

```typescript
import { container } from "@/infrastructure/di";
const storage = container.videoTaskStorage; // 属性访问，非方法调用
```

这种设计的优势在于类型安全——`AppContainer` 类型由 `ContainerShape` 自动推导，访问不存在的 token 会在编译时报错。运行时，Proxy 的 `get` 拦截器查找 token 并通过 `ModuleRegistry` 解析实例。

**循环依赖检测**：`resolve()` 函数使用 `resolving` Set 追踪当前解析链。如果解析过程中发现 token 已在 Set 中，立即抛出包含完整依赖链的错误：`Circular dependency detected: tokenA -> tokenB -> tokenA`。这种检测在开发阶段就能发现循环依赖，而非运行时栈溢出。

**overrideToken() 测试替换**：测试中通过 `overrideToken(token, factory)` 替换特定 token 的工厂函数，实现依赖隔离。测试结束后调用 `resetContainer()` 恢复原始状态。

### 5.2 Token 分类（5 类 30 个）

| 类别 | 数量 | 说明 | 示例 |
|------|------|------|------|
| A. Domain Port 实现 | 9 | Port 接口的具体实现 | videoProvider, characterStorage, imageProvider, textProvider, fileUploader, syncStorage, videoTaskStorage, sceneStorage, storyStorage |
| B. 有状态服务 | 6 | 单例，需测试替换 | eventBus, apiClient, imageApi, videoApi, textApi, preferencesStorage |
| C. Storage 实例 | 11 | 有状态存储，模块无法直接导入 infrastructure/storage | versionStorage, elementStorage, videoCacheStorage, imageCacheStorage（暴露 `flushPendingAccessUpdates()` 用于延迟元数据更新）, collectionStorage, storyboardStorage, importExportStorage, templateStorage, autoSaveStorage, errorLogStorage, sessionStorage |
| D. Repository 实例 | 1 | Drizzle ORM | mediaAssetRepository |
| E. 懒加载模块 | 2 | 避免循环依赖 | elementManager, referenceEngine |

**A 类 Token 的设计意图**：domain 层定义 Port 接口（如 `IVideoProvider`、`ICharacterStorage`），infrastructure 层提供实现。模块通过 `container.videoProvider` 获取实例，编译时类型由 Port 接口约束，运行时实例由 infrastructure 提供。这种 Port-Implementation 分离使得替换 AI 提供商或存储实现时，模块代码无需修改。

**C 类 Token 的必要性**：Storage 实例是有状态的（持有数据库连接、缓存等），且位于 `@/infrastructure/storage` 下——模块不能直接导入。DI 容器是模块获取 storage 实例的唯一合法途径。

**E 类 Token 的懒加载原因**：`elementManager` 和 `referenceEngine` 位于 `@/modules/shot/` 下，但被其他模块通过 DI 容器引用。如果静态导入，会在模块初始化阶段形成循环依赖。懒加载将依赖解析推迟到首次使用时，此时所有模块已完成初始化。

### 5.3 什么该注册 DI，什么不该

判断标准：**测试是否需要 mock 这个依赖？**

| 应该注册 | 不应该注册 |
|---------|-----------|
| Port 接口实现（需替换测试替身） | 纯函数（如 `resolveImageUrl`、`getErrorMessage`） |
| 有状态服务（如 eventBus、apiClient） | 类型导出（用 `export type`） |
| 需测试替换的依赖 | 常量和枚举 |
| Storage 实例（模块无法直接导入） | `@/infrastructure/*` 的纯函数（走 `@/shared/` 代理导出） |

违反此原则的典型反模式：将 `sanitizeIdentifier`、`sanitizeTable` 等纯函数注册到 DI 容器。这些函数无状态、无副作用，测试中不需要 mock——直接从 `@/shared/sql-safety` 导入即可。

### 5.4 @/shared/ 代理导出清单

模块不能直接导入 `@/infrastructure/*`（除 DI），但某些 infrastructure 纯函数是模块运行所必需的。`@/shared/` 通过代理导出解决此约束：

| 代理模块 | 导出函数 | 来源（infrastructure） | 用途 |
|---------|---------|----------------------|------|
| `@/shared/db-core` | `safeQuery`, `safeRun`, `safeTransaction`, `withRetry` | `infrastructure/storage/sqlite-core` | 安全数据库操作 |
| `@/shared/api-config` | `checkConfigStatus`, `testConnection` | `infrastructure/network/api-client` | API 配置检查 |
| `@/shared/video-cache` | `cacheVideoBlob`, `getCachedVideoUrl` | `infrastructure/storage/video-cache` | 视频缓存操作 |
| `@/shared/outfit` | `getAllOutfits`, `getOutfitsForCharacter` | `infrastructure/storage/characters/outfit-manager` | 角色服装批量查询 |
| `@/shared/sql-safety` | `sanitizeIdentifier`, `sanitizeTable`, `buildSafeUpdate`, `buildSafeDelete` | `infrastructure/storage/sql-sanitizer` | SQL 安全工具 |
| `@/shared/model-capabilities` | `getModelCapabilities`, `ImageSizePurpose` | `infrastructure/ai-providers/model-capabilities` | AI 模型能力查询 |
| `@/shared/user-facing-error` | `mapUserFacingError` | `shared/utils/user-facing-error` (uses classifyError from domain) | 用户友好错误消息映射 |

## 六、数据模型与存储层

### 6.1 SQLite 架构

数据库使用 better-sqlite3 + WAL 模式，通过以下 PRAGMA 优化性能：

```sql
PRAGMA journal_mode = WAL;       -- 写前日志，允许并发读写
PRAGMA synchronous = NORMAL;     -- 平衡安全性与性能
PRAGMA cache_size = -64000;      -- 64MB 页缓存
PRAGMA temp_store = memory;      -- 临时表在内存中
PRAGMA mmap_size = 268435456;    -- 256MB 内存映射
```

**7 字段基础列**：所有业务表自动获得以下列——`owner_id`、`created_at`、`updated_at`、`is_deleted`、`deleted_at`、`version`、`sync_id`。这些列由 `schema-builder.ts` 的 `BASE_COLUMNS` 定义，`generateTableSQL()` 自动追加。基础列提供了软删除（`is_deleted` + `deleted_at`）、乐观锁（`version`）和同步追踪（`sync_id`）的能力，业务代码无需手动管理这些字段。

**JSON 容器模式**：volatile 字段存储在 JSON 列中（如 `config`、`provider`、`media_refs`、`tracking`、`camera`、`generation`、`meta`、`appearance`、`atmosphere` 等）。为什么用 JSON 容器而非独立列？因为 AI Provider 的参数频繁变更——新增模型、调整分辨率选项、添加引用视频支持等。如果每个参数都是独立列，每次变更都需要 ALTER TABLE 和数据库迁移。JSON 容器模式下，应用层通过 `parseConfig()`、`parseProvider()` 等函数安全解析 JSON，数据库 schema 保持稳定。

**JSON 容器的更新模式**：使用 `json_set(COALESCE(container, '{}'), '$.key', ?)` 进行部分更新，而非读取-修改-写入整个 JSON。这避免了并发修改时的覆盖问题——两个并发更新不同字段不会互相覆盖。

### 6.2 表结构概览

**业务表（14 张）**：

| 表名 | 功能组 | 关键 JSON 容器 |
|------|--------|---------------|
| video_tasks | video | config, provider, media_refs, tracking |
| story_beats | core | camera, generation, meta |
| characters | core | appearance, generation, config, meta |
| scenes | core | appearance, atmosphere, generation, config |
| stories | core | style_guide_json, element_ids_json, element_bindings_json |
| story_versions | core | beats_json, characters_json, scenes_json |
| character_outfits | core | accessories_json |
| elements | core | character_config_json, scene_config_json, feature_anchor_json, reference_image_quality_json, bindings_json |
| media_assets | assets | tags |
| video_templates | video | shots_json, tags |
| storyboard_assets | core | character_ids |
| collections | assets | — |
| ast_templates | templates | tags |
| generation_tasks | video | input_params |

**关联表（5 张）**：story_characters、story_scenes、story_elements、collection_assets、asset_tags。关联表使用复合主键，不包含基础列（`baseColumns: false`）。

**缓存表（6 张）**：video_cache、image_cache、error_logs、sessions、auto_saves、file_index。缓存表同样不包含基础列。

**同步表（3 张）**：sync_changelog、sync_meta、sync_conflict_backup。由 `SCHEMA_FEATURES.sync` 特性开关控制。

**Schema 版本控制**：`CURRENT_SCHEMA_VERSION=3`，迁移在 `db.transaction()` 中执行确保原子性。v3 迁移添加了 `local_video_path` 等列，支持视频本地缓存路径。

**索引策略**：`EXTRA_INDEXES_SQL` 定义了 30+ 个索引，覆盖高频查询路径——视频任务按状态/故事 ID 查询、分镜按故事 ID 查询、缓存按时间/大小查询、模板按分类/使用量排序等。索引不是盲目添加的，每个索引都对应一个已识别的查询热点。

### 6.3 安全操作模式

**参数化查询**：所有 SQL 查询使用参数化语句，禁止字符串拼接。`sql-sanitizer.ts` 提供 `buildSafeUpdate` 和 `buildSafeDelete` 两个安全构建函数，自动处理表名和列名的白名单验证。

**DDL 拦截**：渲染进程中的 SQL 语句经过双重 DDL 检测：

1. **Preload 层**：`validateSqlSafety()` 检查 `db:run` 和 `db:transaction` 通道的参数，DDL 模式（DROP/ALTER/CREATE/TRUNCATE/ATTACH/DETACH）被拦截
2. **主进程层**：`database.ts` handler 中的 `DANGEROUS_PATTERNS` 再次检查

**SQL 注释剥离**：DDL 检测前先剥离 SQL 注释（`/* */` 和 `--`），防止通过注释绕过检测。例如 `DROP/*comment*/TABLE stories` 会被正确识别为 DDL 语句。

**为什么需要双重 DDL 检测**：Preload 层的检测在渲染进程中执行，理论上可以被绕过（如直接调用 `ipcRenderer.invoke`）。主进程层的检测是最后一道防线，确保即使渲染进程被恶意代码控制，也无法执行 DDL 语句。

### 6.4 视频任务状态机

视频任务是项目中最复杂的状态实体，其状态转换由 `TaskMachine` 严格管控：

```
                    ┌──────────┐
          ┌────────→│ pending  │←──────────┐
          │         └────┬─────┘           │
          │              │                 │
     cancelled    generating,failed   cancelled
          │              │                 │
          │         ┌────┴─────┐           │
          │         │generating│           │
          │         └────┬─────┘           │
          │              │                 │
          │   completed,failed,cancelled   │
          │         ┌────┴─────┐           │
          │         │completed │           │
          │         └──────────┘           │
          │                                │
          │         ┌──────┐    ┌────────┐ │
          └─────────│failed│←──│retrying│←┘
                    └──┬───┘    └───┬────┘
                       │            │
                  retrying    generating,
                  cancelled   completed,failed,cancelled
```

**合法转换表**：

| 当前状态 | 可转换到 | 触发条件 |
|---------|---------|---------|
| pending | generating | API 接受任务 |
| pending | failed | API 拒绝任务 |
| pending | cancelled | 用户取消 |
| generating | completed | API 返回视频 URL |
| generating | failed | API 返回错误 / 超时 |
| generating | cancelled | 用户取消 |
| completed | pending | 重新生成 |
| failed | retrying | 智能重试触发 |
| failed | cancelled | 用户取消 |
| retrying | generating | 重试请求被接受 |
| retrying | completed | 重试成功 |
| retrying | failed | 重试失败 |
| retrying | cancelled | 用户取消 |
| cancelled | （终态） | — |

**可轮询状态**：pending、generating、retrying。只有这些状态的任务需要定时轮询 API 查询进度。

**终态**：completed、failed、cancelled。终态任务不参与轮询。

**副作用**：每次转换自动设置副作用字段——generating 时重置 `pollFailureCount`；completed 时设置 `progress: 100` 和 `videoUrl`；failed 时设置 `message`；pending 时清空 `videoUrl` 和 `progress`。

### 6.5 断路器状态机

网络韧性层的断路器按 Provider 隔离：

```
CLOSED ──(连续失败 ≥ 阈值)──→ OPEN
  ↑                              │
  │                              │(等待恢复超时)
  │                              ↓
  └──(成功 ≥ 阈值)──── HALF_OPEN
                              │
                    (任何失败) │
                              ↓
                            OPEN
```

| 状态 | 行为 | 转换条件 |
|------|------|---------|
| CLOSED | 请求直接通过 | 连续失败 ≥ failureThreshold（默认 3）→ OPEN |
| OPEN | 所有请求快速失败 | 等待 recoveryTimeout（默认 30s）→ HALF_OPEN |
| HALF_OPEN | 允许有限请求通过 | 成功 ≥ successThreshold（默认 2）→ CLOSED；任何失败 → OPEN |

### 6.6 端到端数据流

**用户保存故事的完整数据流**：

```
用户点击保存 / Ctrl+S
  → useStorySaver.handleSave()
    → savingRef.current = true（并发守卫）
    → storyIdAtSaveStart = currentStory.id（快照）
    → storyService.update(id, data)
      → updateStoryInputSchema.safeParse()（验证）
      → container.storyStorage.updateStory(id, data)
        → safeRun(UPDATE stories SET ... WHERE id = ?)（IPC: db:run）
        → trackChange("stories", id)（变更追踪）
      → container.eventBus.emit(STORY_UPDATED)（事件通知）
    → currentStoryIdRef.current === storyIdAtSaveStart?（上下文验证）
    → setStories() + setCurrentStory()（React 状态更新）
    → markClean("story")（清除 dirty 标记）
    → success toast
    → savingRef.current = false
```

**视频任务轮询的完整数据流**：

```
polling-engine (5-15s interval)
  → getActiveTasks()（IPC: db:query）
  → for each task where TaskMachine.isPollable(status):
    → apiClient.pollTask(provider, taskId)
      → resilient-fetch（断路器检查 → 重试策略 → HTTP 请求）
    → TaskMachine.transition(task, newStatus, context)
    → container.videoTaskStorage.batchUpdateVideoTasks(batchUpdates)（批量更新，单次 safeTransaction）
      → safeTransaction([UPDATE ...], [UPDATE ...], ...)（IPC: db:transaction，批量）
    → Promise.allSettled(batchUpdates.map(t => trackChange("video_tasks", t.id)))（并行变更追踪）
    → if completed: emitToast("视频生成完成", taskLabel)
    → if failed: smartRetryEngine.evaluate(task)
      → if retryable: TaskMachine.transition(task, "retrying")
      → else: emitToast("error", taskLabel)
```

**角色删除的完整数据流**：

```
用户确认删除
  → characterService.delete(id)
    → deleteCharacterWithRefs(id)
      → safeQuery(SELECT image paths)（收集文件路径）
      → safeTransaction([
          DELETE FROM story_characters WHERE character_id = ?,
          UPDATE story_beats SET character = NULL WHERE character = ?,
          DELETE FROM character_outfits WHERE character_id = ?,
          DELETE FROM characters WHERE id = ?
        ])（IPC: db:transaction，原子操作）
      → removeIdFromJsonArray("story_beats", "character", id, "character_ids_json")
      → removeIdFromJsonArray("storyboard_assets", "character", id, "character_ids")
      → cleanupLocalFiles([...paths])（删除本地图片文件）
    → onUpdateStoriesAfterDelete(id, stories)
      → for each affected story: storyService.update()（逐个 try-catch）
      → if partial failure: showError("部分故事引用未清除", failedList)
    → TanStack Query invalidation → UI 刷新
```

## 七、Electron 主进程架构

### 7.1 进程模型

```
主进程 (main.ts)
  ├── 窗口管理、生命周期
  ├── IPC Handler 注册
  ├── 数据库初始化
  ├── HTTP API Server
  └── 插件注册

渲染进程 (Next.js static export)
  ├── 页面路由
  ├── React 组件树
  └── 通过 IPC 与主进程通信

Preload (preload.ts)
  ├── IPC 桥接
  ├── 5 级权限系统
  ├── 速率限制
  └── DDL 拦截
```

**为什么渲染进程不直接访问数据库**：Electron 的安全模型要求渲染进程（加载远程/本地 HTML）不应有完整的 Node.js 访问权限。通过 Preload 脚本暴露受控的 IPC 接口，渲染进程只能执行预定义的操作，且每个操作都经过权限检查和速率限制。

### 7.2 IPC 安全体系

5 级权限从低到高：

| 权限级别 | 通道 | 设计意图 |
|---------|------|---------|
| READONLY | db:query, db:get, db:stats, db:type, config:get, secure-config:load, secure-config:has, assets:read-file-base64, assets:get-dir, assets:file-exists, fs:read-file, cache:get-cache-directory, fs:get-file-info, fs:get-disk-space, image:to-base64, export:data | 只读操作，无副作用，安全性最高 |
| READWRITE | db:run, db:batch-insert, db:init, db:save, config:set, secure-config:save, secure-config:delete, assets:save-image, assets:save-buffer, assets:copy-file, fs:write-file, image:normalize | 读写操作，有副作用但可控 |
| DANGEROUS | db:transaction, db:migrate, db:vacuum, db:analyze, db:checkpoint, assets:delete-file | 危险操作，可能影响数据完整性 |
| SYSTEM | shell:open-external, dialog:open-file, dialog:save-file, db:close | 系统级操作，涉及外部程序或关键资源 |
| SECURE | secure-config:resolve | 安全操作，解密 API Key |

**速率限制**：每个通道独立限流。db:query 通道 3000 次/分钟，db:run/db:transaction 通道 600 次/分钟，READONLY 通道 5000 次/分钟，其他通道 300 次/分钟。全局限制 10000 次/分钟。超过限制的调用直接抛出错误。限流历史每 60 秒清理一次，防止内存泄漏。

**未注册通道拦截**：调用未在 `IPC_PERMISSIONS` 中注册的通道时，请求被拒绝并通过 `log:security` 通道记录安全日志。这防止了恶意代码通过未授权通道与主进程通信。

### 7.3 崩溃恢复

桌面应用必须能从瞬态错误中恢复——网络超时、数据库忙碌、IPC 故障都不应导致应用退出。

**uncaughtException / unhandledRejection**：只记录日志，不调用 `app.exit()`。这是与 Web 应用最大的不同——Web 应用刷新页面即可恢复，桌面应用退出意味着用户丢失所有未保存的工作。

**渲染进程崩溃**：`render-process-gone` 事件设置 `isRendererCrashed` 标志并销毁窗口。`window-all-closed` 事件检查此标志——如果为 true，1 秒后自动重建窗口；如果为 false（用户主动关闭），调用 `app.quit()`。这种区分确保崩溃后自动恢复，而用户主动关闭时正常退出。

**GPU 进程崩溃**：`child-process-gone` 事件中，`details.type === "GPU"` 触发 `webContents.reload()`。GPU 进程崩溃通常由驱动问题引起，重载页面可以重新初始化 GPU 进程。其他子进程退出仅记录警告。

**优雅关闭序列**：

```
before-quit → gracefulShutdown()
  → 销毁窗口
  → 关闭静态服务器（destroy 所有 tracked connections）
  → stopApiServer()（destroy 所有 tracked connections，关闭 HTTP server）
  → closeDatabase()（关闭 SQLite 连接）
  → app.quit()
```

**静态服务器连接追踪**：`activeConnections: Set<net.Socket>` 追踪所有 HTTP 连接。关闭时，所有追踪的连接调用 `destroy()` 后才调用 `server.close()`。这防止了 keep-alive 连接阻止进程退出——一个常见的 Electron 关机挂起问题。

### 7.4 AI Provider 插件系统

10 个内置 Provider 通过声明式插件注册：

| Provider | ID | 视频 | 图片 | 文本 | 视觉 |
|----------|-----|------|------|------|------|
| 火山引擎 (Doubao) | volcengine | 是 | 是 | — | — |
| 可灵AI (Kling) | kuaishou | 是 | — | — | — |
| 智谱AI (GLM) | zhipu | 是 | 是 | — | — |
| Pixverse | pixverse | 是 | — | — | — |
| Seedance | seedance | 是 | — | — | — |
| Google (Veo) | google | — | 是 | 是 | 是 |
| OpenAI (Sora) | openai-sora | 是 | — | — | — |
| MiniMax (Hailuo) | minimax | 是 | 是 | — | — |
| Anthropic (Claude) | anthropic | — | — | 是 | 是 |
| OpenAI Compatible | openai-compatible | 是 | 是 | 是 | 是 |

**插件架构**：每个 Provider 继承 `BaseAIProviderPlugin`，实现 `match(apiUrl, model)` 方法用于自动识别，以及 `buildVideoRequest`、`buildImageRequest`、`buildTextRequest`、`buildVisionRequest` 方法用于构建 API 请求。`OpenAICompatiblePlugin` 作为回退（fallback），匹配所有未被其他 Provider 识别的 API URL。

**用户自定义插件**：`user-plugin-loader.ts` 从 `%APPDATA%/ai-animation-studio/Plugins/` 目录加载 `.plugin.json` 文件。插件配置使用 `user-plugin-schema.ts` 定义的 JSON Schema 验证，支持自定义 API 端点映射、请求/响应格式和认证方式。用户无需编写代码即可接入任意兼容 OpenAI API 格式的 AI 服务。

**为什么用插件而非硬编码**：AI 提供商的 API 格式、参数、认证方式各不相同且频繁变更。插件模式将每个 Provider 的适配逻辑隔离在独立文件中，修改一个 Provider 不影响其他。新增 Provider 只需创建一个继承 `BaseAIProviderPlugin` 的类并注册，无需修改核心代码。

### 7.5 安全机制

**API Key 存储**：通过 `electron-store` 加密存储，访问路径为 IPC 的 `secure-config:*` 通道（save、load、resolve、delete、has）。渲染进程永远无法直接读取加密存储——`secure-config:resolve` 是唯一能获取解密后 API Key 的通道，属于 SECURE 权限级别。

**SSRF 防护**：所有主进程发出的 HTTP 请求经过 `ssrf-guard.ts` 检查，阻止对内网地址（127.0.0.1、10.0.0.0/8、172.16.0.0/12、192.168.0.0/16）和 IPv6 链路本地地址的请求。IPv6 链路本地检测使用首段解析：`(value & 0xffc0) === 0xfe80`，而非字符串匹配，避免 `fe80::1` 的各种缩写形式绕过检测。

**X-Electron-App 头**：所有 API 请求必须携带 `X-Electron-App` 头，服务端验证此头以确认请求来自合法的 Electron 应用。这防止了浏览器或脚本直接调用 API。

**错误日志脱敏**：`error-logger.ts` 中的 `API_KEY_PATTERNS` 匹配 API Key 模式（如 `sk-xxx`、`key-xxx`、`api_key=xxx`），在日志写入前自动编辑。这防止了 API Key 通过日志文件泄露。

### 7.6 日志系统

**双传输**：`ConsoleTransport` + `FileTransport`。生产模式最低级别 info，开发模式最低级别 debug。

**日志文件**：
- 生产：`%APPDATA%/ai-animation-studio/logs/app-YYYY-MM-DD.log`
- 开发：`%APPDATA%/ai-animation-studio/logs/dev-YYYY-MM-DD.log`

**日志轮转**：单文件 10MB 触发重命名为 `.1` 备份，最多保留 5 个日志文件，最老的自动删除。

**刷新策略**：5 秒间隔批量写入，队列超过 100 条时立即刷新。这种设计平衡了性能（减少磁盘 I/O 次数）和可靠性（确保关键日志及时落盘）。

**Logger 方法签名**：

```typescript
logger.info(message: string, context?: LogContext)   // 2 参数
logger.warn(message: string, context?: LogContext)   // 2 参数
logger.error(message: string, error?: Error, context?: LogContext)  // 3 参数
```

error 方法接受可选的 Error 对象，便于同时记录错误消息和堆栈跟踪。

## 八、网络韧性层

### 8.1 三层防护

网络请求面临三类问题：瞬时故障（超时、网络抖动）、持续故障（服务宕机）、限流（API 配额耗尽）。三层防护分别应对：

**Circuit Breaker（断路器）**：CLOSED → OPEN → HALF_OPEN 状态机。

- CLOSED：正常状态，请求直接通过。连续失败达到阈值（默认 3 次）后转为 OPEN。
- OPEN：熔断状态，所有请求立即失败（快速失败），不发送网络请求。等待恢复超时（默认 30 秒）后转为 HALF_OPEN。
- HALF_OPEN：半开状态，允许有限数量的请求通过（默认 3 个并发）。成功达到阈值（默认 2 次）后转为 CLOSED；任何失败立即转回 OPEN。

断路器按 Provider 隔离——一个 Provider 熔断不影响其他 Provider 的请求。这是必要的，因为不同 AI 提供商的服务独立性很高，火山引擎宕机不应阻止对 Google Veo 的请求。

**Resilient Fetch**：自动重试 + 指数退避 + 抖动 + 分块下载 + 断点续传 + 进度回调。拦截器链（interceptor chain）架构允许在请求前后插入日志、重试、缓存等逻辑。

**Retry Executor**：可配置的重试执行器，4 种预设策略：

| 策略 | 最大重试 | 基础延迟 | 最大延迟 | 退避方式 |
|------|---------|---------|---------|---------|
| api | 3 | 1000ms | 10000ms | exponential |
| video | 5 | 2000ms | 30000ms | exponential |
| download | 3 | 1000ms | 5000ms | linear |
| status | 5 | 3000ms | 15000ms | exponential |

抖动公式：`delay * (0.5 + random() * 0.5)`，避免多个客户端同时重试造成"惊群效应"。可重试错误码：NETWORK_ERROR、TIMEOUT、RATE_LIMITED、API_SERVER_ERROR、ECONNREFUSED、ETIMEDOUT。

### 8.2 错误分类体系

**12 个错误域**：database、validation、api、network、storage、generation、recovery、cache、config、auth、state、system。每个错误码归属于一个域，域决定了错误的处理策略——database 域的错误可能需要重试，validation 域的错误不应重试。

**33 个结构化错误码**：从 `DATABASE_ERROR` 到 `LOG`，每个错误码包含 code（字符串标识）、domain（所属域）、description（中文描述）、retryable（是否可重试）。`isRetryable(code)` 函数查询错误码的可重试属性，指导重试决策。

**9 个错误类别**：timeout、rate_limit、quota、invalid_params、network、server_error、database_busy、auth、unknown。错误类别是错误码的粗粒度分组，用于 UI 展示和通用处理逻辑。

**分类策略**：两阶段分类——先查 `ERROR_CATEGORY_MAP`（精确匹配错误码到类别），再查 `CATEGORY_PATTERNS`（正则匹配错误消息回退）。例如 `TIMEOUT_ERROR` 精确映射到 `timeout` 类别；而未知错误码 `CUSTOM_TIMEOUT` 则通过正则 `/timeout/i` 匹配到 `timeout` 类别。

**为什么不用 `message.includes("timeout")`**：字符串子串匹配是脆弱的——`"Rate limit timeout"` 会被错误分类为超时而非限流。结构化错误码 + 正则回退的两阶段策略确保了精确匹配优先，模糊匹配兜底。

**12 个语义化错误类**：AppError（基类）、DatabaseError、ValidationError、ApiError、NotFoundError、NetworkError、StorageError、ConfigurationError、GenerationError、TimeoutError、RateLimitError、AuthenticationError。每个错误类包含 `code` 字段用于程序化分类，避免依赖 `message.includes()` 的脆弱字符串匹配。

**Result 类型**：`ok(value)` / `err(code, message, cause?)` / `fromThrowable(fn)` / `fromAsyncThrowable(fn)`。选择 Result 类型而非 try/catch 的原因：类型安全（编译器强制处理错误路径）、可组合（`Result.map()`、`Result.andThen()` 支持链式操作）、可追溯（每个错误都有 code 和 context）。

## 九、AI 维护基础设施

### 9.1 机器可读契约体系

三级契约确保 AI 在修改代码时遵循架构约束：

**第一级：MODULE.md**（模块概览，50-150 行）

- 模块职责（一句话）
- 子域结构表（子域名、路径、职责）
- 公共 API 列表（hooks、services、components、types）
- 依赖列表
- 边界约束
- AI 维护指南链接

**第二级：contract.json**（子域契约，30-80 行/子域）

```json
{
  "name": "story-prompt-editor",
  "description": "提示词编辑：AI 辅助提示词生成、编辑、预览、浮动助手",
  "dependencies": ["story-beat-editor", "story-generation", "domain-schemas"],
  "publicAPI": {
    "hooks": ["usePromptEditor"],
    "services": ["generatePromptWithAI", "buildDefaultPrompt"],
    "components": ["PromptEditor", "PromptFloatingBall"]
  },
  "invariants": [
    "AI 生成失败时必须回退到默认提示词",
    "提示词编辑状态必须在 context 变更时重置"
  ]
}
```

invariants 是不可协商的业务规则。违反不变量的修改必须改变方案或显式更新不变量并说明理由。

**第三级：.ai/modules/**（详细维护指南）

包含模块特定的修改规则、子域交互图、常见修改场景的操作步骤。

**第四级：index.ts**（实际桶文件导出）

是契约的执行层——其他模块只能通过桶文件导入公共 API。

### 9.2 自动化验证

四个验证脚本在 CI 和 pre-commit 中执行：

**check-architecture.mjs**：检测 DDD 违规（shared→modules、domain→infrastructure 导入）、裸 SQL 检测（未使用参数化查询的 SQL 字符串）、深层路径导入（`@/modules/xxx/yyy/zzz`）、contract.json 一致性。

**check-module-api-consistency.mjs**：检查 MODULE.md 中列出的公共 API 是否与 index.ts 的实际导出一致。如果 MODULE.md 声明了 `useStoryPlanner` 但 index.ts 未导出，脚本报错。

**validate-contracts.mjs**：验证 contract.json 的 JSON 有效性、invariants 完整性（每个子域至少 1 条不变量）、导出存在性（publicAPI 中列出的名称在 index.ts 中存在）、大小约束（contract.json 不超过 5KB，防止过度膨胀）。

**ESLint 架构守卫规则**：在编辑器实时执行，禁止 shared→modules 导入、domain→infrastructure 导入、modules 深层路径导入。生产代码中违反为 error，测试代码中为 warn。

### 9.3 44 条回归防护

回归防护规则来自四次 Bug 审计，每条规则对应一个已发生的真实 Bug：

**数据一致性（R1, R2, R8, R9, R13, R14）**：

- R1：持久化优先于状态更新——存储写入必须在 React 状态更新之前完成
- R2：删除必须级联——删除实体时清理所有关联资源（VideoTask、缓存、媒体引用）
- R8：自动保存必须覆盖无 ID 的新实体——新故事（id: ""）也必须可自动保存
- R9：乐观更新失败时必须回滚——blob URL 上传失败后恢复原始 URL
- R13：破坏性导入使用 Write-Then-Clean 模式——先写新数据，再清旧数据
- R14：异步 AI 分析结果必须合并而非替换——保留用户在分析期间的编辑

**异步安全（R4, R10, R11, R12）**：

- R4：重复请求去重优于中止——AbortController.abort() 无法取消已发送的 HTTP 请求
- R10：异步保存操作使用 ref 守卫防止并发——React state 在闭包中捕获过时值
- R11：跨实体异步回调必须验证所有权——用户切换故事后，视频完成回调不应更新旧故事
- R12：破坏性覆盖操作必须警告进行中的任务——AI 规划覆盖分镜前检查视频任务

**错误处理（R5, R6, R15, R17, R18）**：

- R5：后台操作失败必须通知用户——自动保存重试耗尽后 toast 告警
- R6：用户可见错误信息使用可识别标签——"分镜 3"而非 "a1b2c3d4"
- R15：批量删除操作对部分失败有韧性——逐个 try-catch，成功删除的从 store 移除
- R17：级联更新对部分失败有韧性——每个关联实体独立处理，收集失败列表
- R18：存储配额错误必须通知用户——QuotaExceededError 后 toast 告警

**数据一致性扩展（R30）**：

- R30：级联删除操作必须原子——所有 DELETE/UPDATE 语句在同一 `safeTransaction` 中执行，拆分为多个事务会导致部分完成的数据不一致

**异步安全扩展（R29, R31, R32）**：

- R29：异步回调必须验证实体 ID 一致性——异步操作完成时，检查操作开始时的实体 ID 是否仍为当前实体 ID
- R31：用户主动触发的异步保存必须验证实体上下文——保存开始时快照实体 ID，保存完成后验证当前实体 ID 未变
- R32：批量生成循环必须检查组件卸载取消——`cancelledRef` + useEffect cleanup + 循环内 break

**UI 健壮性（R7, R16, R19, R20）**：

- R7/R19：Video onError 必须使用 data-retried 守卫——防止 fallback URL 也失败时的无限循环
- R16/R20：ErrorBoundary 重试次数限制（默认 3 次）——确定性错误不应无限重试

**Electron 兼容（R21）**：禁止 `fetch("/api/...")`——Electron + output: "export" 无服务端，所有内部通信走 DI/IPC/代理导出

**UX 完整性（R22-R25）**：

- R22：异步删除按钮有 loading 状态
- R23：异步保存/编辑按钮有 loading 状态
- R24：用户显式操作有成功 toast 反馈
- R25：数据依赖 UI 显示 loading 指示器

**代码质量（R3, R26, R27, R28, R33）**：

- R3：跨上下文状态更新必须验证所有权
- R26：不必要的动态导入替换为静态导入
- R27：App 层访问基础设施必须通过 DI 容器
- R28：批量查询优于 N+1 循环查询——Storage 层的 getAll 方法必须使用批量查询（一次查询所有关联数据，内存按父 ID 分组），而非逐条查询关联数据
- R33：写操作前的存在性检查应尽可能消除——UPDATE WHERE id=? 自然处理不存在的记录（影响 0 行），无需预先 SELECT

**Vibe Coding 审计（R34-R36）**：

- R34：Zustand store 更新必须使用函数式 `set(state => ...)`——`get()+set({})` 模式在并发时会覆盖其他更新
- R35：Blob URL 必须在组件卸载时 revoke——`URL.createObjectURL()` 创建的预览 URL 需用 `useRef` 跟踪并在 useEffect cleanup 中释放
- R36：异步 AI 分析结果必须选择性合并——只覆盖 AI 产生的字段（`??` 运算符），不能 spread 覆盖用户正在编辑的 `name`/`description`

**IPC 效率（R39-R41）**：

- R39：批量 DB 操作禁止退化为逐条 IPC——批量更新/删除使用 `batchUpdateVideoTasks`/`batchDeleteVideoTasks`（单次 `safeTransaction`），存在性检查使用 `SELECT WHERE IN` 而非逐条 `safeQuery`
- R40：元数据更新必须延迟合并——`imageCacheStorage` 的 `last_accessed_at` 更新通过 5s debounce timer 批量合并为单次 `safeTransaction`，而非每次读取触发 `safeRun`
- R41：trackChange 必须并行执行——批量操作后的 `trackChange` 调用使用 `Promise.allSettled` 而非串行 `for...of` 循环

**数据一致性扩展（R42）**：

- R42：Auto-Save 必须使用乐观锁——`INSERT OR REPLACE` 会无条件覆盖用户新修改，必须使用 `ON CONFLICT(id) DO UPDATE SET ... WHERE timestamp < excluded.timestamp`，写入 0 行时需二次查询确认

**UX 完整性扩展（R43）**：

- R43：破坏性 UI 操作必须确认——删除/批量删除操作必须 `await confirm({ variant: "danger" })` 后才能执行，取消时中止

**错误消息（R44）**：

- R44：用户可见错误消息必须使用 `mapUserFacingError`——禁止 `e.message`、`extractErrorMessage()` 或技术术语直接展示给用户，必须通过 `mapUserFacingError()` 映射为用户友好中文消息

### 9.4 Bug 审计方法论

44 条回归防护来自四次定向 Bug 审计，审计遵循"使用驱动发现 + 结构化验证固化"方法论。完整操作手册见 `docs/bug-audit-methodology.md`，此处记录核心框架。

**三阶段工作流**：

1. **场景推演**：AI 模拟真实用户，从操作中自主发现断裂点。不预设问题类别，不套用检查清单——每个场景必须绑定具体用户操作，输出用户操作 + 代码路径 + 断裂点假设 + 优先级
2. **定向举证**：在代码中查找证据，每个场景给出三种结论之一——[已证实]（附最小触发序列和修复方向）、[已排除]（附防御机制）、[需确认]（附缺失信息）
3. **规则固化**：将证实的 Bug 抽象为可复用的检测规则，写入 `regression-guards.md`、`check-architecture.mjs` 或 ESLint 规则

**隔离原则（CRITICAL）**：阶段三产出的规则是**回归防护**，不是**发现工具**。下一轮审计的阶段一必须从零开始推演场景，禁止参考任何阶段三规则。如果阶段一变成了"对着规则清单检查"，就违背了"AI 自主思考"的核心原则。

**四种使用模式**：

| 模式 | 触发方式 | 阶段一范围 |
|------|---------|-----------|
| A. 全量审计 | 从打开应用开始模拟完整使用流程 | 所有核心功能页面 |
| B. 聚焦审计 | 指定功能名称 | 仅围绕该功能的使用场景 |
| C. 修复后回归 | 描述刚修复的 Bug | 仅该 Bug 对应的场景 |
| D. 单模块深度 | 指定模块路径 | 仅该模块支撑的用户功能 |

## 十、开发指南

### 10.1 环境准备

- Node.js 18+、npm、PowerShell（Windows）
- `npm install` 安装依赖
- `npm run dev` 启动 Next.js 开发服务器（仅渲染进程，无 Electron）
- `npm run build:electron` 完整 Electron 构建

better-sqlite3 是原生模块，测试前需要 `npm rebuild better-sqlite3`（为 Node.js 重建），Electron 打包前由 `@electron/rebuild` 自动重建。

### 10.2 关键命令

| 命令 | 用途 |
|------|------|
| `npm run dev` | Next.js 开发服务器（仅渲染进程） |
| `npm run build:electron` | 完整 Electron 构建 |
| `npm run build:win` | 构建 Windows NSIS 安装包 |
| `npm run build:mac` | 构建 macOS DMG |
| `npm run validate` | typecheck + lint + architecture + contracts + test |
| `npm run validate:full` | validate + coverage |
| `npm run test` | Vitest 单元测试 |
| `npm run test:coverage` | Vitest 覆盖率报告 |
| `npm run lint` | ESLint（src/） |
| `npm run lint:electron` | ESLint（electron/src/） |
| `npm run lint:arch` | DDD 架构违规扫描 |
| `npm run typecheck` | TypeScript 检查（根） |
| `npm run typecheck:electron` | TypeScript 检查（electron/） |

### 10.3 编码约定

**无注释**：代码中不添加注释，除非明确要求。意图通过命名和结构表达。

**ID 生成**：使用 `crypto.randomUUID()`，不用 `Date.now() + Math.random`。后者在高并发下可能碰撞。

**useRef 避免闭包陷阱**：useEffect 中引用外部状态时，使用 useRef 保存最新值的引用。React state 在闭包中捕获的是创建时的值，不是最新值。

```typescript
const beatsRef = useRef(beats);
beatsRef.current = beats;

useEffect(() => {
  const updates = buildVideoUrlUpdates(beatsRef.current, completedUrls);
  setBeats(updates);
}, [completedUrls]);
```

**异步操作取消守卫**：所有 useEffect 中的异步操作必须有取消守卫，防止组件卸载后更新状态。

```typescript
useEffect(() => {
  let cancelled = false;
  fetchData().then(data => {
    if (!cancelled) setState(data);
  });
  return () => { cancelled = true; };
}, []);
```

**Result<T> 必须解包**：函数返回 `Result<T>` 时，调用方必须检查 `result.ok` 后才能使用 `result.value`。直接赋值 `Result<T>` 给期望 `T` 的变量是类型错误。

**unknown 优于 any**：捕获异常时使用 `unknown` 类型，通过 `instanceof Error` 安全访问属性。

**emitToast() 用于非 React 代码**：Zustand store、轮询引擎等非 React 代码不能使用 `useToastHelpers`（Hook），必须使用 `emitToast()` 从 `@/shared/utils/toast-bridge` 发送通知。

**withTransitionGuard**：状态机转换守卫。开发模式下无效转换抛出 `TransitionError`（立即发现问题），生产模式下静默剥离 status 字段（不中断用户操作）。

**事件传播隔离**：可点击容器内的嵌套操作按钮（如列表项内的删除按钮）必须调用 `e.stopPropagation()`，防止容器的 onClick 触发。

### 10.4 状态管理策略

项目使用三种状态管理工具，各有明确的适用边界：

| 工具 | 适用场景 | 文件数 | 典型用例 |
|------|---------|--------|---------|
| React Query | 服务端状态（异步数据获取/缓存/同步） | 16 | `useCharacters`、`useScenes`、`useMediaAssets`、`useVideoTasks` |
| Zustand | 跨组件客户端状态（需在非 React 代码中访问） | 3 | `useVideoTaskStore`（视频任务轮询状态）、`useDirtyState`（脏状态追踪）、`appStore`（应用全局状态） |
| React Context | UI 组合状态（组件树级别注入） | 3 | `StoryProvider`（Story 页面组合逻辑）、`ThemeProvider`（主题切换）、`Toast`（通知系统） |

**选择决策树**：

1. 数据来自异步 API/数据库？→ **React Query**（自动缓存、重试、stale-while-revalidate）
2. 需要在非 React 代码（Zustand store、轮询引擎）中读写？→ **Zustand**（`getState()`/`setState()` 无需 Hook）
3. 仅在组件树内传递，不需要跨页面持久化？→ **React Context**（轻量、无额外依赖）
4. 以上都不满足？→ **React useState**（组件局部状态）

**反模式**：
- 不要用 Zustand 管理 React Query 已覆盖的数据（重复缓存、同步问题）
- 不要用 Context 传递需要跨页面持久化的状态（Context 随页面卸载销毁）
- 不要在 Zustand store 中存储可从 React Query 缓存派生的数据

### 10.5 测试约定

**框架**：Vitest，文件命名 `*.test.ts` / `*.test.tsx`。

**Mock 策略**：

- `vi.hoisted()`：用于模块导入前必须存在的 mock 函数
- `vi.mock()`：模块级 mock（DI 容器、外部包、UI 组件）
- `overrideToken()`：替换 DI 容器中的特定 token
- UI 组件 mock：`@/shared/ui/*` mock 为简单 HTML 元素
- `next/link` mock 为 `<a>` 标签

**测试结构**：

```typescript
// 1. Hoisted mocks（模块导入前）
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }));

// 2. Module mocks
vi.mock("@/infrastructure/di", () => ({ container: { ...mockFn } }));

// 3. Import SUT
import { ComponentName } from "../ComponentName";

// 4. Factory functions
function buildProps(overrides = {}) { return { ...defaults, ...overrides }; }

// 5. Test suite
describe("ComponentName", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("does something", () => { ... });
});
```

**覆盖率阈值**：Branches 70%、Functions 70%、Lines 70%、Statements 70%，perFile 强制执行。覆盖范围包括 domain schemas、services、infrastructure core、shared utils。

**测试文件位置**：
- Services：`src/modules/{module}/{subdomain}/services/__tests__/{service}.test.ts`
- Hooks：`src/modules/{module}/{subdomain}/hooks/__tests__/{hook}.test.ts`
- Components：`src/modules/{module}/presentation/__tests__/{Component}.test.tsx`

### 10.6 构建与发布

**build-electron.ps1 执行流程**：

1. 临时移除 `src/app/api/` → Next.js `output: "export"` 不允许 API 路由
2. `next build` → 静态 HTML/JS/CSS 输出到 `out/`
3. `tsc -p electron/tsconfig.json` → 编译主进程 TypeScript
4. 复制编译产物、插件文档到输出目录
5. 恢复 `src/app/api/` → 开发模式正常工作

**electron-builder 打包**：
- `out/` 打包为 asar（Electron 应用归档格式）
- better-sqlite3 原生模块通过 `asarUnpack` 解包（原生 .node 文件无法在 asar 内加载）
- 构建时依赖（next、@next/swc*、sharp、shadcn）排除在 electron-builder `files` 外，减小包体积

**发布流程**：
- 推送 `v*` tag 触发 GitHub Actions release workflow
- 自动执行 build:electron → rebuild native → electron-builder --publish always
- 生成 Windows NSIS 安装包和 macOS DMG

### 10.7 修改检查清单

每次代码修改后，验证以下项目：

1. 依赖方向：无 shared→modules 或 domain→infrastructure 导入
2. 错误诚实：所有错误路径返回失败指示，非静默"成功"
3. DI 必要性：只有有状态/可测试替换/基础设施桥接项在容器中
4. 静态导入：无动态导入除非证明存在循环依赖
5. 事件隔离：嵌套点击处理器使用 stopPropagation()
6. Result 解包：Result<T> 值在使用前解包
7. 契约同步：公共 API 变更时更新 MODULE.md + contract.json + index.ts
8. 测试覆盖：新 services/hooks 有 __tests__/ 下的测试
9. 验证通过：`npm run validate:full`
10. Video onError 守卫：所有 `<video>` onError 使用 data-retried 守卫
11. 无 fetch("/api/...")：所有内部通信使用 DI/IPC/代理导出
12. 异步按钮 loading：删除/保存确认按钮有 loading 状态
13. 操作反馈：显式用户操作提供成功 toast
14. 数据加载指示器：数据依赖 UI 在加载时显示 spinner

### 10.8 已知架构债务

- **WASM 冗余包**：`@emnapi/core`、`@emnapi/runtime` 等 better-sqlite3 的 optional deps 存在于 node_modules 中，源码无任何 import，无法修剪，无害
- **better-sqlite3 版本锁定**：`12.10.0`（无 ^前缀），锁定原因是原生模块升级可能导致 Electron 重建失败，升级需手动验证兼容性
- **story 模块体量大**：9793 行（占模块总量 35.5%），包含 5 个子域（beat-editor、generation、planning、template、prompt-editor），功能内聚性较强，暂不拆分

### 10.9 未来发展规划

- **网络层激活**：当前网络层（断路器、重试执行器、请求生命周期、拦截器链、网络监控）已实现但激活度不足。AI Provider 的 `fetch()` 调用未走网络层，apiClient 仅用于本地 IPC。规划：v1.0 后将 AI Provider 的外部 API 调用迁移到 `resilient-fetch`，让断路器保护多 Provider 并发场景，重试器处理 429/500，网络监控驱动离线队列。届时网络层从"预埋基础设施"升级为"必要基础设施"
- **UI 层国际化完成**：840+ 键的 messages.ts 已覆盖核心 UI 文本，但 shared/presentation、app/、modules/*/presentation 中仍有约 1500+ 处中文硬编码需迁移。AI 提示词模板和日志文本按规则不迁移
- **测试覆盖均衡化**：storage 层测试密集（16个文件），但 character/scene/asset 的 hook 层测试薄弱。规划：优先补充 CRUD hook 和 presentation 组件的行为测试
