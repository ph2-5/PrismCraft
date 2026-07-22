# Port 接口清单

> 自动生成于 2026-07-23。基于 `src/domain/ports/` 实际代码扫描。
> Port 总数：20 个

## 概述

在 DDD（领域驱动设计）的依赖倒置原则下，Port 接口是模块层与基础设施层之间的解耦边界。模块定义 Port 接口（在 `src/domain/ports/`），基础设施层提供具体实现，通过 DI 容器注入。这确保了：

- **模块不依赖基础设施**：模块仅依赖 `@/domain/ports` 中的抽象接口，不直接导入 `@/infrastructure/*`
- **可测试性**：通过 `overrideToken()` 替换实现，模块可在隔离环境下测试
- **可替换性**：更换存储引擎、AI 提供商等只需修改 DI 注册，不影响业务逻辑

### 依赖方向

```
modules/ ──imports──→ domain/ports/ ←──implements── infrastructure/
                                │
                          DI Container
                        (wiring layer)
```

### Barrel 导出

所有 Port 接口通过 `src/domain/ports/index.ts` 统一导出。模块应从 `@/domain/ports` 导入，而非深路径。

### Port 分类

| 分类 | Port 数 | 包含的接口 |
|------|---------|-----------|
| 视频/媒体相关 Port | 7 | IVideoProvider, IVideoTaskStorage, IImageProvider, ITextProvider, IEmbeddingProvider, IAudioProvider, IFileUploader |
| 角色/场景/故事相关 Port | 8 | ICharacterStorage, ISceneStorage, IStoryStorage, ISubShotStorage, IGenerationAssetStorage, IElementManager, IElementStorage, IReferenceEngine |
| 存储/持久化相关 Port | 5 | ISyncStorage, IVersionStorage, ITemplateStorage, IMediaAssetRepository, IFileStorage |
| **合计** | **20** | |

## Port 详情

### 视频/媒体相关 Port

---

#### IVideoProvider

- **文件**: `src/domain/ports/ai-provider-port.ts`
- **职责**: 视频生成、状态查询、关键帧与帧对生成、局部重绘
- **实现**: `container.videoProvider`（内联组合 `@/infrastructure/ai-providers/video`）
- **方法**:
  - `generateVideo(prompt, options?): Promise<ApiResponse<VideoGenerationResult>>` — 根据提示词与可选的首末帧/角色引用/场景引用生成视频
  - `queryVideoStatus(taskId, options?): Promise<ApiResponse<{ status, videoUrl?, progress?, message? }>>` — 查询视频生成任务状态（pending/generating/completed/failed）
  - `generateKeyframe(params): Promise<ApiResponse<{ imageUrl, source?, prompt? }>>` — 生成关键帧（含角色/场景引用、镜头要求）
  - `generateFramePair(params): Promise<ApiResponse<{ firstFrame, lastFrame, generatedAt }>>` — 生成首末帧对
  - `generateVideoWithFrames(params): Promise<ApiResponse<VideoGenerationResult>>` — 基于首末帧生成视频
  - `generatePartialEdit?(input): Promise<ApiResponse<VideoGenerationResult>>` — 可选：局部重绘（Seedance 2.5，mask 外像素保持不变）
  - `cancelTask?(taskId): Promise<void>` — 可选：尽力取消服务端任务（best-effort）

---

#### IVideoTaskStorage

- **文件**: `src/domain/ports/storage-port.ts`
- **职责**: 视频任务的持久化存储与批量操作
- **实现**: `container.videoTaskStorage`（`@/infrastructure/storage/video-tasks`）
- **方法**:
  - `getVideoTasks(): Promise<VideoTask[]>` — 获取全部视频任务
  - `getVideoTaskById(taskId): Promise<VideoTask | null>` — 按 ID 获取任务
  - `getVideoTasksByStory(storyId): Promise<VideoTask[]>` — 按故事 ID 获取任务
  - `getVideoTasksByStatus(status): Promise<VideoTask[]>` — 按状态获取任务
  - `getPendingVideoTasks(): Promise<VideoTask[]>` — 获取待处理任务
  - `createVideoTask(task): Promise<void>` — 创建任务
  - `updateVideoTask(taskId, updates): Promise<void>` — 更新任务
  - `deleteVideoTask(taskId): Promise<void>` — 删除任务
  - `deleteVideoTasksByStatus(statuses): Promise<void>` — 按状态批量删除
  - `deleteVideoTasksByBeatId(beatId): Promise<void>` — 按 beat ID 批量删除
  - `deleteVideoTasksByStoryId(storyId): Promise<void>` — 按故事 ID 批量删除
  - `deleteExpiredVideoTasks(): Promise<number>` — 删除过期任务，返回删除数
  - `clearVideoTasks(): Promise<void>` — 清空全部任务
  - `bulkPutVideoTasks(tasks): Promise<void>` — 批量写入
  - `batchUpdateVideoTasks(updates): Promise<void>` — 批量更新
  - `batchDeleteVideoTasks(taskIds): Promise<void>` — 批量删除

