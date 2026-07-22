# DI Token 清单

> 自动生成于 2026-07-23。基于 `src/infrastructure/di/container.ts` 实际代码扫描。
> Token 总数：46 个

## 概述

本文档列出 PrismCraft 项目 DI 容器中注册的所有 Token。每个 Token 通过 `createToken()` 创建，并以 `singleton` 生命周期注册到 `ModuleRegistry`。

- **容器入口**：`src/infrastructure/di/container.ts`
- **类型定义**：`src/infrastructure/di/types.ts`（`Token<T>`、`ModuleFactory<T>`、`Lifecycle`）
- **注册表实现**：`src/infrastructure/di/registry.ts`（`ModuleRegistry`）
- **访问方式**：`import { container } from "@/infrastructure/di"; container.videoProvider`
- **测试替换**：`overrideToken(token, factory)` / `resetContainer()`
- **自省 API**：`getTokenRegistry()` 返回 `{ key, id, category }[]`；`TOKEN_IDS` 冻结对象提供 key→id 映射

## Token 分类

按照 `architecture-rules.md` 的分类体系（代码中扩展至 6 类，F 类为 Agent 服务，是 E 类懒加载的特化）：

| 分类 | 说明 | 数量 |
|------|------|------|
| A. Domain Port 实现 | Domain Port 接口的具体实现（视频/图像/文本/存储等） | 13 |
| B. 有状态服务 | 单例服务，需测试替换（API 客户端、事件总线、偏好存储） | 6 |
| C. Storage 实例 | 有状态存储模块（模块层无法直接导入 infrastructure/storage） | 18 |
| D. Repository 实例 | Drizzle ORM Repository（模块层无法直接导入 infrastructure/database） | 1 |
| E. 懒加载模块 | 动态 `import()` 加载，避免循环依赖 | 4 |
| F. Agent 服务 | Agent 模块动态导入（E 类特化，避免 infrastructure 静态依赖 modules） | 4 |
| **合计** | | **46** |

> **分类权威来源**：`getTokenRegistry()` 函数（container.ts 第 274-332 行）中的 `categories` 映射。`fileStorage` 在 container.ts 注释中归入 A 类，但 `getTokenRegistry()` 将其归入 E 类（因使用动态 import）——本表采用 `getTokenRegistry()` 的分类。

## Token 详情表

### A. Domain Port 实现

模块通过 Port 接口与基础设施解耦。以下 Token 均实现 `@/domain/ports` 中定义的接口。

| Token 名 | 类型/接口 | 实现来源 | 路径 | 备注 |
|----------|-----------|----------|------|------|
| `videoTaskStorage` | `IVideoTaskStorage` | `videoTaskStorage` | `@/infrastructure/storage/video-tasks` | 视频任务 CRUD |
| `characterStorage` | `ICharacterStorage` | `characterStorage` | `@/infrastructure/storage/characters` | 角色与服装存储 |
| `sceneStorage` | `ISceneStorage` | `sceneStorage` | `@/infrastructure/storage/scenes` | 场景存储 |
| `storyStorage` | `IStoryStorage` | `storyStorage` | `@/infrastructure/storage/stories` | 故事存储与搜索 |
| `subShotStorage` | `ISubShotStorage` | `subShotStorage` | `@/infrastructure/storage/shot/sub-shot-storage` | 子分镜存储 |
| `generationAssetStorage` | `IGenerationAssetStorage` | `generationAssetStorage` | `@/infrastructure/storage/asset/asset-storage` | 生成资产存储 |
| `videoProvider` | `IVideoProvider` | 内联组合对象 | `@/infrastructure/ai-providers/video` | 聚合 generateVideo/queryVideoStatus/generateKeyframe/generateFramePair/generateVideoWithFrames |
| `imageProvider` | `IImageProvider` | 内联组合对象 | `@/infrastructure/ai-providers/image` | 聚合 generateImage/analyzeImage |
| `textProvider` | `ITextProvider` | 内联组合对象 | `@/infrastructure/ai-providers/text` | 聚合 generateText/generateTextStream/generateChat |
| `embeddingProvider` | `IEmbeddingProvider` | 内联组合对象 | `@/infrastructure/ai-providers/embedding` | 聚合 generateEmbedding/generateEmbeddings |
| `audioProvider` | `IAudioProvider` | 内联组合对象 | `@/infrastructure/ai-providers/audio` | 聚合 synthesizeSpeech/transcribeAudio |
| `fileUploader` | `IFileUploader` | 内联包装对象 | `@/infrastructure/ai-providers/utils` | 包装 uploadFile |
| `syncStorage` | `ISyncStorage` | 内联组合对象 | `@/infrastructure/storage/sqlite-core` + `@/infrastructure/storage/core` | 聚合 safeQuery/safeRun/safeTransaction/registerChangeTracker/unregisterChangeTracker |

