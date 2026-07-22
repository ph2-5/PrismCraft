# PrismCraft - 完整代码目录

> 版本: 1.3.0 | 更新日期: 2026-07-23 | 架构: Electron + Vite + React + DDD

---

## 目录

1. [项目概述](#1-项目概述)
2. [目录结构总览](#2-目录结构总览)
3. [领域层 (src/domain)](#3-领域层-srcdomain)
4. [共享逻辑层 (src/shared-logic)](#4-共享逻辑层-srcshared-logic)
5. [模块层 (src/modules) — 42 个模块](#5-模块层-srcmodules--42-个模块)
6. [共享层 (src/shared)](#6-共享层-srcshared)
7. [基础设施层 (src/infrastructure)](#7-基础设施层-srcinfrastructure)
8. [应用层 (src/app)](#8-应用层-srcapp)
9. [Electron 主进程 (electron/src)](#9-electron-主进程-electronsrc)
10. [测试代码](#10-测试代码)
11. [配置文件](#11-配置文件)
12. [构建与校验脚本 (scripts/)](#12-构建与校验脚本-scripts)
13. [AI 工具集成文件 (.ai/)](#13-ai-工具集成文件-ai)

---

## 1. 项目概述

PrismCraft 是一款 AI 驱动的动画制作工具，采用本地优先（local-first）架构，支持从故事创作、小说导入、角色/场景/分镜生成到视频合成的完整工作流。项目基于 Electron + Vite + React 技术栈，采用 DDD（领域驱动设计）分层架构，将代码组织为 `domain → shared-logic → modules → shared → infrastructure → app` 六层，主进程独立位于 `electron/src/`。

**核心技术栈**（版本取自 `package.json`）：

| 类别 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React + React DOM | 19.2.4 |
| 类型系统 | TypeScript | ^6.0.3 |
| 状态管理 | Zustand | ^5.0.12 |
| 数据请求 | @tanstack/react-query | ^5.100.9 |
| 路由 | react-router-dom | ^7.16.0 |
| 样式 | Tailwind CSS（@tailwindcss/vite） | ^4.3.0 |
| Schema 校验 | Zod | ^4.4.3 |
| 3D | three + @react-three/fiber + @react-three/drei | ^0.185.1 / ^9.6.1 / ^10.7.7 |
| 拖拽 | @dnd-kit/core + sortable + utilities | ^6.3.1 / ^10.0.0 / ^3.2.2 |
| 桌面端 | Electron | 41.7.1 |
| 本地数据库 | better-sqlite3 | 12.10.0 |
| 配置存储 | electron-store | ^11.0.2 |
| 自动更新 | electron-updater | ^6.8.3 |
| 向量检索（可选） | @huggingface/transformers | ^4.2.0 |
| 构建工具 | Vite（@vitejs/plugin-react） | ^6.0.2 |
| 打包 | electron-builder | ^26.8.1 |
| 单元测试 | Vitest + @vitest/coverage-v8 | ^4.1.7 |
| E2E 测试 | Playwright | ^1.60.0 |
| 组件开发 | Storybook | 8.6.18 |
| 变异测试 | Stryker | ^8.7.1 |
| Lint | ESLint + typescript-eslint | ^9.39.4 / ^8.60.0 |
| Git Hook | Husky + lint-staged | ^9.1.7 / ^17.0.5 |

**规模概览**：

- 业务模块：**42 个**（核心业务 25 / 基础设施 4 / 工具 13）
- 子域（`modules/*/*/index.ts`）：56 个
- Agent 工具：153 个（分布于 13 个 `agent-tools-*` 模块）
- HTTP API 路由组：9 个
- DI Token 类别：5 类（A 端口实现 / B 有状态服务 / C Storage / D Repository / E 懒加载模块）

---

## 2. 目录结构总览

```
ai-animation-studio-source-code/
├── src/
│   ├── domain/              # 领域层：纯类型、端口接口、Zod Schema、领域服务（零外部依赖）
│   ├── shared-logic/        # 共享逻辑层：零外部依赖的纯函数（渲染进程 + 主进程共用）
│   ├── modules/             # 模块层：42 个业务模块（含 56 个子域）
│   ├── shared/              # 共享层：跨模块通用工具、代理导出、UI 组件
│   ├── infrastructure/      # 基础设施层：存储、AI 提供商、网络、DI 容器、监控
│   ├── app/                 # 应用层：路由页面、Provider、布局
│   ├── config/              # 渲染进程配置常量与端口
│   ├── __tests__/           # 渲染进程测试基础设施（factories/mocks/helpers）
│   └── main.tsx             # 渲染进程入口
├── electron/src/            # Electron 主进程（api/database/plugins/security/handlers/lifecycle/logging）
├── tests/                   # Playwright E2E 测试（浏览器 + Electron）
├── docs/                    # 项目文档（含 MODULES.md / ARCHITECTURE.md / API_REFERENCE 等）
├── scripts/                 # 构建与校验脚本（架构检查、模块图、契约校验等）
├── .ai/                     # AI 工具集成文件（上下文快照、模块上下文 md、方法论）
├── .trae/rules/             # Trae IDE 规则（架构规则、回归防护、测试规则）
├── .storybook/              # Storybook 配置
├── public/                  # 静态资源（图标、Logo）
└── 配置文件                  # package.json / vite.config.ts / tsconfig.json / eslint.config.mjs 等
```

**分层依赖方向**（CRITICAL）：

```
app → modules → domain
              → shared-logic
              → shared
              → infrastructure/di (via container only)
infrastructure → domain, shared
shared-logic → NOTHING (纯逻辑，零外部依赖)
shared → domain, infrastructure (仅代理导出)
domain → NOTHING (纯类型)
```

---

## 3. 领域层 (src/domain)

> 领域层是纯业务逻辑层，零外部依赖。包含端口接口、Zod Schema、领域服务、类型定义和工具函数。详见 `.trae/rules/architecture-rules.md` 与 `docs/ports.md`。

### 3.1 端口接口 (`src/domain/ports/`)

10 个端口接口文件 + 1 个桶导出，定义各基础设施实现的抽象契约。

| 文件 | 说明 |
|------|------|
| `storage-port.ts` | 存储 Port（`IVideoTaskStorage`, `ICharacterStorage`, `ISceneStorage`, `IStoryStorage` 等） |
| `ai-provider-port.ts` | AI 提供商 Port（`IVideoProvider`, `IImageProvider`, `ITextProvider`, `IFileUploader`） |
| `sync-port.ts` | 同步 Port（`ISyncStorage`, `DbRunResult`） |
| `element-manager-port.ts` | 元素管理器 Port（`IElementManager`） |
| `element-storage-port.ts` | 元素存储 Port（`IElementStorage`） |
| `reference-engine-port.ts` | 引用引擎 Port（`IReferenceEngine`） |
| `version-storage-port.ts` | 版本存储 Port（`IVersionStorage`） |
| `template-storage-port.ts` | 模板存储 Port（`ITemplateStorage`） |
| `file-storage-port.ts` | 文件存储 Port |
| `media-asset-repository-port.ts` | 媒体资产仓库 Port（`IMediaAssetRepository`） |
| `index.ts` | 桶导出 |

### 3.2 Schema 定义 (`src/domain/schemas/`)

14 个 Zod Schema 文件 + 1 个桶导出，覆盖全部领域模型。

| 文件 | 说明 |
|------|------|
| `character.ts` | 角色 Schema（`characterSchema`, `characterOutfitSchema`, `characterAppearanceSchema` 及 CRUD Input 类型） |
| `character-variant.ts` | 角色变体 Schema |
| `scene.ts` | 场景 Schema（`sceneSchema`, `sceneCameraSchema`, `sceneElementSchema` 及 CRUD Input 类型） |
| `scene-variant.ts` | 场景变体 Schema |
| `story.ts` | 故事 Schema（`storySchema`, `storyBeatSchema`, `storyBeatKeyframeSchema`, `storyBeatFramePairSchema`, `storyBeatVideoSchema`, `elementBindingSchema`, `beatCameraSchema`, `chainModeSchema`, `promptLabSchema`, `storyVersionSchema`, `storyStyleGuideSchema`, `VALID_SHOT_TYPES`） |
| `shot.ts` | 镜头 Schema |
| `shot-system.ts` | 分镜系统 Schema（`shotInstructionSchema`, `featureAnchoringSchema`, `consistencyCheckResultSchema`, `shotReferenceSchema`, `templateConfigSchema`, `elementLibrarySchema` 等） |
| `timeline.ts` | 时间线 Schema |
| `blockout-scene.ts` | 3D 场景布局 Schema |
| `api.ts` | API Schema（`apiConfigSchema`, `videoTaskSchema`, `videoTaskStatusSchema`, `imageGenerationResultSchema`, `videoGenerationResultSchema`, `userApiConfigSchema`） |
| `media.ts` | 媒体 Schema（`mediaAssetSchema`, `videoTemplateSchema`, `collectionSchema`, `batchTaskSchema`, `storyboardAssetSchema`, `asaExportDataSchema`, `searchResultSchema` 等） |
| `asset.ts` | 资产 Schema |
| `prop.ts` | 道具 Schema |
| `llm-message.ts` | LLM 消息 Schema |
| `index.ts` | 桶导出 |

### 3.3 领域服务 (`src/domain/services/`)

4 个领域服务文件 + 1 个桶导出。

| 文件 | 说明 |
|------|------|
| `story-generation-service.ts` | 故事生成服务（`StoryGenerationService`, `BeatGenerationContext`, `ResolvedGenerationParams`） |
| `beat-workflow-service.ts` | 分镜工作流服务（`BeatWorkflowService`, `GenerationStep`, `BeatWorkflowResult`） |
| `reference-resolver.ts` | 引用解析服务（`resolveCharacterRef`, `resolveCharacterRefs`, `resolveSceneRef`） |
| `reference-check.ts` | 引用检查服务（`checkCharacterReferences`, `checkSceneReferences`, `checkElementReferences`） |
| `index.ts` | 桶导出 |

### 3.4 类型定义 (`src/domain/types/`)

8 个类型文件 + 1 个桶导出。

| 文件 | 说明 |
|------|------|
| `result.ts` | Result 模式与错误类型（`Result`, `AppError` 及 12 种错误子类，`ok`, `err`, `fromThrowable`, `fromAsyncThrowable`） |
| `sync.ts` | 同步类型（`SyncStatus`, `VectorClock`, `SyncChangeLogEntry`, `SyncConflict`, `ConflictStrategy`, `SyncConfig`, `SYNC_TABLES` 等） |
| `electron-api.ts` | Electron API 类型（`VideoTaskRecord`, `VideoTaskHistory`, `CustomApiConfig`） |
| `cloud-provider.ts` | 云提供商类型（`CloudProviderInfo`） |
| `video-model.ts` | 视频模型类型（`VideoModelFormat`） |
| `error-codes.ts` | 错误码类型（`ErrorDomain`, `ErrorCodeEntry`, `isRetryable`, `classifyError`） |
| `memory.ts` | 记忆类型 |
| `agent-tools.ts` | 智能体工具类型 |
| `index.ts` | 桶导出 |

### 3.5 工具函数 (`src/domain/utils/`)

4 个工具文件 + 1 个桶导出。

| 文件 | 说明 |
|------|------|
| `shot-prompt.ts` | 分镜提示词工具（`shotInstructionToPrompt`, `resolveShotInstruction`, `SHOT_SIZE_OPTIONS`, `CAMERA_MOVEMENT_OPTIONS`, `CAMERA_ANGLE_OPTIONS`） |
| `beat-prompt-builder.ts` | 分镜提示词构建（`generateBeatImagePrompt`, `generateSimpleBeatImagePrompt`, `getBeatCharacterIds`） |
| `frame-pair-accessors.ts` | 帧对访问器（`getFirstFrameUrl`, `getLastFrameUrl`） |
| `prompt-vocabulary.ts` | 提示词词汇表（`QUALITY_TAGS_IMAGE/VIDEO`, `STYLE_KEYWORDS`, `SCENE_TYPE_KEYWORDS`, `MOOD_KEYWORDS`, `LIGHTING_KEYWORDS`, `CAMERA_*_KEYWORDS` 等） |
| `index.ts` | 桶导出 |

### 3.6 视频子域 (`src/domain/video/`)

| 文件 | 说明 |
|------|------|
| `task-state.ts` | 视频任务状态定义 |

---

## 4. 共享逻辑层 (src/shared-logic)

> 共享逻辑层是零外部依赖的纯函数层，可被渲染进程（`@/shared-logic/*`）和主进程（`@shared-logic/*`）共同使用。仅允许目录内相对导入。构建产物由 `tsconfig.shared-logic.json` 单独编译（`npm run build:shared-logic`）。

包含 9 个子目录 + 1 个顶层桶导出：

| 子目录 | 文件 | 职责 |
|--------|------|------|
| `agent/` | `token-estimator.ts`, `index.ts` | Token 估算（智能体上下文预算） |
| `json/` | `index.ts` | JSON 安全解析工具 |
| `migration/` | `create-idempotent-migration.ts`, `index.ts` | 幂等数据迁移 |
| `prompt/` | `prompt-engine.ts`, `prompt-service.ts`, `compositor-prompt.ts` + `safety/`（antislop, filter-repair, ip-rewriter）+ `skills/`（11 个技能：audio/camera/characters/compress/interview/lighting/prompt/qc/style/troubleshoot/vfx）+ `vocabulary/`（model-name-map, multilingual） | 提示词引擎、服务、安全过滤、技能库、多语言词汇 |
| `retry/` | `retry-with-backoff.ts`, `index.ts` | 指数退避重试 |
| `shot/` | `reference-engine.ts`, `consistency-check.ts`, `consistency-enhancer.ts`, `visual-consistency-check.ts`, `reference-check.ts`, `mood-shot-mapping.ts` | 镜头引用引擎、一致性检查、视觉一致性、引用检查 |
| `story/` | `story-service.ts`, `storyboard-generation.ts`, `story-plan-generator.ts`, `story-few-shot.ts` | 故事服务、分镜生成、故事规划、Few-shot 示例 |
| `timeline/` | `binding-injector.ts`, `cascade-update.ts`, `cross-timeline-injector.ts`, `pinned-snapshot.ts`, `prompt-enhancer.ts`, `snapshot-types.ts`, `snapshot-window.ts`, `state-propagation-engine.ts`, `state-transition-rules.ts` | 时间线 8 维变体系统（绑定注入、级联更新、快照窗口、状态传播） |
| `video/` | `video-task-params.ts`, `video-tracker.ts`, `video-recovery.ts` | 视频任务参数构建、追踪、恢复 |
| 根目录 | `index.ts` | 顶层桶导出（`shot`, `prompt`, `video`, `story`, `timeline`, `agent`, `json`, `migration`, `retry` 命名空间） |

> 注：相比旧版（仅 shot/prompt/video/story），新增了 `agent/`、`json/`、`migration/`、`retry/`、`timeline/` 五个子目录。

---

## 5. 模块层 (src/modules) — 42 个模块

> 模块层是业务核心。模块按职责分为三大类：核心业务（25）、基础设施（4）、工具（13）。**完整模块详情（子域、Public API、依赖、MODULE.md 契约）请参见 [MODULES.md](./MODULES.md)，本节仅给出目录级概览，避免重复。** 模块边界、跨模块通信机制、CQRS/SyncEngine 等模式参见 `.trae/rules/architecture-rules.md`。

### 5.1 核心业务模块（25 个）

| 序号 | 模块 | 路径 | 子域数 | 一句话职责 |
|------|------|------|--------|-----------|
| 1 | `agent` | `src/modules/agent/` | 1 | 智能体主入口：会话编排、工具执行、专家调度、记忆服务 |
| 2 | `agent-memory` | `src/modules/agent-memory/` | 0 | 三层记忆架构（core/archival/working）核心实现 |
| 3 | `agent-session` | `src/modules/agent-session/` | 0 | 智能体会话持久化与检查点服务 |
| 4 | `agent-specialist` | `src/modules/agent-specialist/` | 0 | 专家注册表与内置专家定义 |
| 5 | `agent-fewshot` | `src/modules/agent-fewshot/` | 0 | Few-shot 示例库与提示构建 |
| 6 | `asset` | `src/modules/asset/` | 8 | 资产总库：角色/场景/媒体/道具/集合/导入导出/编辑/生成资产 |
| 7 | `asset-library` | `src/modules/asset-library/` | 0 | 资产库页面型模块（路由入口） |
| 8 | `audit-log` | `src/modules/audit-log/` | 0 | 审计日志记录与查询 |
| 9 | `blockout-3d` | `src/modules/blockout-3d/` | 0 | 3D 场景布局预演（Blockout） |
| 10 | `character` | `src/modules/character/` | 4 | 角色领域：服务 + 变体 + 展示 + hooks |
| 11 | `characters` | `src/modules/characters/` | 0 | 角色页面型模块（路由入口） |
| 12 | `compositor` | `src/modules/compositor/` | 0 | 图像合成器：组合角色/场景/资产生成新图 |
| 13 | `novel` | `src/modules/novel/` | 6 | 小说导入流水线（10 阶段状态机）+ 结构/节奏/连续性 |
| 14 | `prompt` | `src/modules/prompt/` | 10 | 提示词引擎：角色/场景/视频/节拍图/配方/模板 |
| 15 | `quick-generate` | `src/modules/quick-generate/` | 0 | 快速生成页面型模块（图/视频一键生成） |
| 16 | `scene` | `src/modules/scene/` | 4 | 场景领域：服务 + 变体 + 展示 + hooks |
| 17 | `scenes` | `src/modules/scenes/` | 0 | 场景页面型模块（路由入口） |
| 18 | `search` | `src/modules/search/` | 0 | 全局搜索与快速搜索 |
| 19 | `settings` | `src/modules/settings/` | 0 | 设置页面型模块（路由入口） |
| 20 | `shot` | `src/modules/shot/` | 10 | 镜头领域：一致性检查/元素绑定/特征提取/生成/编辑/比较/参考 |
| 21 | `storyboard` | `src/modules/storyboard/` | 5 | 分镜：规划/生成/节拍编辑/提示词编辑/模板 |
| 22 | `timeline` | `src/modules/timeline/` | 0 | 时间线编辑（8 维变体参数系统） |
| 23 | `video` | `src/modules/video/` | 6 | 视频任务 CQRS + 缓存 + 恢复 + 一致性 QC + 局部编辑 |
| 24 | `video-compose` | `src/modules/video-compose/` | 0 | 视频片段合成（15 种转场） |
| 25 | `video-tasks` | `src/modules/video-tasks/` | 0 | 视频任务列表页面型模块（路由入口） |

### 5.2 基础设施模块（4 个）

| 序号 | 模块 | 路径 | 子域数 | 一句话职责 |
|------|------|------|--------|-----------|
| 1 | `persistence` | `src/modules/persistence/` | 0 | 自动保存 + 角色/场景引用删除保护 |
| 2 | `sync` | `src/modules/sync/` | 2 | 同步引擎（SyncEngine 类）+ 设置面板 |
| 3 | `vector-search` | `src/modules/vector-search/` | 0 | 向量检索（API > 本地 ONNX > 关键词 三策略链） |
| 4 | `ffmpeg-runner` | `src/modules/ffmpeg-runner/` | 0 | ffmpeg 服务封装（probe/transcode/merge/extract-frames） |

### 5.3 工具模块（13 个）

均为 `agent` 模块拆分出的工具子集，按业务领域归类，供 `toolRegistry` / `toolExecutor` 调度。工具架构详见 [agent-tools-architecture.md](./agent-tools-architecture.md)。

| 序号 | 模块 | 路径 | 工具数 | 一句话职责 |
|------|------|------|--------|-----------|
| 1 | `agent-tools-asset` | `src/modules/agent-tools-asset/` | 14 | 资产查询（5）+ 资产 CRUD（9） |
| 2 | `agent-tools-generation` | `src/modules/agent-tools-generation/` | 19 | 图像/视频生成（9）+ 图像编辑（10） |
| 3 | `agent-tools-media` | `src/modules/agent-tools-media/` | 23 | 音频（5）+ 视频（7）+ 视频后期（9）+ QC（2） |
| 4 | `agent-tools-memory` | `src/modules/agent-tools-memory/` | 6 | 记忆读写工具 |
| 5 | `agent-tools-meta` | `src/modules/agent-tools-meta/` | 21 | 配置 + 诊断 + 监控 + 帮助 |
| 6 | `agent-tools-project-io` | `src/modules/agent-tools-project-io/` | 4 | 项目导入导出 |
| 7 | `agent-tools-shot` | `src/modules/agent-tools-shot/` | 5 | 镜头操作工具 |
| 8 | `agent-tools-specialist` | `src/modules/agent-tools-specialist/` | 2 | 专家调度工具 |
| 9 | `agent-tools-story` | `src/modules/agent-tools-story/` | 13 | 故事/分镜工具 |
| 10 | `agent-tools-system` | `src/modules/agent-tools-system/` | 3 | 系统级工具 |
| 11 | `agent-tools-template` | `src/modules/agent-tools-template/` | 9 | 模板工具 |
| 12 | `agent-tools-web-file` | `src/modules/agent-tools-web-file/` | 14 | Web（8）+ 文件管理（6） |
| 13 | `agent-tools-workflow` | `src/modules/agent-tools-workflow/` | 14 | 工作流编排（5）+ 子流程（9） |

### 5.4 模块统计

| 类别 | 模块数 | 子域数 | 工具数 |
|------|--------|--------|--------|
| 核心业务模块 | 25 | 54 | — |
| 基础设施模块 | 4 | 2 | — |
| 工具模块 | 13 | 0 | 153 |
| **合计** | **42** | **56** | **153** |

---

## 6. 共享层 (src/shared)

> 共享层提供跨模块通用工具和基础设施代理导出。代理导出目录允许从 `@/infrastructure/*` 重新导出（仅编译期），避免 modules 层直接依赖 infrastructure。详见 `.trae/rules/architecture-rules.md` 的 Import Rules Table。

### 6.1 代理导出模块

| 目录 | 代理导出源 | 关键导出 |
|------|-----------|---------|
| `db-core/` | `@/infrastructure/storage/sqlite-core` | `safeQuery`, `safeRun`, `safeTransaction`, `withRetry` |
| `api-config/` | `@/infrastructure/ai-providers/api-config/*` | `loadConfig`, `checkConfigStatus`, `initConfig`, `getAllTemplatesAsync`, `loadPluginTemplates` |
| `video-cache/` | `@/infrastructure/storage/video-cache` + `@/infrastructure/network/resilient-fetch` | `registerObjectUrl`, `revokeObjectUrl`, `getObjectUrl`, `resilientFetch` |
| `outfit/` | `@/infrastructure/ai-providers/outfit-synthesis` + `@/infrastructure/storage/characters` | `synthesizeOutfit`, `batchSynthesizeOutfits`, `updateOutfitImage` |
| `sql-safety/` | `@/infrastructure/storage/sql-sanitizer` + `schema-registry` | `sanitizeIdentifier`, `sanitizeTable`, `buildSafeInsert/Update/Delete`, `registerColumn(s)`, `isColumnRegistered` |
| `ai-providers/` | `@/infrastructure/ai-providers` | AI 提供商聚合代理 |
| `embedding/` | `@/infrastructure/embedding` | 嵌入服务代理 |
| `file-http/` | 自身实现 | **统一文件操作通信层**：`writeFile`, `readFile`, `getFileInfo`, `getCacheDirectory`, `getDiskSpace`, `fileExists`, `deleteFile`（HTTP `/api/file/*` 优先 + IPC 回退） |
| `model-capabilities.ts` | `@/infrastructure/ai-providers/model-capabilities` | `resolveImageSize`, `getModelCapabilities`, `getVideoGenerationStrategy`, `BUILTIN_MODEL_CAPABILITIES` 等 |

### 6.2 核心工具（根文件）

| 文件 | 说明 |
|------|------|
| `event-bus.ts` | 事件总线（`eventBus`, `EventHandler`, `EventSubscription`） |
| `event-types.ts` | 领域事件类型（`DomainEvents`, `EventPayloadMap`：character/scene/story/asset/videoTask 的 created/updated/deleted/completed/failed） |
| `app-store.ts` | 全局应用状态（`useAppStore`：activeCharacterId, activeSceneId, activeStoryId, sidebarCollapsed） |
| `error-handler.ts` | 错误处理（`isAppError`, `createAppError`, `createGenerationError`, `handleError`, `handleApiClientError`） |
| `error-logger.ts` | 错误日志（`errorLogger` debug/info/warn/error/fatal, `installGlobalErrorHandlers`） |

### 6.3 常量 (`src/shared/constants/`)

| 文件 | 说明 |
|------|------|
| `messages.ts` | 国际化消息（`t()` 函数） |
| `error-codes.ts` | API 错误码（`API_ERROR_CODES`, `getApiErrorI18nKey`） |
| `app-version.ts` | 应用版本常量 |
| `timers.ts` | 定时器常量 |
| `tool-timeouts.ts` | 工具超时常量 |
| `index.ts` | 桶导出 |

### 6.4 Hooks (`src/shared/hooks/`)

| 文件 | 说明 |
|------|------|
| `create-crud-hooks.ts` | 通用 CRUD Hook 工厂 |
| `use-entity-crud.ts` | 通用实体 CRUD Hook |
| `use-entity-image.ts` | 实体图片 Hook |
| `use-model-capabilities.ts` | 模型能力 Hook |
| `use-provider-templates.ts` | 提供商模板 Hook |
| `use-keyboard-shortcuts.ts` | 键盘快捷键 Hook |
| `use-global-keyboard-actions.ts` | 全局键盘操作 Hook |
| `use-debounced-state.ts` | 防抖状态 Hook |
| `use-dirty-state.ts` | 脏状态管理 Hook |
| `use-virtual-list.ts` | 虚拟列表 Hook |
| `use-pagination.ts` | 分页 Hook |
| `use-network-monitor.ts` | 网络监控 Hook |
| `use-memory-monitor.ts` | 内存监控 Hook |
| `use-current-time.ts` | 当前时间 Hook |

### 6.5 工具函数 (`src/shared/utils/`)

| 文件 | 说明 |
|------|------|
| `user-facing-error.ts` | 用户友好错误 |
| `error-classifier.ts` | 错误分类器 |
| `performance.ts` | 性能工具 |
| `preferences.ts` | 偏好设置工具 |
| `safe-json.ts` | 安全 JSON 解析 |
| `image-url.ts` | 图片 URL 工具 |
| `url-validation.ts` | URL 验证 |
| `file-download.ts` | 文件下载 |
| `media-error-handler.ts` | 媒体错误处理 |
| `platform.ts` | 平台检测 |
| `format.ts` | 格式化工具 |
| `confirm.tsx` | 确认对话框工具 |
| `upload-validation.ts` | 上传校验 |
| `toast-bridge.ts` | Toast 桥接（非 React 环境通知） |
| `utils.ts` | 通用工具函数 |

### 6.6 视频工具 (`src/shared/video-utils/`)

| 文件 | 说明 |
|------|------|
| `video-codec.ts` | 视频编解码检测 |
| `video-frame-extractor.ts` | 视频帧提取 |
| `codec-check.ts` | 编解码兼容性检查 |
| `provider-codecs.ts` | 提供商编解码支持 |
| `index.ts` | 桶导出 |

### 6.7 其他子目录

| 目录 | 说明 |
|------|------|
| `errors/` | 错误类型（`version-conflict.ts` 版本冲突错误） |
| `types/` | 类型定义（`api.ts`, `ipc.ts`, `index.ts`：`ApiRequest`, `ApiResponse`, `RouteHandler`, `IpcArgs`, `IpcResult` 等） |

### 6.8 共享 UI 组件 (`src/shared/presentation/`)

包含 35+ 个通用 UI 组件，主要分类：

- **基础控件**：`IconButton`, `AppCard`, `Modal`, `Tabs`, `Tooltip`, `Skeleton`, `SafeImage`, `EmptyState`, `ErrorState`, `PageLoader`
- **布局与反馈**：`Toast`, `ErrorBoundary`, `PageErrorBoundary`, `ThemeProvider`, `ThemeSwitcher`, `Sidebar`, `TitleBar`, `DebugOverlay`
- **对话框与引导**：`AssetSelectorDialog`, `BeforeUnloadGuard`, `DeleteConfirmDialog`, `SearchDialog`, `KeyboardShortcutsDialog`, `CrashRecoveryDialog`, `onboarding.tsx`
- **状态监控**：`NetworkStatusAlert`, `SaveStatusIndicator`, `PerformanceMonitorPanel`, `MemoryMonitorPanel`, `UpdateNotification`, `AgentStatusIndicator`
- **业务组件**：`ModelParameterPanel`, `VirtualList`, `GlobalKeyboardActions`, `ComingSoon`, `use-generation-stage.ts`

---

## 7. 基础设施层 (src/infrastructure)

> 基础设施层提供端口实现、有状态服务、存储与外部集成。modules 层只能通过 DI container（`@/infrastructure/di`）或 `@/shared/*` 代理导出访问本层。DI Token 清单详见 [di-tokens.md](./di-tokens.md)。

### 7.1 AI 提供商 (`src/infrastructure/ai-providers/`)

| 文件 | 说明 |
|------|------|
| `core.ts` | API 客户端核心（`ApiClientError`, `apiCallWithRetry`, `checkApiHealth`） |
| `config.ts` | 配置管理（`resolveCapability`, `safeTruncatePrompt`, `MAX_PROMPT_LENGTH`） |
| `text.ts` | 文本生成（`generateText`） |
| `image.ts` | 图片生成（`generateImage`, `analyzeImage`） |
| `video.ts` | 视频生成（`generateVideo`, `generateKeyframe`, `generateFramePair`, `queryVideoStatus`） |
| `audio.ts` | 音频生成 |
| `embedding.ts` | 嵌入生成 |
| `multi-api.ts` | 多 API 生成（`generateVideoWithMultiAPI`, `testConnection`） |
| `services.ts` | 安全配置与导出（`secureConfig`, `exportData`） |
| `api-cache.ts` | API 调用缓存 |
| `errors.ts` | AI 提供商错误类型 |
| `types.ts` | 类型定义（`ApiRequestOptions`, `CustomApiConfig`, `ApiProviderConfig` 等） |
| `utils.ts` | 工具函数（`imageToBase64`, `uploadFile`, `getConfig`） |
| `index.ts` | 桶导出 |

> 提供商实现位于 `electron/src/plugins/providers/`（火山引擎、快手、智谱、Pixverse、Seedance、Google、OpenAI Sora、OpenAI 兼容、MiniMax、Anthropic、Pika、Luma、Runway）。

### 7.2 API 客户端 (`src/infrastructure/api/`)

| 文件 | 说明 |
|------|------|
| `client.ts` | HTTP API 客户端（`apiClient`） |
| `endpoints.ts` | API 端点定义（`imageApi`, `videoApi`, `textApi`, `configApi`） |
| `index.ts` | 桶导出 |

### 7.3 DI 容器 (`src/infrastructure/di/`)

| 文件 | 说明 |
|------|------|
| `container.ts` | DI 容器（`container`, `resolve`, `AppContainer`） |
| `registry.ts` | 模块注册表（`ModuleRegistry`） |
| `types.ts` | DI 类型（`Token`, `ModuleFactory`, `ModuleContainer`, `Lifecycle`, `createToken`） |
| `index.ts` | 桶导出 |

### 7.4 存储 (`src/infrastructure/storage/`)

20+ 个存储文件，覆盖各领域实体的 SQLite 持久化。

| 文件 | 说明 |
|------|------|
| `sqlite-core.ts` | SQLite 核心操作（`safeQuery`, `safeRun`, `safeTransaction`） |
| `core.ts` | 存储核心（`parseRecord`, `toSqlValue`, `trackChange`） |
| `db.ts` | 数据库连接管理 |
| `schema-registry.ts` | Schema 注册表（列注册与查询） |
| `sql-sanitizer.ts` | SQL 安全（注入防护） |
| `s3-file-storage.ts` | S3 文件存储 |
| `characters.ts` / `scenes.ts` / `stories.ts` | 角色/场景/故事存储 |
| `video-tasks.ts` / `video-cache.ts` / `image-cache.ts` | 视频任务/视频缓存/图片缓存存储 |
| `storyboard.ts` / `collections.ts` / `versions.ts` / `templates.ts` | 分镜/收藏集/版本/模板存储 |
| `auto-save.ts` / `sessions.ts` / `import-export.ts` | 自动保存/会话/导入导出存储 |
| `elements.ts` / `error-logs.ts` | 元素/错误日志存储 |
| `index.ts` | 桶导出 |

子目录：`characters/`、`elements/`（含 `queries.ts`）、`props/`、`stories/`。

### 7.5 网络 (`src/infrastructure/network/`)

| 文件 | 说明 |
|------|------|
| `resilient-fetch.ts` | 弹性 Fetch（`resilientFetch`） |
| `retry-executor.ts` | 重试执行器（`executeWithRetry`, `RETRY_POLICIES`） |
| `circuit-breaker.ts` | 熔断器（`getCircuitBreaker`, `executeThroughCircuit`） |
| `network-monitor.ts` | 网络监控（`getNetworkQuality`, `getAdaptiveTimeout`） |
| `network.config.ts` | 网络配置（`NETWORK_CONFIG`） |
| `profiles.ts` | 网络配置文件（`aiApiProfile`, `syncProfile`） |
| `types.ts` | 网络类型（`CircuitState`, `NetworkQualityLevel`, `DownloadTask` 等） |
| `index.ts` | 桶导出 |

### 7.6 其他子目录

| 目录 | 说明 |
|------|------|
| `database/` | 数据库入口（`index.ts`：`mediaAssetRepository`） |
| `embedding/` | 嵌入服务（`MODULE.md` + `model-manager.ts`, `similarity.ts`, `vector-index.ts`） |
| `monitoring/` | 性能监控（`performanceMonitor`, `PerformanceMetric`） |
| `server/` | 服务端工具（`api-utils.ts`：`safeParseJson`, `sanitizeErrorMessage`, `maskApiKey`, `isUrlAllowed`, `ApiError`） |
| `video-utils/` | 视频工具（代理 `@/shared/video-utils`） |
| 根文件 `api-config-facade.ts` | API 配置门面，统一配置入口 |

---

## 8. 应用层 (src/app)

> 应用层包含路由页面、全局 Provider 和布局组件。

### 8.1 全局入口与布局

| 文件 | 说明 |
|------|------|
| `page.tsx` | 首页（项目列表） |
| `layout.tsx` | 布局组件（侧边栏 + 内容区） |
| `not-found.tsx` | 404 页面 |
| `ClientProviders.tsx` | 客户端 Provider 组合（QueryClient, EventBus 等） |
| `MigrationInitializer.tsx` | 数据迁移初始化组件 |
| `SidebarWithSearch.tsx` | 带搜索的侧边栏 |
| `globals.css` | 全局样式 |
| `ARCHITECTURE-NOTE.md` | 应用层架构说明 |

### 8.2 路由页面

| 路径 | 文件 | 说明 |
|------|------|------|
| `/` | `page.tsx` | 首页 |
| `/story` | `story/page.tsx` | 故事列表页 |
| `/story/...` | `stories/StoryCard.tsx`, `page.tsx` | 故事卡片与列表 |
| `/agent` | `agent/page.tsx` | 智能体页 |
| `/agent/settings` | `agent/settings/page.tsx` | 智能体设置页 |
| `/plugins` | `plugins/page.tsx` | 插件管理页 |
| coming-soon | `coming-soon/*.tsx` | 占位页（Login/Mobile/TemplateMarket/Workflow/Workspace） |

### 8.3 应用层 Hooks

| 文件 | 说明 |
|------|------|
| `hooks/use-home-page.ts` | 首页 Hook |

> 注：角色、场景、视频任务、快速生成、资产库、设置等页面型模块的页面组件实际位于 `src/modules/{module}/page.tsx`（如 `characters/page.tsx`、`scenes/page.tsx`、`video-tasks/`、`quick-generate/`、`asset-library/`、`settings/`），由路由直接引用模块公共 API。

---

## 9. Electron 主进程 (electron/src)

### 9.1 入口与生命周期

| 文件 | 说明 |
|------|------|
| `main.ts` | 主进程入口 |
| `main-dev.ts` | 开发模式入口 |
| `main-common.ts` | 主进程通用逻辑 |
| `api-server.ts` | API 服务器 |
| `api-gateway.ts` | API 网关主文件 |
| `api-gateway-image.ts` / `api-gateway-text.ts` / `api-gateway-av.ts` | 图片/文本/音视频 API 网关 |
| `api-gateway-retry.ts` / `api-gateway-error-codes.ts` / `api-gateway-helpers.ts` / `api-gateway-utils.ts` | 重试/错误码/辅助/工具 |
| `protocol.ts` | 自定义协议注册 |
| `menu.ts` | 应用菜单 |
| `preload.ts` | 预加载脚本（IPC 安全桥接） |
| `db-interface.ts` | 数据库接口 |
| `app-paths.ts` | 应用路径 |
| `http-request.ts` | HTTP 请求 |
| `shared-logic-resolve.ts` | 共享逻辑解析 |
| `sync-http-client.ts` | 同步 HTTP 客户端（beforeunload 同步保存） |
| `lifecycle/` | 生命周期管理（`manager.ts`, `cleanup.ts`, `recovery.ts`, `states.ts`, `index.ts`） |

### 9.2 API 路由 (`electron/src/api/`)

9 个路由组（详见 `docs/HTTP-API.md` 与 `.trae/rules/architecture-rules.md` 的 HTTP Routes Registry）：

| 文件 | 说明 |
|------|------|
| `server.ts` | HTTP 服务器实现 |
| `routes.ts` | 路由注册（合并 `coreRoutes`, `dbRoutes`, `fileRoutes`, `generationRoutes`, `pluginRoutes`, `shotRoutes`, `storyboardRoutes`, `downloadRoutes`, `ffmpegRoutes`） |
| `schemas.ts` | Zod Schema 定义（所有 API 请求 Schema 与推断类型） |
| `types.ts` | API 类型（`ApiRequest`, `ApiResponse`, `Route`, `RouteHandler`, `defineRoute`） |
| `middleware.ts` | 请求中间件 |

路由组覆盖：`config/get|set`、`db/query|run|transaction`、`file/*`（`write` 限 100MB）、download、ffmpeg（probe/transcode/extract-frames/merge）、generation（image/video/text/story）、plugin（list/add/delete/reload）、shot（reference/consistency/visual-consistency）、storyboard（generation/recovery/bulk-save）。

### 9.3 预加载 (`electron/src/preload.ts`)

IPC 安全桥接，定义 `electronAPI` 对象，按权限分级：READONLY / READWRITE / DANGEROUS / SYSTEM / SECURE（`secure-config:resolve`）。

### 9.4 插件系统 (`electron/src/plugins/`)

| 文件 | 说明 |
|------|------|
| `base-provider.ts` | 插件基类（`BaseAIProviderPlugin`） |
| `registry.ts` | 插件注册表（`pluginRegistry`, `USER_PLUGINS_DIR`, `CODE_PLUGINS_DIR`） |
| `types.ts` | 插件类型（`AIProviderPlugin`, `ModelCapabilities`, `ProviderCapabilities` 等） |
| `utils.ts` | 插件工具（`ensureAccessibleUrl`, `downloadAsBase64`, `stripDataUriPrefix`） |
| `plugin-worker.ts` | 插件工作线程 |
| `index.ts` | 桶导出 |

提供商实现 (`plugins/providers/`)：`luma.ts`, `pika.ts`, `zhipu.ts`, `index.ts`。

### 9.5 其他主进程模块

| 目录/文件 | 说明 |
|----------|------|
| `config/` | 配置管理（`config-manager.ts`, `ports.ts`） |
| `database/` | 数据库（`db-connection.ts`, `db-schema.ts`, `migrations.ts`, `schema-builder.ts`） |
| `handlers/` | IPC 处理器（`database.ts`, `assets.ts`, `config.ts`, `config-storage.ts`, `sync.ts`, `secure-config.ts`, `export.ts`, `ffmpeg-handler.ts`） |
| `logging/` | 日志（`logger.ts`, `types.ts`） |
| `security/` | 安全模块（SSRF 防护、密钥存储） |
| `shared/i18n.ts` | 主进程国际化 |
| `types/` | 类型声明（`api.ts`, `ipc.ts`, `database.ts`, `story.ts`, `sharp.d.ts`, `sql-modules.d.ts`） |

> SSRF 防护：`ssrfGuard.validate` 对非 loopback 用户配置主机强制校验，loopback 受信绕过（见 R105）。文件写入限制：`/api/file/write` 强制 100MB 上限。

---

## 10. 测试代码

### 10.1 E2E 测试 (`tests/`)

Playwright E2E 测试，支持浏览器与 Electron 两种运行模式。

**根级测试** (`tests/*.spec.ts`)：

| 文件 | 说明 |
|------|------|
| `smoke.spec.ts`（位于 electron/） | 冒烟测试 |
| `full-creation-workflow.spec.ts` | 完整创建工作流 |
| `story-workflow.spec.ts` | 故事工作流 |
| `character-scene-crud.spec.ts` | 角色/场景 CRUD |
| `database-storage.spec.ts` | 数据库存储 |
| `navigation-guard.spec.ts` | 导航守卫 |
| `video-generation.spec.ts` / `video-task-workflow.spec.ts` | 视频生成/任务工作流 |
| `sync-workflow.spec.ts` | 同步工作流 |
| `plugin-management.spec.ts` | 插件管理 |
| `asset-library-workflow.spec.ts` | 资产库工作流 |
| `api-config-workflow.spec.ts` | API 配置工作流 |
| `story-delete-confirmation.spec.ts` | 故事删除确认 |
| `settings-config.spec.ts` | 设置配置 |
| `electron-integration.spec.ts` / `electron-pages.spec.ts` | Electron 集成/页面 |
| `beat-detail-page.spec.ts` | 分镜详情页 |
| `composer-and-compositor.spec.ts` | 合成器与合成 |
| `network-resilience.spec.ts` | 网络韧性 |
| `not-found-page.spec.ts` | 404 页面 |
| `agent-and-update.spec.ts` | 智能体与更新 |

**Electron E2E** (`tests/electron/`)：`smoke`, `database-storage`, `character-scene-crud`, `story-workflow`, `video-generation`, `settings-config`, `edit-field-combination-persistence`。

**测试辅助** (`tests/helpers/`)：`page-helpers.ts`, `electron-mock.ts`, `mock-api.ts`, `electron-page-helpers.ts`, `electron-fixture.ts`, `console-errors.ts`。

### 10.2 单元测试分布

单元测试（Vitest）分布在各源码目录的 `__tests__/` 子目录，主要覆盖：

- `src/domain/__tests__/` — 领域纯度、Schema 验证、服务、工具测试
- `src/shared/__tests__/` + 各子目录 `__tests__/` — 错误处理、事件总线、Hooks、SQL 安全、UI 回归测试
- `src/shared-logic/*/__tests__/` — 共享逻辑纯函数测试
- `src/modules/*/__tests__/` 与 `src/modules/*/*/__tests__/` — 各模块服务、Hooks、组件测试
- `src/infrastructure/*/__tests__/` — 存储、AI 提供商、网络、DI 测试
- `electron/src/**/__tests__/` — 主进程插件、API、数据库、安全测试
- `src/__tests__/` — 测试基础设施（`factories/`, `mocks/`, `helpers/`, `lib/`, `test-helpers/`, `utils/`）

### 10.3 测试基础设施 (`src/__tests__/`)

| 子目录 | 说明 |
|--------|------|
| `factories/` | 测试数据工厂 |
| `mocks/` | Mock 工具（`ai-call-mock.ts`, `di-container.ts`, `electron-api.ts`, `factories.ts`, `in-memory-db.ts`, `ipc-responses.ts`, `storage-ports.ts`） |
| `helpers/` | 测试辅助 |
| `lib/` | 测试库（`api-client.test.ts`, `api-core.test.ts`, `api-config/`, `prompt-engine/`, `element-manager.test.ts`） |
| `test-helpers/` | `api-key-helper.ts`, `test-prompts.ts` |
| `utils/` | `contract-validator.ts`, `render-with-providers.tsx`, `result-helpers.ts` |
| `setup.ts` | 测试环境初始化 |

测试配置：`vitest.config.ts`（渲染进程）、`vitest.config.electron.ts`（主进程）、`tsconfig.test.json`、`playwright.config.ts` / `playwright.electron.config.ts` / `playwright.electron-all.config.ts`。

---

## 11. 配置文件

| 文件 | 说明 |
|------|------|
| `package.json` | 项目配置：依赖、脚本、electron-builder 配置（appId: `com.prismcraft.app`） |
| `vite.config.ts` | Vite 构建配置：路径别名、代码分割分组 |
| `tsconfig.json` | 渲染进程 TypeScript 配置（严格模式、路径别名） |
| `tsconfig.shared-logic.json` | 共享逻辑层独立编译配置 |
| `tsconfig.test.json` | 测试 TypeScript 配置 |
| `eslint.config.mjs` | ESLint 配置：DDD 分层规则、禁止导入模式、`no-direct-db-ipc` 自定义规则 |
| `electron/tsconfig.json` | Electron 主进程 TypeScript 配置 |
| `electron/tsconfig.test.json` | Electron 测试 TypeScript 配置 |
| `vitest.config.ts` | Vitest 单元测试配置 |
| `vitest.config.electron.ts` | Electron Vitest 配置 |
| `playwright.config.ts` | Playwright E2E 配置 |
| `playwright.electron.config.ts` / `playwright.electron-all.config.ts` | Electron E2E 配置 |
| `build-electron.ps1` | Electron 构建脚本（PowerShell） |
| `global.d.ts` | 全局类型声明 |
| `postcss.config.mjs` | PostCSS 配置 |
| `.prettierrc` / `.editorconfig` | 代码格式化配置 |
| `.npmrc` / `.env.example` | npm 与环境变量配置 |
| `.cnb.yml` | CNB CI 配置 |
| `.github/workflows/ci.yml` / `release.yml` | GitHub Actions CI/发布工作流 |
| `.husky/pre-commit` | Git pre-commit hook |
| `.storybook/main.ts` / `preview.ts` | Storybook 配置 |

### 11.1 路径别名

| 别名 | 路径 | 用途 |
|------|------|------|
| `@/*` | `./src/*` | 渲染进程源码 |
| `@shared-logic/*` | `./src/shared-logic/*` | 共享逻辑层（渲染进程） |
| `@shared-logic/*` | （主进程符号链接） | 共享逻辑层（主进程，由 `scripts/setup-shared-logic-symlink.mjs` 建立） |
| `@shared/*` | （主进程） | 主进程共享导出 |
| `@domain/*` | （主进程） | 领域类型 |

### 11.2 关键 NPM Scripts

| 脚本 | 说明 |
|------|------|
| `dev` | 启动开发服务器 |
| `build` / `build:shared-logic` / `build:electron` | 各层构建 |
| `build:win` / `build:mac` / `build:linux` | 平台打包 |
| `typecheck` / `typecheck:electron` / `typecheck:test` | 各层类型检查 |
| `lint` / `lint:electron` / `lint:arch` | ESLint + 架构合规检查 |
| `test` / `test:watch` / `test:coverage` | Vitest 单元测试 |
| `test:electron` / `test:local-cloud` | Electron 测试 |
| `test:mutation` | Stryker 变异测试 |
| `test:e2e` / `test:e2e:electron` / `test:e2e:electron-all` | Playwright E2E |
| `storybook` / `build-storybook` | Storybook |
| `validate` / `validate:full` | 完整验证（typecheck + lint + arch + 契约 + test） |
| `graph` / `di-docs` / `changelog` / `perf` / `smoke` | 模块图/DI 文档/变更日志/性能/冒烟 |

---

## 12. 构建与校验脚本 (scripts/)

| 文件 | 说明 |
|------|------|
| `check-architecture.mjs` | DDD 分层架构合规检查（`lint:arch`） |
| `validate-contracts.mjs` / `validate-contracts.ts` | 模块契约验证 |
| `check-native-modules.mjs` | 原生模块兼容性检查 |
| `build-module-graph.ts` | 模块依赖图生成（`graph`） |
| `dependency-graph.ts` | 依赖关系图生成 |
| `generate-di-docs.ts` | DI 容器文档生成（`di-docs`） |
| `generate-changelog.ts` | 变更日志生成（`changelog`） |
| `ai-context-boundary.ts` | AI 上下文边界分析 |
| `guard-module-size.ts` | 模块大小守卫 |
| `perf-regression.ts` | 性能回归检测（`perf`） |
| `render-creation-flow.mjs` | 创作流程渲染 |
| `download-embedding-model.mjs` | 嵌入模型下载 |
| `setup-shared-logic-symlink.mjs` | 共享逻辑层符号链接建立（postinstall） |
| `electron-build-win.js` | Electron Windows 构建脚本 |
| `api-routes-manager.js` | API 路由管理工具 |
| `copy-static-resources.js` | 静态资源复制 |
| `clean-before-build.js` / `cleanup-lib.js` / `clean-user-data.js` | 构建前/lib/用户数据清理 |
| `count-code.ps1` | 代码行数统计（PowerShell） |
| `smoke-test.ps1` | 冒烟测试脚本（PowerShell） |
| `migrate-components.js` / `migrate-hooks.js` / `migrate-services.js` / `migrate-files.js` / `migrate-single-imports.js` | 历史迁移脚本 |
| `video-test-tool/` | 视频测试工具（`cli.ts`, `video-tester.ts`, `types.ts`） |
| `test-config/` | 测试配置工具（`cli.ts`, `config-manager.ts`, `types.ts`） |

---

## 13. AI 工具集成文件 (.ai/)

> 为 AI 编程工具（Trae / Cursor / Copilot）提供项目上下文，降低幻觉与跨层违规。详见 `.trae/rules/ai-tool-integration.md`。

### 13.1 根文件

| 文件 | 说明 |
|------|------|
| `README.md` | AI 工具集成说明 |
| `context-snapshot.mjs` | 上下文快照脚本（新会话恢复：分支/修改文件/最近提交/类型检查状态） |
| `methodology.md` | AI 协作方法论 |
| `symbol-index.md` | 符号索引 |
| `contest-post-1.2.2.md` | 比赛提交记录 |

### 13.2 模块上下文 (`.ai/modules/`)

42 个模块各一个 `.md`（与 `src/modules/` 一一对应），加 `__tests__.md`，共 43 个文件。每个文件提供该模块的 AI 上下文（职责、关键 API、依赖、注意事项），供 AI 工具按需加载以节省 token 预算。

涵盖：`agent.md`, `agent-fewshot.md`, `agent-memory.md`, `agent-session.md`, `agent-specialist.md`, 13 个 `agent-tools-*.md`, `asset.md`, `asset-library.md`, `audit-log.md`, `blockout-3d.md`, `character.md`, `characters.md`, `compositor.md`, `ffmpeg-runner.md`, `novel.md`, `persistence.md`, `prompt.md`, `quick-generate.md`, `scene.md`, `scenes.md`, `search.md`, `settings.md`, `shot.md`, `storyboard.md`, `sync.md`, `vector-search.md`, `video.md`, `video-compose.md`, `video-tasks.md` 等。

### 13.3 Trae 规则 (`.trae/rules/`)

| 文件 | 说明 |
|------|------|
| `quick-start.md` | Layer 0：始终加载的核心规则（命令、关键路径） |
| `architecture-rules.md` | Layer 1：架构规则（依赖方向、Import Rules、DI、defineRoute、CQRS） |
| `testing-rules.md` | Layer 1：测试规则 |
| `project_rules.md` | 项目规则全集 |
| `regression-guards.md` | 回归防护规则全集 |
| `ai-tool-integration.md` | AI 工具集成指南（决策树、防幻觉、会话状态传递） |
| `regression/` | 按类别拆分的回归规则（`async-safety.md`, `engineering.md`, `platform.md`, `ui-robustness.md`, `user-safety.md`, `index.md`） |

---

## 相关文档

- [MODULES.md](./MODULES.md) — 42 个模块全景图（子域、Public API、依赖详情）
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 架构设计说明
- [agent-tools-architecture.md](./agent-tools-architecture.md) — 智能体工具架构
- [di-tokens.md](./di-tokens.md) — DI Token 清单
- [ports.md](./ports.md) — 端口接口清单
- [HTTP-API.md](./HTTP-API.md) — HTTP API 文档
- [API_REFERENCE.md](./API_REFERENCE.md) — API 参考
- [DEVELOPMENT.md](./DEVELOPMENT.md) — 开发指南
- [TECHNICAL_REFERENCE.md](./TECHNICAL_REFERENCE.md) — 技术参考
- [timeline-implementation.md](./timeline-implementation.md) — 时间线实现
- [novel-pipeline-guide.md](./novel-pipeline-guide.md) — 小说流水线指南
- [plugin-specification.md](./plugin-specification.md) — 插件规范