---

#### IImageProvider

- **文件**: `src/domain/ports/ai-provider-port.ts`
- **职责**: 图像生成与图像分析
- **实现**: `container.imageProvider`（内联组合 `@/infrastructure/ai-providers/image`）
- **方法**:
  - `generateImage(prompt, type?, options?): Promise<ApiResponse<ImageGenerationResult>>` — 根据提示词生成图像
  - `analyzeImage(imageUrl, type?, prompt?, options?): Promise<ApiResponse<{ analysis, analyzed? }>>` — 分析图像（角色/场景识别）

---

#### ITextProvider

- **文件**: `src/domain/ports/ai-provider-port.ts`
- **职责**: 文本生成、流式生成、原生对话补全（支持 function calling）
- **实现**: `container.textProvider`（内联组合 `@/infrastructure/ai-providers/text`）
- **方法**:
  - `generateText(prompt, options?): Promise<ApiResponse<{ text }>>` — 单次文本生成
  - `generateTextStream(prompt, options?): Promise<ApiResponse<{ text }>>` — 流式文本生成，通过 `onChunk` 回调逐块返回；支持 `signal` 中止
  - `generateChat(messages, options?): Promise<ApiResponse<{ text }>>` — 原生对话补全，接收结构化 messages 数组，支持原生 function calling；`onChunk` 可选（有则流式）

---

#### IEmbeddingProvider

- **文件**: `src/domain/ports/ai-provider-port.ts`
- **职责**: 向量嵌入生成，供记忆系统语义检索使用
- **实现**: `container.embeddingProvider`（内联组合 `@/infrastructure/ai-providers/embedding`）
- **方法**:
  - `generateEmbedding(input, options?): Promise<ApiResponse<{ embedding: number[] }>>` — 生成单段文本的向量嵌入
  - `generateEmbeddings?(inputs, options?): Promise<ApiResponse<{ embeddings: number[][] }>>` — 可选：批量生成向量嵌入

---

#### IAudioProvider

- **文件**: `src/domain/ports/ai-provider-port.ts`
- **职责**: 语音合成（TTS）与语音转文字（STT）
- **实现**: `container.audioProvider`（内联组合 `@/infrastructure/ai-providers/audio`）
- **方法**:
  - `synthesizeSpeech(text, options?): Promise<ApiResponse<{ audioUrl, duration? }>>` — 文字转语音，返回音频 URL
  - `transcribeAudio?(audioUrl, options?): Promise<ApiResponse<{ text, segments? }>>` — 可选：语音转文字，返回文本与时间分段

---

#### IFileUploader

- **文件**: `src/domain/ports/ai-provider-port.ts`
- **职责**: 文件上传至 AI 服务商
- **实现**: `container.fileUploader`（内联包装 `@/infrastructure/ai-providers/utils` 的 `uploadFile`）
- **方法**:
  - `uploadFile(file): Promise<{ success, data?, error?, message?, source? }>` — 上传文件，返回成功/失败联合类型，成功时含 URL

### 角色/场景/故事相关 Port

---

#### ICharacterStorage

- **文件**: `src/domain/ports/storage-port.ts`
- **职责**: 角色与服装的持久化存储
- **实现**: `container.characterStorage`（`@/infrastructure/storage/characters`）
- **方法**:
  - `getCharacters(): Promise<Character[]>` — 获取全部角色
  - `getCharacterById(id): Promise<Character | null>` — 按 ID 获取角色
  - `getCharacterVersion(id): Promise<number | null>` — 获取角色版本号
  - `createCharacter(character): Promise<void>` — 创建角色
  - `updateCharacter(id, updates, version?): Promise<void>` — 更新角色（可选乐观锁版本）
  - `deleteCharacter(id): Promise<void>` — 删除角色
  - `incrementCharacterUseCount(id): Promise<void>` — 增加使用次数
  - `getOutfitsForCharacter(characterId): Promise<CharacterOutfit[]>` — 获取角色服装列表
  - `saveOutfitsForCharacter(characterId, outfits): Promise<void>` — 保存角色服装列表
  - `updateOutfitImage(outfitId, imageUrl, localImagePath?): Promise<void>` — 更新服装图片