### B. 有状态服务

单例服务，需可通过 `overrideToken()` 替换以支持测试。

| Token 名 | 类型/接口 | 实现来源 | 路径 | 备注 |
|----------|-----------|----------|------|------|
| `eventBus` | 推断类型 | `eventBus` | `@/shared/event-bus` | 事件总线（fire-and-forget 通知） |
| `apiClient` | 推断类型 | `apiClient` | `@/infrastructure/api` | 主 API 客户端 |
| `imageApi` | 推断类型 | `imageApi` | `@/infrastructure/api` | 图像 API 客户端 |
| `videoApi` | 推断类型 | `videoApi` | `@/infrastructure/api` | 视频 API 客户端 |
| `textApi` | 推断类型 | `textApi` | `@/infrastructure/api` | 文本 API 客户端 |
| `preferencesStorage` | 推断类型 | `preferencesStorage` | `@/shared/utils/preferences` | 用户偏好存储 |

### C. Storage 实例

有状态存储模块。模块层无法直接导入 `@/infrastructure/storage/*`，必须通过 DI 获取。

| Token 名 | 类型/接口 | 实现来源 | 路径 | 备注 |
|----------|-----------|----------|------|------|
| `versionStorage` | `IVersionStorage` | `versionStorage` | `@/infrastructure/storage/versions` | 故事版本快照 |
| `elementStorage` | `IElementStorage` | `elementStorage` | `@/infrastructure/storage/elements` | 故事元素存储 |
| `videoCacheStorage` | 推断类型 | `videoCacheStorage` | `@/infrastructure/storage/video-cache` | 视频缓存 |
| `imageCacheStorage` | 推断类型 | `imageCacheStorage` | `@/infrastructure/storage/image-cache` | 图像缓存 |
| `collectionStorage` | 推断类型 | `collectionStorage` | `@/infrastructure/storage/collections` | 收藏集存储 |
| `storyboardStorage` | 推断类型 | `storyboardStorage` | `@/infrastructure/storage/storyboard` | 分镜板存储 |
| `importExportStorage` | 推断类型 | `importExportStorage` | `@/infrastructure/storage/import-export` | 导入导出存储 |
| `templateStorage` | `ITemplateStorage` | `templateStorage` | `@/infrastructure/storage/templates` | 视频模板与 AST 模板 |
| `autoSaveStorage` | 推断类型 | `autoSaveStorage` | `@/infrastructure/storage/auto-save` | 自动保存存储 |
| `errorLogStorage` | 推断类型 | `errorLogStorage` | `@/infrastructure/storage/error-logs` | 错误日志存储 |
| `sessionStorage` | 推断类型 | `sessionStorage` | `@/infrastructure/storage/sessions` | 会话存储 |
| `novelProjectStorage` | 推断类型 | `novelProjectStorage` | `@/infrastructure/storage/novel-projects` | 小说项目存储 |
| `propStorage` | 推断类型 | `propStorage` | `@/infrastructure/storage/props` | 道具存储 |
| `characterVariantStorage` | 推断类型 | `characterVariantStorage` | `@/infrastructure/storage/characters/variant-manager` | 角色变体管理 |
| `sceneVariantStorage` | 推断类型 | `sceneVariantStorage` | `@/infrastructure/storage/scenes/variant-manager` | 场景变体管理 |
| `timelineStorage` | 推断类型 | `timelineStorage` | `@/infrastructure/storage/timelines/timeline-manager` | 时间线存储 |
| `plotNodeStorage` | 推断类型 | `plotNodeStorage` | `@/infrastructure/storage/timelines/plot-node-manager` | 剧情节点存储 |
| `storyTemplateStorage` | 推断类型 | `storyTemplateStorage` | `@/infrastructure/storage/story-templates` | 故事模板存储 |

