# PrismCraft 技术参考文档

> **版本**: 1.1.0 | **最后更新**: 2026-07-07 | **架构**: Vite 8 + React Router 7

---

## 目录

- [1. 项目概览](#1-项目概览)
- [2. 架构设计](#2-架构设计)
- [3. Domain 层详解](#3-domain-层详解)
- [4. Modules 层详解](#4-modules-层详解)
- [5. Infrastructure 层详解](#5-infrastructure-层详解)
- [6. Electron 主进程详解](#6-electron-主进程详解)
- [7. Shared 层详解](#7-shared-层详解)
- [8. App 层详解](#8-app-层详解)
- [9. 构建与部署](#9-构建与部署)
- [10. 测试策略](#10-测试策略)
- [11. ESLint 与代码质量](#11-eslint-与代码质量)
- [12. 已知技术债务与路线图](#12-已知技术债务与路线图)
- [13. AI 维护工作流](#13-ai-维护工作流)
- [14. 核心数据流详解](#14-核心数据流详解)
- [15. 设计决策记录](#15-设计决策记录)
- [16. 关键算法与模式](#16-关键算法与模式)
- [17. 配置参考](#17-配置参考)
- [18. 术语表](#18-术语表)
- [附录 A: 文件结构总览](#附录-a-文件结构总览)

---

## 1. 项目概览

### 1.1 基本信息

| 属性 | 值 |
|------|------|
| 项目名称 | PrismCraft |
| 版本 | 1.1.1 |
| 描述 | AI 驱动的动画制作工具 — 本地优先，支持从故事创作到视频生成的完整工作流 |
| 构建目标 | Electron 桌面应用 (local-first, offline-capable) |
| 语言 | TypeScript (strict mode) |

### 1.2 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | 41.7.1 | 桌面应用框架 |
| Vite | 8 | 前端构建工具 (rolldown code splitting) |
| React Router | 7 | 客户端路由 (createBrowserRouter) |
| React | 19.2.4 | UI 库 |
| Zustand | 5 | 状态管理 |
| better-sqlite3 | 12.10.0 (锁定) | 本地数据库 (WAL 模式) |
| Tailwind CSS | 4 | 样式系统 |
| Zod | 4 | Schema 验证 |
| Vitest | 4 | 测试框架 |
| Playwright | 1.60 | E2E 测试 |

### 1.3 代码规模

| 目录 | 说明 |
|------|------|
| `src/modules/` | 业务子域 (9 个模块: story, video, shot, asset, sync, prompt, character, scene, persistence) |
| `src/infrastructure/` | DI 容器 / 存储 / 网络 / API / AI 提供者 / 插件 / 安全 / 日志 |
| `src/app/` | 页面组件与布局 (React Router lazy loading) |
| `src/shared/` | 跨切面 UI / 工具函数 / 代理导出 |
| `src/domain/` | 纯类型 / Schema / Result 类型 / Port 接口 |
| `electron/src/` | 主进程 / API Server / 数据库 / IPC / 插件 / 安全 / 日志 |

---

## 2. 架构设计

### 2.1 DDD 分层架构

```
┌─────────────────────────────────────────────────────┐
│                    app (应用层)                      │
│       React Router 页面与布局, 消费模块 Context       │
├─────────────────────────────────────────────────────┤
│                 modules (模块层)                     │
│    业务子域: story / video / shot / asset / sync /   │
│    prompt / character / scene / persistence          │
├──────────────┬──────────────────────────────────────┤
│  shared      │           infrastructure             │
│  跨切面 UI   │    DI 容器 / 存储 / 网络 / API / AI    │
│  工具函数    │    提供者 / 插件 / 安全 / 日志          │
│  代理导出    │                                      │
├──────────────┴──────────────────────────────────────┤
│              shared-logic (纯逻辑层)                 │
│    提示词引擎 / 引用引擎 / 视频追踪 / 一致性检查       │
│    零外部依赖 — 只允许相对导入                        │
├─────────────────────────────────────────────────────┤
│                  domain (领域层)                     │
│         纯类型 / Schema / Result 类型 / Port 接口     │
└─────────────────────────────────────────────────────┘
```

### 2.2 依赖方向规则 (CRITICAL)

依赖必须**仅向内流动**，外层可依赖内层，内层不可依赖外层：

```
app → modules → domain
              → shared
              → infrastructure/di (仅通过 container)
infrastructure → domain, shared
shared → domain, infrastructure (仅代理导出)
domain → NOTHING (纯类型)
```

| 层 | 允许导入 | 禁止导入 |
|----|----------|----------|
| `domain/` | 无外部依赖 | `@/modules/*`, `@/infrastructure/*` |
| `shared-logic/` | 仅相对导入（同层内） | ALL 外部导入 (`@/`, `@shared/`, `@domain/`, 任何项目层) |
| `shared/` | `@/domain/*`, `@/infrastructure/*` (仅代理导出目录) | `@/modules/*` |
| `modules/` | `@/domain/*`, `@/shared/*`, `@/shared-logic/*`, `@/infrastructure/di` | `@/infrastructure/*` (除 DI), `@/modules/*/*/*` |
| `infrastructure/` | `@/domain/*`, `@/shared/*` | `@/modules/*`, `@/shared-logic/*` |
| `app/` | 所有层 | 模块深层路径 `@/modules/*/*/*` |
| `electron/src/api/` | `@shared-logic/*`, `@shared/*`, `@domain/*` | `@/modules/*` |

**shared 层代理导出目录** (允许从 `@/infrastructure/*` 导入):

| 代理模块 | 来源 | 用途 |
|----------|------|------|
| `@/shared/db-core` | `infrastructure/storage/sqlite-core` | 数据库安全操作 (withRetry, safeQuery, safeRun, safeTransaction) |
| `@/shared/api-config` | `infrastructure/ai-providers/api-config` | API 配置查询 |
| `@/shared/video-cache` | `infrastructure/storage/video-cache` | 视频缓存操作 |
| `@/shared/outfit` | `infrastructure/ai-providers/outfit-synthesis` | 服装合成 |
| `@/shared/sql-safety` | `infrastructure/storage/sql-sanitizer` | SQL 安全工具 |
| `@/shared/model-capabilities` | `infrastructure/ai-providers/model-capabilities` | 模型能力查询与视频生成策略 |
| `@/shared/user-facing-error` | `shared/utils/user-facing-error` | 用户友好错误消息映射 (`mapUserFacingError`) |
| `@/shared/file-http` | `shared/file-http` | 统一文件操作通信层 (HTTP 优先 + IPC 回退) |

**常见违规与纠正**：

| 违规 | 纠正 |
|------|------|
| `shared/` 导入 `@/modules/*` | 将共享逻辑下沉到 `domain/` 或 `shared/` |
| `domain/` 导入 `@/infrastructure/*` | 通过 Port 接口 + DI 解耦 |
| `modules/` 直接导入 `@/infrastructure/*` | 通过 DI container 获取或 `@/shared/` 代理导出 |
| 跨模块深层导入 `@/modules/xxx/yyy/zzz` | 使用桶导入 `@/modules/xxx` |

### 2.3 双进程模型

```
┌──────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ SQLite DB  │  │  HTTP API    │  │  IPC Handlers         │ │
│  │ (WAL mode) │  │  Server      │  │  (database/config/    │ │
│  │            │  │ (localhost)  │  │   sync/secure-config) │ │
│  └────────────┘  └──────────────┘  └───────────────────────┘ │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Plugin    │  │  Security    │  │  Logging              │ │
│  │  Registry  │  │  (SSRF/Key)  │  │  (Console+File)       │ │
│  └────────────┘  └──────────────┘  └───────────────────────┘ │
├─────────────────────────── IPC ──────────────────────────────┤
│                     preload.ts (权限桥接)                     │
├──────────────────────────────────────────────────────────────┤
│                   Renderer Process                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Vite SPA + React Router 7                             │  │
│  │  React 19 + Zustand 5 + Tailwind CSS 4                 │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │  │
│  │  │Story │ │Video │ │Shot  │ │Asset │ │Sync  │ ...      │  │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘          │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 2.4 通信机制

#### IPC 通信

- **通道注册**: 所有 IPC 通道必须在 `preload.ts` 的 `IPC_PERMISSIONS` 中注册
- **权限等级**: READONLY → READWRITE → DANGEROUS → SYSTEM → SECURE
- **速率限制**: 每个通道独立限流
- **安全防护**: DDL 语句 (DROP, ALTER, CREATE, TRUNCATE, ATTACH, DETACH) 被阻止, SQL 注释在 DDL 检测前被剥离
- **安全日志**: `log:security` IPC 通道将 preload 安全事件转发到主进程日志

#### HTTP API Server

- **地址**: `localhost:API_SERVER_PORT`
- **请求头**: 所有 API 请求必须携带 `X-Electron-App` 头 (服务端验证)
- **连接追踪**: `activeConnections: Set<net.Socket>` 追踪所有 HTTP 连接
- **优雅关闭**: 关闭时先 `destroy()` 所有追踪连接, 再 `server.close()`

#### Vite SPA 路由模式

- **构建工具**: Vite 8 (rolldown code splitting)
- **路由**: React Router 7 `createBrowserRouter` + `React.lazy` 懒加载
- **路由配置**: `src/router.tsx` 集中定义所有路由
- **纯客户端路由**: 无 SSR, 页面按需懒加载

---

## 3. Domain 层详解

Domain 层是整个系统的核心, 包含纯类型定义、Schema 验证、Result 类型和 Port 接口。**Domain 层不依赖任何其他层**, 确保业务规则的纯粹性和可测试性。

### 3.1 Result 类型体系

#### 核心类型

```typescript
type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

#### 12 种语义化错误类型

| 错误类型 | 用途 |
|----------|------|
| `AppError` | 通用应用错误 |
| `DatabaseError` | 数据库操作错误 |
| `ValidationError` | 数据验证错误 |
| `ApiError` | 外部 API 调用错误 |
| `NotFoundError` | 资源未找到 |
| `NetworkError` | 网络连接错误 |
| `StorageError` | 存储操作错误 |
| `ConfigurationError` | 配置错误 |
| `GenerationError` | AI 生成错误 |
| `TimeoutError` | 操作超时 |
| `RateLimitError` | 速率限制 |
| `AuthenticationError` | 认证失败 |

#### 辅助函数

| 函数 | 签名 | 用途 |
|------|------|------|
| `ok()` | `<T>(value: T) => Result<T, never>` | 创建成功结果 |
| `err()` | `<E extends AppError>(error: E) => Result<never, E>` | 创建失败结果 |
| `fromThrowable()` | `<T>(fn: () => T) => Result<T, AppError>` | 将可能抛异常的同步函数转为 Result |
| `fromAsyncThrowable()` | `<T>(fn: () => Promise<T>) => Promise<Result<T, AppError>>` | 将可能抛异常的异步函数转为 Result |

#### 错误码注册表

34 个错误码, 分布在 12 个错误域中, 每个错误码标记 `retryable` 属性：

| 错误域 | 错误码 | retryable |
|--------|--------|-----------|
| `database` | DATABASE_ERROR, NOT_FOUND | true, false |
| `validation` | VALIDATION_ERROR | false |
| `api` | API_ERROR, RATE_LIMIT_ERROR | true, true |
| `network` | NETWORK_ERROR, TIMEOUT_ERROR | true, true |
| `storage` | STORAGE_ERROR | true |
| `generation` | GENERATION_ERROR, SYNTHESIZE_PROGRESS | true, false |
| `recovery` | RETRY_NOT_RECOMMENDED, DUPLICATE_DETECTED, HIGH_RISK_RETRY, VERIFICATION_FAILED, RECOVERY_INCOMPLETE, RECOVERY_FAILED, RECOVERY_PENDING, UNKNOWN_STATUS, QUERY_FAILED, BACKGROUND_RECOVERY_ERROR | false, false, false, true, true, false, true, true, true, true |
| `cache` | CACHE_CLEANUP_ERROR, CACHE_VIDEO_ERROR, CACHE_DB_ERROR | true, true, true |
| `config` | CONFIGURATION_ERROR | false |
| `auth` | AUTHENTICATION_ERROR | false |
| `state` | INVALID_TRANSITION | false |
| `system` | UNKNOWN_ERROR, CLEANUP_ERROR, REMOVE_TASK_ERROR, CLEAR_ACTIVE_TASKS_ERROR, UNHANDLED_REJECTION, LOG | false, true, false, false, false, false |

#### 错误分类

9 种错误类别, 使用结构化错误码 + 正则回退进行分类：

| 错误类别 | 说明 |
|----------|------|
| `timeout` | 请求超时 |
| `rate_limit` | 速率限制 |
| `quota` | 额度不足 |
| `invalid_params` | 参数错误 |
| `network` | 网络错误 |
| `server_error` | 服务端错误 |
| `database_busy` | 数据库繁忙 |
| `auth` | 认证失败 |
| `unknown` | 未知错误 |

### 3.2 Zod Schema 体系

#### Character Schema

角色实体, 描述动画中的角色信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 (crypto.randomUUID) |
| `name` | `string` | 角色名称 |
| `description` | `string` | 角色描述 |
| `gender` | `string` | 性别 |
| `age` | `string` | 年龄 |
| `style` | `string` | 风格 |
| `personality` | `string` | 性格 |
| `appearance` | `object` | 外貌特征 |
| `appearance.hairColor` | `string` | 发色 |
| `appearance.hairStyle` | `string` | 发型 |
| `appearance.eyeColor` | `string` | 瞳色 |
| `appearance.height` | `string` | 身高 |
| `appearance.build` | `string` | 体型 |
| `appearance.clothing` | `string` | 服装 |
| `outfits` | `CharacterOutfit[]` | 服装方案列表 |
| `prompt` | `string` | AI 生成提示词 |
| `generatedImage` | `string` | AI 生成的图片 URL |
| `refImagePath` | `string` | 参考图路径 |
| `thumbnailPath` | `string` | 缩略图路径 |
| `previewPath` | `string` | 预览图路径 |
| `avatarPath` | `string` | 头像路径 |
| `tags` | `string[]` | 标签 |
| `useCount` | `number` | 使用次数 |
| `lastUsedAt` | `string` | 最后使用时间 |
| `createdAt` | `string` | 创建时间 |

#### CharacterOutfit Schema

角色服装方案。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `name` | `string` | 方案名称 |
| `description` | `string` | 方案描述 |
| `clothing` | `string` | 服装描述 |
| `accessories` | `string[]` | 配饰列表 |
| `imageUrl` | `string` | 图片 URL |
| `localImagePath` | `string` | 本地图片路径 |
| `thumbnailPath` | `string` | 缩略图路径 |
| `isDefault` | `boolean` | 是否为默认方案 |
| `createdAt` | `string` | 创建时间 |

#### Scene Schema

场景实体, 描述动画中的场景信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `name` | `string` | 场景名称 |
| `description` | `string` | 场景描述 |
| `type` | `string` | 场景类型 |
| `timeOfDay` | `string` | 时间段 |
| `weather` | `string` | 天气 |
| `mood` | `string` | 氛围 |
| `lighting` | `string` | 光照 |
| `elements` | `SceneElement[]` | 场景元素列表 |
| `colors` | `string[]` | 色彩方案 |
| `prompt` | `string` | AI 生成提示词 |
| `generatedImage` | `string` | AI 生成的图片 URL |
| `generatedVideo` | `string` | AI 生成的视频 URL |
| `camera` | `object` | 摄像机参数 |
| `camera.position` | `string` | 位置 |
| `camera.angle` | `string` | 角度 |
| `camera.zoom` | `string` | 缩放 |
| `camera.distance` | `string` | 距离 |
| `camera.movement` | `string` | 运动 |
| `imageUrl` | `string` | 图片 URL |
| `scenePath` | `string` | 场景文件路径 |
| `refImagePath` | `string` | 参考图路径 |
| `thumbnailPath` | `string` | 缩略图路径 |
| `previewPath` | `string` | 预览图路径 |
| `atmosphere` | `string` | 大气效果 |
| `tags` | `string[]` | 标签 |
| `useCount` | `number` | 使用次数 |
| `lastUsedAt` | `string` | 最后使用时间 |
| `createdAt` | `string` | 创建时间 |

#### SceneElement Schema

场景中的元素 (角色/道具/环境)。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `name` | `string` | 元素名称 |
| `type` | `"existing_character" \| "new_character" \| "prop" \| "environment"` | 元素类型 |
| `characterId` | `string` | 关联角色 ID |
| `description` | `string` | 元素描述 |
| `imageUrl` | `string` | 图片 URL |
| `dialogue` | `string` | 对话内容 |
| `action` | `string` | 动作描述 |
| `emotion` | `string` | 情感 |
| `position` | `string` | 位置 |
| `pose` | `string` | 姿势 |
| `order` | `number` | 排序 |
| `timelineGroup` | `string` | 时间线分组 |
| `timelineOrder` | `number` | 时间线排序 |

#### Story Schema

故事实体, 动画制作的核心容器。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `title` | `string` | 故事标题 |
| `description` | `string` | 故事描述 |
| `characters` | `string[]` | 角色 ID 列表 |
| `scenes` | `string[]` | 场景 ID 列表 |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | 更新时间 |
| `genre` | `string` | 类型 |
| `tone` | `string` | 基调 |
| `targetDuration` | `number` | 目标时长 (秒) |
| `keyframeChainValid` | `boolean` | 关键帧链是否有效 |
| `beats` | `StoryBeat[]` | 故事节拍列表 |
| `elementIds` | `string[]` | 元素 ID 列表 |
| `elementBindings` | `Record<string, ElementBinding>` | 元素绑定映射 |
| `styleGuide` | `StoryStyleGuide` | 风格指南 |

#### StoryBeat Schema (核心, 50+ 字段)

故事节拍, 系统最核心的数据结构, 描述动画中的一个镜头/场景片段。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `sequence` | `number` | 序列号 |
| `order` | `number` | 排序 |
| `description` | `string` | 描述 |
| `duration` | `number` | 时长 (秒) |
| `type` | `"action" \| "dialogue" \| "scene" \| "transition" \| "effect"` | 节拍类型 |
| `title` | `string` | 标题 |
| `content` | `string` | 内容 |
| `character` | `string` | 主角色 ID |
| `characters` | `string[]` | 角色 ID 列表 |
| `scene` | `string` | 场景 ID |
| `shotType` | `"wide" \| "medium" \| "close" \| "extreme_close" \| "low" \| "high" \| "birdseye" \| "wormseye"` | 镜头类型 |
| `elementIds` | `string[]` | 元素 ID 列表 |
| `elementBindings` | `Record<string, ElementBinding>` | 元素绑定映射 |
| `reference` | `ShotReference` | 镜头引用 |
| `generationStatus` | `string` | 生成状态 |
| `generationResult` | `string` | 生成结果 |
| `generationPrompt` | `string` | 生成提示词 |
| `camera` | `BeatCamera` | 摄像机参数 |
| `shotInstruction` | `ShotInstruction` | 镜头指令 |
| `featureAnchoring` | `FeatureAnchoring` | 特征锚定 |
| `consistencyCheck` | `ConsistencyCheckResult` | 一致性检查结果 |
| `keyframe` | `StoryBeatKeyframe` | 关键帧 |
| `framePair` | `StoryBeatFramePair` | 帧对 |
| `videoGen` | `StoryBeatVideo` | 视频生成 |
| `keyframeInput` | `"ai" \| "upload" \| "asset" \| "isolated"` | 关键帧输入模式 |
| `framePairInput` | `"ai" \| "upload" \| "keyframe" \| "isolated"` | 帧对输入模式 |
| `videoInput` | `"ai" \| "upload" \| "framepair" \| "isolated"` | 视频输入模式 |
| `chainMode` | `"auto" \| "isolated" \| "custom" \| "asset"` | 链模式 |
| `promptLab` | `object` | 提示词实验室 |
| `sceneElements` | `SceneElement[]` | 场景元素 |
| `characterOutfits` | `object` | 角色服装方案 |
| `transition` | `object` | 过渡效果 |
| `imageUrl` | `string` | 图片 URL |
| `videoReferenceUrl` | `string` | 视频参考 URL |
| `uploadedKeyframe` | `string` | 上传的关键帧路径 |
| `uploadedFramePair` | `string` | 上传的帧对路径 |
| `uploadedVideo` | `string` | 上传的视频路径 |

#### StoryBeatKeyframe Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `imageUrl` | `string` | 关键帧图片 URL |
| `prompt` | `string` | 生成提示词 |
| `generatedAt` | `string` | 生成时间 |
| `source` | `"ai" \| "upload"` | 来源 |
| `referencedPrevKeyframe` | `boolean` | 是否引用前一关键帧 |

#### StoryBeatFramePair Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `firstFrameUrl` | `string` | 首帧图片 URL |
| `lastFrameUrl` | `string` | 末帧图片 URL |
| `firstFramePrompt` | `string` | 首帧提示词 |
| `lastFramePrompt` | `string` | 末帧提示词 |
| `generatedAt` | `string` | 生成时间 |
| `source` | `"ai" \| "upload" \| "keyframe" \| "isolated"` | 来源 |
| `firstFrame.imageUrl` | `string` | 首帧图片 URL |
| `firstFrame.prompt` | `string` | 首帧提示词 |
| `firstFrame.derivedFrom` | `string` | 首帧派生来源 |
| `lastFrame.imageUrl` | `string` | 末帧图片 URL |
| `lastFrame.prompt` | `string` | 末帧提示词 |
| `lastFrame.derivedFrom` | `string` | 末帧派生来源 |

#### StoryBeatVideo Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `videoUrl` | `string` | 视频 URL |
| `taskId` | `string` | 视频任务 ID |
| `status` | `string` | 生成状态 |
| `generatedAt` | `string` | 生成时间 |
| `source` | `string` | 来源 |
| `prompt` | `string` | 生成提示词 |
| `error` | `string` | 错误信息 |
| `createdAt` | `string` | 创建时间 |

#### StoryStyleGuide Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `styleImageUrl` | `string` | 风格参考图 URL |
| `stylePrompt` | `string` | 风格提示词 |
| `colorPalette` | `string[]` | 色彩方案 |
| `artStyle` | `string` | 艺术风格 |
| `moodAtmosphere` | `string` | 氛围 |
| `generatedAt` | `string` | 生成时间 |
| `source` | `"ai" \| "upload" \| "manual"` | 来源 |

#### ShotInstruction Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `shotSize` | `"extreme_close" \| "close" \| "medium" \| "wide" \| "extreme_wide"` | 景别 |
| `cameraMovement` | `"static" \| "push" \| "pull" \| "pan" \| "orbit" \| "crane_up" \| "crane_down" \| "tracking"` | 运镜方式 |
| `cameraAngle` | `"eye_level" \| "low" \| "high" \| "birds_eye" \| "worms_eye" \| "dutch"` | 摄像角度 |

#### FeatureAnchoring Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | `boolean` | 是否启用 |
| `characterAnchors` | `{ elementId: string; referenceImageUrl: string; featureTags: string[]; weight: number }[]` | 角色特征锚点 |
| `propAnchors` | `object[]` | 道具特征锚点 |
| `previewImageUrl` | `string` | 预览图 URL |
| `disableFrameBinding` | `boolean` | 禁用帧绑定 |
| `featureConsistencyStrength` | `number` | 特征一致性强度 |
| `blend.mode` | `"anchor_only" \| "chain_only" \| "blend"` | 混合模式 |
| `blend.chainWeight` | `number` | 链权重 |
| `blend.anchorWeight` | `number` | 锚点权重 |
| `blend.autoFallback` | `boolean` | 自动回退 |

#### ConsistencyCheckResult Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `passed` | `boolean` | 是否通过 |
| `characterScores` | `{ elementId: string; elementName: string; score: number; issues: string[] }[]` | 角色一致性评分 |
| `overallScore` | `number` | 总体评分 |
| `recommendation` | `"accept" \| "regenerate" \| "adjust"` | 建议 |

#### ShotReference Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `direction` | `"none" \| "previous" \| "next" \| "custom"` | 引用方向 |
| `targetShotId` | `string` | 目标镜头 ID |
| `contentType` | `"full_video" \| "last_frame" \| "first_frame" \| "video_segment"` | 内容类型 |
| `segmentDuration` | `number` | 片段时长 |
| `segmentPosition` | `"start" \| "end"` | 片段位置 |

#### FixedImage Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | `boolean` | 是否启用 |
| `lockType` | `"character" \| "scene"` | 锁定类型 |
| `imageUrl` | `string` | 图片 URL |
| `name` | `string` | 名称 |
| `characters` | `{ characterId: string; characterName: string; imageUrl: string }[]` | 角色信息 |

#### ReferenceVideo Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | `boolean` | 是否启用 |
| `videoUrl` | `string` | 视频 URL |
| `mimicryLevel` | `"light" \| "medium" \| "deep"` | 模仿程度 |
| `name` | `string` | 名称 |
| `duration` | `number` | 时长 |

#### TemplateConfig Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | `boolean` | 是否启用 |
| `templateId` | `string` | 模板 ID |
| `template` | `VideoTemplate` | 模板实例 |
| `autoMatchStory` | `boolean` | 自动匹配故事 |
| `name` | `string` | 名称 |
| `matchCamera` | `boolean` | 匹配摄像机 |
| `matchTransition` | `boolean` | 匹配过渡 |
| `matchTiming` | `boolean` | 匹配时序 |

#### BeatCamera Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `angle` | `string` | 角度 |
| `movement` | `string` | 运动 |
| `distance` | `string` | 距离 |
| `speed` | `string` | 速度 |
| `relationType` | `"continuous" \| "contrast" \| "parallel" \| "fade"` | 关系类型 |
| `transitionType` | `"cut" \| "dissolve" \| "wipe" \| "fade"` | 过渡类型 |
| `transitionDuration` | `number` | 过渡时长 |

#### ElementBinding Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `role` | `string` | 角色 |
| `position` | `string` | 位置 |
| `action` | `string` | 动作 |
| `emotion` | `string` | 情感 |
| `description` | `string` | 描述 |
| `text` | `string` | 文本 |
| `imageUrl` | `string` | 图片 URL |

#### StoryElement Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `type` | `"character" \| "prop" \| "effect"` | 元素类型 |
| `name` | `string` | 名称 |
| `description` | `string` | 描述 |
| `bindings` | `{ type: "image" \| "video" \| "text"; url: string; name: string; uploadedAt: string; isPrimary: boolean }[]` | 绑定列表 |
| `characterConfig` | `{ gender: string; age: string; style: string; personality: string; appearance: object }` | 角色配置 |
| `sceneConfig` | `{ timeOfDay: string; weather: string; mood: string; lighting: string; style: string }` | 场景配置 |
| `featureAnchor` | `object` | 特征锚点 |
| `referenceImageQuality` | `string` | 参考图质量 |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | 更新时间 |

#### ElementLibrary Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `elements` | `StoryElement[]` | 元素列表 |
| `nextCode` | `{ character: number; prop: number; effect: number }` | 下一个编码计数器 |

#### VideoTask Schema

视频任务实体, 跟踪视频生成的完整生命周期。

| 字段 | 类型 | 说明 |
|------|------|------|
| `taskId` | `string` | 任务 ID |
| `status` | `"pending" \| "generating" \| "completed" \| "failed" \| "cancelled" \| "retrying"` | 任务状态 |
| `progress` | `number` | 进度 (0-100) |
| `videoUrl` | `string` | 视频 URL |
| `message` | `string` | 状态消息 |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | 更新时间 |
| `expiresAt` | `string` | 过期时间 |
| `model` | `string` | 模型名称 |
| `prompt` | `string` | 生成提示词 |
| `parameters` | `object` | 生成参数 |
| `apiUrl` | `string` | API 地址 |
| `apiEndpoint` | `string` | API 端点 |
| `providerId` | `string` | 提供者 ID |
| `providerModelId` | `string` | 提供者模型 ID |
| `providerFormat` | `string` | 提供者格式 |
| `fixedImageUrl` | `string` | 固定图片 URL |
| `fixedImageLockType` | `string` | 固定图片锁定类型 |
| `referenceVideoUrl` | `string` | 参考视频 URL |
| `referenceVideoMimicryLevel` | `string` | 参考视频模仿程度 |
| `templateId` | `string` | 模板 ID |
| `templateShots` | `object` | 模板镜头 |
| `beatId` | `string` | 关联 Beat ID |
| `storyId` | `string` | 关联故事 ID |
| `storyTitle` | `string` | 故事标题 |
| `beatTitle` | `string` | Beat 标题 |
| `cacheFailed` | `boolean` | 缓存是否失败 |
| `promptWasTruncated` | `boolean` | 提示词是否被截断 |
| `pollFailureCount` | `number` | 轮询失败次数 |
| `pollCount` | `number` | 轮询次数 |
| `recoveryAttempts` | `number` | 恢复尝试次数 |
| `lastPolledAt` | `string` | 最后轮询时间 |
| `vectorClock` | `VectorClock` | 向量时钟 |
| `syncStatus` | `SyncStatus` | 同步状态 |
| `urlObtainedAt` | `string` | URL 获取时间 |
| `urlTtl` | `number` | URL 生存时间 |

#### MediaAsset Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `name` | `string` | 名称 |
| `description` | `string` | 描述 |
| `type` | `"image" \| "video"` | 媒体类型 |
| `url` | `string` | URL |
| `thumbnailUrl` | `string` | 缩略图 URL |
| `tags` | `string[]` | 标签 |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | 更新时间 |
| `boundTo` | `{ type: string; id: string; name: string }` | 绑定目标 |
| `fileSize` | `number` | 文件大小 |
| `mimeType` | `string` | MIME 类型 |
| `width` | `number` | 宽度 |
| `height` | `number` | 高度 |
| `duration` | `number` | 时长 (视频) |

#### VideoTemplate Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `name` | `string` | 模板名称 |
| `description` | `string` | 描述 |
| `category` | `string` | 分类 |
| `totalDuration` | `number` | 总时长 |
| `shots` | `{ id: string; sequence: number; description: string; duration: number; cameraAngle: string; cameraMovement: string; transition: string; promptTemplate: string }[]` | 镜头列表 |
| `tags` | `string[]` | 标签 |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | 更新时间 |
| `thumbnailUrl` | `string` | 缩略图 URL |

#### Collection Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `name` | `string` | 集合名称 |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | 更新时间 |

#### BatchTask Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `itemId` | `string` | 项目 ID |
| `itemName` | `string` | 项目名称 |
| `status` | `"pending" \| "generating" \| "completed" \| "failed"` | 任务状态 |
| `progress` | `number` | 进度 (0-100) |
| `error` | `string` | 错误信息 |
| `result` | `{ imageUrl: string; source: string; prompt: string }` | 生成结果 |

#### EnhancedVideoGenerationParams Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `prompt` | `string` | 提示词 |
| `duration` | `number` | 时长 |
| `fixedImage` | `FixedImage` | 固定图片 |
| `referenceVideo` | `ReferenceVideo` | 参考视频 |
| `template` | `TemplateConfig` | 模板配置 |
| `providerId` | `string` | 提供者 ID |
| `modelId` | `string` | 模型 ID |
| `featureAnchoring` | `FeatureAnchoring` | 特征锚定 |

#### UserApiConfig Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `imageApiUrl` | `string` | 图片 API 地址 |
| `imageApiKey` | `string` | 图片 API 密钥 |
| `imageApiModel` | `string` | 图片 API 模型 |
| `videoApiUrl` | `string` | 视频 API 地址 |
| `videoApiKey` | `string` | 视频 API 密钥 |
| `videoApiModel` | `string` | 视频 API 模型 |
| `textApiUrl` | `string` | 文本 API 地址 |
| `textApiKey` | `string` | 文本 API 密钥 |
| `textApiModel` | `string` | 文本 API 模型 |
| `visionApiUrl` | `string` | 视觉 API 地址 |
| `visionApiKey` | `string` | 视觉 API 密钥 |
| `visionApiModel` | `string` | 视觉 API 模型 |
| `useCustomImageApi` | `boolean` | 是否使用自定义图片 API |
| `useCustomVideoApi` | `boolean` | 是否使用自定义视频 API |
| `useCustomVisionApi` | `boolean` | 是否使用自定义视觉 API |

#### HealthStatus Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | `{ configured: boolean; provider: string; available: boolean }` | 文本服务状态 |
| `image` | `{ configured: boolean; provider: string; available: boolean }` | 图片服务状态 |
| `video` | `{ configured: boolean; provider: string; available: boolean }` | 视频服务状态 |
| `vision` | `{ configured: boolean; provider: string; available: boolean }` | 视觉服务状态 |

#### AsaExportData Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `format` | `"asa"` | 导出格式 |
| `version` | `"1.0"` | 格式版本 |
| `createdAt` | `string` | 导出时间 |
| `collections` | `Collection[]` | 集合列表 |
| `characters` | `Character[]` | 角色列表 |
| `scenes` | `Scene[]` | 场景列表 |
| `storyboards` | `Story[]` | 故事板列表 |

#### SearchResult Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `"character" \| "scene" \| "story"` | 结果类型 |
| `id` | `string` | 唯一标识 |
| `title` | `string` | 标题 |
| `subtitle` | `string` | 副标题 |

### 3.3 Port 接口

Port 接口定义在 `domain/` 层, 由 `infrastructure/` 层实现并通过 DI 容器注册。模块通过 `container.xxx` 访问, 不直接导入基础设施代码。

#### IVideoTaskStorage

视频任务持久化接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `create` | `(task: VideoTask) => Promise<Result<VideoTask>>` | 创建任务 |
| `update` | `(id: string, data: Partial<VideoTask>) => Promise<Result<VideoTask>>` | 更新任务 |
| `delete` | `(id: string) => Promise<Result<void>>` | 删除任务 |
| `getById` | `(id: string) => Promise<Result<VideoTask>>` | 按 ID 查询 |
| `queryByStatus` | `(status: string) => Promise<Result<VideoTask[]>>` | 按状态查询 |
| `queryByBeatId` | `(beatId: string) => Promise<Result<VideoTask[]>>` | 按 Beat ID 查询 |
| `queryAll` | `() => Promise<Result<VideoTask[]>>` | 查询全部 |
| `cleanup` | `(beforeDate: string) => Promise<Result<number>>` | 清理过期任务 |

#### ICharacterStorage

角色持久化接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `create` | `(character: Character) => Promise<Result<Character>>` | 创建角色 |
| `update` | `(id: string, data: Partial<Character>) => Promise<Result<Character>>` | 更新角色 |
| `delete` | `(id: string) => Promise<Result<void>>` | 删除角色 |
| `getById` | `(id: string) => Promise<Result<Character>>` | 按 ID 查询 |
| `queryAll` | `() => Promise<Result<Character[]>>` | 查询全部 |

#### ISceneStorage

场景持久化接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `create` | `(scene: Scene) => Promise<Result<Scene>>` | 创建场景 |
| `update` | `(id: string, data: Partial<Scene>) => Promise<Result<Scene>>` | 更新场景 |
| `delete` | `(id: string) => Promise<Result<void>>` | 删除场景 |
| `getById` | `(id: string) => Promise<Result<Scene>>` | 按 ID 查询 |
| `queryAll` | `() => Promise<Result<Scene[]>>` | 查询全部 |

#### IStoryStorage

故事持久化接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `create` | `(story: Story) => Promise<Result<Story>>` | 创建故事 |
| `update` | `(id: string, data: Partial<Story>) => Promise<Result<Story>>` | 更新故事 |
| `delete` | `(id: string) => Promise<Result<void>>` | 删除故事 |
| `getById` | `(id: string) => Promise<Result<Story>>` | 按 ID 查询 |
| `getByBeatId` | `(beatId: string) => Promise<Result<Story>>` | 按 Beat ID 查询 |
| `queryAll` | `() => Promise<Result<Story[]>>` | 查询全部 |

#### IVideoProvider

视频生成提供者接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `generateVideo` | `(params: EnhancedVideoGenerationParams) => Promise<Result<VideoTask>>` | 生成视频 |
| `queryVideoStatus` | `(taskId: string) => Promise<Result<VideoTask>>` | 查询视频状态 |
| `generateKeyframe` | `(params) => Promise<Result<string>>` | 生成关键帧 |
| `generateFramePair` | `(params) => Promise<Result<FramePairResult>>` | 生成帧对 |
| `generateVideoWithFrames` | `(params) => Promise<Result<VideoTask>>` | 基于帧对生成视频 |

#### IImageProvider

图片生成提供者接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `generateImage` | `(prompt: string, options?: object) => Promise<Result<string>>` | 生成图片 |
| `analyzeImage` | `(params) => Promise<Result<AnalysisResult>>` | 分析图片 |

#### ITextProvider

文本生成提供者接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `generateText` | `(prompt: string, options?: object) => Promise<Result<string>>` | 生成文本 |

#### IFileUploader

文件上传接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `uploadFile` | `(file: File) => Promise<Result<string>>` | 上传文件 |

#### ISyncStorage

同步存储接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `safeRun` | `(sql: string, params: unknown[]) => Promise<Result<void>>` | 安全执行 SQL |
| `safeQuery` | `(sql: string, params: unknown[]) => Promise<Result<unknown[]>>` | 安全查询 SQL |
| `safeTransaction` | `(fn: () => void) => void` | 安全事务 |
| `registerChangeTracker` | `(tracker) => void` | 注册变更追踪器 |

#### IElementManager

元素管理接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `createElement` | `(element: StoryElement) => Promise<Result<StoryElement>>` | 创建元素 |
| `bindElement` | `(elementId: string, beatId: string, binding: ElementBinding) => Promise<Result<void>>` | 绑定元素 |
| `updateElement` | `(id: string, data: Partial<StoryElement>) => Promise<Result<StoryElement>>` | 更新元素 |
| `deleteElement` | `(id: string) => Promise<Result<void>>` | 删除元素 |
| `getElement` | `(id: string) => Promise<Result<StoryElement>>` | 获取元素 |
| `getElementsByStory` | `(storyId: string) => Promise<Result<StoryElement[]>>` | 按故事查询元素 |
| `getLibrary` | `() => Promise<Result<ElementLibrary>>` | 获取元素库 |
| `saveLibrary` | `(library: ElementLibrary) => Promise<Result<void>>` | 保存元素库 |

#### IReferenceEngine

引用引擎接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `resolveReference` | `(beatId: string, reference: ShotReference) => Promise<Result<string>>` | 解析引用 |
| `validateReference` | `(beatId: string, reference: ShotReference) => Promise<Result<boolean>>` | 验证引用 |
| `getVideoUrlForBeat` | `(beatId: string) => Promise<Result<string>>` | 获取 Beat 视频 URL |

### 3.4 同步类型

#### 基础枚举

| 类型 | 值 | 说明 |
|------|------|------|
| `SyncStatus` | `"pending" \| "synced" \| "conflict"` | 同步状态 |
| `SyncEntityType` | `"story" \| "character" \| "scene" \| "video_task" \| "element"` | 同步实体类型 |
| `ChangeOperation` | `"create" \| "update" \| "delete"` | 变更操作类型 |
| `ConflictStrategy` | `"local_wins" \| "remote_wins" \| "manual"` | 冲突解决策略 |

#### VectorClock

向量时钟, 用于分布式冲突检测。

```typescript
type VectorClock = Record<string, number>;
```

| 函数 | 签名 | 说明 |
|------|------|------|
| `create` | `(deviceId: string) => VectorClock` | 创建初始向量时钟 |
| `increment` | `(clock: VectorClock, deviceId: string) => VectorClock` | 递增设备计数器 |
| `merge` | `(clock1: VectorClock, clock2: VectorClock) => VectorClock` | 合并两个向量时钟 (取各设备最大值) |
| `compare` | `(clock1: VectorClock, clock2: VectorClock) => "before" \| "after" \| "concurrent"` | 比较两个向量时钟 |
| `isConflict` | `(clock1: VectorClock, clock2: VectorClock) => boolean` | 检测是否冲突 (concurrent) |

#### SyncChangeLogEntry

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `entityType` | `SyncEntityType` | 实体类型 |
| `entityId` | `string` | 实体 ID |
| `operation` | `ChangeOperation` | 操作类型 |
| `data` | `unknown` | 变更数据 |
| `vectorClock` | `VectorClock` | 向量时钟 |
| `deviceId` | `string` | 设备 ID |
| `timestamp` | `string` | 时间戳 |
| `synced` | `boolean` | 是否已同步 |

#### SyncConfig

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | `boolean` | 是否启用同步 |
| `serverUrl` | `string` | 同步服务器地址 |
| `syncInterval` | `number` | 同步间隔 (毫秒) |
| `conflictStrategy` | `ConflictStrategy` | 冲突解决策略 |
| `deviceId` | `string` | 设备 ID |

#### SyncPushResult

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | `boolean` | 是否成功 |
| `pushedCount` | `number` | 推送数量 |
| `errors` | `string[]` | 错误列表 |

#### SyncPullResult

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | `boolean` | 是否成功 |
| `pulledCount` | `number` | 拉取数量 |
| `conflicts` | `SyncChangeLogEntry[]` | 冲突列表 |
| `errors` | `string[]` | 错误列表 |

### 3.5 Domain 服务

#### storyGenerationService

AI 故事生成服务, 负责根据用户输入生成完整的故事结构。

| 职责 | 说明 |
|------|------|
| 故事生成 | 根据主题/风格/角色生成完整故事 |
| 大纲生成 | 生成故事大纲和 Beat 结构 |
| 角色分配 | 自动将角色分配到各个 Beat |

#### referenceResolver

引用解析服务, 解析 Beat 之间的镜头引用关系。

| 职责 | 说明 |
|------|------|
| 引用解析 | 解析 ShotReference 到实际媒体资源 |
| 链式引用 | 处理连续镜头之间的引用链 |
| 自定义引用 | 解析用户指定的自定义引用 |

#### referenceCheck

引用检查服务, 验证引用的有效性。

| 职责 | 说明 |
|------|------|
| 有效性验证 | 检查引用目标是否存在 |
| 完整性检查 | 检查引用链是否完整 |
| 循环检测 | 检测循环引用 |

#### beatWorkflowService

Beat 工作流管理服务, 管理 Beat 的生成工作流状态。

| 职责 | 说明 |
|------|------|
| 工作流编排 | 编排关键帧→帧对→视频的生成流程 |
| 状态管理 | 管理生成状态转换 |
| 链模式处理 | 处理 auto/isolated/custom/asset 链模式 |

### 3.6 Domain 工具

#### beatPromptBuilder

Beat 提示词构建器, 将 Beat 信息组装为 AI 生成提示词。

| 功能 | 说明 |
|------|------|
| 角色描述 | 将角色外观/服装/情感转为提示词片段 |
| 场景描述 | 将场景氛围/光照/天气转为提示词片段 |
| 镜头描述 | 将景别/运镜/角度转为提示词片段 |
| 组装 | 将所有片段组装为完整提示词 |

#### shotPrompt

镜头提示词生成器, 生成特定镜头的 AI 提示词。

| 功能 | 说明 |
|------|------|
| 景别映射 | 将 shotSize 映射为自然语言描述 |
| 运镜映射 | 将 cameraMovement 映射为自然语言描述 |
| 角度映射 | 将 cameraAngle 映射为自然语言描述 |
| 组合生成 | 组合生成完整的镜头提示词 |

#### promptVocabulary

提示词词汇表, 提供标准化的提示词词汇。

| 功能 | 说明 |
|------|------|
| 景别词汇 | extreme close-up, close-up, medium shot, wide shot, extreme wide shot |
| 运镜词汇 | static, push in, pull out, pan, orbit, crane up, crane down, tracking |
| 角度词汇 | eye level, low angle, high angle, bird's eye, worm's eye, dutch angle |
| 过渡词汇 | cut, dissolve, wipe, fade in, fade out |
| 情感词汇 | happy, sad, angry, surprised, fearful, disgusted, neutral |

---

## 4. Modules 层详解

Modules 层是业务逻辑的核心, 采用子域划分, 每个模块遵循统一结构：

```
module-name/
  index.ts           → 桶文件 (公共 API)
  MODULE.md          → 模块契约
  hooks/             → React hooks
  services/          → 业务逻辑服务
  presentation/      → React 组件
  domain/            → 模块特定领域类型 (可选)
```

### 4.1 Story 模块

| 属性 | 值 |
|------|------|
| 职责 | 故事创作全生命周期管理 |

> 故事创作流水线设计详见 [story-pipeline-design.md](story-pipeline-design.md) — 10 步流水线（7 Phase）、单入口 `/story` 路由、三栏布局。

#### 子域

##### beat-editor

Beat 编辑器, 负责 StoryBeat 的 CRUD 操作、拖拽排序和元素绑定。

| 组件 | 说明 |
|------|------|
| Beat CRUD | 创建/读取/更新/删除 StoryBeat |
| 拖拽排序 | 支持拖拽调整 Beat 顺序 |
| 元素绑定 | 将 StoryElement 绑定到 Beat |
| 服装方案 | 管理 Beat 中的角色服装方案 |

##### generation

AI 生成子域, 负责关键帧、帧对和视频的生成。

| Hook | 说明 |
|------|------|
| `useKeyframeGenerator` | 关键帧生成 (AI/上传/资产/隔离模式) |
| `useFramePairGenerator` | 帧对生成 (首帧+末帧) |
| `useVideoGenerator` | 视频生成 (基于关键帧/帧对) |
| `useUploadHandlers` | 上传处理 (关键帧/帧对/视频) |

生成流程:

```
关键帧生成 → 帧对生成 → 视频生成
     ↑            ↑           ↑
  keyframeInput  framePairInput  videoInput
  (ai/upload/    (ai/upload/     (ai/upload/
   asset/         keyframe/       framepair/
   isolated)      isolated)       isolated)
```

##### planning

故事规划子域, 负责 AI 故事生成和故事大纲。

| 服务 | 说明 |
|------|------|
| `storyService` | 故事 CRUD 和查询 |
| `storyPlanningService` | AI 故事生成, 大纲生成, Beat 自动生成 |

##### prompt-editor

提示词编辑子域, 提供 PromptLab 和浮动球 UI。

| 组件 | 说明 |
|------|------|
| PromptLab | 提示词编辑器, 支持变量替换和预览 |
| PromptFloatingBall | 浮动球 UI, 快速访问提示词编辑 |

##### template

模板管理子域, 负责版本控制和资产选择器。

| 组件 | 说明 |
|------|------|
| 版本控制 | 模板版本管理 |
| AssetPicker | 资产选择器组件 |

#### 公共 API

| 导出 | 类型 | 说明 |
|------|------|------|
| `useStoryState` | Hook | 故事状态管理 |
| `storyService` | Service | 故事 CRUD |
| `StoryProvider` | Component | 故事 Context Provider |
| `useStoryPlanner` | Hook | 故事规划 |
| `useKeyframeGenerator` | Hook | 关键帧生成 |
| `useFramePairGenerator` | Hook | 帧对生成 |
| `useVideoGenerator` | Hook | 视频生成 |
| `useUploadHandlers` | Hook | 上传处理 |
| `PromptFloatingBall` | Component | 提示词浮动球 |
| `AssetPicker` | Component | 资产选择器 |
| `ShotReferenceConfig` | Component | 镜头引用配置 |
| `ReferenceVideoUploader` | Component | 参考视频上传 |
| `versionControl` | Service | 版本控制 |
| `styleGuideService` | Service | 风格指南服务 |
| `promptEditorService` | Service | 提示词编辑服务 |

#### 依赖

| 依赖 | 来源 | 用途 |
|------|------|------|
| `@/domain/schemas` | Domain | 类型定义 |
| `container.videoProvider` | DI | 视频生成 |
| `container.imageProvider` | DI | 图片生成 |
| `container.textProvider` | DI | 文本生成 |
| `container.storyStorage` | DI | 故事持久化 |
| `container.elementManager` | DI | 元素管理 |
| `container.referenceEngine` | DI | 引用引擎 |

### 4.2 Video 模块

| 属性 | 值 |
|------|------|
| 职责 | 视频任务全生命周期管理 |

#### 子域

##### task-management

任务管理子域, 核心状态机和轮询引擎。

**状态机**:

```
                    ┌──────────┐
          ┌────────→│ pending  │
          │         └────┬─────┘
          │              │ start
          │              ▼
          │         ┌──────────┐
          │    ┌───→│generating│←───┐
          │    │    └──┬───┬───┘    │
          │    │       │   │        │ retry
          │    │  fail │   │ success│
          │    │       ▼   ▼        │
          │    │  ┌──────┐ ┌──────┐ │
          │    │  │failed│ │compl-│ │
          │    │  └───┬──┘ │eted  │ │
          │    │      │    └──────┘ │
          │    │      │retry        │
          │    │      ▼             │
          │    │   ┌──────────┐     │
          │    └───│ retrying │─────┘
          │        └──────────┘
          │
          │  cancel
          │         ┌──────────┐
          └─────────│cancelled │
                    └──────────┘
```

**轮询引擎**:

| 参数 | 值 | 说明 |
|------|------|------|
| 轮询间隔 | 5 秒 | 基础轮询间隔 |
| 退避策略 | 指数退避 | 失败后间隔递增 |
| 最大失败次数 | 配置化 | 超过后标记任务失败 |

**核心 Hook**: `useVideoTaskManager` — 管理视频任务的创建、轮询、状态更新。

**CQRS 模式**: 视频任务管理遵循 CQRS（Command Query Responsibility Segregation），将 Zustand Store 拆分为四层：

| Hook | 职责 |
|------|------|
| `useVideoTaskState` | 纯状态，无副作用，无 API 调用 |
| `useVideoTaskQueries` | 只读派生数据，使用 useMemo |
| `useVideoTaskCommands` | 写操作（API 调用 + 状态更新） |
| `useVideoTaskPolling` | 定期状态检查 |
| `useVideoTaskManager` | 组合接口（向后兼容） |

**stableActions 模式**: `useVideoTaskManager` 通过 `useMemo([store])` 缓存所有 action 方法为稳定引用，避免 `allTasks` 变化时触发消费方不必要的重渲染。

**setAllTasks 不自动触发 sync/polling**: `setAllTasks` 仅更新 Zustand 状态。写操作在状态更新后显式调用 `scheduleSync()` + `checkAndStartOrStopPolling()`。轮询引擎在批量更新后统一触发一次 sync/polling，使用动态 `import("./sync-engine")` 避免循环依赖。

**useStableCompletedUrls**: `useStoryVideo` 中 `completedTaskUrls` Map 通过 shallow 比较确保只有内容真正变化时才创建新引用，防止轮询更新触发下游 useEffect。

##### recovery

恢复服务子域, 提供智能重试和视频验证。

| 服务 | 说明 |
|------|------|
| 智能重试 | 根据错误类型决定是否重试 (retryable 错误码) |
| 后台恢复 | 应用启动时自动恢复未完成的任务 |
| 视频验证 | 验证视频 URL 是否有效, 检测过期 |

##### cache

缓存管理子域, 管理视频 URL 缓存和 blob URL。

| 服务 | 说明 |
|------|------|
| URL 缓存 | 缓存视频 URL, 避免重复请求 |
| blob URL 管理 | 管理本地 blob URL 的生命周期 |
| 过期清理 | 定期清理过期的缓存条目 |

##### utils

工具函数子域。

| 工具 | 说明 |
|------|------|
| 视频编解码检测 | 检测视频编码格式 (H.264/H.265/VP9/AV1) |
| URL 处理 | 视频 URL 解析和转换 |

#### 公共 API

| 导出 | 类型 | 说明 |
|------|------|------|
| `useVideoTaskManager` | Hook | 视频任务管理 |
| `VideoTaskManagerUI` | Component | 任务管理 UI |
| `videoRecoveryService` | Service | 视频恢复服务 |
| `videoCache` | Service | 视频缓存服务 |
| `videoCodecUtils` | Utils | 视频编解码工具 |

### 4.3 Shot 模块

| 属性 | 值 |
|------|------|
| 职责 | 镜头系统管理 |

#### 子域

##### shot-instruction

镜头指令子域, 管理景别、运镜和角度。

| 概念 | 可选值 |
|------|--------|
| 景别 (shotSize) | extreme_close, close, medium, wide, extreme_wide |
| 运镜 (cameraMovement) | static, push, pull, pan, orbit, crane_up, crane_down, tracking |
| 角度 (cameraAngle) | eye_level, low, high, birds_eye, worms_eye, dutch |

##### shot-generation

镜头生成子域, 通过 story-generation-pipeline 编排生成流程。

| 组件 | 说明 |
|------|------|
| story-generation-pipeline | 故事生成管线, 编排关键帧→帧对→视频的批量生成 |

##### shot-reference

镜头引用子域, 管理前/后/自定义引用。

| 引用方向 | 说明 |
|----------|------|
| previous | 引用前一个 Beat 的视频/帧 |
| next | 引用后一个 Beat 的视频/帧 |
| custom | 引用用户指定的 Beat |
| none | 无引用 |

##### feature-extraction

特征提取子域, 管理角色和场景的特征锚定。

| 功能 | 说明 |
|------|------|
| 角色特征锚定 | 提取角色面部/服装特征作为生成参考 |
| 场景特征锚定 | 提取场景风格特征 |
| 混合模式 | anchor_only / chain_only / blend 三种混合策略 |

##### consistency-check

一致性检查子域, 评估角色一致性。

| 指标 | 说明 |
|------|------|
| 角色一致性评分 | 每个角色的视觉一致性分数 |
| 总体评分 | 所有角色的综合评分 |
| 建议 | accept / regenerate / adjust |

##### element-binding

元素绑定子域, 将元素与 Beat 关联。

| 功能 | 说明 |
|------|------|
| 绑定创建 | 将 StoryElement 绑定到 Beat |
| 角色指定 | 指定元素在 Beat 中的角色/位置/动作/情感 |
| 解绑 | 从 Beat 中解绑元素 |

##### reference-check

参考检查子域, 验证引用有效性。

| 检查 | 说明 |
|------|------|
| 目标存在性 | 引用目标 Beat 是否存在 |
| 媒体可用性 | 引用的媒体资源是否可用 |
| 循环检测 | 是否存在循环引用 |

#### 公共 API

| 导出 | 类型 | 说明 |
|------|------|------|
| `consistencyCheckService` | Service | 一致性检查 |
| `elementManager` | Service | 元素管理 |
| `referenceEngine` | Service | 引用引擎 |
| `storyGenerationPipeline` | Service | 故事生成管线 |
| `featureExtractionService` | Service | 特征提取 |
| `referenceCheckService` | Service | 参考检查 |

### 4.4 Asset 模块

| 属性 | 值 |
|------|------|
| 职责 | 资产库管理 |

#### 子域

##### asset-library

资产库子域, 提供资产的 CRUD 操作和 ASA 格式导出。

| 服务 | 说明 |
|------|------|
| assetLibraryService | 资产 CRUD, 查询, 集合管理 |

##### import-export

导入导出子域, 支持 ASA 格式和 ZIP 打包。

| 服务 | 说明 |
|------|------|
| importExportService | ASA 格式导出/导入, ZIP 打包/解包 |

ASA 导出格式:

```typescript
{
  format: "asa",
  version: "1.0",
  createdAt: string,
  collections: Collection[],
  characters: Character[],
  scenes: Scene[],
  storyboards: Story[]
}
```

##### media-assets

媒体资产管理子域。

| 服务 | 说明 |
|------|------|
| mediaAssetService | 媒体资产 CRUD, 标签管理, 绑定管理 |

##### presentation

批量操作 UI 子域。

| 组件 | 说明 |
|------|------|
| BatchOperations | 批量生成/删除/导出操作面板 |

##### hooks

资产相关 hooks。

| Hook | 说明 |
|------|------|
| `useAssetLibrary` | 资产库状态管理 |

#### 公共 API

| 导出 | 类型 | 说明 |
|------|------|------|
| `assetLibraryService` | Service | 资产库服务 |
| `importExportService` | Service | 导入导出服务 |
| `mediaAssetService` | Service | 媒体资产服务 |
| `BatchOperations` | Component | 批量操作组件 |
| `useAssetLibrary` | Hook | 资产库 Hook |

### 4.5 Sync 模块

| 属性 | 值 |
|------|------|
| 职责 | 多设备数据同步 |

#### 子域

##### engine

同步引擎子域, 基于 Vector Clock 的冲突检测和变更追踪。

**Vector Clock 算法流程**:

```
设备 A 创建记录 → VectorClock: { A: 1 }
设备 B 拉取记录 → 本地无冲突
设备 A 更新记录 → VectorClock: { A: 2 }
设备 B 更新记录 → VectorClock: { A: 1, B: 1 }
同步时 compare → "concurrent" → isConflict = true
根据 conflictStrategy 解决: local_wins / remote_wins / manual
```

**HMR 保护**: 使用 `window.__SYNC_ENGINE_STATE__` 单例模式, 防止开发模式下热更新导致同步引擎重复初始化。

##### presentation

同步设置面板子域。

| 组件 | 说明 |
|------|------|
| SyncSettingsPanel | 同步配置面板 (服务器地址/间隔/冲突策略) |

#### 公共 API

| 导出 | 类型 | 说明 |
|------|------|------|
| `initSyncEngine` | Function | 初始化同步引擎 |
| `updateSyncConfig` | Function | 更新同步配置 |
| `performSync` | Function | 执行一次同步 |
| `startAutoSync` | Function | 启动自动同步 |
| `stopAutoSync` | Function | 停止自动同步 |
| `getSyncConfig` | Function | 获取同步配置 |
| `SyncSettingsPanel` | Component | 同步设置面板 |

### 4.6 Prompt 模块

| 属性 | 值 |
|------|------|
| 职责 | AI 提示词生成与管理 |

#### 子域

##### base

基础提示词服务, 提供通用的提示词构建能力。

##### character

角色提示词子域, 生成角色相关的 AI 提示词。

##### scene

场景提示词子域, 生成场景相关的 AI 提示词。

##### video

视频提示词子域, 生成视频相关的 AI 提示词。

##### builder

提示词构建器子域, 提供 quick-mode 快速构建。

##### server-prompts

服务端提示词子域, 提供 LLM 帧提示词生成。

##### beat-image

Beat 图片提示词子域。

##### presentation

UI 组件子域。

| 组件 | 说明 |
|------|------|
| ConfigCheckBanner | 配置检查横幅, 显示 API 配置状态 |
| ModelSelector | 模型选择器, 选择 AI 模型 |

#### 公共 API

| 导出 | 类型 | 说明 |
|------|------|------|
| `promptService` | Service | 提示词服务 |
| `useModelSelection` | Hook | 模型选择 Hook |
| `ConfigCheckBanner` | Component | 配置检查横幅 |
| `ModelSelector` | Component | 模型选择器 |

### 4.7 Character 模块

| 属性 | 值 |
|------|------|
| 职责 | 角色管理 |

#### 子域

##### hooks

| Hook | 说明 |
|------|------|
| `useCharacterImage` | 角色图片生成和管理 |
| `useOutfitManagement` | 服装方案管理 |

##### services

| 服务 | 说明 |
|------|------|
| `characterService` | 角色 CRUD, 查询, 服装方案管理 |

##### presentation

| 组件 | 说明 |
|------|------|
| 角色列表 UI | 角色卡片列表, 支持搜索和筛选 |

#### 公共 API

| 导出 | 类型 | 说明 |
|------|------|------|
| `characterService` | Service | 角色服务 |
| `useCharacterImage` | Hook | 角色图片 Hook |
| `useOutfitManagement` | Hook | 服装管理 Hook |

### 4.8 Scene 模块

| 属性 | 值 |
|------|------|
| 职责 | 场景管理 |

#### 子域

##### hooks

| Hook | 说明 |
|------|------|
| `useSceneImage` | 场景图片生成和管理 |

##### services

| 服务 | 说明 |
|------|------|
| `sceneService` | 场景 CRUD, 查询 |

##### presentation

| 组件 | 说明 |
|------|------|
| 场景列表 UI | 场景卡片列表, 支持搜索和筛选 |

#### 公共 API

| 导出 | 类型 | 说明 |
|------|------|------|
| `sceneService` | Service | 场景服务 |
| `useSceneImage` | Hook | 场景图片 Hook |

### 4.9 Persistence 模块

| 属性 | 值 |
|------|------|
| 职责 | 数据持久化保护 |

#### 子域

##### services

| 服务 | 说明 |
|------|------|
| `transactionalDelete` | 事务性删除, 确保关联数据一致性 |

##### hooks

| Hook | 说明 |
|------|------|
| `useAutoSave` | 自动保存, 定期保存未提交的变更 |
| `usePersistenceGuard` | 持久化守卫, 防止数据丢失 |

#### 公共 API

| 导出 | 类型 | 说明 |
|------|------|------|
| `useAutoSave` | Hook | 自动保存 Hook |
| `usePersistenceGuard` | Hook | 持久化守卫 Hook |
| `transactionalDelete` | Service | 事务性删除 |

### 4.10 模块总览

| 模块 | 子域数 | 状态 |
|------|--------|------|
| Story | 5 | 活跃 |
| Video | 4 | 活跃 |
| Shot | 7 | 活跃 |
| Asset | 5 | 活跃 |
| Sync | 2 | 活跃 |
| Prompt | 8 | 活跃 |
| Character | 3 | 活跃 |
| Scene | 3 | 活跃 |
| Persistence | 2 | 活跃 |

---

## 5. Infrastructure 层详解

Infrastructure 层提供技术基础设施实现, 包括 DI 容器、AI 提供者、存储、网络、API 客户端等。模块层通过 DI 容器或 `@/shared/` 代理导出访问基础设施, 不直接导入。

### 5.1 DI 容器 (container.ts)

- **位置**: `src/infrastructure/di/container.ts`
- **用途**: 依赖注入容器, 解耦模块层与基础设施层, 支持测试替换

#### 5 类 Token

| 类别 | 说明 | 示例 |
|------|------|------|
| **A. Domain Port 实现** | Port 接口的具体实现 | `videoProvider`, `imageProvider`, `textProvider`, `fileUploader`, `videoTaskStorage`, `characterStorage`, `sceneStorage`, `storyStorage`, `syncStorage` |
| **B. 有状态服务** | 需要单例和测试替换的服务 | `eventBus`, `apiClient`, `imageApi`, `videoApi`, `textApi`, `preferencesStorage` |
| **C. Storage 实例** | 有状态存储模块, 模块无法直接导入 | `versionStorage`, `elementStorage`, `videoCacheStorage`, `imageCacheStorage`, `collectionStorage`, `storyboardStorage`, `importExportStorage`, `templateStorage`, `autoSaveStorage`, `errorLogStorage`, `sessionStorage` |
| **D. Repository 实例** | Drizzle ORM 仓库 | `mediaAssetRepository` |
| **E. 懒加载模块** | 避免循环依赖的延迟加载 | `elementManager`, `referenceEngine` |

#### DI Token 准则

仅注册以下类型的 Token:

1. **Port 接口实现** — 模块定义 Port, 基础设施提供实现
2. **有状态服务** — 需要单例管理和测试替换
3. **需测试替换的依赖** — 方便在测试中 `overrideToken()`

> **注意**: `@/shared/*` 的纯函数 (如 `resolveImageUrl`、`mapUserFacingError`) 应直接导入, **不走 DI**。来自 `@/infrastructure/*` 的纯函数通过 `@/shared/` 代理导出 (如 `@/shared/db-core`、`@/shared/api-config`、`@/shared/video-cache`、`@/shared/outfit`、`@/shared/sql-safety`、`@/shared/model-capabilities`), 不走 DI。

#### 使用方式

```typescript
import { container } from "@/infrastructure/di";

const storage = container.videoTaskStorage;
const result = await storage.create(task);
```

#### 添加新 Token 的流程

1. 确定所属类别 (A-E)
2. 如果是类别 E, 添加注释说明为什么模块不能直接导入
3. 在 `container.ts` 中注册
4. 在模块中通过 `container.xxx` 访问

### 5.2 AI Providers (ai-providers/)

AI 提供者模块, 统一管理多供应商 AI API 调用。

| 文件 | 说明 |
|------|------|
| `core.ts` | 统一 API 调用入口, 错误分类, 重试逻辑 |
| `model-adapter/` | 模型适配器 (支持多供应商: Kling/Runway/Luma/Pika/Vidu/MiniMax 等) |
| `model-capabilities.ts` | 模型能力查询 (支持的视频/图片/文本模型列表) |
| `api-cache.ts` | API 响应缓存 |
| `api-config/` | API 配置管理 (detect/templates/storage/server/init) |
| `config.ts` | 配置状态管理 |
| `config-status.ts` | 配置状态检查 |
| `errors.ts` | 错误分类 |
| `image.ts` | 图片生成接口 |
| `video.ts` | 视频生成接口 |
| `text.ts` | 文本生成接口 |
| `utils.ts` | 工具函数 |
| `image-normalization.ts` | 图片标准化 |
| `offline-queue.ts` | 离线队列 (网络恢复后自动重试) |
| `outfit-synthesis.ts` | 服装合成 |
| `enhanced-video.ts` | 增强视频生成 |
| `video-service.ts` | 视频服务 |
| `multi-api.ts` | 多 API 支持 |
| `providers/` | 内置 AI 供应商插件 |

#### 错误分类

使用结构化错误码 + 正则回退, **不依赖** `message.includes("timeout")` 等子串匹配:

```typescript
const ERROR_CODE_PATTERNS = [
  { category: "timeout", codes: ["TIMEOUT", "ETIMEDOUT"], patterns: [/timeout/i] },
  { category: "rate_limit", codes: ["RATE_LIMITED", "429"], patterns: [/rate[\s_-]?limit/i] },
];
export function classifyError(errorCode?: string, errorMessage?: string): ErrorCategory { ... }
```

9 种错误类别: `timeout` | `rate_limit` | `quota` | `invalid_params` | `network` | `server_error` | `database_busy` | `auth` | `unknown`

### 5.3 Storage (storage/)

存储模块, 基于 SQLite (better-sqlite3) 的持久化实现。

| 文件/目录 | 说明 |
|-----------|------|
| `sqlite-core.ts` | SQLite 核心操作 (`withRetry`, `safeQuery`, `safeRun`, `safeTransaction`, WAL 模式配置) |
| `core.ts` | 基础 Storage 类, 变更追踪注册 |
| `video-tasks/` | 视频任务存储 (JSON Container: config/provider/media_refs/tracking, parseConfig/parseProvider/parseMediaRefs/parseTracking) |
| `characters/` | 角色存储 |
| `scenes/` | 场景存储 |
| `stories/` | 故事存储 |
| `elements/` | 元素存储 |
| `video-cache/` | 视频缓存存储 (服务层已迁移到 `@/shared/file-http` 统一通信层) |
| `image-cache/` | 图片缓存存储 (服务层已迁移到 `@/shared/file-http` 统一通信层) |
| `versions/` | 版本存储 |
| `collections/` | 集合存储 |
| `storyboard/` | 故事板存储 |
| `templates/` | 模板存储 |
| `import-export/` | 导入导出存储 |
| `auto-save/` | 自动保存存储 |
| `error-logs/` | 错误日志存储 |
| `sessions/` | 会话存储 |

#### JSON Container 模式

易变字段存储在 JSON 列中, 避免 ALTER TABLE:

| Container | 用途 | 解析函数 |
|-----------|------|----------|
| `config` | 任务配置 | `parseConfig()` |
| `provider` | 提供者信息 | `parseProvider()` |
| `media_refs` | 媒体引用 | `parseMediaRefs()` |
| `tracking` | 追踪信息 | `parseTracking()` |
| `camera` | 摄像机参数 | — |
| `generation` | 生成信息 | — |
| `meta` | 元数据 | — |
| `appearance` | 外貌特征 | — |

#### 安全操作模式

```typescript
import { withRetry } from "@/shared/db-core";
await withRetry(() => storage.run(sql, params));
```

```typescript
import { parseConfig, parseProvider, parseMediaRefs, parseTracking } from "@/infrastructure/storage/video-tasks/json-schemas";

const config = parseConfig(record.config);
const provider = parseProvider(record.provider);
```

### 5.4 Network (network/)

网络模块, 提供网络状态监控、熔断器和重试机制。

| 文件 | 说明 |
|------|------|
| `network-monitor.ts` | 网络状态监控 (在线/离线检测, HMR 保护 `window.__NETWORK_MONITOR_STATE__`) |
| `circuit-breaker.ts` | 熔断器 (CLOSED/OPEN/HALF_OPEN 三态) |
| `retry-executor.ts` | 重试执行器 (指数退避, 最大重试次数) |
| `profiles.ts` | 网络配置档案 |
| `types.ts` | 网络类型定义 |

#### 熔断器状态机

```
         ┌──────────────────────────────────────────┐
         │                                          │
         ▼                                          │
    ┌─────────┐  连续失败达阈值  ┌──────────┐        │
    │ CLOSED  │ ──────────────→ │   OPEN   │        │
    │ (正常)   │                │ (熔断)    │       │
    └─────────┘                 └────┬─────┘       │
         ▲                          │ 冷却时间后    │
         │                          ▼              │
         │                    ┌───────────┐        │
         │  探测成功           │ HALF_OPEN │        │
         │ ─────────────────  │ (半开)     │        │
         │                    └─────┬─────┘        │
         │                          │ 探测失败      │
         └──────────────────────────┘──────────────┘
```

### 5.5 API (api/)

| 文件 | 说明 |
|------|------|
| `client.ts` | HTTP API 客户端 (请求拦截, 错误处理, `ELECTRON_APP_HEADERS`) |

#### 请求头规范

所有 API 请求必须携带 `X-Electron-App` 头:

```typescript
import { ELECTRON_APP_HEADERS } from "@/config/constants";
fetch(url, { headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" } });
```

### 5.6 Video Utils (video-utils/)

| 文件 | 说明 |
|------|------|
| `video-codec.ts` | 视频编解码检测 (H.264/H.265/VP9/AV1) |
| `video-frame-extractor.ts` | 视频帧提取 (事件监听器泄漏已修复) |

### 5.7 Database (database/)

Drizzle ORM 仓库层, 提供类型安全的数据访问。

| 文件 | 说明 |
|------|------|
| `character-repository.ts` | Drizzle ORM 角色仓库 |
| `element-repository.ts` | Drizzle ORM 元素仓库 |
| `media-asset-repository.ts` | Drizzle ORM 媒体资产仓库 |

### 5.8 Secure Storage

| 文件 | 说明 |
|------|------|
| `secure-storage.ts` | electron-store 加密存储 (API 密钥) |
| `key-storage/key-storage.ts` | keyStorage 统一入口（v0.12.1+） |
| `key-storage/strategies/safe-storage.strategy.ts` | safeStorage + AES-256-GCM 策略（含 writeChain 互斥） |
| `key-storage/strategies/plaintext-fallback.strategy.ts` | 回退策略（fail-close，拒绝明文 JSON） |
| `handlers/config.ts` | `saveConfig` (sync, 抛错) / `saveConfigAsync` (async, keyStorage 持久化) |

API 密钥采用**双层存储**：元数据存于 `electron-store`，敏感 apiKey 存于 `keyStorage`（`$secure:` 引用机制）。前端 `saveConfig` → `/api/config/set` → `applyConfigValue` → `saveConfigAsync` → `keyStorage.save`。

**`saveConfigAsync`** 会提取 provider 中的 apiKey 字段，存入 keyStorage，并在 config 中替换为 `$secure:providerId` 引用。`loadConfigAsync` 在运行时反向解析引用为真实 apiKey。`saveConfig` (sync) 检测到明文 apiKey 会 throw Error（R182 回归规则）。

绝不存储在 localStorage 或使用 XOR 混淆。

---

## 6. Electron 主进程详解

### 6.1 应用生命周期

#### 入口文件

| 文件 | 用途 | 说明 |
|------|------|------|
| `main.ts` | 生产入口 | `uncaughtException`/`unhandledRejection` 不调用 `app.exit()`, 仅日志 |
| `main-dev.ts` | 开发入口 | `minLevel: "debug"`, DevTools 自动打开 |
| `main-common.ts` | 共享逻辑 | `createWindow`, `staticServer`, `gracefulShutdown`, config IPC |

#### 崩溃恢复

| 场景 | 处理方式 |
|------|----------|
| Renderer 进程崩溃 | `render-process-gone` → 设置 `isRendererCrashed` 标志 → 销毁窗口 |
| 窗口全部关闭 | `window-all-closed` 检查 `isRendererCrashed`: 为 true 则 1 秒后自动重建窗口 |
| 用户主动关闭 | 触发 `app.quit()` |
| GPU 进程崩溃 | `child-process-gone` (type=GPU) → `webContents.reload()` |
| 其他子进程退出 | 记录 warn 级别日志 |

#### 优雅关闭序列

```
before-quit
    │
    ▼
gracefulShutdown()
    │ → 销毁窗口
    │ → 关闭静态服务器
    ▼
stopApiServer()
    │ → destroy 所有追踪连接
    │ → 关闭 HTTP 服务器
    ▼
closeDatabase()
    │ → 关闭 SQLite 连接
    ▼
app.quit()
```

#### 关键原则

- `uncaughtException` 和 `unhandledRejection` **绝不**调用 `app.exit()` — 仅记录日志, 保持运行
- 桌面应用必须能存活瞬态错误 (网络超时、DB busy、IPC 故障)
- 仅 `SIGINT`、`SIGTERM` 和用户主动退出触发 `app.quit()`

### 6.2 IPC 权限系统

#### preload.ts 架构

`preload.ts` 是 IPC 桥接层, 提供权限检查、SQL 安全验证和速率限制。

#### 5 级权限

| 权限等级 | 说明 |
|----------|------|
| `READONLY` | 只读操作 |
| `READWRITE` | 读写操作 |
| `DANGEROUS` | 危险操作 |
| `SYSTEM` | 系统级操作 |
| `SECURE` | 安全操作 (API 密钥等) |

#### SQL 安全

| 防护 | 说明 |
|------|------|
| DDL 阻止 | DROP/ALTER/CREATE/TRUNCATE/ATTACH/DETACH 被阻止 |
| 注释剥离 | SQL 注释在 DDL 检测前被剥离, 防止绕过 |
| 参数化查询 | 所有查询使用参数化语句, 不使用字符串拼接 |

#### 速率限制

- 每个 IPC 通道独立计数
- 超出限制的请求被拒绝

#### 安全日志

`log:security` IPC 通道将 preload 安全事件转发到主进程日志。

### 6.3 HTTP API Server

| 文件 | 说明 |
|------|------|
| `api-server.ts` | Re-export from `api/server.ts` (向后兼容入口) |
| `api/server.ts` | HTTP 服务器启动/停止, 请求分发, Schema 验证 |
| `api/types.ts` | Route, RouteHandler, ApiResponse 类型定义 (Zod schema 支持) |
| `api/middleware.ts` | 速率限制, CORS, X-Electron-App 认证, 连接追踪 |
| `api/schemas.ts` | Zod schemas for all route request bodies (40+ schemas) |
| `api/routes.ts` | 路由注册表 (合并所有路由组) |
| `api/route-groups/` | 路由处理器组 |

#### 路由组

| 路由组 | 说明 |
|--------|------|
| `core-routes.ts` | 配置、上传、导出、测试连接、同步路由 |
| `generation-routes.ts` | 图片/视频/文本生成、故事生成路由 |
| `plugin-routes.ts` | 插件管理路由 (列表、添加、删除、重载等) |
| `shot-routes.ts` | 镜头参考、一致性检查、视觉一致性路由 |
| `storyboard-routes.ts` | 故事板生成、视频恢复、批量保存路由 |

#### 连接追踪

```typescript
const activeConnections: Set<net.Socket> = new Set();
```

关闭时先 `destroy()` 所有追踪连接, 再 `server.close()`, 防止 keep-alive 连接阻塞进程退出。

#### API 路由

| 路由 | 说明 |
|------|------|
| `/api/config` | 配置管理 |
| `/api/validate` | 验证接口 |
| `/api/test-connection` | 连接测试 |
| `/api/secure-config` | 安全配置 (API 密钥) |
| `/api/generate/*` | AI 生成接口 |
| `/api/plugins/*` | 插件管理接口 |

### 6.4 数据库架构

#### schema-builder.ts — 声明式 Schema 构建

**7 字段基列**: 所有业务表自动包含:

| 列名 | 类型 | 说明 |
|------|------|------|
| `owner_id` | TEXT | 所有者 ID |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |
| `is_deleted` | INTEGER | 软删除标记 |
| `deleted_at` | TEXT | 删除时间 |
| `version` | INTEGER | 版本号 (乐观锁) |
| `sync_id` | TEXT | 同步 ID |

**JSON Container 模式**: 易变字段存储在 JSON 列中, 避免 ALTER TABLE:

| Container | 用途 |
|-----------|------|
| `config` | 任务配置 |
| `provider` | 提供者信息 |
| `media_refs` | 媒体引用 |
| `tracking` | 追踪信息 |
| `camera` | 摄像机参数 |
| `generation` | 生成信息 |
| `meta` | 元数据 |
| `appearance` | 外貌特征 |

**SCHEMA_FEATURES**: 控制哪些表组被创建:

| Feature Group | 说明 |
|---------------|------|
| `core` | 核心表 |
| `video` | 视频相关表 |
| `sync` | 同步相关表 |
| `templates` | 模板相关表 |
| `assets` | 资产相关表 |

**TableDef 结构**:

```typescript
interface TableDef {
  name: string;
  columns: ColumnDef[];
  featureGroup: string;
  constraints: string[];
}
```

#### db-schema.ts

实际表定义, 使用 `generateTableSQL(tableDef)` 生成 SQL。

#### migrations.ts

迁移框架:

| 属性 | 值 |
|------|------|
| `CURRENT_SCHEMA_VERSION` | 4 |
| `MIGRATIONS` | v3 (添加 local_video_path 等列), v4 (添加 collection_assets 时间戳列) |
| 事务包裹 | `db.transaction()` |
| `MigrationDb` 接口 | 要求 `transaction(fn: () => void): void` 方法 |

#### db-connection.ts

连接管理:

| 配置 | 值 |
|------|------|
| WAL 模式 | `journal_mode = WAL` |
| busy_timeout | 配置化 |
| 外键约束 | 启用 |

#### JSON Container 操作模式

**更新模式** — 使用 `json_set` + `COALESCE`:

```sql
UPDATE table_name
SET container = json_set(COALESCE(container, '{}'), '$.key', ?)
WHERE id = ?
```

**解析模式** — 使用 `parseXxx()` 函数:

```typescript
import { parseConfig, parseProvider, parseMediaRefs, parseTracking } from "@/infrastructure/storage/video-tasks/json-schemas";

const config = parseConfig(record.config);
const provider = parseProvider(record.provider);
```

### 6.5 安全系统

| 组件 | 说明 |
|------|------|
| `ssrf-guard/` | SSRF 防护 (IPv4 私有地址检测, IPv6 link-local 检测) |
| `secure-config handler` | electron-store 加密存储 API 密钥 |
| `X-Electron-App` 头 | 所有 API 请求必须携带, 服务端验证 |
| 错误日志清洗 | API 密钥模式被脱敏 |

#### IPv6 link-local 检测

使用首 hextet 解析, 而非字符串匹配:

```typescript
(value & 0xffc0) === 0xfe80
```

### 6.6 插件系统

| 文件 | 说明 |
|------|------|
| `plugin-registry.ts` | 插件注册表 |
| `providers/` | AI 供应商插件 (anthropic.ts, openai.ts 等) |
| `user-plugin-loader.ts` | 用户声明式插件加载器 |
| `user-plugin-adapter.ts` | 用户声明式插件适配器 |
| `code-plugin-loader.ts` | 代码插件加载器 (进程隔离) |
| `plugin-process-manager.ts` | 代码插件进程管理器 |
| `plugin-worker.ts` | 代码插件 worker 进程入口 |
| `plugin-spec.schema.json` | 插件规范 JSON Schema |

**插件类型**:

| 插件类型 | 格式 | 位置 | 加载器 |
|----------|------|------|--------|
| 内置 | TypeScript class | `electron/src/plugins/providers/` | 直接导入 |
| 声明式 | `.plugin.json` | `~/PrismCraft/UserPlugins/` | `UserPluginAdapter` |
| 代码 | `.plugin.js` | `~/PrismCraft/CodePlugins/` | `CodePluginAdapter` (进程隔离) |

### 6.7 日志系统

| 文件 | 说明 |
|------|------|
| `logger.ts` | 核心日志模块 (命名空间, 多传输, 结构化日志) |

#### Transport

| Transport | 说明 |
|-----------|------|
| `ConsoleTransport` | 控制台输出 |
| `FileTransport` | 文件输出 |

#### 日志文件位置

| 环境 | 路径 |
|------|------|
| 生产 | `%APPDATA%/ai-animation-studio/logs/app-YYYY-MM-DD.log` |
| 开发 | `%APPDATA%/ai-animation-studio/logs/dev-YYYY-MM-DD.log` |

#### 日志轮转

| 参数 | 值 |
|------|------|
| 触发大小 | 10MB |
| 最大文件数 | 5 |
| 最旧文件 | 删除 |
| 刷新间隔 | 5 秒 |
| 立即刷新条件 | 队列 > 100 条 |

#### 方法签名

```typescript
logger.info(message: string, context?: LogContext)   // 2 参数
logger.warn(message: string, context?: LogContext)   // 2 参数
logger.error(message: string, error?: Error, context?: LogContext)  // 3 参数
```

#### 初始化

| 入口 | minLevel | filename |
|------|----------|----------|
| `main.ts` | `"info"` | `"app"` |
| `main-dev.ts` | `"debug"` | `"dev"` |

### 6.8 协议注册

| 文件 | 说明 |
|------|------|
| `protocol.ts` | 自定义协议注册 |

| 协议 | 用途 |
|------|------|
| `app://` | 静态资源访问 |
| `vcache://` | 视频缓存访问 |

**路径安全**: `isPathAllowed` 检查, 路径遍历防护。

---

## 7. Shared 层详解

Shared 层提供跨切面 UI 组件、工具函数和错误处理。**Shared 层依赖 Domain 层**, 并通过代理导出目录从 Infrastructure 层重导出纯函数。

### 7.1 事件系统

| 文件 | 说明 |
|------|------|
| `event-bus.ts` | 发布/订阅模式 (`on`/`off`/`emit`), 类型安全事件 |
| `event-types.ts` | 事件类型定义 |

### 7.2 错误处理

| 文件 | 说明 |
|------|------|
| `error-logger.ts` | 结构化错误日志 (级别: debug/info/warn/error, 上下文传递, 错误信息提取) |
| `error-handler.ts` | 统一错误处理 (`createAppError`, `handleClientError`, `getErrorMessage`) |

### 7.3 UI 组件

#### presentation/

| 组件 | 说明 |
|------|------|
| `Toast` | 通知提示 |
| `Sidebar` | 侧边栏 |
| `ErrorBoundary` | 错误边界 (包裹所有页面级组件) |
| `ThemeProvider` | 主题提供者 |
| `NetworkStatusAlert` | 网络状态告警 |
| `SaveStatusIndicator` | 保存状态指示器 |
| `OnboardingGuide` | 新手引导 |

#### ui/

基础 UI 组件, 基于 **@base-ui/react** 构建。

### 7.4 Hooks

| Hook | 说明 |
|------|------|
| `use-global-keyboard-actions.ts` | 全局键盘快捷键 |
| `use-memory-monitor.ts` | 内存监控 (60 秒间隔, 低内存警告) |
| `use-current-time.ts` | 当前时间 hook (`useSyncExternalStore`, 60 秒更新, 解决 React Compiler purity 问题) |

### 7.5 工具函数

| 文件 | 说明 |
|------|------|
| `utils/image-url.ts` | 图片 URL 解析 |
| `utils/toast-bridge.ts` | 非 React 代码的 Toast 通知桥接 (Zustand stores、轮询引擎等使用 `emitToast()` 而非 `useToastHelpers`) |
| `utils/utils.ts` | 通用工具函数 |
| `utils/preferences.ts` | Hydration 安全的偏好存储 (`usePreference`, `preferencesStorage`) |

### 7.6 代理导出模块

Shared 层的代理导出目录, 允许模块层间接访问 Infrastructure 纯函数:

| 模块 | 来源 | 导出内容 |
|------|------|----------|
| `@/shared/db-core` | `infrastructure/storage/sqlite-core` | `withRetry`, `safeQuery`, `safeRun`, `safeTransaction` |
| `@/shared/api-config` | `infrastructure/ai-providers/api-config` | API 配置查询函数 |
| `@/shared/video-cache` | `infrastructure/storage/video-cache` | 视频缓存操作 |
| `@/shared/outfit` | `infrastructure/ai-providers/outfit-synthesis` | 服装合成函数 |
| `@/shared/sql-safety` | `infrastructure/storage/sql-sanitizer` | `buildSafeUpdate`, `buildSafeDelete`, `sanitizeIdentifier`, `sanitizeTable` |
| `@/shared/model-capabilities` | `infrastructure/ai-providers/model-capabilities` | `getModelCapabilities`, `getVideoGenerationStrategy`, `ImageSizePurpose` |
| `@/shared/user-facing-error` | `shared/utils/user-facing-error` | `mapUserFacingError` — 用户友好错误消息映射 |
| `@/shared/file-http` | `shared/file-http` | `writeFile`, `readFile`, `getFileInfo`, `getCacheDirectory`, `getDiskSpace`, `fileExists`, `deleteFile` — 统一文件操作通信层 (HTTP 优先 + IPC 回退) |

#### 7.6.1 统一文件操作通信层 (`@/shared/file-http`)

`src/shared/file-http/index.ts` 提供统一的文件操作 API，采用 **HTTP 优先 + IPC 回退** 双轨设计：

- **HTTP 优先**：通过 `http://localhost:${API_SERVER_PORT}/api/*` 调用主进程 HTTP API Server，享受流式传输、标准状态码、Zod schema 校验等优势
- **IPC 回退**：当 HTTP API Server 不可用（启动早期、降级模式）时，自动回退到 `window.electronAPI` IPC 通道

**公开函数** (7 个):

| 函数 | 说明 | HTTP 路由 |
|------|------|----------|
| `writeFile` | 写入文件 (受 `MAX_WRITE_SIZE = 100MB` 限制) | `POST /api/file/write` |
| `readFile` | 读取文件内容 | IPC 回退 |
| `getFileInfo` | 查询文件元信息 | IPC 回退 |
| `getCacheDirectory` | 查询缓存目录路径 | `GET /api/file/cache-directory` |
| `getDiskSpace` | 查询磁盘可用空间 | `GET /api/file/disk-space` |
| `fileExists` | 判断文件是否存在 | IPC 回退 |
| `deleteFile` | 删除文件 | IPC 回退 |

> 测试用 `_resetHttpCache` 不属于公开 API。

**已迁移的调用方**: `src/modules/video/cache/services/video-cache.ts` 与 `image-cache.ts` 已全部改用 `@/shared/file-http`，不再直接调用 `window.electronAPI` 或 fetch。

---

## 8. App 层详解

App 层是 React Router 页面和布局, 消费模块层通过 Context 提供的功能。

### 8.1 路由配置

路由在 `src/router.tsx` 中集中定义, 使用 `createBrowserRouter` + `React.lazy` 懒加载:

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 首页 | 项目入口 |
| `/story` | 故事编辑页 | `StoryProvider` + `BeatEditor` |
| `/story/beat/:beatId` | Beat 详情页 | 动态路由, `BeatDetailClient` |
| `/characters` | 角色页 | 角色管理 |
| `/scenes` | 场景页 | 场景管理 |
| `/quick-generate` | 快速生成页 | 视频快速生成 |
| `/asset-library` | 资产库页 | 资产管理 |
| `/settings` | 设置页 | API 配置, 插件管理 |
| `/video-tasks` | 视频任务页 | 视频任务管理 |

### 8.2 关键组件

| 组件 | 说明 |
|------|------|
| `StoryProvider` | 故事上下文提供者 (Zustand store, `handleSave`, `incrementSuppressDirtyCount`) |
| `MigrationInitializer` | 数据迁移初始化 |
| `BeatDetailClient` | Beat 详情客户端 (`useBeatDetail` hook) |
| `RootLayout` | 根布局 (侧边栏, 路由出口) |

---

## 9. 构建与部署

### 9.1 构建脚本 (build-electron.ps1)

| 特性 | 说明 |
|------|------|
| 锁文件机制 | `.build-electron.lock` (中断恢复) |
| 双重 try/finally | 内层确保 API 目录恢复, 外层确保任何异常都恢复 |

#### 构建流程

```
设置 BUILD_TARGET=electron
    │
    ▼
vite build (base: "./", outDir: "out")
    │ → rolldown code splitting
    │ → 按模块分 chunk (vendor-react, app-story, app-video, ...)
    │
    ▼
tsc electron (electron/tsconfig.json)
    │
    ▼
复制资源 (docs 等)
    │
    ▼
electron-builder
    │
    ▼
NSIS 安装程序 (oneClick=false, 允许自定义安装目录)
```

### 9.2 代码分割策略

Vite 8 使用 rolldown 的 `codeSplitting` API 在 `vite.config.ts` 中配置:

| Chunk | 内容 | 优先级 |
|-------|------|--------|
| `vendor-react` | react, react-dom, react-router, scheduler | 30 |
| `vendor-state` | zustand, @tanstack/react-query | 25 |
| `vendor-ui` | lucide-react, clsx, tailwind-merge, class-variance-authority | 25 |
| `app-infra-core` | src/infrastructure/ | 20 |
| `app-shared` | src/shared/ | 18 |
| `app-domain` | src/domain/ | 18 |
| `app-story` | src/modules/story/ | 15 |
| `app-video` | src/modules/video/ | 15 |
| `app-shot` | src/modules/shot/ | 15 |
| `app-character` | src/modules/character/ | 15 |
| `app-scene` | src/modules/scene/ | 15 |
| `app-infra` | asset, sync, persistence modules | 15 |
| `app-prompt` | src/modules/prompt/ | 15 |
| `vendor-misc` | Other node_modules | 10 |
| `common` | Shared dependencies (minShareCount: 2) | 5 |

所有页面路由使用 `React.lazy()` 进行代码分割 — 页面仅在导航到时加载。

### 9.3 冒烟测试 (smoke-test.ps1)

10 项检查:

| # | 检查项 |
|---|--------|
| 1 | `index.html` 存在 |
| 2 | `main.js` 存在 |
| 3 | `preload.js` 存在 |
| 4 | `docs` 目录存在 |
| 5 | `api-server` 引用存在 |
| 6 | `database` 引用存在 |
| 7 | `IPC_PERMISSIONS` 引用存在 |
| 8 | 无 `.ts` 源文件 |
| 9 | 关键资源完整性 |
| 10 | better-sqlite3 native module 存在 |

### 9.4 架构检查 (check-architecture.mjs)

| 检查项 | 说明 |
|--------|------|
| DDD 违规检测 | 检测依赖方向违规 |
| 裸 SQL 检测 | 检测未使用参数化的 SQL |
| 深路径导入检测 | 检测 `@/modules/*/*/*` 导入 |

### 9.5 模块 API 一致性检查 (check-module-api-consistency.mjs)

验证 `MODULE.md` ↔ `index.ts` 同步:
- `MODULE.md` 中声明的公共 API 是否在 `index.ts` 中导出
- `index.ts` 中导出的 API 是否在 `MODULE.md` 中声明

---

## 10. 测试策略

### 10.1 框架与配置

| 配置项 | 值 |
|--------|------|
| 框架 | Vitest 4 + @testing-library/react + happy-dom/jsdom |
| 环境 | `jsdom` |
| 进程池 | `pool: "forks"` |
| 最大工作线程 | `maxWorkers: 2` |
| 覆盖率 Provider | V8 |
| 覆盖率阈值 | 80% (branches/functions/lines/statements) |
| 按文件强制 | `perFile: true` |

### 10.2 测试约定

#### 文件位置

| 类型 | 路径模式 |
|------|----------|
| Services | `src/modules/{module}/{subdomain}/services/__tests__/{service}.test.ts` |
| Hooks | `src/modules/{module}/{subdomain}/hooks/__tests__/{hook}.test.ts` |
| Components | `src/modules/{module}/presentation/__tests__/{Component}.test.tsx` |

#### Mock 策略

```typescript
// 1. Hoisted mocks (必须在模块导入前存在)
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }));

// 2. Module mocks
vi.mock("@/infrastructure/di", () => ({ container: { ...mockFn } }));

// 3. Import SUT (被测系统)
import { ComponentName } from "../ComponentName";

// 4. Factory functions
function buildProps(overrides = {}) { return { ...defaults, ...overrides }; }

// 5. Test suite
describe("ComponentName", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("does something", () => { ... });
});
```

#### Mock 要点

- 使用 `vi.hoisted()` 创建必须在模块导入前存在的 mock 函数
- 使用 `vi.mock()` 进行模块级 mock (DI container、外部包、UI 组件)
- 使用 `overrideToken()` 从 DI 替换特定 container token
- Mock UI 组件 (`@/shared/presentation/*`) 为简单 HTML 元素
- Mock `react-router-dom` Link 为 `<a>` 标签
- 测试文件允许 `@/infrastructure/*` 导入 (warn 级别, 非 error)

### 10.3 覆盖范围

| 层 | 覆盖范围 |
|----|----------|
| domain | schemas, services, types, utils |
| infrastructure | di, storage, ai-providers, network, video-utils |
| modules | `**/services/**` |
| shared | error-handler, error-logger, event-bus, utils |

### 10.4 E2E 测试

两种模式:

1. **Browser mode** (`npx playwright test`) — 使用 `electron-mock.ts` 在 Chromium 中模拟 Electron API
2. **Electron mode** (`npx playwright test --config=playwright.electron.config.ts`) — 启动真实 Electron 应用

**E2E 选择器策略**: 使用 `data-testid` 属性进行元素选择，而非 placeholder 文本或 CSS 选择器。命名规范：`{entity}-{action}-{element}`（如 `character-name-input`、`story-title-input`）。

---

## 11. ESLint 与代码质量

### 11.1 ESLint 配置 (eslint.config.mjs)

ESLint 9 flat config, 使用以下插件:

| 插件 | 用途 |
|------|------|
| `typescript-eslint` | TypeScript 特定规则 |
| `eslint-plugin-react` | React 规则 |
| `eslint-plugin-react-hooks` | Hooks 规则 |

#### DDD 层级规则

| 规则 | 说明 |
|------|------|
| domain 禁止 | `@/infrastructure/*`, `@/modules/*` |
| shared 禁止 | `@/modules/*`; `@/infrastructure/*` (代理导出目录除外: db-core, api-config, video-cache, outfit, sql-safety, model-capabilities, file-http) |
| modules 禁止 | `@/infrastructure/*` 子域 (仅允许 `@/infrastructure/di`) |
| 跨模块深路径 | `@/modules/*/*/*` 被阻止 |
| 测试文件 | infrastructure 导入为 warn 级别 |

#### 废弃导入模式

| 模式 | 说明 |
|------|------|
| `@/types` | 已弃用, 使用 `@/domain/schemas` |
| `@/lib` | 已全部迁移, 使用 `@/modules/*`、`@/infrastructure/*` 或 `@/shared/*` |
| `@/application/services` | 已弃用, 直接从各模块导入服务 |
| `@/application/hooks` | 已弃用, 直接从各模块导入 hooks |
| `@/components` | 已迁移, 使用 `@/shared/presentation` 或各模块的 `presentation/` |

#### 关键规则

| 规则 | 级别 | 说明 |
|------|------|------|
| `@typescript-eslint/no-explicit-any` | error (生产) / warn (测试) | 类型安全 |
| `@typescript-eslint/no-unused-vars` | warn | 死代码检测 |
| `no-console` | warn (允许 warn/error/info/debug) | 应改用 logger |
| `no-restricted-imports` | error | DDD 层级约束 |
| `react-hooks/rules-of-hooks` | error | Hooks 规范 |
| `eqeqeq` | error | 严格相等 |
| `@typescript-eslint/consistent-type-imports` | error | 类型导入规范 |
| `react/no-unescaped-entities` | warn | JSX 转义 |

---

## 12. 已知技术债务与路线图

### 12.1 已清理（2026-06-20）

| 问题 | 修复 |
|------|------|
| `asarUnpack: "out/**/*"` 解包全部前端代码 | 移除，Electron patched `fs` 可直接读取 asar 内文件 |
| `Module._resolveFilename` monkey-patch 路径检测脆弱 | 提取到 `electron/src/shared-logic-resolve.ts`，改用 `fs.existsSync` 检测 |
| `local-file-storage.ts` 被 Vite 打包进浏览器 bundle | 添加 `nodeModuleBrowserStubs` Vite 插件，构建时替换为 browser mock |
| `@shared-logic` junction 无自动创建脚本 | 添加 `scripts/setup-shared-logic-symlink.mjs`，集成到 `postinstall` |
| `electron-pages.spec.ts` 死测试（无 Playwright config 能运行） | 重写测试，修复 `playwright.electron.config.ts` 匹配规则 |

### 12.2 国际化

| 指标 | 值 |
|------|------|
| i18n 键数 | 2000+ |
| 迁移状态 | ✅ 完成 — R56 全量迁移完成 |
| 覆盖范围 | app/pages + modules/presentation + shared/presentation + modules/hooks |
| 例外 | AI 提示词模板、error-codes 业务数据、日志文本 (按规则不迁移) |

### 12.3 测试覆盖率

| 层 | 当前状态 | 目标 |
|----|----------|------|
| domain | 覆盖较好 | 维持 80%+ |
| modules/services | 部分覆盖 | 补充到 80% |
| presentation | 覆盖不足 | 逐步补充 |

**阈值**: 80% (perFile), 重点补充 services 和 hooks。

### 12.3 依赖版本锁定

| 依赖 | 版本 | 说明 |
|------|------|------|
| better-sqlite3 | 12.10.0 | 精确版本, 不使用 `^` |
| Electron | 41.7.1 | — |
| React | 19.2.4 | — |
| React Router | 7.16+ | — |
| Vite | 8 | — |

### 12.4 WASM 包残留

| 包 | 来源 | 说明 |
|----|------|------|
| `@emnapi/core` | better-sqlite3 optional deps | 无法剪除, 无害 |
| `@emnapi/runtime` | better-sqlite3 optional deps | 无法剪除, 无害 |

---

## 13. AI 维护工作流

### 13.1 修改前必读

按以下顺序阅读模块契约, 总计约 130 行/子域:

| 顺序 | 文件 | 说明 |
|------|------|------|
| 1 | `MODULE.md` | 模块概览、子域表、公共 API 列表、边界约束 |
| 2 | `contract.json` | 子域名称、描述、依赖、公共 API、**不变量** |
| 3 | `.ai/modules/{module}.md` | 详细 AI 维护指南、修改规则、子域细节 |
| 4 | `index.ts` | 实际桶导出 |

> **注意**: 除非修改内部实现, 否则不要阅读内部实现文件。

### 13.2 修改检查清单

每次代码修改前, 逐项验证:

| # | 检查项 | 说明 |
|---|--------|------|
| 1 | **依赖方向** | 无 `shared→modules` 或 `domain→infrastructure` 导入 |
| 2 | **错误诚实** | 所有错误路径返回失败指示, 不静默吞错返回"成功" |
| 3 | **DI 必要性** | 仅 Port/有状态/测试替换在容器中, 纯函数走 `@/shared/` 代理导出 |
| 4 | **静态导入** | 无动态导入除非证明循环依赖 |
| 5 | **事件隔离** | 嵌套点击处理器使用 `stopPropagation()` |
| 6 | **Result 解包** | `Result<T>` 值在使用前必须解包 |
| 7 | **契约同步** | 公共 API 变更时更新 `MODULE.md` + `contract.json` + `index.ts` |
| 8 | **测试覆盖** | 新 services/hooks 有测试 |
| 9 | **验证通过** | `eslint` + `tsc` + `vitest` 全部通过 |

#### 常见反模式

##### 1. "安慰剂"错误处理

**错误** — AI 分析失败返回 `passed: true`:

```typescript
catch {
  return { passed: true, recommendation: "accept" };
}
```

**正确** — 诚实报告失败:

```typescript
catch {
  return { passed: false, recommendation: "adjust" };
}
```

##### 2. 脆弱的字符串匹配

**错误**:

```typescript
if (error.message.includes("timeout")) return "timeout";
if (error.message.includes("rate")) return "rate_limit";
```

**正确**:

```typescript
const ERROR_CODE_PATTERNS = [
  { category: "timeout", codes: ["TIMEOUT", "ETIMEDOUT"], patterns: [/timeout/i] },
  { category: "rate_limit", codes: ["RATE_LIMITED", "429"], patterns: [/rate[\s_-]?limit/i] },
];
export function classifyError(errorCode?: string, errorMessage?: string): ErrorCategory { ... }
```

##### 3. DI 容器滥用

**错误** — 纯函数走 DI:

```typescript
container.sanitizeIdentifier  // 纯函数, 无状态
container.sanitizeTable       // 纯函数, 无状态
```

**正确** — 直接导入:

```typescript
import { sanitizeIdentifier, sanitizeTable } from "@/shared/sql-safety";
```

##### 4. 不必要的动态导入

**错误**:

```typescript
const { saveVideoTask } = await import("@/modules/video/recovery");
```

**正确**:

```typescript
import { saveVideoTask } from "@/modules/video/recovery";
```

动态导入仅在以下场景可接受: 代码分割大型可选功能、避免已证实的循环依赖、懒加载重型模块。

##### 5. 嵌套点击事件传播

**错误**:

```tsx
<div onClick={onClick}>
  <button onClick={onDelete}>Delete</button>
</div>
```

**正确**:

```tsx
<div onClick={onClick}>
  <button onClick={(e) => { e.stopPropagation(); onDelete(e); }}>Delete</button>
</div>
```

##### 6. Result 类型未解包

**错误**:

```typescript
beat.keyframe = generateBeatKeyframe(...);  // 返回 Result<StoryBeatKeyframe>
```

**正确**:

```typescript
const result = generateBeatKeyframe(...);
if (result.ok) {
  beat.keyframe = result.value;
}
```

### 13.3 验证命令

每次代码修改后, 按顺序执行:

```bash
npx eslint src/                                        # 导入限制 + 代码风格
npx eslint electron/src/                               # Electron 代码风格
node scripts/check-architecture.mjs                    # DDD 违规 + contract.json 一致性
node scripts/check-module-api-consistency.mjs           # MODULE.md ↔ index.ts 同步
node scripts/validate-contracts.mjs                    # Contract 结构 + 不变量
npx tsc --noEmit                                       # 类型安全
npx tsc -p electron/tsconfig.json --noEmit             # Electron 类型安全
npx tsc -p tsconfig.test.json --noEmit                 # 测试类型安全
npx vitest run                                         # 单元测试
```

或使用完整验证:

```bash
npm run validate:full
```

---

## 14. 核心数据流详解

### 14.1 故事创作完整流程

用户从创建故事到生成视频的完整数据流：

1. **创建故事**: 用户在 /story 页面点击"新建故事" → storyService.create() → container.storyStorage.create() → SQLite INSERT → 返回 Story 对象
2. **编辑 Beat**: 用户在 BeatEditor 中编辑描述/角色/场景 → useStoryState 管理 beats 数组 → 自动保存触发 useAutoSave → storyService.update() → SQLite UPDATE
3. **生成关键帧**: 用户点击"生成关键帧" → useKeyframeGenerator hook → container.imageProvider.generateImage() → AI API 调用 → 返回 imageUrl → 更新 beat.keyframe.imageUrl
4. **生成帧对**: useFramePairGenerator → container.videoProvider.generateFramePair() → 更新 beat.framePair
5. **生成视频**: useVideoGenerator → container.videoProvider.generateVideo() → 返回 taskId → 轮询引擎每 5 秒查询状态 → 完成后更新 beat.videoGen.videoUrl
6. **链式生成**: chainMode=auto 时，前一个 beat 的视频最后一帧作为下一个 beat 的参考图

### 14.2 视频任务状态机

```
pending → generating → completed
                    → failed → retrying → generating
                    → cancelled
```

- **pending**: 任务已创建，等待 API 调用
- **generating**: API 已接受，轮询中
- **completed**: 视频已生成，URL 可用
- **failed**: 生成失败，可重试
- **retrying**: 智能重试中（评估风险后决定是否重试）
- **cancelled**: 用户取消

轮询引擎行为：
- 正常间隔: 5 秒
- 失败后指数退避: 5s → 10s → 20s → 40s → 60s (上限)
- 最大连续失败: 10 次后标记为 failed
- URL 过期检测: urlTtl + urlObtainedAt 计算，过期前主动刷新

### 14.3 同步引擎工作流

1. **变更追踪**: 每次 CRUD 操作后，changelog.ts 记录 SyncChangeLogEntry (entityType, entityId, operation, vectorClock, deviceId)
2. **自动同步**: startAutoSync() 按 syncInterval 定时调用 performSync()
3. **推送**: 收集未同步的 changelog 条目 → POST /api/sync/push → 服务端合并
4. **拉取**: GET /api/sync/pull?since=lastSyncAt → 获取远端变更 → 本地应用
5. **冲突检测**: Vector Clock 比较 → isVectorClockConflict() → 按 conflictStrategy 处理
   - local_wins: 保留本地版本
   - remote_wins: 采用远端版本
   - manual: 触发冲突回调，等待用户决策

**`getDeviceId()` 异步化**: `src/modules/sync/engine/changelog.ts:74` 中的 `getDeviceId()` 为 `async function getDeviceId(): Promise<string>`，采用 **HTTP 优先 + IPC 回退 + 内存缓存** 策略：

- 优先通过 HTTP `/api/config/get` 获取设备 ID
- HTTP 不可用时回退到 `window.electronAPI` IPC
- 首次解析后缓存到内存，避免重复网络/IPC 调用
- 调用方必须 `await getDeviceId()`，不能同步使用

### 14.4 AI Provider 调用链

```
Module (useVideoGenerator)
  → container.videoProvider (IVideoProvider Port)
    → infrastructure/ai-providers/video.ts
      → model-adapter/index.ts (选择适配器)
        → 具体 Provider 适配器 (KlingAdapter/RunwayAdapter/...)
          → api-config/server.ts (获取 API 配置)
            → secure-config IPC (读取加密的 API Key)
          → HTTP 请求 (带 X-Electron-App 头)
            → SSRF Guard 检查
          → 响应解析 → 错误分类
            → 成功: 返回 Result.ok
            → 失败: 分类为 timeout/rate_limit/quota/invalid_params/network/server_error/database_busy/auth/unknown
              → retry-executor.ts (指数退避重试)
              → circuit-breaker.ts (熔断保护)
```

### 14.5 IPC 通信流程

```
Renderer Process                          Main Process
─────────────────                         ────────────
window.electronAPI                        ipcMain.handle()
  .invoke('db:query', sql, params)  →     handlers/database.ts
                                           ↓
                                         preload.ts 权限检查
                                           ↓ READONLY 权限
                                         SQL 安全验证
                                           ↓ DDL 检测
                                         db-connection.ts
                                           ↓ 参数化查询
                                         better-sqlite3
                                           ↓
                                         返回结果  ←  ──────
```

### 14.6 数据库 Schema 生成流程

```
schema-builder.ts
  → TableDef { name, columns[], featureGroup, constraints }
  → generateTableSQL(tableDef)
    → 自动添加 7 字段基列: owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id
    → 生成 CREATE TABLE IF NOT EXISTS SQL
    → JSON Container 列: config TEXT, provider TEXT, media_refs TEXT, tracking TEXT, ...

db-schema.ts
  → 定义所有 TableDef
  → SCHEMA_FEATURES 控制哪些表组被创建

migrations.ts
  → CURRENT_SCHEMA_VERSION = 4
  → MIGRATIONS: v3 (local_video_path 列), v4 (collection_assets 时间戳列)
  → runMigrations(db, currentVersion) 在 db.transaction() 中执行
```

---

## 15. 设计决策记录

### 15.1 为什么选择 DDD 分层

**问题**: 项目初期代码散落在 @/lib, @/types, @/components 等扁平目录中，模块间依赖混乱，修改一个功能可能影响多个不相关模块。

**决策**: 采用 DDD 分层 + 子域模块化，严格依赖方向 domain → shared → modules → infrastructure → app。

**收益**:
- 修改隔离: 改 story 模块不会影响 video 模块
- 测试替换: DI 容器允许轻松 mock infrastructure 依赖
- 架构守护: ESLint 规则自动检测违规导入

**代价**:
- DI 容器增加间接层
- 跨模块通信需要通过桶导出或 DI
- 新开发者需要理解分层规则

### 15.2 为什么使用 JSON Container 模式

**问题**: SQLite ALTER TABLE 在大型表上耗时，且 better-sqlite3 同步执行 DDL 会阻塞主进程。

**决策**: 业务表的易变字段存储在 JSON 列中（config, provider, media_refs, tracking 等），避免 ALTER TABLE。

**收益**:
- Schema 变更无需迁移: 新增字段只需更新 TypeScript 类型和 json-schemas.ts
- 部分更新: `json_set(COALESCE(container, '{}'), '$.key', ?)` 只更新单个字段
- 向后兼容: 旧数据缺少新字段时，parseXxx() 提供默认值

**代价**:
- 无法对 JSON 内部字段建索引
- 查询 JSON 内部字段语法较复杂
- 需要额外的 parseXxx() 安全解析层

### 15.3 为什么使用 Result 类型而非异常

**问题**: JavaScript 异常是隐式的，调用者无法从函数签名判断可能失败，容易遗漏错误处理。

**决策**: 所有可能失败的操作返回 Result<T, AppError> 联合类型。

**收益**:
- 强制错误处理: 调用者必须检查 result.ok 才能访问 value
- 类型安全: TypeScript 确保未检查 ok 时无法访问 value
- 语义化错误: 12 种错误类型 + 34 个错误码，每个标记 retryable

**代价**:
- 代码略冗长: 需要 if (result.ok) 检查
- 异步操作需要 fromAsyncThrowable 包装

### 15.4 为什么 Electron 主进程不退出

**问题**: 桌面应用遇到未预期异常（网络超时、DB busy、IPC 故障）时不应崩溃退出。

**决策**: uncaughtException 和 unhandledRejection 只记录日志，不调用 app.exit()。仅 SIGINT/SIGTERM 和用户主动退出触发 app.quit()。

**收益**:
- 桌面应用可用性: 瞬时错误不会导致应用关闭
- 崩溃恢复: 渲染进程崩溃后 1 秒自动重建窗口
- GPU 进程崩溃: 自动 reload 而非退出

### 15.5 为什么从 Next.js 迁移到 Vite + React Router

**问题**: Next.js 的 SSR/SSG 功能在 Electron 桌面应用中完全无用，`output: "export"` 模式下 API Routes 不可用，构建流程复杂（需要移除/恢复 API 目录），功能利用率仅约 15%。

**决策**: 迁移到 Vite 8 + React Router 7，使用 `createBrowserRouter` + `React.lazy` 实现客户端路由和代码分割。

**收益**:
- 功能利用率 100%: 所有引入的框架功能都被使用
- 构建流程简化: 无需移除/恢复 API 目录，直接 `vite build`
- 代码分割更精细: rolldown `codeSplitting` API 按模块分 chunk
- 开发体验: Vite HMR 比 Next.js Fast Refresh 更快

**代价**:
- 需要手动配置路由 (不再有文件系统路由)
- 需要手动配置代码分割 (rolldown groups)

### 15.6 为什么构建脚本使用锁文件

**问题**: 之前的构建脚本在 next build 前移动 API 目录，如果构建中断，源码目录丢失无法恢复。

**决策**: 引入 .build-electron.lock 锁文件 + 双重 try/finally 保护。

**收益**:
- 中断恢复: 下次构建检测到锁文件时自动恢复
- 双重保护: 内层 finally 确保 API 目录恢复，外层 finally 确保任何异常都恢复

---

## 16. 关键算法与模式

### 16.1 Vector Clock 冲突检测

```typescript
// 创建: 每个设备初始时钟为空
createVectorClock(): VectorClock → {}

// 递增: 本地操作后递增本设备计数器
incrementVectorClock(clock, deviceId): VectorClock
  → { ...clock, [deviceId]: (clock[deviceId] || 0) + 1 }

// 合并: 取每个设备计数器的最大值
mergeVectorClocks(a, b): VectorClock
  → 遍历所有 key, 取 max(a[key], b[key])

// 比较: 判断因果关系
compareVectorClocks(a, b): "before" | "after" | "concurrent"
  → 如果 a 所有 key <= b 且至少一个 < : "before"
  → 如果 a 所有 key >= b 且至少一个 > : "after"
  → 否则: "concurrent" (冲突)

// 冲突检测: 并发即为冲突
isVectorClockConflict(local, remote): boolean
  → compareVectorClocks(local, remote) === "concurrent"
```

### 16.2 熔断器状态机

```
CLOSED (正常) ──连续失败达到阈值──→ OPEN (熔断)
   ↑                                  │
   │                              超时后
   │                                  ↓
   └────成功──── HALF_OPEN (试探) ←───┘
                      │
                  失败 → OPEN
                  成功 → CLOSED
```

- CLOSED → OPEN: 连续失败次数达到阈值 (默认 5 次)
- OPEN → HALF_OPEN: 熔断超时后 (默认 30 秒)
- HALF_OPEN → CLOSED: 试探请求成功
- HALF_OPEN → OPEN: 试探请求失败

### 16.3 智能重试策略

```typescript
// 错误分类 → 重试决策
TIMEOUT_ERROR     → 可重试, 指数退避
RATE_LIMIT_ERROR  → 可重试, 使用 retryAfter 头
NETWORK_ERROR     → 可重试, 指数退避
API_ERROR (5xx)   → 可重试, 指数退避
API_ERROR (4xx)   → 不重试 (客户端错误)
AUTHENTICATION_ERROR → 不重试
VALIDATION_ERROR  → 不重试
```

### 16.4 HMR 安全保护模式

模块级单例（sync-engine, network-monitor, polling-engine）在开发模式下需要防止 HMR 重复初始化：

```typescript
const STATE_KEY = "__SYNC_ENGINE_STATE__";

function getOrCreateState() {
  if (typeof window !== "undefined") {
    if (!window[STATE_KEY]) {
      window[STATE_KEY] = { config: DEFAULT_SYNC_CONFIG, ... };
    }
    return window[STATE_KEY];
  }
  return { config: DEFAULT_SYNC_CONFIG, ... };
}
```

### 16.5 React Compiler 兼容模式

React 19 编译器对代码有严格要求，以下模式已适配：

1. **setState-in-effect**: 使用 lazy state initializer 或 useSyncExternalStore 替代 useEffect + setState
2. **Refs in render**: 将渲染期间的 ref 访问移入 useEffect，或改用 state
3. **Date.now() in render**: 使用 useCurrentTime hook (基于 useSyncExternalStore)
4. **Immutability**: 封装 ref 递增操作为方法，避免直接修改 hook 返回的 ref
5. **Memoization**: 递归 useCallback 改为 while 循环，使编译器能正确分析

---

## 17. 配置参考

### 17.1 端口配置

| 服务 | 端口 | 说明 |
|------|------|------|
| API_SERVER_PORT | 13579 | Electron 主进程 HTTP API |
| APP_SERVER_PORT | 13580 | 静态文件服务 |
| DEV_SERVER_PORT | 3000 | Vite 开发服务器 |

### 17.2 常量配置

| 常量 | 值 | 说明 |
|------|------|------|
| SHOT_SEQUENCES | wide/medium/close/extreme_close/low/high/birdseye/wormseye | 景别序列 |
| MAX_FILE_SIZE | 100MB | 文件上传大小限制 (`file-routes.ts` 中 `MAX_WRITE_SIZE = 100 * 1024 * 1024`) |
| BATCH_MAX_CONCURRENT | 3 | 批量操作最大并发数 |
| POLL_INTERVAL | 5000ms | 视频任务轮询间隔 |
| POLL_MAX_FAILURES | 10 | 轮询最大连续失败次数 |
| AUTO_SAVE_INTERVAL | 30000ms | 自动保存间隔 |
| LOG_FLUSH_INTERVAL | 5000ms | 日志刷新间隔 |
| LOG_QUEUE_THRESHOLD | 100 | 日志队列立即刷新阈值 |
| LOG_MAX_FILE_SIZE | 10MB | 单个日志文件最大大小 |
| LOG_MAX_FILES | 5 | 最大日志文件数量 |

### 17.3 环境变量

| 变量 | 用途 |
|------|------|
| BUILD_TARGET=electron | Vite 构建目标 (触发 base: "./") |
| ELECTRON_MIRROR | Electron 下载镜像 |
| ELECTRON_BUILDER_BINARIES_MIRROR | electron-builder 二进制镜像 |

---

## 18. 术语表

| 术语 | 英文 | 定义 |
|------|------|------|
| Beat | Story Beat | 故事节拍，故事中的最小叙事单元 |
| 关键帧 | Keyframe | 单帧图像，用于视频生成的起始帧 |
| 帧对 | Frame Pair | 首帧+尾帧，用于视频生成的起止参考 |
| 链式生成 | Chain Mode | 前一个 Beat 的输出作为下一个 Beat 的输入 |
| 元素绑定 | Element Binding | 角色/道具/特效与 Beat 的关联关系 |
| 特征锚定 | Feature Anchoring | 通过参考图锚定角色/场景的视觉特征一致性 |
| 一致性检查 | Consistency Check | 检查生成结果与参考图的角色一致性 |
| Vector Clock | 向量时钟 | 分布式系统中用于因果排序和冲突检测的数据结构 |
| 熔断器 | Circuit Breaker | 防止级联故障的保护机制 |
| DDD | Domain-Driven Design | 领域驱动设计 |
| Port | Port Interface | 领域层定义的接口，由基础设施层实现 |
| DI | Dependency Injection | 依赖注入 |
| WAL | Write-Ahead Logging | SQLite 预写式日志模式 |
| HMR | Hot Module Replacement | 热模块替换 |
| IPC | Inter-Process Communication | 进程间通信 |
| SSRF | Server-Side Request Forgery | 服务端请求伪造 |
| ASA | Animation Studio Archive | 项目自定义的资产归档格式 |
| 代理导出 | Proxy Export | shared 层从 infrastructure 重导出纯函数的模式 |

---

## 附录 A: 文件结构总览

```
ai-animation-studio-source-code/
├── src/
│   ├── domain/                    # 纯类型、Schema、Port 接口
│   │   ├── schemas/               # Zod Schema (character, scene, story, shot-system, api, media)
│   │   ├── types/                 # 类型定义 (result, error-codes, sync, infrastructure, video-model, cloud-provider)
│   │   ├── ports/                 # Port 接口 (storage, ai-provider, sync, element-manager, reference-engine)
│   │   ├── services/              # 领域服务 (story-generation, reference-resolver, reference-check, beat-workflow)
│   │   └── utils/                 # 领域工具 (beat-prompt-builder, shot-prompt, prompt-vocabulary)
│   ├── modules/                   # 业务模块 (9 个)
│   │   ├── story/                 # 故事模块 (beat-editor, generation, planning, prompt-editor, template)
│   │   ├── video/                 # 视频模块 (task-management, recovery, cache, utils)
│   │   ├── shot/                  # 镜头模块 (shot-instruction, shot-generation, shot-reference, feature-extraction, consistency-check, element-binding, reference-check)
│   │   ├── asset/                 # 资产模块 (asset-library, import-export, media-assets, presentation, hooks)
│   │   ├── sync/                  # 同步模块 (engine, presentation)
│   │   ├── prompt/                # 提示词模块 (base, character, scene, video, builder, server-prompts, beat-image, presentation)
│   │   ├── character/             # 角色模块 (hooks, services, presentation)
│   │   ├── scene/                 # 场景模块 (hooks, services, presentation)
│   │   └── persistence/           # 持久化模块 (hooks, services)
│   ├── infrastructure/            # 基础设施
│   │   ├── di/                    # DI 容器 (container, types, registry)
│   │   ├── ai-providers/          # AI 供应商 (core, video, image, text, model-adapter, api-config, offline-queue, ...)
│   │   ├── storage/               # 存储 (sqlite-core, video-tasks, characters, scenes, stories, elements, video-cache, ...)
│   │   ├── network/               # 网络 (network-monitor, circuit-breaker, retry-executor)
│   │   ├── api/                   # API 客户端
│   │   ├── video-utils/           # 视频工具 (video-codec, video-frame-extractor)
│   │   ├── database/              # 数据库 (character-repository, element-repository, media-asset-repository)
│   │   └── secure-storage.ts      # 加密存储
│   ├── shared/                    # 共享层
│   │   ├── event-bus.ts           # 事件总线
│   │   ├── error-logger.ts        # 错误日志
│   │   ├── error-handler.ts       # 错误处理
│   │   ├── hooks/                 # 共享 Hooks (use-global-keyboard-actions, use-memory-monitor, use-current-time)
│   │   ├── presentation/          # 共享 UI (Toast, Sidebar, ErrorBoundary, ThemeProvider, ...)
│   │   ├── utils/                 # 工具函数 (image-url, toast-bridge, utils, preferences)
│   │   ├── db-core/               # 代理导出: 数据库安全操作
│   │   ├── api-config/            # 代理导出: API 配置查询
│   │   ├── video-cache/           # 代理导出: 视频缓存操作
│   │   ├── outfit/                # 代理导出: 服装合成
│   │   ├── sql-safety/            # 代理导出: SQL 安全工具
│   │   └── model-capabilities.ts  # 代理导出: 模型能力查询
│   ├── app/                       # 页面组件
│   │   ├── story/                 # 故事页 (StoryProvider, BeatEditor, BeatDetail)
│   │   ├── characters/            # 角色页
│   │   ├── scenes/                # 场景页
│   │   ├── quick-generate/        # 快速生成页
│   │   ├── asset-library/         # 资产库页
│   │   ├── settings/              # 设置页
│   │   ├── video-tasks/           # 视频任务页
│   │   ├── layout.tsx             # 根布局
│   │   └── page.tsx               # 首页
│   ├── router.tsx                 # 路由配置 (createBrowserRouter + React.lazy)
│   ├── main.tsx                   # 应用入口 (RouterProvider)
│   └── config/                    # 配置
│       ├── constants.ts           # 常量
│       └── ports.ts               # 端口
├── electron/
│   └── src/
│       ├── main.ts                # 生产入口
│       ├── main-dev.ts            # 开发入口
│       ├── main-common.ts         # 共享逻辑
│       ├── preload.ts             # IPC 桥接
│       ├── api-server.ts          # HTTP API 服务器 (re-export)
│       ├── api/                   # API 服务器模块
│       │   ├── types.ts           # 路由类型定义
│       │   ├── middleware.ts      # 中间件 (速率限制, CORS, 认证)
│       │   ├── schemas.ts         # Zod 请求 Schema (40+)
│       │   ├── routes.ts          # 路由注册表
│       │   ├── server.ts          # HTTP 服务器
│       │   └── route-groups/      # 路由组 (core, db, file, generation, plugin, shot, storyboard)
│       ├── protocol.ts            # 协议注册
│       ├── database/              # 数据库 (schema-builder, db-schema, migrations, db-connection)
│       ├── handlers/              # IPC 处理器 (database, secure-config, config, sync, assets)
│       ├── plugins/               # 插件系统 (plugin-registry, providers/, user-plugin-loader, code-plugin-loader)
│       ├── security/              # 安全 (ssrf-guard/)
│       ├── logging/               # 日志 (logger, transports)
│       ├── lifecycle/             # 生命周期管理
│       └── config/                # 配置
├── scripts/                       # 工具脚本
```