---

#### ISceneStorage

- **文件**: `src/domain/ports/storage-port.ts`
- **职责**: 场景的持久化存储
- **实现**: `container.sceneStorage`（`@/infrastructure/storage/scenes`）
- **方法**:
  - `getScenes(): Promise<Scene[]>` — 获取全部场景
  - `getSceneById(id): Promise<Scene | null>` — 按 ID 获取场景
  - `getSceneVersion(id): Promise<number | null>` — 获取场景版本号
  - `createScene(scene): Promise<void>` — 创建场景
  - `updateScene(id, updates, version?): Promise<void>` — 更新场景（可选乐观锁版本）
  - `deleteScene(id): Promise<void>` — 删除场景

---

#### IStoryStorage

- **文件**: `src/domain/ports/storage-port.ts`
- **职责**: 故事的持久化存储、搜索与计数
- **实现**: `container.storyStorage`（`@/infrastructure/storage/stories`）
- **方法**:
  - `getStories(): Promise<Story[]>` — 获取全部故事
  - `getStoryById(id): Promise<Story | null>` — 按 ID 获取故事
  - `getStoryByBeatId(beatId): Promise<Story | null>` — 按 beat ID 获取故事
  - `getStoryVersion(id): Promise<number | null>` — 获取故事版本号
  - `createStory(story): Promise<void>` — 创建故事
  - `updateStory(id, updates, version?): Promise<void>` — 更新故事（可选乐观锁版本）
  - `updateStoryStatus(id, status): Promise<void>` — 更新故事状态
  - `deleteStory(id): Promise<void>` — 删除故事
  - `duplicateStory(sourceId, newTitle): Promise<string>` — 复制故事，返回新故事 ID
  - `searchStories<T>(options): Promise<T[]>` — 按条件搜索故事（query/status/genre/tone/sortBy/sortOrder/limit/offset）
  - `countStories(options): Promise<number>` — 按条件计数故事

---

#### ISubShotStorage

- **文件**: `src/domain/ports/storage-port.ts`
- **职责**: 子分镜的持久化存储与排序
- **实现**: `container.subShotStorage`（`@/infrastructure/storage/shot/sub-shot-storage`）
- **方法**:
  - `getSubShotsByBeatId(beatId): Promise<SubShot[]>` — 按 beat ID 获取子分镜
  - `getSubShotById(id): Promise<SubShot | null>` — 按 ID 获取子分镜
  - `createSubShot(subShot): Promise<void>` — 创建子分镜
  - `updateSubShot(id, updates): Promise<void>` — 更新子分镜
  - `deleteSubShot(id): Promise<void>` — 删除子分镜
  - `deleteSubShotsByBeatId(beatId): Promise<void>` — 按 beat ID 批量删除
  - `reorderSubShots(beatId, orderedIds): Promise<void>` — 重排序子分镜

---

#### IGenerationAssetStorage

- **文件**: `src/domain/ports/storage-port.ts`
- **职责**: 生成资产（图像/视频）的持久化存储与清理
- **实现**: `container.generationAssetStorage`（`@/infrastructure/storage/asset/asset-storage`）
- **方法**:
  - `getAssetsByType(type): Promise<GenerationAsset[]>` — 按类型获取资产
  - `getAssetsByProject(projectId): Promise<GenerationAsset[]>` — 按项目获取资产
  - `getAssetsByStoryBeat(beatId): Promise<GenerationAsset[]>` — 按 beat ID 获取资产
  - `getAssetsBySourceAssetId(sourceAssetId): Promise<GenerationAsset[]>` — 查询某原视频的所有局部重绘版本
  - `getAssetById(id): Promise<GenerationAsset | null>` — 按 ID 获取资产
  - `createAsset(asset): Promise<void>` — 创建资产
  - `updateAsset(id, updates): Promise<void>` — 更新资产
  - `deleteAsset(id): Promise<void>` — 删除资产
  - `deleteUnreferencedAssets(): Promise<number>` — 删除未引用资产，返回删除数

