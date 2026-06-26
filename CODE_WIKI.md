# PrismCraft - Code Wiki

> **注意**: 本文档与 docs/CODE_CATALOG.md 内容重叠。建议以 CODE_CATALOG.md 为准。
> 版本号和路径可能已过时，请参考 .ai/symbol-index.md 获取最新结构。

> 版本: 0.11.0 | 更新日期: 2026-06-21 | 架构: Electron + Vite + React | 模式: DDD (领域驱动设计)

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈与依赖](#2-技术栈与依赖)
3. [项目架构总览](#3-项目架构总览)
4. [目录结构详解](#4-目录结构详解)
5. [前端架构 (Renderer Process)](#5-前端架构-renderer-process)
   - 5.1 [领域层 (domain)](#51-领域层-domain)
   - 5.2 [模块层 (modules)](#52-模块层-modules)
   - 5.3 [基础设施层 (infrastructure)](#53-基础设施层-infrastructure)
   - 5.4 [共享层 (shared)](#54-共享层-shared)
   - 5.5 [应用层 (app)](#55-应用层-app)
6. [Electron 主进程架构](#6-electron-主进程架构)
   - 6.1 [主进程入口与生命周期](#61-主进程入口与生命周期)
   - 6.2 [API 服务器](#62-api-服务器)
   - 6.3 [数据库层](#63-数据库层)
   - 6.4 [插件系统](#64-插件系统)
   - 6.5 [IPC 通信与安全](#65-ipc-通信与安全)
7. [依赖注入 (DI) 容器](#7-依赖注入-di-容器)
8. [关键数据流](#8-关键数据流)
9. [路由与页面结构](#9-路由与页面结构)
10. [构建与运行](#10-构建与运行)
11. [测试体系](#11-测试体系)
12. [代码规范与架构约束](#12-代码规范与架构约束)

---

## 1. 项目概述

**PrismCraft** 是一款 AI 驱动的动画制作桌面工具，采用本地优先 (local-first) 设计，支持从故事创作到视频生成的完整工作流。核心功能包括：

- **故事创作** — AI 辅助的故事规划、节拍编辑与模板管理
- **角色与场景管理** — 角色/场景的 CRUD、参考图管理、outfit 系统
- **镜头系统** — 镜头指令、参考图策略、一致性检查、特征锚定
- **视频生成管线** — 预览图(keyframe) → 首尾帧(framePair) → 视频(video) 的三阶段管线
- **多 AI 提供商支持** — 通过插件系统适配 Kling、Seedance、MiniMax、通义万相等
- **数据同步** — 多设备数据同步与冲突解决
- **资产管理** — 媒体资产库、收藏集、导入导出

---

## 2. 技术栈与依赖

### 运行时核心

| 类别 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 桌面框架 | Electron | 41.7.1 | 桌面应用容器 |
| 前端框架 | React | 19.2.4 | UI 渲染 |
| 路由 | React Router | 7.16.0 | SPA 路由 |
| 状态管理 | Zustand | 5.0.12 | 全局状态 |
| 数据查询 | @tanstack/react-query | 5.100.9 | 服务端数据缓存 |
| 样式 | Tailwind CSS | 4.x | 原子化 CSS |
| 数据库 | better-sqlite3 | 12.10.0 (精确锁定) | SQLite3 绑定 |
| Schema 验证 | Zod | 4.4.3 | 请求/数据验证 |
| 构建工具 | Vite | 8.x | 前端构建 + HMR |

### 开发工具链

| 类别 | 技术 | 用途 |
|------|------|------|
| 语言 | TypeScript (strict) | 类型安全 |
| Lint | ESLint 9 + typescript-eslint + react-hooks | 代码质量 |
| 测试 | Vitest (单元) + Playwright (E2E) | 测试覆盖 |
| 打包 | electron-builder | 桌面安装包 |
| Git Hooks | Husky + lint-staged | 提交门禁 |

---

## 3. 项目架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Desktop App                   │
│                                                           │
│  ┌──────────────────────┐  ┌───────────────────────────┐ │
│  │   Renderer Process    │  │     Main Process          │ │
│  │                       │  │                            │ │
│  │  ┌───────────────┐   │  │  ┌──────────────────────┐ │ │
│  │  │  React SPA     │   │  │  │  HTTP API Server     │ │ │
│  │  │  (Vite Build)  │◄──┼──┼──┤  (localhost:API_PORT)│ │ │
│  │  │                │   │  │  └──────────────────────┘ │ │
│  │  │  app/          │   │  │  ┌──────────────────────┐ │ │
│  │  │  modules/      │   │  │  │  SQLite Database     │ │ │
│  │  │  domain/       │   │  │  │  (better-sqlite3)    │ │ │
│  │  │  shared/       │   │  │  └──────────────────────┘ │ │
│  │  │  infrastructure/│  │  │  ┌──────────────────────┐ │ │
│  │  └───────────────┘   │  │  │  Plugin System       │ │ │
│  │                       │  │  │  (Registry + Adapters)│ │ │
│  │  ┌───────────────┐   │  │  └──────────────────────┘ │ │
│  │  │  DI Container  │   │  │  ┌──────────────────────┐ │ │
│  │  │  (Proxy-based) │   │  │  │  IPC Handlers        │ │ │
│  │  └───────────────┘   │  │  └──────────────────────┘ │ │
│  └──────────────────────┘  └───────────────────────────┘ │
│            │                           │                   │
│            └───── preload.ts (IPC Bridge) ─────┘           │
└─────────────────────────────────────────────────────────┘
```

### DDD 分层架构

依赖方向严格**向内流动**：

```
app → modules → domain
              → shared
              → infrastructure/di (via container only)
infrastructure → domain, shared
shared → domain, infrastructure (proxy exports only)
domain → NOTHING (pure types)
```

---

## 4. 目录结构详解

```
prismcraft/
├── src/                          # 前端源码 (Renderer Process)
│   ├── main.tsx                  # React 入口，挂载 RouterProvider
│   ├── router.tsx                # 路由定义，所有页面使用 React.lazy 懒加载
│   ├── domain/                   # 纯类型与 Schema，不依赖任何其他层
│   │   ├── schemas/              # 数据模型定义 (story, character, scene, shot, media, api)
│   │   └── ports/                # Port 接口定义 (AI Provider, Storage, Element Manager)
│   ├── modules/                  # 业务子域模块 (每个含 hooks/, services/, presentation/)
│   │   ├── story/                # 故事模块 (beat-editor, generation, planning, template)
│   │   ├── video/                # 视频模块 (task-management, utils, recovery, cache)
│   │   ├── character/            # 角色模块 (hooks, services)
│   │   ├── scene/                # 场景模块 (hooks, services)
│   │   ├── shot/                 # 镜头模块 (instruction, generation, reference, consistency)
│   │   ├── prompt/               # 提示词模块 (base, builder, beat-image, video, scene, character)
│   │   ├── asset/                # 资产模块 (library, import-export, media-assets)
│   │   ├── sync/                 # 同步模块 (engine, presentation)
│   │   └── persistence/          # 持久化模块 (auto-save, persistence guard)
│   ├── infrastructure/           # 基础设施层
│   │   ├── di/                   # 依赖注入容器 (container.ts, types.ts, registry.ts)
│   │   ├── storage/              # 存储模块 (15+ storage modules + JSON container parsers)
│   │   ├── ai-providers/         # AI 提供商 (video, image, text 生成 + model-capabilities)
│   │   ├── api/                  # API 客户端 (apiClient, imageApi, videoApi, textApi)
│   │   ├── database/             # Drizzle ORM repository
│   │   └── api-config-facade.ts  # API 配置门面
│   ├── shared/                   # 跨切面共享层
│   │   ├── constants/            # 常量 (messages.ts 含 1850+ i18n 键)
│   │   ├── presentation/         # 共享 UI (Toast, Sidebar, ThemeProvider, ErrorBoundary)
│   │   ├── utils/                # 工具函数 (preferences, toast-bridge, error-logger)
│   │   ├── event-bus/            # 事件总线
│   │   ├── errors/               # 错误类型 (VersionConflictError)
│   │   ├── db-core/              # DB 代理导出 (safeQuery, safeRun, safeTransaction)
│   │   ├── api-config/           # API 配置代理导出
│   │   ├── model-capabilities/   # 模型能力代理导出
│   │   ├── sql-safety/           # SQL 安全代理导出
│   │   ├── video-cache/          # 视频缓存代理导出
│   │   └── file-http/            # 统一文件操作通信层代理导出 (HTTP 优先 + IPC 回退)
│   ├── app/                      # 页面组件与布局
│   │   ├── layout.tsx            # 根布局 (Sidebar + Toast + Theme + Providers)
│   │   ├── page/                 # 首页
│   │   ├── story/                # 故事页 + 节拍详情页
│   │   ├── characters/           # 角色管理页
│   │   ├── scenes/               # 场景管理页
│   │   ├── asset-library/        # 资产库页
│   │   ├── quick-generate/       # 快速生成页
│   │   ├── settings/             # 设置页
│   │   └── video-tasks/          # 视频任务页
│   └── config/                   # 配置常量 (constants.ts, ports.ts)
│
├── electron/src/                 # Electron 主进程源码
│   ├── main.ts                   # 生产入口 (窗口管理 + 自动更新 + 生命周期)
│   ├── main-dev.ts               # 开发入口 (debug 日志 + DevTools)
│   ├── main-common.ts            # 共享逻辑 (createWindow + 静态服务器 + 配置 IPC)
│   ├── preload.ts                # IPC 桥接 (权限系统 + 速率限制)
│   ├── api-server.ts             # API 服务器入口 (re-export from api/server.ts)
│   ├── api/                      # HTTP API 服务器
│   │   ├── types.ts              # Route, RouteHandler, ApiResponse 类型定义
│   │   ├── middleware.ts         # CORS + X-Electron-App 认证 + 速率限制 + 连接追踪
│   │   ├── schemas.ts            # Zod Schema (40+ 请求体验证)
│   │   ├── routes.ts             # 路由注册 (合并 7 个路由组)
│   │   ├── server.ts             # HTTP 服务器启停 + 请求分发 + Schema 验证
│   │   └── route-groups/         # 路由处理器组
│   │       ├── core-routes.ts    # 配置、上传、导出、测试连接、同步
│   │       ├── db-routes.ts      # 数据库查询、运行、批量插入、事务
│   │       ├── file-routes.ts    # 文件读写、缓存目录、磁盘空间、文件信息
│   │       ├── generation-routes.ts # 图片/视频/文本生成、故事生成
│   │       ├── plugin-routes.ts  # 插件管理 (列表、添加、删除、重载)
│   │       ├── shot-routes.ts    # 镜头参考、一致性检查、视觉一致性
│   │       └── storyboard-routes.ts # 故事板生成、视频恢复、批量保存
│   ├── database/                 # 数据库层
│   │   ├── db-connection.ts      # SQLite 连接管理
│   │   ├── db-schema.ts          # 表定义 (13 业务表 + 5 关联表 + 6 缓存表 + 3 同步表)
│   │   ├── schema-builder.ts     # 声明式 Schema 生成器 (7 字段基础列)
│   │   └── migrations.ts         # 迁移框架 (当前版本 v4)
│   ├── handlers/                 # IPC 处理器
│   │   ├── database.ts           # 数据库 IPC
│   │   ├── assets.ts             # 资产文件 IPC
│   │   ├── config.ts             # 配置 IPC
│   │   ├── export.ts             # 导出 IPC
│   │   ├── sync.ts               # 同步 IPC
│   │   └── secure-config.ts      # 安全配置 IPC (API Key 加密存储)
│   ├── plugins/                  # 插件系统
│   │   ├── registry.ts           # PluginRegistry 类 (注册、匹配、重载)
│   │   ├── types.ts              # AIProviderPlugin 接口定义
│   │   ├── user-plugin-loader.ts # 声明式插件加载 (.plugin.json)
│   │   ├── user-plugin-adapter.ts # 声明式插件适配器
│   │   ├── code-plugin-loader.ts # 代码插件加载 (.plugin.js)
│   │   ├── code-plugin-adapter.ts # 代码插件适配器 (进程隔离)
│   │   ├── plugin-process-manager.ts # 子进程管理器
│   │   ├── plugin-worker.ts      # 子进程入口 (vm 沙箱)
│   │   └── providers/            # 内置提供商插件
│   ├── services/                 # 主进程业务服务
│   │   ├── story/                # 故事服务 (story-service, storyboard-generation)
│   │   ├── video/                # 视频服务 (video-task-service, video-recovery, video-tracker)
│   │   ├── prompt/               # 提示词服务 (prompt-service)
│   │   └── shot/                 # 镜头服务 (reference-engine, consistency-check, reference-check, visual-consistency-check)
│   ├── security/                 # 安全模块
│   │   ├── ssrf-guard/           # SSRF 防护
│   │   └── key-storage/          # 密钥存储
│   ├── logging/                  # 日志系统
│   │   ├── logger.ts             # Logger 核心 (loggerRegistry, getLogger)
│   │   └── transports/           # 日志传输 (ConsoleTransport, FileTransport)
│   ├── lifecycle/                # 生命周期管理 (LifecycleManager, cleanup)
│   ├── protocol/                 # 自定义协议注册
│   ├── api-gateway.ts            # API 网关 (统一 AI 提供商调用)
│   └── config/                   # 主进程配置 (ports.ts)
│
├── scripts/                      # 构建/检查脚本
│   ├── check-architecture.mjs    # DDD 违规扫描
│   ├── check-module-api-consistency.mjs # MODULE.md ↔ index.ts 一致性检查
│   ├── validate-contracts.mjs    # Contract 结构验证
│   ├── check-native-modules.mjs  # 原生模块版本锁定检查
│   └── generate-di-docs.ts       # DI Token 文档生成
│
├── docs/                         # 文档
├── tests/                        # E2E 测试
├── build-electron.ps1            # Electron 构建脚本 (PowerShell)
├── vite.config.ts                # Vite 构建配置
├── tsconfig.json                 # TypeScript 配置
└── package.json                  # 项目元数据与脚本
```

---

## 5. 前端架构 (Renderer Process)

### 5.1 领域层 (domain)

**路径**: `src/domain/`

领域层是纯类型定义层，**不依赖任何其他层**，包含两个子目录：

#### schemas/ — 数据模型定义

| 文件 | 职责 |
|------|------|
| `story.ts` | 故事与节拍数据模型 (StoryBeat, StoryBeatKeyframe 等) |
| `character.ts` | 角色数据模型 (Character, CharacterOutfit 等) |
| `scene.ts` | 场景数据模型 |
| `shot-system.ts` | 镜头系统数据模型 (Shot, ShotInstruction 等) |
| `media.ts` | 媒体资产数据模型 |
| `api.ts` | API 响应类型 (ApiResponse\<T\>, VideoGenerationResult, ImageGenerationResult) |

#### ports/ — Port 接口定义

Port 接口是 DDD 中模块与基础设施之间的解耦契约：

| Port 接口 | 文件 | 职责 |
|-----------|------|------|
| `IVideoProvider` | `ai-provider-port.ts` | 视频生成 (generateVideo, queryVideoStatus, generateKeyframe, generateFramePair, generateVideoWithFrames) |
| `IImageProvider` | `ai-provider-port.ts` | 图片生成与分析 (generateImage, analyzeImage) |
| `ITextProvider` | `ai-provider-port.ts` | 文本生成 (generateText) |
| `IFileUploader` | `ai-provider-port.ts` | 文件上传 (uploadFile) |
| `IVideoTaskStorage` | `storage-port.ts` | 视频任务存储 |
| `ICharacterStorage` | `storage-port.ts` | 角色存储 |
| `ISceneStorage` | `storage-port.ts` | 场景存储 |
| `IStoryStorage` | `storage-port.ts` | 故事存储 |
| `ISyncStorage` | `sync-port.ts` | 同步存储 (safeQuery, safeRun, safeTransaction) |
| `IElementManager` | `element-manager-port.ts` | 元素管理器 (创建、绑定、更新、删除) |
| `IReferenceEngine` | `reference-engine-port.ts` | 参考图引擎 |
| `IVersionStorage` | `version-storage-port.ts` | 版本快照存储 |
| `IElementStorage` | `element-storage-port.ts` | 元素存储 |
| `ITemplateStorage` | `template-storage-port.ts` | 模板存储 |
| `IMediaAssetRepository` | `media-asset-repository-port.ts` | 媒体资产仓库 |

### 5.2 模块层 (modules)

**路径**: `src/modules/`

每个模块遵循统一结构：

```
module-name/
  index.ts           → Barrel file (公共 API)
  MODULE.md          → 模块契约文档
  hooks/             → React hooks
  services/          → 业务逻辑服务
  presentation/      → React 组件
  domain/            → 模块特定领域类型 (可选)
  {subdomain}/       → 子域
    contract.json    → 子域契约 (invariants, publicAPI)
    index.ts         → 子域 barrel
    hooks/
    services/
```

#### 模块总览

| 模块 | 子域 | 核心职责 |
|------|------|---------|
| **story** | beat-editor, generation, planning, template, prompt-editor | 故事创作全流程：节拍编辑、AI 生成、规划、模板管理 |
| **video** | task-management (5 sub-contracts), utils, recovery, cache | 视频任务管理、轮询、恢复、缓存 |
| **character** | hooks, services | 角色 CRUD、参考图、outfit 管理 |
| **scene** | hooks, services | 场景 CRUD、参考图、氛围管理 |
| **shot** | shot-instruction, shot-generation, shot-reference, feature-extraction, consistency-check, element-binding, reference-check | 镜头指令、参考图策略、一致性检查、特征锚定、元素绑定 |
| **prompt** | base, builder, beat-image, video, scene, character, server-prompts | 提示词构建与管理 |
| **asset** | asset-library, import-export, hooks, media-assets, presentation | 资产库、导入导出、媒体资产管理 |
| **sync** | engine, presentation | 数据同步引擎与冲突解决 |
| **persistence** | (single contract) | 自动保存与持久化守卫 |

#### 关键模块详解

**story 模块** — 故事是应用的核心实体，管理从创意到成片的完整流程：
- `beat-editor` — 节拍的增删改查、排序、内容编辑
- `generation` — AI 故事生成 (调用 textProvider)
- `planning` — 故事规划 (角色分配、场景选择)
- `template` — 故事模板管理

**video 模块** — 视频生成管线管理：
- 任务状态机: `pending → generating → completed / failed / cancelled / retrying`
- 轮询引擎: 定时查询视频生成状态
- 恢复机制: 从中断的任务中恢复

**shot 模块** — 镜头系统是最复杂的模块，包含 7 个子域：
- 参考图策略: 根据 `getVideoGenerationStrategy(modelId)` 决定参考图传递方式
- 一致性检查: 确保角色/场景在连续镜头中保持一致
- 特征锚定: 将角色特征固定到元素上

### 5.3 基础设施层 (infrastructure)

**路径**: `src/infrastructure/`

#### DI 容器 (`di/`)

基于 Proxy 的依赖注入容器，支持：
- **Token 注册**: `createToken<T>(id, factory)` 创建懒加载 Token
- **循环依赖检测**: `resolve()` 时追踪解析链，检测循环引用
- **测试替换**: `overrideToken(token, factory)` 替换 Token 实现
- **重置**: `resetContainer()` 重置所有单例

#### 存储层 (`storage/`)

15+ 存储模块，全部基于 better-sqlite3：

| 存储模块 | Domain Port | 关键功能 |
|----------|-------------|---------|
| video-tasks | IVideoTaskStorage | 视频任务 CRUD + 批量操作 + JSON 解析 |
| characters | ICharacterStorage | 角色 CRUD + outfit 管理 |
| scenes | ISceneStorage | 场景 CRUD |
| stories | IStoryStorage | 故事 + 节拍 CRUD + 节拍转换器 |
| elements | IElementStorage | 元素 CRUD + 命令/查询 + JSON 解析 |
| versions | IVersionStorage | 版本快照 |
| templates | ITemplateStorage | 视频模板 CRUD |
| collections | — | 资产收藏集 |
| storyboard | — | 故事板资产 |
| video-cache | — | 视频缓存 (已迁移到 `@/shared/file-http` 通信) |
| image-cache | — | 图片缓存 (已迁移到 `@/shared/file-http` 通信) |
| import-export | — | 数据导入导出 |
| auto-save | — | 自动保存快照 |
| error-logs | — | 错误日志持久化 |
| sessions | — | 会话键值存储 |

**JSON Container Pattern**: 易变字段存储在 JSON 列中 (config, provider, media_refs, tracking, appearance 等)，通过 `parseXxx()` 函数安全解析，避免 ALTER TABLE 迁移。

**乐观锁**: 关键更新操作支持 `version` 参数，通过 `WHERE version = ?` + `SET version = version + 1` 实现并发控制，冲突时抛出 `VersionConflictError`。

#### AI 提供商 (`ai-providers/`)

| 文件 | 职责 |
|------|------|
| `video.ts` | 视频生成 (generateVideo, generateKeyframe, generateFramePair, generateVideoWithFrames, queryVideoStatus) |
| `image.ts` | 图片生成与分析 (generateImage, analyzeImage) |
| `text.ts` | 文本生成 (generateText) |
| `model-capabilities.ts` | 模型能力查询 (getModelCapabilities, getVideoGenerationStrategy, BUILTIN_MODEL_CAPABILITIES) |
| `api-config/` | 提供商模板数据 (provider-templates-data.ts) |
| `services.ts` | AI 服务封装 |

**模型能力系统**:
- `getModelCapabilities(modelId)` — 查询模型能力 (supportsCharacterRef, supportsSceneRef 等)
- `getVideoGenerationStrategy(modelId)` — 获取视频生成策略 (参考图传递方式)
- 策略模式: `native_field` (API 原生字段) / `bake_into_first` (融入首帧) / `ref_field` (role: reference_image) / `both` / `none`

### 5.4 共享层 (shared)

**路径**: `src/shared/`

共享层提供跨切面功能，**不依赖 modules 层**，可通过代理导出 (proxy export) 暴露 infrastructure 的纯函数：

| 子目录 | 职责 | 代理导出来源 |
|--------|------|-------------|
| `constants/` | i18n 消息 (1850+ 键)、错误码 | — |
| `presentation/` | Toast, Sidebar, ThemeProvider, ErrorBoundary, NetworkStatusAlert, OnboardingGuide | — |
| `utils/` | preferences (usePreference), toast-bridge, error-logger | — |
| `event-bus/` | 全局事件总线 | — |
| `errors/` | VersionConflictError | — |
| `db-core/` | safeQuery, safeRun, safeTransaction | ← infrastructure/storage/sqlite-core |
| `api-config/` | API 配置工具 | ← infrastructure/api-config-facade |
| `model-capabilities/` | getModelCapabilities, getVideoGenerationStrategy | ← infrastructure/ai-providers/model-capabilities |
| `sql-safety/` | sanitizeTable, sanitizeIdentifier, buildSafeUpdate, buildSafeDelete | ← infrastructure/storage/sql-sanitizer |
| `video-cache/` | 视频缓存工具 | ← infrastructure/storage/video-cache |
| `file-http/` | writeFile, readFile, getFileInfo, getCacheDirectory, getDiskSpace, fileExists, deleteFile | `shared/file-http` (HTTP 优先 + IPC 回退，非 infrastructure 代理) |
| `outfit/` | Outfit 工具 | ← infrastructure |
| `user-facing-error/` | mapUserFacingError — 用户友好错误消息映射 | ← shared/utils/user-facing-error |

**mapUserFacingError**: 所有用户可见错误必须通过 `mapUserFacingError()` 映射为中文友好消息，禁止直接展示 `e.message` 或技术术语。**使用边界**：`catch(err)` 中的原始异常必须用 `mapUserFacingError(err)`，但 `result.error`（Result 类型的已处理字符串）应直接展示 `result.error || t("...")`，不应再包装 `mapUserFacingError`（否则会丢失具体信息变成通用"操作失败"）。

**统一文件操作通信层 (`@/shared/file-http`)**: `src/shared/file-http/` 是文件操作的统一通信层，采用 **HTTP 优先 + IPC 回退** 的双轨设计。首次调用时通过 `/api/health` 探测 HTTP API Server 可用性并缓存（`_httpAvailable`），后续调用优先走 `http://localhost:${API_SERVER_PORT}/api/file/*` 端点，HTTP 不可用或失败时回退到 `window.electronAPI` 的 IPC 接口。

**公开函数 (7 个)**:
- `writeFile(filePath, data)` — 写入文件（字符串或 ArrayBuffer）
- `readFile(filePath)` — 读取文件（返回 ArrayBuffer，HTTP 通道走 base64）
- `getFileInfo(filePath)` — 获取文件大小等信息
- `getCacheDirectory()` — 获取视频缓存目录
- `getDiskSpace(dirPath)` — 获取磁盘可用/总空间
- `fileExists(filePath)` — 判断文件是否存在
- `deleteFile(filePath)` — 删除文件

**迁移背景**: `video-cache.ts` 与 `image-cache.ts` 已全部改用 `@/shared/file-http`（别名 `httpWriteFile`、`httpReadFile` 等），获得 HTTP 通道的批量传输能力与统一错误处理，同时保留 IPC 回退保证向后兼容。

### 5.5 纯逻辑层 (shared-logic)

**路径**: `src/shared-logic/`

纯逻辑层，零外部依赖。只允许相对导入，不能导入 `@/`、`@shared/`、`@domain/` 或任何项目层。

```
src/shared-logic/
  shot/       → reference-engine, consistency-check, reference-check, visual-consistency-check
  prompt/     → prompt-engine, prompt-service
  video/      → video-task-params, video-tracker, video-recovery
  story/      → story-service, storyboard-generation
  index.ts    → Top-level barrel
```

**路径别名**: `@/shared-logic/*`（渲染进程），`@shared-logic/*`（主进程）

### 5.6 应用层 (app)

**路径**: `src/app/`

应用层是页面组件和布局的容器，消费模块层提供的功能：

**StoryProvider useMemo 依赖拆分**: `StoryProvider` 中的 `useMemo` 依赖从 `videoTaskManager` 整体对象拆分为具体属性（`videoTaskManager.tasks`、`videoTaskManager.addTask` 等），配合 stableActions 模式避免级联重渲染。

**useStableCompletedUrls**: `useStoryVideo` 中 `completedTaskUrls` Map 通过 shallow 比较确保只有内容真正变化时才创建新引用，防止轮询更新触发下游 `useEffect`（如 `useStoryPersistence`）。

- `layout.tsx` — 根布局，组装所有 Provider 和全局组件
- 每个页面目录包含 `page.tsx`，使用 `React.lazy()` 懒加载

---

## 6. Electron 主进程架构

### 6.1 主进程入口与生命周期

**入口文件**: `electron/src/main.ts`

启动流程：

```
1. 初始化日志系统 (ConsoleTransport + FileTransport)
2. 设置应用名称与 userData 路径
3. 请求单实例锁 (app.requestSingleInstanceLock)
4. 创建 LifecycleManager
5. 注册 IPC 处理器 (API, Assets, Database, Export, SecureConfig)
6. 设置自动更新 (electron-updater)
7. app.whenReady() → registerAppProtocol → lifecycle.start → createWindow
```

**LifecycleManager** (`lifecycle/`) 管理：
- 窗口创建与销毁
- 渲染进程崩溃恢复 (`render-process-gone` → 自动重建窗口)
- GPU 进程崩溃恢复 (`child-process-gone` GPU → `webContents.reload()`)
- 优雅关机序列: `before-quit → gracefulShutdown → stopApiServer → closeDatabase → app.quit()`

**createWindow** (`main-common.ts`) 流程：
1. 启动 API 服务器
2. 注册允许的 Origin
3. 启动静态文件服务器 (生产模式)
4. 等待服务器就绪
5. 创建 BrowserWindow (contextIsolation: true, sandbox: true)
6. 加载 URL
7. 设置导航安全策略 (will-navigate 白名单)

### 6.2 API 服务器

**入口**: `electron/src/api/server.ts`

HTTP API 服务器运行在 `localhost:API_SERVER_PORT`，处理渲染进程的所有业务请求。

#### 请求处理流程

```
1. CORS 处理 (handleCors)
2. 健康检查 (/health → 返回 DB 状态 + 运行时间)
3. 认证检查 (X-Electron-App header)
4. 速率限制 (checkRateLimit)
5. 路由匹配 (routes[pathname])
6. 请求体解析 (JSON, 最大 100MB)
7. Schema 验证 (Zod safeParse)
8. 调用 handler
9. 返回 JSON 响应
```

#### 路由组

| 路由组 | 文件 | 路由数 | 核心路由 |
|--------|------|--------|---------|
| **core-routes** | `core-routes.ts` | 7 | config, secure-config, upload, test-connection, sync/*, export |
| **db-routes** | `db-routes.ts` | — | db/query, db/run, db/batch-insert, db/transaction, db/get, db/stats |
| **file-routes** | `file-routes.ts` | — | file/write, file/read, file/info, file/cache-directory, file/disk-space, file/exists, file/delete |
| **generation-routes** | `generation-routes.ts` | 14 | generate-video, generate-image, generate-keyframe, generate-frame-pair, generate-text, video-status, story/*, character/*, scene/* |
| **plugin-routes** | `plugin-routes.ts` | 12 | plugins/list, plugins/add, plugins/delete, plugins/reload, plugins/capabilities, plugins/detection-rules, plugins/templates, video/select-strategy, video/detect-format |
| **shot-routes** | `shot-routes.ts` | 9 | shot/validate-reference, shot/get-reference-video-url, shot/build-reference-description, validate/consistency, validate/feature-anchoring, reference/check-*, visual-consistency/check |
| **storyboard-routes** | `storyboard-routes.ts` | 8 | storyboard/generate-keyframe, storyboard/generate-frame-pair, storyboard/generate-video, storyboard/generate-full-workflow, storyboard/generate-keyframe-chain, video/recover, video-tasks/bulk-save, video/tracking-info |

#### API 网关 (`api-gateway.ts`)

统一 AI 提供商调用入口，根据 `pluginRegistry.select(apiUrl, model)` 选择匹配的插件，将请求转发到对应的 AI 服务。

### 6.3 数据库层

**路径**: `electron/src/database/`

#### Schema 架构

数据库使用声明式 Schema Builder (`schema-builder.ts`)，所有业务表自动包含 **7 字段基础列**：

```
owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id
```

#### 表分类

| 类别 | 表名 | 说明 |
|------|------|------|
| **核心业务** | stories, story_beats, characters, scenes, elements, character_outfits, story_versions | 主要业务实体 |
| **视频** | video_tasks, video_templates, generation_tasks | 视频生成相关 |
| **资产** | media_assets, collections, storyboard_assets | 资产管理 |
| **模板** | ast_templates | 故事模板 |
| **关联表** | story_characters, story_scenes, story_elements, collection_assets, asset_tags | 多对多关系 |
| **缓存** | video_cache, image_cache, error_logs, sessions, auto_saves, file_index | 缓存与辅助 |
| **同步** | sync_changelog, sync_meta, sync_conflict_backup | 数据同步 |

#### SQLite 配置

```sql
PRAGMA journal_mode = WAL;       -- Write-Ahead Logging
PRAGMA synchronous = NORMAL;     -- 平衡性能与安全
PRAGMA cache_size = -64000;      -- 64MB 缓存
PRAGMA temp_store = memory;      -- 临时表在内存中
PRAGMA mmap_size = 268435456;    -- 256MB 内存映射
```

#### 迁移框架

- 当前版本: `CURRENT_SCHEMA_VERSION = 4`
- 迁移在 `db.transaction()` 中执行，确保回滚安全
- v3 迁移: 添加 `local_video_path` 列
- v4 迁移: 为 `collection_assets` 关联表补齐 `created_at`、`updated_at` 列

### 6.4 插件系统

**路径**: `electron/src/plugins/`

#### 插件类型

| 类型 | 格式 | 位置 | 加载器 | 隔离级别 |
|------|------|------|--------|---------|
| 内置 | TypeScript class | `plugins/providers/` | 直接导入 | 主进程内 |
| 声明式 | `.plugin.json` | `~/PrismCraft/UserPlugins/` | UserPluginAdapter | 主进程内 |
| 代码 | `.plugin.js` | `~/PrismCraft/CodePlugins/` | CodePluginAdapter | 子进程 + vm 沙箱 |

#### PluginRegistry 类

核心方法：
- `register(plugin, isUserPlugin)` — 注册插件
- `select(apiUrl, model)` — 根据 URL/模型匹配插件 (使用 matchPatterns 同步匹配)
- `selectById(pluginId)` — 按 ID 查找
- `reloadUserPlugins()` — 热重载声明式插件
- `loadCodePlugins()` — 加载代码插件 (进程隔离)
- `getAllCapabilities()` — 获取所有插件能力
- `getAllModelProfiles()` — 获取所有模型参数配置

#### 代码插件安全模型

```
子进程 (child_process.fork)
  └── vm.createContext() 沙箱
       ├── 冻结 Object/Array/Function/Error 原型
       ├── 禁用 Function, eval, Proxy, Reflect, Promise, Symbol, Map, Set
       ├── 阻断 require, process, __filename, __dirname, Buffer, setTimeout, fetch
       └── 预扫描逃逸模式 (__proto__, getPrototypeOf, Reflect) — 检测到则拒绝加载
```

进程管理:
- `PluginProcessManager` — 管理子进程生命周期
- 资源限制: `--max-old-space-size=64`, `--max-semi-space-size=16`
- 崩溃保护: 60s 内最多 3 次崩溃，超限自动禁用
- 调用超时: 10s，启动超时: 15s
- 优雅关机: 发送 shutdown 消息 → 等待 3s → SIGKILL

### 6.5 IPC 通信与安全

**Preload 脚本**: `electron/src/preload.ts`

#### IPC 权限分级

| 级别 | 允许的操作 | 示例通道 |
|------|-----------|---------|
| READONLY | 只读查询 | db:query, db:get, config:get, assets:read-file-base64 |
| READWRITE | 读写操作 | db:run, db:batch-insert, config:set, assets:save-image |
| DANGEROUS | 危险操作 | db:transaction, db:migrate, db:vacuum, assets:delete-file |
| SYSTEM | 系统操作 | shell:open-external, shell:open-path, dialog:open-file |
| SECURE | 安全操作 | secure-config:resolve |

#### 安全措施

- **contextIsolation: true** — 渲染进程无法直接访问 Node.js API
- **sandbox: true** — 渲染进程在沙箱中运行
- **IPC 通道注册检查** — 未注册的通道会被阻止
- **DDL 阻断** — 主进程处理器中阻止 DROP, ALTER, CREATE 等语句
- **API Key 加密存储** — 通过 electron-store 加密，IPC 通道 `secure-config:*`
- **X-Electron-App 认证** — API 请求必须携带此 Header
- **速率限制** — 基于 IP 的请求频率控制
- **导航白名单** — 只允许 localhost 和 file: 协议导航

---

## 7. 依赖注入 (DI) 容器

**路径**: `src/infrastructure/di/container.ts`

### Token 分类

| 类别 | 说明 | 示例 |
|------|------|------|
| **A. Domain Port 实现** | Port 接口的具体实现 | videoTaskStorage, characterStorage, videoProvider, imageProvider, textProvider |
| **B. 有状态服务** | 需要测试替换的单例 | eventBus, apiClient, imageApi, videoApi, textApi, preferencesStorage |
| **C. Storage 实例** | 有状态存储模块 | versionStorage, elementStorage, videoCacheStorage, templateStorage, autoSaveStorage 等 |
| **D. Repository 实例** | Drizzle ORM 仓库 | mediaAssetRepository |
| **E. 懒加载模块** | 避免循环依赖的动态导入 | elementManager, referenceEngine |

### 使用方式

```typescript
// 模块中通过 container 访问依赖
import { container } from "@/infrastructure/di";
const storage = container.videoTaskStorage;

// 测试中替换依赖
import { overrideToken } from "@/infrastructure/di";
overrideToken(videoTaskStorageToken, () => mockStorage);
```

### 设计原则

- **纯函数不走 DI** — `@/shared/*` 的纯函数直接导入
- **Infrastructure 纯函数走代理导出** — 通过 `@/shared/` 代理模块暴露
- **只有有状态/需测试替换的依赖才注册**

---

## 8. 关键数据流

### 8.1 视频生成管线

```
预览图 (Keyframe)
  │  generateKeyframe()
  │  输入: characterRefs, sceneRef, shotRequirement, content
  │  输出: keyframeUrl + keyframePrompt
  ▼
首尾帧 (Frame Pair)
  │  generateFramePair()
  │  输入: keyframeUrl, keyframePrompt, characterRefs, sceneRef, prevLastFrameUrl
  │  输出: firstFrame.imageUrl + lastFrame.imageUrl
  ▼
视频 (Video)
  │  generateVideo() / generateVideoWithFrames()
  │  输入: prompt, firstFrameUrl, lastFrameUrl, characterRefs, sceneRef
  │  输出: taskId → 轮询 → videoUrl
  ▼
完成
```

### 8.2 参考图策略

```
getVideoGenerationStrategy(modelId)
  │
  ├── native_field: API 原生字段传递 (Kling V2+ subject_reference, MiniMax subject_image_url)
  ├── bake_into_first: 参考图融入首帧 (Seedance pro 系列)
  │     首帧生成时传 ref_image → 视频生成时不传参考图
  ├── ref_field: role: "reference_image" 传递 (Seedance lite-i2v)
  ├── both: 原生字段 + 首帧都传
  └── none: 不支持参考图
```

### 8.3 前端 → API 请求流

```
React Component (模块层)
  │  调用 hook/service
  ▼
Service (模块层)
  │  fetch("/api/xxx", { headers: ELECTRON_APP_HEADERS })
  ▼
Static Server (main-common.ts)
  │  /api/* 代理到 API Server
  ▼
API Server (server.ts)
  │  CORS → Auth → RateLimit → Route → Schema → Handler
  ▼
Route Handler (route-groups/)
  │  调用 api-gateway / service
  ▼
API Gateway / Service
  │  pluginRegistry.select() → plugin.buildVideoRequest() → HTTP 请求
  ▼
AI Provider (外部 API)
```

### 8.4 数据持久化流

```
React Component
  │  调用 hook
  ▼
Hook (模块层)
  │  调用 container.storage.method()
  ▼
Storage (infrastructure/storage/)
  │  safeQuery / safeRun / safeTransaction
  │  trackChange() (同步引擎感知)
  ▼
SQLite (better-sqlite3, WAL mode)
```

---

## 9. 路由与页面结构

**路由定义**: `src/router.tsx`

| 路径 | 页面 | 懒加载 Chunk |
|------|------|-------------|
| `/` | 首页 | page |
| `/story` | 故事列表 | story |
| `/story/beat/:beatId` | 节拍详情 | story |
| `/characters` | 角色管理 | characters |
| `/scenes` | 场景管理 | scenes |
| `/asset-library` | 资产库 | asset-library |
| `/quick-generate` | 快速生成 | quick-generate |
| `/settings` | 设置 | settings |
| `/video-tasks` | 视频任务 | video-tasks |
| `*` | 404 | not-found |

所有页面使用 `React.lazy()` + `Suspense` 实现代码分割，加载时显示旋转加载指示器。

### 代码分割策略 (Vite rolldown)

| Chunk | 内容 | 优先级 |
|-------|------|--------|
| vendor-react | react, react-dom, react-router, scheduler | 30 |
| vendor-state | zustand, @tanstack/react-query | 25 |
| vendor-ui | lucide-react, clsx, tailwind-merge, cva | 25 |
| app-infra-core | src/infrastructure/ | 20 |
| app-shared | src/shared/ | 18 |
| app-domain | src/domain/ | 18 |
| app-story | src/modules/story/ | 15 |
| app-video | src/modules/video/ | 15 |
| app-shot | src/modules/shot/ | 15 |
| app-character | src/modules/character/ | 15 |
| app-scene | src/modules/scene/ | 15 |
| app-infra | asset, sync, persistence modules | 15 |
| app-prompt | src/modules/prompt/ | 15 |
| vendor-misc | 其他 node_modules | 10 |
| common | 共享依赖 (minShareCount: 2) | 5 |

---

## 10. 构建与运行

### 开发模式

```bash
# 仅前端开发 (Vite Dev Server, 无 Electron)
npm run dev

# Electron 开发 (需先构建)
npm run build:electron
```

### 生产构建

```bash
# 完整 Electron 构建 (Vite + TypeScript 编译 + 文件复制)
npm run build:electron

# Windows 安装包
npm run build:win

# macOS DMG
npm run build:mac

# Linux AppImage
npm run build:linux
```

### 构建流程 (`build-electron.ps1`)

```
1. 设置 BUILD_TARGET=electron
2. vite build → 输出到 out/ (SPA 静态文件)
3. tsc -p electron/tsconfig.json → 输出到 electron/dist/
4. 复制 docs/ → out/docs/
5. 复制 electron/src/api-gateway.ts → electron/dist/
6. 复制 electron/src/services/ → electron/dist/services/
7. 复制 electron/src/plugins/ → electron/dist/plugins/
```

### 端口配置

| 端口 | 用途 |
|------|------|
| 3000 | Vite Dev Server (开发模式) |
| APP_SERVER_PORT | 静态文件服务器 (生产模式) |
| API_SERVER_PORT | HTTP API 服务器 |

---

## 11. 测试体系

### 测试框架

| 类型 | 框架 | 命令 |
|------|------|------|
| 单元测试 | Vitest | `npm run test` |
| 单元测试 (watch) | Vitest | `npm run test:watch` |
| 覆盖率 | Vitest + coverage-v8 | `npm run test:coverage` |
| Electron 测试 | Vitest (electron config) | `npm run test:electron` |
| E2E (浏览器) | Playwright | `npm run test:e2e` |
| E2E (Electron) | Playwright + Electron | `npm run test:e2e:electron` |
| 页面加载测试 | Playwright | `npm run test:e2e:pages` |

### 覆盖率阈值

- Branches: 80%, Functions: 80%, Lines: 80%, Statements: 80%
- 逐文件强制 (`perFile: true`)

### 测试文件位置

| 类型 | 位置 |
|------|------|
| 服务测试 | `src/modules/{module}/{subdomain}/services/__tests__/{service}.test.ts` |
| Hook 测试 | `src/modules/{module}/{subdomain}/hooks/__tests__/{hook}.test.ts` |
| 组件测试 | `src/modules/{module}/presentation/__tests__/{Component}.test.tsx` |
| 存储往返测试 | `src/infrastructure/storage/{module}/__tests__/parser-roundtrip.test.ts` |

### 完整验证

```bash
npm run validate:full
# 等价于:
# typecheck + typecheck:electron + typecheck:test
# + lint + lint:arch
# + check-module-api-consistency + validate-contracts
# + test + coverage
```

---

## 12. 代码规范与架构约束

### 依赖方向约束 (ESLint 强制)

| 层 | 允许导入 | 禁止导入 |
|----|---------|---------|
| `domain/` | 无外部依赖 | `@/modules/*`, `@/infrastructure/*` |
| `shared/` | `@/domain/*`, `@/infrastructure/*` (仅代理导出) | `@/modules/*` |
| `modules/` | `@/domain/*`, `@/shared/*`, `@/infrastructure/di` | `@/infrastructure/*` (除 DI), `@/modules/*/*/*` (深层路径) |
| `infrastructure/` | `@/domain/*`, `@/shared/*` | `@/modules/*` |
| `app/` | 所有层 | `@/modules/*/*/*` (深层路径) |

### 关键编码规范

- **无 `any`** — 生产代码中 `@typescript-eslint/no-explicit-any` 为 error
- **无注释** — 除非明确要求
- **crypto.randomUUID()** — ID 生成 (非 Date.now + Math.random)
- **useRef** — useEffect 中的稳定引用，避免闭包陷阱
- **usePreference** — 替代 localStorage in useState (水合安全)
- **errorLogger** — 替代 console.warn/console.error
- **t()** — 所有用户可见字符串必须国际化
- **Result\<T\>** — 必须解包后使用，不可直接赋值
- **参数化查询** — 禁止字符串拼接 SQL
- **原生模块精确锁定** — better-sqlite3@12.10.0 (禁止 ^ 或 ~)

### Pre-commit 检查

```
.husky/pre-commit → typecheck → architecture check → lint-staged
```

---

> 本文档基于项目源码自动分析生成，最后更新: 2026-06-14