### D. Repository 实例

Drizzle ORM Repository。模块层无法直接导入 `@/infrastructure/database`，必须通过 DI 获取。

| Token 名 | 类型/接口 | 实现来源 | 路径 | 备注 |
|----------|-----------|----------|------|------|
| `mediaAssetRepository` | `IMediaAssetRepository` | `mediaAssetRepository` | `@/infrastructure/database` | 媒体资产 Repository（findAll/findById/create/update/delete，返回 `Result<T>`） |

### E. 懒加载模块

动态 `import()` 加载，避免循环依赖。消费者需 `await`：`const engine = await container.syncEngine`。

| Token 名 | 类型/接口 | 实现来源 | 路径 | 备注 |
|----------|-----------|----------|------|------|
| `fileStorage` | 推断类型（`IFileStorage` 实现） | `getFileStorage()` | `@/infrastructure/storage/file-storage-factory`（动态 import） | 文件存储 Port 实现，懒加载以延迟工厂选择（LocalFileStorage/S3FileStorage）。`getTokenRegistry()` 归为 E 类 |
| `elementManager` | `IElementManager` | `elementManager` | `@/modules/shot`（动态 import） | 元素生命周期管理 |
| `referenceEngine` | `IReferenceEngine` | `referenceEngine` | `@/modules/shot`（动态 import） | 分镜引用校验与视频 URL 解析 |
| `syncEngine` | 推断类型 | `syncEngine` | `@/modules/sync`（动态 import） | 同步引擎 |

### F. Agent 服务

Agent 模块动态导入，避免 `infrastructure` 静态依赖 `modules`。`AgentLoop` 构造函数通过 `deps` 参数注入协作者（同步，不依赖 container）；这些 Token 供异步初始化场景使用（如 `useAgent` 预加载、测试 `overrideToken` 替换）。消费者需 `await`。

| Token 名 | 类型/接口 | 实现来源 | 路径 | 备注 |
|----------|-----------|----------|------|------|
| `agentConversationManager` | 推断类型 | `conversationManager` | `@/modules/agent`（动态 import） | Agent 对话管理 |
| `agentToolRegistry` | 推断类型 | `toolRegistry` | `@/modules/agent`（动态 import） | Agent 工具注册表 |
| `agentToolExecutor` | 推断类型 | `toolExecutor` | `@/modules/agent`（动态 import） | Agent 工具执行器 |
| `agentMemoryService` | 推断类型 | `memoryService` | `@/modules/agent-memory`（动态 import） | Agent 记忆服务（语义检索） |

## 容器 API

| API | 签名 | 说明 |
|-----|------|------|
| `container` | `AppContainer`（Proxy） | 通过属性访问解析 Token，如 `container.videoProvider` |
| `resolve<T>` | `(token: Token<T>) => T` | 显式解析 Token（带循环依赖检测） |
| `overrideToken<T>` | `(token: Token<T>, factory: (c: ModuleContainer) => T) => void` | 测试期替换实现，清除单例缓存 |
| `resetContainer` | `() => void` | 清除所有单例缓存 |
| `TOKEN_IDS` | `Record<string, string>`（冻结） | Token key → id 映射 |
| `getTokenRegistry` | `() => Array<{ key, id, category }>` | 返回所有 Token 的自省信息 |

## 实现说明

### Proxy 模式与类型断言

`container` 通过 `Proxy` 包装 `tokens` 对象，`get` trap 调用 `registry.resolve(token)` 返回实例。由于 Proxy 的 `get` trap 只能返回单一类型，使用 `as unknown as AppContainer` 断言保留消费者侧的 per-property 类型安全。访问未注册的属性会抛出 `[DI] Unknown container token: "<prop>"`。

### 循环依赖检测

`resolve()` 与 `ModuleRegistry.resolve()` 均维护解析栈（`resolving` Set / `resolutionStack` Set），检测到循环时抛出 `[DI] Circular dependency detected: A -> B -> A`。

### 生命周期

所有 Token 均以 `singleton` 生命周期注册（container.ts 第 218-220 行）。首次解析时调用工厂函数并缓存，后续返回缓存实例。