---

#### IElementManager

- **文件**: `src/domain/ports/element-manager-port.ts`
- **职责**: 故事元素的生命周期管理、资产绑定与更新通知
- **实现**: `container.elementManager`（`@/modules/shot`，懒加载）
- **方法**:
  - `subscribe(listener): () => void` — 订阅元素更新通知，返回取消订阅函数
  - `getLibrary(): Promise<ElementLibrary>` — 获取完整元素库
  - `createElement(type, name, description?): Promise<StoryElement>` — 创建元素
  - `bindAsset(elementId, asset): Promise<StoryElement>` — 绑定资产到元素
  - `unbindAsset(elementId, assetUrl): Promise<StoryElement>` — 解绑资产
  - `getElement(elementId): Promise<StoryElement | undefined>` — 按 ID 获取元素
  - `getAllElements(): Promise<StoryElement[]>` — 获取全部元素
  - `getElementsByType(type): Promise<StoryElement[]>` — 按类型获取元素
  - `deleteElement(elementId): Promise<void>` — 删除元素
  - `updateElement(elementId, updates): Promise<StoryElement>` — 更新元素

---

#### IElementStorage

- **文件**: `src/domain/ports/element-storage-port.ts`
- **职责**: 故事元素的底层存储与订阅通知
- **实现**: `container.elementStorage`（`@/infrastructure/storage/elements`）
- **方法**:
  - `subscribe(listener): () => void` — 订阅元素更新通知，返回取消订阅函数
  - `notify(): void` — 主动触发更新通知
  - `getLibrary(): Promise<ElementLibrary>` — 获取完整元素库
  - `getElement(elementId): Promise<StoryElement | undefined>` — 按 ID 获取元素
  - `getAllElements(): Promise<StoryElement[]>` — 获取全部元素
  - `getElementsByType(type): Promise<StoryElement[]>` — 按类型获取元素
  - `createElement(type, name, description?): Promise<StoryElement>` — 创建元素
  - `updateElement(elementId, updates): Promise<StoryElement>` — 更新元素
  - `deleteElement(elementId): Promise<void>` — 删除元素

> **注意**：`IElementManager` 与 `IElementStorage` 方法高度相似。`IElementManager` 额外提供 `bindAsset`/`unbindAsset` 资产绑定能力，位于 `@/modules/shot`（懒加载）；`IElementStorage` 额外提供 `notify()` 主动通知能力，位于 `@/infrastructure/storage`。

---

#### IReferenceEngine

- **文件**: `src/domain/ports/reference-engine-port.ts`
- **职责**: 分镜间引用的校验、目标解析与视频 URL 解析
- **实现**: `container.referenceEngine`（`@/modules/shot`，懒加载）
- **方法**:
  - `validateReference(shot, allShots, reference): ReferenceValidationResult` — 校验引用的正确性与完整性，返回 `{ valid, error?, errors?, warnings? }`
  - `getTargetShot(shot, allShots, reference): StoryBeat | undefined` — 解析引用的目标分镜
  - `getReferenceVideoUrl(shot, allShots, reference): string | undefined` — 获取引用的视频 URL
  - `buildReferenceDescription(shot, allShots, reference): string` — 构建人类可读的引用描述（本地化字符串）

### 存储/持久化相关 Port

---

#### ISyncStorage

- **文件**: `src/domain/ports/sync-port.ts`
- **职责**: 安全 SQL 操作与变更追踪器注册（同步引擎的底层抽象）
- **实现**: `container.syncStorage`（内联组合 `@/infrastructure/storage/sqlite-core` 与 `@/infrastructure/storage/core`）
- **方法**:
  - `safeQuery<T>(sql, params?): Promise<T[]>` — 安全查询（参数化）
  - `safeRun(sql, params?): Promise<DbRunResult>` — 安全执行（返回 changes/lastInsertRowid）
  - `safeTransaction(statements): Promise<unknown[]>` — 事务执行多条语句
  - `registerChangeTracker(tracker): void` — 注册变更追踪回调 `(entityType, entityId, operation) => Promise<void>`
  - `unregisterChangeTracker(): void` — 注销变更追踪回调

---

#### IVersionStorage

