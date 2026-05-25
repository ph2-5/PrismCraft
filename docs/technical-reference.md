# AI Animation Studio 技术文档

> 版本：1.0 | 最后更新：2026-05-23 | 代码规模：104,000 行 / 633 文件

---

## 目录

1. [架构总览与设计哲学](#1-架构总览与设计哲学)
2. [Domain 层——类型系统与 Port 接口](#2-domain-层类型系统与-port-接口)
3. [Modules 层——12 个业务模块详解](#3-modules-层12-个业务模块详解)
4. [Infrastructure 层——存储、AI Provider、网络、DI](#4-infrastructure-层存储ai-provider网络di)
5. [Electron 主进程——生命周期、IPC、安全、数据库](#5-electron-主进程生命周期ipc安全数据库)
6. [前端工程——Hooks、状态管理、Presentation](#6-前端工程hooks状态管理presentation)
7. [跨切面关注——错误处理、日志、安全、测试](#7-跨切面关注错误处理日志安全测试)
8. [构建与部署](#8-构建与部署)

---

# 1. 架构总览与设计哲学

## 1.1 项目定位

AI Animation Studio 是一款面向动画制作领域的 AI 驱动桌面应用。它将"故事创作→分镜生成→视频合成"的完整动画制作流程搬上桌面，通过多 AI Provider（可灵、Vidu、Pika、Runway 等）提供图像生成、视频生成、文本分析等能力。

**核心设计目标**：
- **本地优先**：所有数据存储在本地 SQLite，离线可用，不依赖云同步
- **AI 多供应商**：通过 Port/Adapter 模式解耦 AI Provider，支持热切换
- **长任务韧性**：视频生成是分钟级长耗时任务，需要状态机守卫、智能重试、崩溃恢复
- **架构可演进**：DDD 分层 + JSON 容器模式，避免 Schema 变更的破坏性

## 1.2 技术栈

| 层级 | 技术选型 | 选型理由 |
|------|---------|---------|
| 桌面框架 | Electron | 跨平台、Node.js 生态、本地文件系统访问 |
| 前端框架 | Next.js 16 (output: "export") | React 19 + App Router，静态导出给 Electron |
| 状态管理 | Zustand 5 | 轻量、TypeScript 友好、支持中间件 |
| 样式方案 | Tailwind CSS 4 | 原子化 CSS，与组件化开发契合 |
| 本地数据库 | better-sqlite3 (WAL 模式) | 同步 API、高性能、WAL 支持并发读写 |
| 类型验证 | Zod | 运行时 Schema 验证 + TypeScript 类型推导 |
| 构建脚本 | PowerShell (build-electron.ps1) | Windows 原生，支持复杂构建流程 |
| 测试框架 | Vitest | 快速、ESM 原生、与 Vite 生态一致 |

## 1.3 分层架构

项目采用 DDD（领域驱动设计）分层架构，依赖方向严格单向向内：

```
┌─────────────────────────────────────────────────┐
│  app/          Next.js 页面和布局                  │
├─────────────────────────────────────────────────┤
│  modules/      业务逻辑子域（12 个模块）            │
├─────────────────────────────────────────────────┤
│  domain/       纯类型、Schema、Port 接口            │
├─────────────────────────────────────────────────┤
│  shared/       跨切面 UI、工具、事件总线             │
├─────────────────────────────────────────────────┤
│  infrastructure/ DI 容器、存储、AI Provider、网络    │
└─────────────────────────────────────────────────┘
         ↕ IPC ↕
┌─────────────────────────────────────────────────┐
│  electron/src/ 主进程、数据库、安全、插件            │
└─────────────────────────────────────────────────┘
```

**依赖规则（关键约束）**：

| 层 | 可导入 | 禁止导入 |
|----|-------|---------|
| domain | 无（纯类型层） | modules、infrastructure、shared |
| shared | domain | modules、infrastructure |
| modules | domain、shared、infrastructure/di | infrastructure/*（di 除外） |
| infrastructure | domain、shared | modules |
| app | modules、shared、domain | infrastructure（通过 modules 间接访问） |

这些规则通过 ESLint `no-restricted-imports` 规则和 `check-architecture.mjs` 脚本双重强制执行。

## 1.4 渲染进程与主进程的通信模型

```
┌──────────────────┐     IPC      ┌──────────────────┐
│   渲染进程         │ ──────────→ │   主进程           │
│   (Next.js)       │ ←────────── │   (Electron)      │
│                   │   HTTP API  │                   │
│   Zustand Store   │ ←────────── │   SQLite (WAL)    │
│   React Hooks     │             │   AI Provider     │
│   Zod Validation  │             │   File System     │
└──────────────────┘             └──────────────────┘
```

渲染进程与主进程之间通过两种机制通信：

1. **Electron IPC**（preload.ts 桥接）：用于配置读写、安全密钥操作、窗口控制等低频操作
2. **HTTP API Server**（api-server.ts）：用于数据库 CRUD、AI 生成请求等高频操作，运行在 `http://localhost:{port}`

选择 HTTP API 而非纯 IPC 的原因：HTTP 请求天然支持超时、重试、中间件，且与 Next.js 的 SSR 兼容性更好。

## 1.5 核心数据流：从故事到视频

```
用户输入故事文本
    ↓
Story Generation Pipeline
    ├── 文本分析 → AI 生成故事大纲
    ├── 大纲解析 → StoryBeat[]（分镜数组）
    ├── 预览图生成 → 每个 Beat 的关键帧图片
    ├── 首尾帧生成 → 连续镜头的帧对
    └── 视频生成 → 每个 Beat 的视频片段
    ↓
Video Task Manager
    ├── 创建任务 → TaskMachine 状态守卫
    ├── 轮询引擎 → 自适应间隔、并发限制
    ├── 智能重试 → 错误分类、指数退避
    └── 缓存管理 → 本地视频缓存、过期清理
    ↓
用户预览与导出
```

---

# 2. Domain 层——类型系统与 Port 接口

Domain 层是整个项目的核心，它定义了业务概念的类型和接口，不包含任何实现。所有其他层都依赖 Domain 层，而 Domain 层不依赖任何其他层。

## 2.1 Result 类型体系

`src/domain/types/result.ts` 实现了函数式错误处理的核心：

```typescript
type Result<T> = Ok<T> | Err<T>;

interface Ok<T> { ok: true; value: T; }
interface Err<T> { ok: false; error: AppError; }
```

**AppError 层级**（12 种语义化错误类型）：

| 错误类型 | 语义 | 典型场景 |
|---------|------|---------|
| `DatabaseError` | 数据库操作失败 | SQLite 查询异常 |
| `ValidationError` | 输入验证失败 | Zod Schema 校验不通过 |
| `GenerationError` | AI 生成失败 | API 调用超时、模型错误 |
| `RateLimitError` | 速率限制 | AI Provider 限流 |
| `QuotaError` | 配额不足 | 账户余额耗尽 |
| `NetworkError` | 网络错误 | 连接超时、DNS 解析失败 |
| `AuthenticationError` | 认证失败 | API Key 无效 |
| `NotFoundError` | 资源不存在 | 查询 ID 不存在 |
| `ConflictError` | 冲突 | 并发修改冲突 |
| `TimeoutError` | 操作超时 | 视频生成超时 |
| `ConfigurationError` | 配置错误 | 模型参数不合法 |
| `UnknownError` | 未知错误 | 兜底错误类型 |

**工具函数**：

- `ok(value)` → 创建成功结果
- `err(code, message, cause?)` → 创建失败结果
- `fromThrowable(fn)` → 将可能抛异常的同步函数包装为返回 Result
- `fromAsyncThrowable(fn)` → 将可能抛异常的异步函数包装为返回 Result

**设计决策**：选择 Result 类型而非 try/catch 的原因：
1. **类型安全**：编译器强制调用方处理错误路径
2. **可组合**：`Result.map()`、`Result.andThen()` 支持链式操作
3. **可追溯**：每个错误都有 `code` 和 `context`，便于日志和监控

## 2.2 Zod Schema 体系

Domain 层使用 Zod 定义运行时验证 Schema，同时推导 TypeScript 类型。核心 Schema 包括：

### storyBeatSchema（40+ 字段）

这是整个项目最复杂的 Schema，覆盖了动画分镜的完整语义：

| 字段组 | 字段 | 说明 |
|-------|------|------|
| 基础信息 | `id`, `beatIndex`, `title`, `content` | 分镜标识和描述 |
| 镜头指令 | `shotType`, `cameraMovement`, `cameraAngle`, `cameraDistance` | 镜头语言 |
| 特征锚定 | `characterAnchors[]`, `sceneAnchor` | 绑定角色和场景引用 |
| 一致性控制 | `consistencyMode`, `referenceImageUrls[]` | 视觉一致性策略 |
| Prompt Lab | `promptOverride`, `negativePrompt`, `stylePrompt` | 自定义提示词 |
| 生成状态 | `previewImageUrl`, `firstFrameUrl`, `lastFrameUrl`, `videoUrl` | 生成结果 |
| 视频参数 | `duration`, `aspectRatio`, `fps` | 视频技术参数 |

**预处理函数**处理 SQLite NULL 与 TypeScript 的阻抗失配：

- `nullToUndef`：`null → undefined`（可选字段）
- `nullToEmpty`：`null → []`（数组字段）
- `nullToPositiveNumberOptional`：`null/0 → undefined`（数值字段）

### 其他核心 Schema

| Schema | 用途 | 关键字段 |
|--------|------|---------|
| `characterSchema` | 角色定义 | name, appearance, personality, outfits[] |
| `sceneSchema` | 场景定义 | name, description, lighting, mood, background |
| `videoTaskSchema` | 视频任务 | taskId, status, provider, config, tracking |
| `apiRequestSchema` | API 请求验证 | provider, model, parameters |

## 2.3 Port 接口

Port 接口定义了模块需要的能力，由 Infrastructure 层提供实现，通过 DI 容器注入。

### IStoragePort（存储端口）

```typescript
interface IStoragePort {
  save<T>(table: string, data: T): Promise<Result<T>>;
  findById<T>(table: string, id: string): Promise<Result<T | null>>;
  findAll<T>(table: string, filter?: Partial<T>): Promise<Result<T[]>>;
  update<T>(table: string, id: string, data: Partial<T>): Promise<Result<T>>;
  delete(table: string, id: string): Promise<Result<void>>;
}
```

### IVideoProvider（视频生成端口）

```typescript
interface IVideoProvider {
  generateVideo(options: VideoGenerationOptions): Promise<Result<VideoGenerationResult>>;
  queryVideoStatus(taskId: string): Promise<Result<VideoTaskStatus>>;
  generateKeyframe(options: KeyframeGenerationOptions): Promise<Result<ImageResult>>;
  generateFramePair(options: FramePairOptions): Promise<Result<FramePairResult>>;
  generateVideoWithFrames(options: VideoWithFramesOptions): Promise<Result<VideoGenerationResult>>;
}
```

**设计决策**：为什么用 Port 接口而非直接导入 AI Provider？
1. **多供应商支持**：可灵、Vidu、Pika、Runway 各有不同 API，Port 统一了调用方式
2. **测试隔离**：测试时可以注入 Mock Provider，不依赖真实 API
3. **运行时切换**：用户可以在 UI 中切换 AI 供应商，无需修改业务逻辑

### IImageProvider / ITextProvider

图像生成和文本分析端口，接口设计与 IVideoProvider 类似，分别封装图像生成和文本分析能力。

### ISyncPort（同步端口）

定义了数据同步的接口，支持将本地数据同步到云端或其他设备。

---

# 3. Modules 层——12 个业务模块详解

每个模块遵循统一的内部结构：

```
module-name/
  index.ts           → Barrel 文件（公共 API）
  MODULE.md          → 模块合约
  hooks/             → React Hooks
  services/          → 业务逻辑服务
  presentation/      → React 组件
  domain/            → 模块特有领域类型（可选）
  __tests__/         → 测试
```

## 3.1 Story 模块（12,303 行 / 63 文件）

**职责**：故事创作与分镜编辑，是整个应用的核心工作流入口。

**子域结构**：

| 子域 | 职责 | 关键文件 |
|------|------|---------|
| beat-editor | 分镜编辑器 | useStoryState.ts, BeatDetailEditor.tsx |
| generation | AI 生成管线 | storyboard-generation-service.ts, useAIGeneratorBase.ts |
| story-editor | 故事元数据编辑 | StoryMetadataPanel.tsx |

**核心流程——AI 生成管线**：

`storyboard-generation-service.ts` 实现了完整的"文本→分镜"生成流程：

1. **generateStoryPlan**：调用 AI 分析用户输入的故事文本，生成结构化大纲
2. **enrichPromptWithFewShot**：根据镜头类型动态注入 few-shot 示例，提高生成质量
3. **validateStoryPlanOutput**：验证 AI 输出是否符合 Schema
4. **buildRetryPrompt**：将验证错误注入下一轮 prompt，引导 AI 修正
5. **convertToStoryBeats**：将 AI 输出转换为 StoryBeat[]，支持缩写字段名和全称双模式解析

**降级策略**：`story-generation-pipeline.ts` 实现了"生成→验证→自动修复→重试"的闭环，最多重试 2 次。

**批量生成**：`useBatchGenerator.ts` 支持三种批量策略：
- **串行**：逐个生成，前一个完成后再开始下一个
- **并行**：同时提交所有生成请求
- **链式**：前一个 Beat 的输出作为后一个的输入（用于连续镜头）

## 3.2 Video 模块（9,434 行 / 65 文件）

**职责**：视频任务全生命周期管理，是应用最复杂的模块。

**子域结构**：

| 子域 | 职责 | 关键文件 |
|------|------|---------|
| task-management | 任务创建、轮询、状态管理 | use-video-task-manager.ts, polling-engine.ts |
| recovery | 智能重试、故障恢复 | smart-retry-engine.ts, video-verification-service.ts |
| cache | 视频本地缓存 | video-cache.ts |

**TaskMachine 状态机**：

视频任务有 6 种状态，状态转换严格受 `TaskMachine` 守卫：

```
pending → generating → completed
   ↓          ↓
failed ← ← ← ←
   ↓
retrying → generating（重新进入生成流程）
```

`VALID_TRANSITIONS` 表定义了所有合法转换，非法转换返回 `Err<TransitionError>` 而非抛异常。`applySideEffects` 根据目标状态自动设置副作用字段（如 completed 时 progress=100，retrying 时 recoveryAttempts+1）。

**轮询引擎**：

`polling-engine.ts` 是模块级单例，跨 React 生命周期持久：

- 并发限制：`CONCURRENT_LIMIT = 3`，批量轮询
- 自适应间隔：全成功 15s，全失败 ×1.5 上限 60s
- 视频缓存重试：3 次递增延迟（1s→2s→4s）
- HMR 保护：`window.__VIDEO_TASK_POLLING_STATE__` 检测旧状态并清理定时器

**智能重试引擎**：

`smart-retry-engine.ts` 基于错误分类决定重试策略：

| 错误类别 | 是否重试 | 延迟策略 | Token 浪费风险 |
|---------|---------|---------|--------------|
| timeout | 是 | 指数退避 | 中→高（>3次） |
| rate_limit | 是 | 至少 60s | 低 |
| quota | 否 | — | 高 |
| invalid_params | 否 | — | 高 |
| network | 是 | 指数退避 | 低 |
| server_error | 是 | 指数退避 | 低→中（>2次） |
| unknown | 是（<5次） | 指数退避 | 中 |

`classifyError()` 函数采用**结构化错误码优先 + 正则降级**的双重匹配策略，优先匹配 `errorCode`（如 `RATE_LIMITED`、`ETIMEDOUT`），降级匹配 `errorMessage`（正则，支持中英文）。

## 3.3 Shot 模块（4,531 行 / 28 文件）

**职责**：镜头生成与视觉一致性检查。

**子域结构**：

| 子域 | 职责 | 关键文件 |
|------|------|---------|
| shot-generation | 镜头生成管线 | story-generation-pipeline.ts |
| consistency-check | 视觉一致性检查 | consistency-check-service.ts |

**一致性检查**：

`consistency-check-service.ts` 通过 AI 分析生成的图片与绑定的角色/场景元素是否视觉一致：

1. 收集 Beat 绑定的角色和场景元素
2. 构建包含元素描述和图片的 Prompt
3. 调用 AI 分析，返回结构化的一致性评分
4. 解析 AI 返回的 JSON，生成 `ConsistencyCheckResult`

**结果语义**：
- `passed: true, recommendation: "accept"` → 通过，建议接受
- `passed: false, recommendation: "adjust"` → 未通过，建议调整后重新生成
- `passed: false, recommendation: "reject"` → 严重不一致，建议完全重新生成

## 3.4 Character 模块（1,071 行 / 11 文件）

**职责**：角色定义与管理，包括外貌、个性、服装等属性。

**核心概念**：
- **角色（Character）**：包含基础信息、外貌描述、个性特征
- **服装（Outfit）**：角色的不同造型，每个服装有独立的图片和描述
- **特征锚定**：角色通过 `characterAnchors` 绑定到分镜，确保视觉一致性

**服装合成**：`outfit-manager.ts` 支持通过 AI 合成角色换装图片，将角色基础外貌与服装描述结合生成新图片。

## 3.5 Scene 模块（680 行 / 10 文件）

**职责**：场景定义与管理，包括光照、氛围、背景等属性。

场景与角色的关系：场景提供环境上下文，角色提供人物特征，两者共同构成分镜的视觉参考。

## 3.6 Asset 模块（2,672 行 / 14 文件）

**职责**：资产管理，包括图片、视频、音频等媒体文件的上传、存储和检索。

**核心功能**：
- 文件上传与格式转换
- 缩略图生成
- 元数据提取（分辨率、时长、格式等）
- 集合（Collection）管理

## 3.7 Prompt 模块（3,473 行 / 21 文件）

**职责**：Prompt 工程与模板管理，是 AI 生成质量的关键保障。

**子域**：
- **video-prompt**：视频生成 Prompt 构建
- **image-prompt**：图像生成 Prompt 构建
- **prompt-lab**：用户自定义 Prompt 模板

Prompt 构建遵循"基础描述 + 镜头指令 + 风格修饰 + 负面提示词"的四层结构。

## 3.8 Sync 模块（2,083 行 / 11 文件）

**职责**：数据同步，支持将本地项目同步到云端或其他设备。

**设计约束**：同步功能通过 Feature Flag 控制（`SCHEMA_FEATURES.sync`），未启用时相关表不会创建。

## 3.9 Persistence 模块（421 行 / 5 文件）

**职责**：数据持久化的事务性操作，特别是级联删除。

`transactional-delete.ts` 实现了安全的事务性删除，在删除主记录时自动清理关联的子记录（如删除故事时删除所有分镜）。

## 3.10 Integrity 模块（397 行 / 4 文件）

**职责**：数据完整性保障，提供 SQL 安全工具和 Schema 注册。

从 `@/shared/sql-safety/` 重导出纯函数：
- `sanitizeIdentifier` / `sanitizeTable`：SQL 标识符消毒
- `buildSafeInsert` / `buildSafeUpdate` / `buildSafeDelete`：参数化 SQL 构建
- `registerColumn` / `getColumnKind` / `isColumnRegistered`：Schema 列注册与查询

## 3.11 Feedback 模块（158 行 / 5 文件）

**职责**：用户反馈收集，包括错误报告和功能建议。

## 3.12 Security 模块（88 行 / 2 文件）

**职责**：渲染进程侧的安全工具，主要是 API Key 的安全读取和验证。

---

# 4. Infrastructure 层——存储、AI Provider、网络、DI

## 4.1 DI 容器

`src/infrastructure/di/container.ts` 是整个项目的依赖注入中枢。

**Token 分组**：

| 分组 | 类型 | 示例 | 数量 |
|------|------|------|------|
| A. Domain Port 实现 | 有状态服务 | videoProvider, imageProvider | ~8 |
| B. 有状态服务 | 单例服务 | apiConfigManager, configManager | ~6 |
| C. Storage 实例 | 数据访问层 | videoTaskStorage, characterStorage | ~12 |
| D. Repository 实例 | Drizzle ORM | characterRepository, sceneRepository | ~4 |
| E. 桥接函数 | 纯函数 | safeQuery, resolveImageSize | ~20 |
| F. 懒加载模块 | 按需初始化 | importExportService, templateService | ~5 |

**核心机制**：

1. **Proxy 容器**：`container` 用 `Proxy` 实现，访问不存在的 token 抛出明确错误
2. **循环依赖检测**：`resolve()` 通过 `resolving` Set 追踪解析链
3. **测试覆盖**：`overrideToken()` 支持测试时替换依赖
4. **Token 工厂**：`createToken(name, factory)` 注册 token 和创建函数

**设计演进**：纯函数（如 `sanitizeIdentifier`）已从 DI 容器迁移到 `@/shared/sql-safety/`，模块直接导入，不再通过 DI 桥接。

## 4.2 存储层

### SQLite Core（sqlite-core.ts）

核心操作封装，仅 82 行：

- `withRetry(fn)`：指数退避 + jitter，仅对 `busy|locked|timeout` 类错误重试
- `safeQuery` / `safeRun` / `safeTransaction`：统一通过 `performanceMonitor.measure` 包裹
- 所有操作返回 `Result<T>` 类型

### Storage Core（core.ts）

变更追踪和记录解析：

- `registerChangeTracker(table, handler)`：注册表级变更监听器
- `toSqlValue(value)`：TypeScript 值→SQL 值转换（处理 undefined、Date、JSON 等）
- `parseRecord<T>(row, schema)`：SQL 行→TypeScript 对象解析

### JSON 容器模式

视频任务等复杂实体使用 JSON 容器存储易变字段：

```typescript
// 数据库表结构
video_tasks:
  id, task_id, status, progress,  -- 稳定字段（列）
  config TEXT DEFAULT '{}',        -- JSON 容器
  provider TEXT DEFAULT '{}',      -- JSON 容器
  media_refs TEXT DEFAULT '{}',    -- JSON 容器
  tracking TEXT DEFAULT '{}'       -- JSON 容器
```

**更新模式**：`json_set(COALESCE(config, '{}'), '$.key', ?)` 实现部分更新，无需读取-修改-写入。

**解析模式**：`parseConfig()` / `parseProvider()` / `parseMediaRefs()` / `parseTracking()` 安全解析 JSON 容器，解析失败返回默认值而非抛异常。

### 角色存储优化

角色存储采用 `parser.ts` + `outfit-manager.ts` 分离架构：

- **parser.ts**：负责从数据库行解析为 `Character` 对象，处理 JSON 字段解析和默认值
- **outfit-manager.ts**：独立管理角色服装数据，支持按角色 ID 查询和批量处理

这种分离使得角色核心数据和服装数据可以独立演进，避免了一个巨型 Storage 类的问题。

## 4.3 AI Provider 体系

### 模型适配器（model-adapter.ts）

统一不同 AI 供应商的 API 差异：

- `getProviderSupportedCodecs(provider)` → 返回供应商支持的视频编码格式
- `getProviderMaxDuration(provider, model)` → 返回供应商的最大视频时长
- `getProviderModelList(provider)` → 返回供应商可用模型列表

### 模型能力配置（model-capabilities.ts，540 行）

定义了每个 AI 模型的能力参数：

| 参数 | 说明 | 示例 |
|------|------|------|
| maxReferenceImages | 最大参考图数量 | 可灵: 9, Vidu: 7 |
| supportedResolutions | 支持的分辨率 | 1080p, 720p |
| supportedFormats | 支持的格式 | mp4, webm |
| maxDuration | 最大时长 | 5s, 10s |
| supportsFramePair | 是否支持首尾帧 | 可灵: true, Pika: false |

### API 配置系统（api-config/）

管理 AI 供应商的 API Key 和配置：

- **storage.ts**：通过 IPC 安全存储 API Key（`electron-store` 加密）
- **init.ts**：配置初始化和状态检测
- **templates.ts**：预定义的供应商配置模板

### 服装合成（outfit-synthesis.ts）

通过 AI 合成角色换装图片：

1. 构建合成 Prompt（角色外貌 + 服装描述）
2. 调用图像生成 API
3. 支持批量处理多个角色的换装

## 4.4 网络层

### Resilient Fetch（resilient-fetch.ts，292 行）

完整的断点续传下载器：

1. **HEAD 探测**：检查服务器是否支持 Range 请求
2. **分块并发下载**：支持 Range 时，将文件分成多个 chunk 并发下载
3. **流式全量下载**：不支持 Range 时，流式下载整个文件
4. **进度回调**：包含速度估算和 ETA
5. **Worker 池模式**：每 chunk 独立重试

### API Client（api/index.ts）

统一的 HTTP 客户端，所有请求自动附加 `X-Electron-App` 头，用于服务端验证请求来源。

---

# 5. Electron 主进程——生命周期、IPC、安全、数据库

## 5.1 应用生命周期

### main.ts（生产入口）

```
app.requestSingleInstanceLock() → 防多开
    ↓
app.whenReady() → 初始化
    ↓
createWindow() → 创建主窗口
    ↓
startApiServer() → 启动 HTTP API
    ↓
autoUpdater → 检查更新
```

**关键设计**：
- `uncaughtException` / `unhandledRejection` 仅记录日志，不退出进程
- `render-process-gone` 设置 `isRendererCrashed` flag，自动重建窗口
- `window-all-closed` 检查 `isRendererCrashed`：崩溃则自动重建，用户关闭则退出

### main-dev.ts（开发入口）

与生产入口共享 `createWindow` 和 `gracefulShutdown`，额外开启 DevTools 和调试日志。

### main-common.ts（共享逻辑，564 行）

核心共享函数：

| 函数 | 职责 |
|------|------|
| `createWindow()` | 创建 BrowserWindow，加载静态服务器页面 |
| `registerApiHandlers()` | 注册所有 API 路由处理函数 |
| `startStaticServer()` | 启动静态文件服务器（服务 Next.js 导出文件） |
| `gracefulShutdown()` | 优雅关闭：窗口→连接→数据库→app.quit() |

**静态服务器连接追踪**：`activeConnections: Set<net.Socket>` 追踪所有 HTTP 连接，关闭时先 `destroy()` 所有连接再 `server.close()`，防止 keep-alive 连接阻止进程退出。

## 5.2 IPC 桥接（preload.ts）

### 权限体系

5 级 IPC 权限，每个通道显式注册：

| 级别 | 权限 | 示例通道 |
|------|------|---------|
| READONLY | 只读 | `config:get` |
| READWRITE | 读写 | `database:query` |
| DANGEROUS | 危险操作 | `database:execute` |
| SYSTEM | 系统操作 | `app:quit` |
| SECURE | 安全操作 | `secure-config:get` |

### 安全防护

1. **DDL 阻止**：`DROP|ALTER|CREATE|TRUNCATE|ATTACH|DETACH` 正则匹配，阻止渲染进程执行结构变更
2. **SQL 注释剥离**：`/* */` 和 `--` 两种注释模式，防止通过注释绕过 DDL 检测
3. **双层速率限制**：全局 600/分钟 + 通道级 100-300/分钟
4. **调用历史**：定期清理，`unref()` 避免阻止进程退出

## 5.3 HTTP API Server（api-server.ts，1,112 行）

运行在 `http://localhost:{port}` 的 HTTP 服务器，提供 RESTful API。

**路由结构**：

| 路由前缀 | 职责 | 主要端点 |
|---------|------|---------|
| `/api/characters` | 角色管理 | CRUD |
| `/api/scenes` | 场景管理 | CRUD |
| `/api/stories` | 故事管理 | CRUD + 分镜操作 |
| `/api/video-tasks` | 视频任务 | 创建、查询、取消 |
| `/api/elements` | 元素管理 | CRUD + 关联查询 |
| `/api/assets` | 资产管理 | 上传、下载、删除 |
| `/api/config` | 配置管理 | 读取、更新 |
| `/api/sync` | 数据同步 | 推送、拉取 |
| `/api/export` | 数据导出 | JSON/ZIP 导出 |

**中间件**：
- `X-Electron-App` 头验证
- 请求体大小限制
- 错误处理中间件

## 5.4 数据库系统

### 连接管理（db-connection.ts，667 行）

```typescript
function openDatabase(dbPath: string): Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');     // WAL 模式，支持并发读写
  db.pragma('foreign_keys = ON');       // 启用外键约束
  db.pragma('busy_timeout = 5000');     // 忙等待超时 5s
  return db;
}
```

**备份机制**：启动时自动创建备份，异常时从备份恢复。

### Schema Builder（schema-builder.ts）

声明式表定义 → 自动生成 SQL：

```typescript
const tableDef: TableDef = {
  name: "video_tasks",
  featureGroup: "video",
  columns: [
    { name: "task_id", type: "TEXT", notNull: true, unique: true },
    { name: "status", type: "TEXT", notNull: true, check: "IN ('pending', 'generating', 'completed', 'failed')" },
    { name: "config", type: "TEXT", defaultValue: "'{}'" },  // JSON 容器
  ],
  indexes: [
    { name: "idx_video_tasks_status", columns: ["status"] },
  ],
};
```

**7 字段基座列**自动注入：`owner_id`, `created_at`, `updated_at`, `is_deleted`, `deleted_at`, `version`, `sync_id`。

**Feature Flag**：`SCHEMA_FEATURES` 控制哪些表组被创建（core, video, sync, templates, assets）。

### 数据库 Schema（db-schema.ts）

14 个业务表 + 5 个关联表 + 5 个缓存表 + 3 个同步表 + 30+ 个索引。

### 迁移框架（migrations.ts）

```typescript
const CURRENT_SCHEMA_VERSION = 1;
const MIGRATIONS: Record<number, MigrationFn> = {};
// 项目未发布，当前无迁移
```

框架已搭建，`runMigrations(db, currentVersion)` 就绪，未来版本升级时只需添加迁移函数。

## 5.5 安全体系

### SSRF 防护（ssrf-guard.ts）

完整的请求目标验证：

1. URL 格式验证
2. 协议检查（仅允许 http/https）
3. 云元数据端点阻止（169.254.169.254 等）
4. 私有 IP 地址检测（10.x, 172.16-31.x, 192.168.x）
5. IPv6 link-local 检测（首 hextet `(value & 0xffc0) === 0xfe80`）
6. DNS 解析验证（防止 DNS 重绑定攻击）

### 密钥存储（key-storage.ts）

通过 `electron-store` 加密存储 API Key：
- 渲染进程通过 `secure-config:*` IPC 通道访问
- 策略模式支持不同存储实现
- 绝不存储在 localStorage 或使用 XOR 混淆

## 5.6 日志系统（logger.ts）

**双传输**：ConsoleTransport + FileTransport

| 配置 | 生产模式 | 开发模式 |
|------|---------|---------|
| 最低级别 | info | debug |
| 文件名 | app-YYYY-MM-DD.log | dev-YYYY-MM-DD.log |
| 日志路径 | %APPDATA%/ai-animation-studio/logs/ | 同左 |
| 轮转大小 | 10MB | 10MB |
| 最大文件数 | 5 | 5 |
| 刷新间隔 | 5s（队列>100 立即） | 同左 |

**方法签名**：
```typescript
logger.info(message: string, context?: LogContext)
logger.warn(message: string, context?: LogContext)
logger.error(message: string, error?: Error, context?: LogContext)
```

## 5.7 插件系统（registry.ts，164 行）

支持用户自定义插件的加载和注册：

1. 插件验证（格式、权限检查）
2. 插件加载（沙箱环境）
3. 插件注册（统一管理接口）
4. 内置插件与用户插件统一管理

---

# 6. 前端工程——Hooks、状态管理、Presentation

## 6.1 Hook 架构

项目采用分层 Hook 架构，从基础到业务逐层组合：

```
useAIGeneratorBase（基础层：AbortController、错误处理、模型检查）
    ↓ 继承
useKeyframeGenerator（预览图生成）
useFramePairGenerator（首尾帧生成）
useVideoGenerator（视频生成）
useBatchGenerator（批量生成，组合上述三个）
```

### useAIGeneratorBase

所有 AI 生成 Hook 的基类，提供：

- **AbortController 管理**：`useRef` 持有活跃的 AbortController，`useEffect` 清理未完成请求
- **模型配置检查**：生成前验证 API Key 和模型参数
- **引用解析**：从角色/场景元素中提取参考图 URL
- **withGenerationState**：包装异步生成函数，自动管理生成中状态

### useBatchGenerator（317 行）

最复杂的 Hook，支持批量生成预览图、首尾帧和视频：

- **策略选择**：串行（逐个）、并行（同时提交）、链式（前一个输出作为后一个输入）
- **链式引用检查**：链式模式下，前一个 Beat 必须有生成结果才能开始后一个
- **错误处理**：单个 Beat 失败不影响其他 Beat，最终汇总成功/失败统计
- **确认对话框**：未绑定角色/场景时弹出确认

### useStoryState

故事和分镜的状态管理：

- **脏数据追踪**：`useDirtyState` 跟踪未保存的更改
- **分镜操作**：添加、更新、删除、移动分镜
- **生成增强**：管理 AI 生成选项和模型选择

## 6.2 Zustand 状态管理

### useVideoTaskManager（711 行）

整个视频任务管理的 Zustand Store，是前端最复杂的状态管理单元：

**核心功能**：
- `createTask`：创建视频任务（防重入保护 `isCreating` flag）
- `cancelTask`：取消任务（通过 TaskMachine 校验状态转换合法性）
- `pollTask`：轮询任务状态
- `removeTask` / `removeTasks`：删除任务及缓存

**生命周期管理**：
- `beforeunload` 中使用同步 XHR 保存任务状态
- 组件卸载时清理轮询定时器
- HMR 时恢复任务状态

## 6.3 Presentation 层

### BeatDetailEditor（219 行）

分镜详情编辑器，包含两个标签页：

1. **设置标签**：基础信息、镜头指令、角色/场景绑定
2. **生成标签**：预览图、首尾帧、视频生成控制

支持 ESC 键关闭、Tab 键切换焦点。

### ShotGenerationPanel（248 行）

分镜生成面板，根据生成状态展示不同 UI：
- 未生成：显示生成按钮
- 生成中：显示进度指示器
- 已完成：显示视频预览和一致性检查结果
- 失败：显示错误信息和重试按钮

## 6.4 事件总线（event-bus）

`src/shared/event-bus/` 提供跨模块事件通信：

```typescript
eventBus.emit("video:taskCompleted", { taskId, videoUrl });
eventBus.on("video:taskCompleted", handler);
```

用于模块间松耦合通信，避免循环依赖。

## 6.5 Toast Bridge

`src/shared/utils/toast-bridge.ts` 通过 CustomEvent 实现跨组件通知：

```typescript
toastBridge.success("视频生成完成");
toastBridge.error("生成失败，请重试");
```

---

# 7. 跨切面关注——错误处理、日志、安全、测试

## 7.1 错误处理策略

### 全栈 Result 类型

从 Domain 层的 `Result<T>` 到 Infrastructure 层的 `fromAsyncThrowable`，错误处理贯穿全栈：

```
Service 层：fromAsyncThrowable(() => aiProvider.generateVideo(options))
    ↓ 返回 Result<VideoGenerationResult>
Hook 层：if (!result.ok) { toastBridge.error(result.error.message); return; }
    ↓ 用户反馈
UI 层：ErrorBoundary 捕获未处理异常
```

### 错误日志消毒

`errorLogger` 自动清理日志中的敏感信息：
- API Key 模式匹配并替换为 `[REDACTED]`
- 请求头中的 Authorization 信息清理

## 7.2 安全纵深防御

```
┌──────────────────────────────────────────────┐
│  渲染进程                                      │
│  ├── ESLint 架构守卫（编译时）                   │
│  ├── Zod Schema 验证（运行时）                   │
│  └── IPC 权限检查（调用时）                      │
├──────────────────────────────────────────────┤
│  Preload 桥接                                  │
│  ├── DDL 语句阻止                               │
│  ├── SQL 注释剥离                               │
│  ├── 速率限制（全局 + 通道级）                    │
│  └── 权限级别验证                               │
├──────────────────────────────────────────────┤
│  主进程                                        │
│  ├── SSRF 防护（所有出站请求）                    │
│  ├── API Key 加密存储（electron-store）          │
│  ├── X-Electron-App 头验证                     │
│  └── SQL 参数化查询                             │
└──────────────────────────────────────────────┘
```

## 7.3 测试体系

### 测试层级

| 层级 | 位置 | 示例 |
|------|------|------|
| Domain 单元测试 | `src/domain/**/__tests__/` | result.test.ts, schema-validation.test.ts |
| Module 集成测试 | `src/modules/**/__tests__/` | task-machine.test.ts, smart-retry-engine.test.ts |
| Storage 测试 | `src/infrastructure/storage/__tests__/` | scenes.test.ts, elements.test.ts |
| E2E 测试 | `src/__tests__/e2e/` | workflow-story-creation.test.ts |

### 测试统计

| 模块 | 测试文件数 | 测试用例数 |
|------|----------|----------|
| Domain | 8 | 423 |
| Video Recovery | 5 | 102 |
| Shot Consistency | 2 | 36 |
| Integrity | 1 | 52 |
| Persistence | 1 | 11 |
| **合计** | **17+** | **624+** |

### 测试模式

- **Mock AI Provider**：所有 AI 相关测试使用 Mock Provider
- **内存数据库**：Storage 测试使用内存 SQLite
- **状态机测试**：TaskMachine 测试覆盖所有合法和非法状态转换
- **Schema 测试**：Zod Schema 测试覆盖有效输入、无效输入和边界情况

## 7.4 架构守卫

### ESLint 规则

`eslint.config.mjs` 定义了 DDD 分层约束：

- `src/domain/` 禁止导入 `@/infrastructure` 和 `@/modules`
- `src/shared/` 禁止导入 `@/infrastructure` 和 `@/modules`
- `src/modules/` 禁止导入 `@/infrastructure/*`（`@/infrastructure/di` 除外）
- 跨模块深路径导入被阻止（`@/modules/xxx/yyy/zzz`）

### 架构检查脚本

`scripts/check-architecture.mjs` 检查：
- DDD 分层违规
- 裸 SQL 字符串（应使用 `buildSafeInsert` 等工具函数）
- 深路径导入

`scripts/check-module-api-consistency.mjs` 检查：
- 模块 barrel 文件与实际导出的一致性
- 公共 API 的稳定性

---

# 8. 构建与部署

## 8.1 构建流程

构建脚本 `build-electron.ps1` 执行以下步骤：

```
1. Next.js 静态导出 (next build → out/)
2. 临时移除 API 路由和动态路由（output: "export" 不支持）
3. Electron TypeScript 编译 (tsc -p electron/tsconfig.json)
4. better-sqlite3 重建 (@electron/rebuild)
5. 插件文档复制 (→ out/docs/)
6. electron-builder 打包
```

**关键约束**：
- better-sqlite3 版本锁定 `12.10.0`（NOT `^12.10.0`）
- `C:\Windows\System32` 必须在 PATH（electron-builder 需要 `cmd.exe`）
- Electron 镜像配置通过环境变量：`ELECTRON_MIRROR`、`ELECTRON_BUILDER_BINARIES_MIRROR`

## 8.2 多平台支持

| 平台 | 输出格式 | 构建命令 |
|------|---------|---------|
| Windows | NSIS 安装包 | `build-electron.ps1` |
| macOS | DMG | `build-electron.ps1` |
| Linux | AppImage | `build-electron.ps1` |

## 8.3 开发模式

```bash
# 终端 1：Next.js 开发服务器
npm run dev

# 终端 2：Electron 主进程
npm run electron:dev
```

开发模式使用 `main-dev.ts`，开启 DevTools 和 debug 级别日志。

## 8.4 已知技术债

1. **双存储体系**：原始 Storage（raw SQL）和 Drizzle ORM Repository 并存，需要统一
2. **部分 Storage 文件**仍使用平面列引用而非 JSON 容器访问模式
3. **WASM 包**：`@emnapi/core`、`@emnapi/runtime` 等 better-sqlite3 可选依赖残留在 node_modules，无法修剪但无害
4. **Polling Engine 模块级可变状态**：`pollingState` 在 SSR/测试环境中可能泄漏

---

*文档结束*