- **文件**: `src/domain/ports/version-storage-port.ts`
- **职责**: 故事版本快照的存储与清理
- **实现**: `container.versionStorage`（`@/infrastructure/storage/versions`）
- **方法**:
  - `getStoryVersions<T>(storyId): Promise<T[]>` — 获取故事的所有版本
  - `createStoryVersion(version): Promise<void>` — 创建版本快照
  - `deleteStoryVersion(versionId): Promise<void>` — 删除指定版本
  - `deleteOldStoryVersions(storyId, keepCount): Promise<void>` — 删除旧版本，保留最近 keepCount 个

---

#### ITemplateStorage

- **文件**: `src/domain/ports/template-storage-port.ts`
- **职责**: 视频模板与 AST 模板的存储、查询与使用统计
- **实现**: `container.templateStorage`（`@/infrastructure/storage/templates`）
- **方法**:
  - `getVideoTemplates<T>(): Promise<T[]>` — 获取全部视频模板
  - `createVideoTemplate(template): Promise<void>` — 创建视频模板
  - `saveASTTemplate(meta): Promise<void>` — 保存 AST 模板元数据（含 id/name/description/category/genre/tone/tags/author/totalDuration/beatsCount 等）
  - `getASTTemplate(id): Promise<Record<string, unknown> | null>` — 按 ID 获取 AST 模板
  - `getASTTemplates(filters?): Promise<Record<string, unknown>[]>` — 按条件获取 AST 模板（category/search/sortBy/limit）
  - `deleteASTTemplate(id): Promise<boolean>` — 删除 AST 模板，返回是否成功
  - `incrementASTTemplateUsage(id): Promise<void>` — 增加 AST 模板使用次数

---

#### IMediaAssetRepository

- **文件**: `src/domain/ports/media-asset-repository-port.ts`
- **职责**: 媒体资产的 Repository（Drizzle ORM），返回 `Result<T>` 类型
- **实现**: `container.mediaAssetRepository`（`@/infrastructure/database`）
- **方法**:
  - `findAll(): Promise<Result<MediaAsset[]>>` — 查询全部媒体资产
  - `findById(id): Promise<Result<MediaAsset | null>>` — 按 ID 查询
  - `create(input): Promise<Result<MediaAsset>>` — 创建资产
  - `update(input): Promise<Result<MediaAsset>>` — 更新资产
  - `delete(id): Promise<Result<void>>` — 删除资产

> **注意**：此 Port 是唯一使用 `Result<T>` 返回类型（而非直接抛异常）的 Port，遵循 Repository 模式的显式错误处理风格。

---

#### IFileStorage

- **文件**: `src/domain/ports/file-storage-port.ts`
- **职责**: 用户数据文件（图片/视频/配置/插件/缓存）的 key-based CRUD，抽象本地与云端存储
- **实现**: `container.fileStorage`（`@/infrastructure/storage/file-storage-factory` 的 `getFileStorage()`，懒加载，返回 `LocalFileStorage` 或 `S3FileStorage`）
- **关联类型**:
  - `FileCategory`: `"character" | "scene" | "storyboard" | "video-cache" | "image-cache" | "upload" | "plugin"` — 文件类别，决定存储子目录
  - `FileMetadata`: `{ key, category, size, mimeType, createdAt, updatedAt }` — 文件元数据
  - `SaveFileParams`: `{ category, key, data: Buffer | ArrayBuffer | string, mimeType? }` — 保存参数（string 视为 base64）
  - `CopyFileParams`: `{ sourceKey, targetCategory, targetKey }` — 复制参数
  - `WriteFileAtomicParams`: `{ category, key, data: string | Buffer }` — 原子写入参数
- **方法**:
  - `saveFile(params: SaveFileParams): Promise<{ key }>` — 保存文件（buffer 或 base64），返回逻辑 key
  - `readFile(key): Promise<Buffer | null>` — 读取文件为 Buffer
  - `readFileAsBase64(key): Promise<string | null>` — 读取文件为 base64 data URL
  - `deleteFile(key): Promise<boolean>` — 删除文件
  - `exists(key): Promise<boolean>` — 检查文件是否存在
  - `copyFile(params: CopyFileParams): Promise<{ key }>` — 复制文件（资产导入场景）
  - `listFiles(category): Promise<FileMetadata[]>` — 列出某类别下的文件
  - `getFileInfo(key): Promise<FileMetadata | null>` — 获取文件元数据
  - `ensureDir(category): Promise<void>` — 确保类别目录存在
  - `writeFileAtomic(params: WriteFileAtomicParams): Promise<{ key }>` — 原子写入（tmp + rename 模式，用于配置/插件）

## Port 与 Token 对应关系总表

| Port 接口 | 文件 | DI Token | 实现来源 | 懒加载 |
|-----------|------|----------|----------|--------|
| `IVideoProvider` | ai-provider-port.ts | `videoProvider` | `@/infrastructure/ai-providers/video` | 否 |
| `IImageProvider` | ai-provider-port.ts | `imageProvider` | `@/infrastructure/ai-providers/image` | 否 |
| `ITextProvider` | ai-provider-port.ts | `textProvider` | `@/infrastructure/ai-providers/text` | 否 |
| `IEmbeddingProvider` | ai-provider-port.ts | `embeddingProvider` | `@/infrastructure/ai-providers/embedding` | 否 |
| `IAudioProvider` | ai-provider-port.ts | `audioProvider` | `@/infrastructure/ai-providers/audio` | 否 |
| `IFileUploader` | ai-provider-port.ts | `fileUploader` | `@/infrastructure/ai-providers/utils` | 否 |
| `IVideoTaskStorage` | storage-port.ts | `videoTaskStorage` | `@/infrastructure/storage/video-tasks` | 否 |
| `ICharacterStorage` | storage-port.ts | `characterStorage` | `@/infrastructure/storage/characters` | 否 |
| `ISceneStorage` | storage-port.ts | `sceneStorage` | `@/infrastructure/storage/scenes` | 否 |
| `IStoryStorage` | storage-port.ts | `storyStorage` | `@/infrastructure/storage/stories` | 否 |
| `ISubShotStorage` | storage-port.ts | `subShotStorage` | `@/infrastructure/storage/shot/sub-shot-storage` | 否 |
| `IGenerationAssetStorage` | storage-port.ts | `generationAssetStorage` | `@/infrastructure/storage/asset/asset-storage` | 否 |
| `IElementManager` | element-manager-port.ts | `elementManager` | `@/modules/shot` | 是 |
| `IElementStorage` | element-storage-port.ts | `elementStorage` | `@/infrastructure/storage/elements` | 否 |
| `IReferenceEngine` | reference-engine-port.ts | `referenceEngine` | `@/modules/shot` | 是 |
| `ISyncStorage` | sync-port.ts | `syncStorage` | `@/infrastructure/storage/sqlite-core` + `core` | 否 |
| `IVersionStorage` | version-storage-port.ts | `versionStorage` | `@/infrastructure/storage/versions` | 否 |
| `ITemplateStorage` | template-storage-port.ts | `templateStorage` | `@/infrastructure/storage/templates` | 否 |
| `IMediaAssetRepository` | media-asset-repository-port.ts | `mediaAssetRepository` | `@/infrastructure/database` | 否 |
| `IFileStorage` | file-storage-port.ts | `fileStorage` | `@/infrastructure/storage/file-storage-factory` | 是 |

## 设计约定

### 可选方法（`?`）

部分 Port 含可选方法（如 `IVideoProvider.generatePartialEdit`、`IAudioProvider.transcribeAudio`、`IEmbeddingProvider.generateEmbeddings`）。调用前应检查方法是否存在：`if (provider.generatePartialEdit) { ... }`。可选方法通常代表特定模型/提供商才支持的能力。

### 乐观锁版本

`ICharacterStorage`、`ISceneStorage`、`IStoryStorage` 的 `update*` 方法接受可选的 `version` 参数，用于乐观锁并发控制。传入版本号与数据库当前版本不匹配时更新失败。

### 返回类型约定

- 大多数 Port 方法返回 `Promise<void>` 或 `Promise<T | null>`，错误通过抛异常传递
- `IMediaAssetRepository` 是唯一返回 `Promise<Result<T>>` 的 Port，采用显式错误处理（不抛异常）
- `ISyncStorage.safeQuery<T>` 使用泛型返回 `Promise<T[]>`

### Port 与 Storage 的区分

`IElementManager`（Port，位于 `@/modules/shot`，懒加载）与 `IElementStorage`（Port，位于 `@/infrastructure/storage`）方法高度相似。区别：

- `IElementManager` 额外提供 `bindAsset`/`unbindAsset` 资产绑定，是面向用例的高层接口
- `IElementStorage` 额外提供 `notify()` 主动通知，是面向持久化的底层接口
- `IElementManager` 通常基于 `IElementStorage` 实现
