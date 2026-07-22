# API 参考手册 — 第一部分：领域层与共享逻辑层

> 自动生成于 2026-07-23。基于 `src/domain/` 和 `src/shared-logic/` 实际代码扫描。
> 所有签名均从源码中精确提取，包含完整的参数类型和返回类型。

---

## 目录

- [1. 领域层 (src/domain)](#1-领域层-srcdomain)
  - [1.1 端口接口 (domain/ports)](#11-端口接口-domainports)
  - [1.2 Schema (domain/schemas)](#12-schema-domainschemas)
  - [1.3 类型 (domain/types)](#13-类型-domaintypes)
  - [1.4 领域服务 (domain/services)](#14-领域服务-domainservices)
  - [1.5 领域工具 (domain/utils)](#15-领域工具-domainutils)
  - [1.6 视频任务状态机 (domain/video)](#16-视频任务状态机-domainvideo)
- [2. 共享逻辑层 (src/shared-logic)](#2-共享逻辑层-srcshared-logic)
  - [2.0 零外部依赖原则](#20-零外部依赖原则)
  - [2.1 shot/ 子模块](#21-shot-子模块)
  - [2.2 prompt/ 子模块](#22-prompt-子模块)
  - [2.3 video/ 子模块](#23-video-子模块)
  - [2.4 story/ 子模块](#24-story-子模块)
  - [2.5 timeline/ 子模块](#25-timeline-子模块)
  - [2.6 retry/ 子模块](#26-retry-子模块)
  - [2.7 agent/ 子模块](#27-agent-子模块)
  - [2.8 json/ 子模块](#28-json-子模块)
  - [2.9 migration/ 子模块](#29-migration-子模块)

---

## 1. 领域层 (src/domain)

领域层是纯类型与抽象接口层，**不包含任何业务实现**。它定义 Port 接口（供基础设施实现）、Zod Schema（数据验证）、纯类型定义、以及少量无副作用的领域服务与工具函数。

### 依赖方向（CRITICAL）

```
domain/ → NOTHING（纯类型，零外部依赖）
```

- `domain/` 不得导入 `@/modules/*`、`@/infrastructure/*`、`@/shared-logic/*`
- Port 接口仅由基础设施层实现，通过 DI 容器注入到模块层

### 1.1 端口接口 (domain/ports)

所有 Port 接口通过 `src/domain/ports/index.ts` 统一 barrel 导出。模块应从 `@/domain/ports` 导入。与 `docs/ports.md` 保持一致。

#### storage-port.ts — 存储端口集合

包含 6 个存储 Port 接口，统一管理视频任务、角色、场景、故事、子分镜、生成资产的持久化。

##### `IVideoTaskStorage`

视频任务存储端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `getVideoTasks` | `(): Promise<VideoTask[]>` | 获取所有视频任务 |
| `getVideoTaskById` | `(taskId: string): Promise<VideoTask \| null>` | 按 ID 获取视频任务 |
| `getVideoTasksByStory` | `(storyId: string): Promise<VideoTask[]>` | 按故事 ID 获取视频任务 |
| `getVideoTasksByStatus` | `(status: string): Promise<VideoTask[]>` | 按状态获取视频任务 |
| `getPendingVideoTasks` | `(): Promise<VideoTask[]>` | 获取待处理视频任务 |
| `createVideoTask` | `(task: Partial<VideoTask> & { taskId: string }): Promise<void>` | 创建视频任务 |
| `updateVideoTask` | `(taskId: string, updates: Partial<VideoTask>): Promise<void>` | 更新视频任务 |
| `deleteVideoTask` | `(taskId: string): Promise<void>` | 删除视频任务 |
| `deleteVideoTasksByStatus` | `(statuses: string[]): Promise<void>` | 按状态批量删除视频任务 |
| `deleteVideoTasksByBeatId` | `(beatId: string): Promise<void>` | 按分镜 ID 删除视频任务 |
| `deleteVideoTasksByStoryId` | `(storyId: string): Promise<void>` | 按故事 ID 删除视频任务 |
| `deleteExpiredVideoTasks` | `(): Promise<number>` | 删除过期视频任务，返回删除数量 |
| `clearVideoTasks` | `(): Promise<void>` | 清空所有视频任务 |
| `bulkPutVideoTasks` | `(tasks: Partial<VideoTask>[]): Promise<void>` | 批量写入视频任务 |
| `batchUpdateVideoTasks` | `(updates: Array<{ taskId: string; updates: Partial<VideoTask> }>): Promise<void>` | 批量更新视频任务 |
| `batchDeleteVideoTasks` | `(taskIds: string[]): Promise<void>` | 批量删除视频任务 |

##### `ICharacterStorage`

角色存储端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `getCharacters` | `(): Promise<Character[]>` | 获取所有角色 |
| `getCharacterById` | `(id: string): Promise<Character \| null>` | 按 ID 获取角色 |
| `getCharacterVersion` | `(id: string): Promise<number \| null>` | 获取角色版本号 |
| `createCharacter` | `(character: Partial<Character>): Promise<void>` | 创建角色 |
| `updateCharacter` | `(id: string, updates: Partial<Character>, version?: number): Promise<void>` | 更新角色（乐观锁） |
| `deleteCharacter` | `(id: string): Promise<void>` | 删除角色 |
| `incrementCharacterUseCount` | `(id: string): Promise<void>` | 增加角色使用计数 |
| `getOutfitsForCharacter` | `(characterId: string): Promise<CharacterOutfit[]>` | 获取角色服装列表 |
| `saveOutfitsForCharacter` | `(characterId: string, outfits: CharacterOutfit[]): Promise<void>` | 保存角色服装列表 |
| `updateOutfitImage` | `(outfitId: string, imageUrl: string, localImagePath?: string): Promise<void>` | 更新服装图片 |

##### `ISceneStorage`

场景存储端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `getScenes` | `(): Promise<Scene[]>` | 获取所有场景 |
| `getSceneById` | `(id: string): Promise<Scene \| null>` | 按 ID 获取场景 |
| `getSceneVersion` | `(id: string): Promise<number \| null>` | 获取场景版本号 |
| `createScene` | `(scene: Partial<Scene>): Promise<void>` | 创建场景 |
| `updateScene` | `(id: string, updates: Partial<Scene>, version?: number): Promise<void>` | 更新场景（乐观锁） |
| `deleteScene` | `(id: string): Promise<void>` | 删除场景 |

##### `IStoryStorage`

故事存储端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `getStories` | `(): Promise<Story[]>` | 获取所有故事 |
| `getStoryById` | `(id: string): Promise<Story \| null>` | 按 ID 获取故事 |
| `getStoryByBeatId` | `(beatId: string): Promise<Story \| null>` | 按分镜 ID 获取故事 |
| `getStoryVersion` | `(id: string): Promise<number \| null>` | 获取故事版本号 |
| `createStory` | `(story: Partial<Story>): Promise<void>` | 创建故事 |
| `updateStory` | `(id: string, updates: Partial<Story>, version?: number): Promise<void>` | 更新故事（乐观锁） |
| `updateStoryStatus` | `(id: string, status: StoryStatus): Promise<void>` | 更新故事状态 |
| `deleteStory` | `(id: string): Promise<void>` | 删除故事 |
| `duplicateStory` | `(sourceId: string, newTitle: string): Promise<string>` | 复制故事，返回新故事 ID |
| `searchStories` | `<T = Story>(options: StorySearchOptions): Promise<T[]>` | 搜索故事（支持模糊/过滤/排序/分页） |
| `countStories` | `(options: StorySearchOptions): Promise<number>` | 统计符合搜索条件的故事数量 |

**`StorySearchOptions`**（故事搜索选项）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `query` | `string?` | 对 title + description 做 LIKE 模糊匹配 |
| `status` | `StoryStatus[]?` | 按 IN 条件过滤；空数组忽略 |
| `genre` | `string[]?` | 按类型过滤 |
| `tone` | `string[]?` | 按基调过滤 |
| `sortBy` | `"updatedAt" \| "createdAt" \| "title"?` | 排序字段，默认 `updatedAt` |
| `sortOrder` | `"asc" \| "desc"?` | 排序方向，默认 `desc` |
| `limit` | `number?` | 分页大小 |
| `offset` | `number?` | 分页偏移 |

##### `ISubShotStorage`

子分镜存储端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `getSubShotsByBeatId` | `(beatId: string): Promise<SubShot[]>` | 按分镜 ID 获取子分镜 |
| `getSubShotById` | `(id: string): Promise<SubShot \| null>` | 按 ID 获取子分镜 |
| `createSubShot` | `(subShot: Partial<SubShot> & { id: string; storyBeatId: string }): Promise<void>` | 创建子分镜 |
| `updateSubShot` | `(id: string, updates: Partial<SubShot>): Promise<void>` | 更新子分镜 |
| `deleteSubShot` | `(id: string): Promise<void>` | 删除子分镜 |
| `deleteSubShotsByBeatId` | `(beatId: string): Promise<void>` | 按分镜 ID 删除所有子分镜 |
| `reorderSubShots` | `(beatId: string, orderedIds: string[]): Promise<void>` | 重排子分镜顺序 |

##### `IGenerationAssetStorage`

生成资产存储端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `getAssetsByType` | `(type: string): Promise<GenerationAsset[]>` | 按类型获取资产 |
| `getAssetsByProject` | `(projectId: string): Promise<GenerationAsset[]>` | 按项目获取资产 |
| `getAssetsByStoryBeat` | `(beatId: string): Promise<GenerationAsset[]>` | 按分镜获取资产 |
| `getAssetsBySourceAssetId` | `(sourceAssetId: string): Promise<GenerationAsset[]>` | 查询原视频的所有局部重绘版本（Task 2A.22） |
| `getAssetById` | `(id: string): Promise<GenerationAsset \| null>` | 按 ID 获取资产 |
| `createAsset` | `(asset: Partial<GenerationAsset> & { id: string; type: string; sourceType: string; url: string }): Promise<void>` | 创建资产 |
| `updateAsset` | `(id: string, updates: Partial<GenerationAsset>): Promise<void>` | 更新资产 |
| `deleteAsset` | `(id: string): Promise<void>` | 删除资产 |
| `deleteUnreferencedAssets` | `(): Promise<number>` | 删除未被引用的资产，返回删除数量 |

#### ai-provider-port.ts — AI Provider 端口

##### `IVideoProvider`

视频生成 Provider 端口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `generateVideo` | `(prompt: string, options?: { firstFrameUrl?; lastFrameUrl?; characterRefs?; characterRef?; sceneRef?; duration?; referenceVideo?; providerId?; modelId?; format? }): Promise<ApiResponse<VideoGenerationResult>>` | 生成视频 |
| `queryVideoStatus` | `(taskId: string, options?: { providerId?; modelId?; format? }): Promise<ApiResponse<{ status; videoUrl?; progress?; message? }>>` | 查询视频生成状态 |
| `generateKeyframe` | `(params: { characterRefs?; characterRef?; sceneRef?; prevKeyframe?; shotRequirement?; content?; providerId?; modelId?; format? }): Promise<ApiResponse<{ imageUrl; source?; prompt? }>>` | 生成关键帧 |
| `generateFramePair` | `(params: { keyframeUrl; keyframePrompt?; characterRefs?; characterRef?; sceneRef?; prevLastFrameUrl?; actionDescription?; duration?; providerId?; modelId?; format? }): Promise<ApiResponse<{ firstFrame; lastFrame; generatedAt }>>` | 生成首末帧对 |
| `generateVideoWithFrames` | `(params: { prompt; firstFrameUrl?; lastFrameUrl?; characterRefs?; characterRef?; sceneRef?; duration?; providerId?; modelId?; format?; referenceVideo? }): Promise<ApiResponse<VideoGenerationResult>>` | 基于首末帧生成视频 |
| `generatePartialEdit?` | `(input: { sourceVideoUrl; maskBase64; prompt; videoTimestamp; preserveUnmasked; providerId?; modelId?; format?; duration? }): Promise<ApiResponse<VideoGenerationResult>>` | 局部重绘（可选，仅 supportsPartialEdit 模型支持） |
| `cancelTask?` | `(taskId: string): Promise<void>` | 取消任务（best-effort，可选） |

##### `IImageProvider`

图像生成 Provider 端口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `generateImage` | `(prompt: string, type?: string, options?: { size?; providerId?; modelId?; purpose? }): Promise<ApiResponse<ImageGenerationResult>>` | 生成图像 |
| `analyzeImage` | `(imageUrl: string, type?: "character" \| "scene", prompt?: string, options?: { providerId?; modelId? }): Promise<ApiResponse<{ analysis; analyzed? }>>` | 分析图像 |

##### `ITextProvider`

文本生成 Provider 端口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `generateText` | `(prompt: string, options?: { maxTokens?; temperature?; providerId?; modelId? }): Promise<ApiResponse<{ text }>>` | 文本生成 |
| `generateTextStream` | `(prompt: string, options?: { maxTokens?; temperature?; providerId?; modelId?; tools?; onChunk; signal? }): Promise<ApiResponse<{ text }>>` | 流式文本生成（Task 1.0），支持外部 abort |
| `generateChat` | `(messages: LLMMessage[], options?: { maxTokens?; temperature?; providerId?; modelId?; tools?; onChunk?; signal? }): Promise<ApiResponse<{ text }>>` | 原生对话补全，支持 function calling |

##### `IFileUploader`

文件上传 Provider 端口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `uploadFile` | `(file: File): Promise<{ success: true; data: { url; [key]: unknown }; source?; error?; message? } \| { success: false; error; message?; data? }>` | 上传文件 |

##### `IEmbeddingProvider`

向量嵌入生成 Provider 端口（用于语义检索）。

| 方法 | 签名 | 说明 |
|------|------|------|
| `generateEmbedding` | `(input: string, options?: { providerId?; modelId? }): Promise<ApiResponse<{ embedding: number[] }>>` | 生成单段文本向量 |
| `generateEmbeddings?` | `(inputs: string[], options?: { providerId?; modelId? }): Promise<ApiResponse<{ embeddings: number[][] }>>` | 批量生成向量（可选） |

##### `IAudioProvider`

音频 Provider 端口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `synthesizeSpeech` | `(text: string, options?: { voice?; format?; speed?; providerId?; modelId? }): Promise<ApiResponse<{ audioUrl; duration? }>>` | 文字转语音（TTS） |
| `transcribeAudio?` | `(audioUrl: string, options?: { language?; providerId?; modelId? }): Promise<ApiResponse<{ text; segments? }>>` | 语音转文字（可选） |

**`AudioCapability`** 类型：`"tts" | "stt" | "music" | "voiceover"`

**辅助类型**（同文件导出）：
- `ToolDef` — 工具定义（OpenAI function-calling 格式）
- `ToolCall` — 工具调用请求
- `StreamChunk` — 流式生成 chunk

#### sync-port.ts — 同步存储端口

##### `ISyncStorage`

| 方法 | 签名 | 说明 |
|------|------|------|
| `safeQuery` | `<T>(sql: string, params?: unknown[]): Promise<T[]>` | 安全查询 |
| `safeRun` | `(sql: string, params?: unknown[]): Promise<DbRunResult>` | 安全执行 |
| `safeTransaction` | `(statements: { sql; params: unknown[] }[]): Promise<unknown[]>` | 安全事务 |
| `registerChangeTracker` | `(tracker: (entityType: string, entityId: string, operation: string) => Promise<void>): void` | 注册变更跟踪器 |
| `unregisterChangeTracker` | `(): void` | 注销变更跟踪器 |

**`DbRunResult`**：`{ changes?: number; lastInsertRowid?: number }`

#### element-manager-port.ts — 元素管理器端口

##### `IElementManager`

元素生命周期管理、资产绑定、更新通知端口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `subscribe` | `(listener: UpdateListener): () => void` | 订阅元素更新通知，返回取消订阅函数 |
| `getLibrary` | `(): Promise<ElementLibrary>` | 获取完整元素库 |
| `createElement` | `(type: ElementType, name: string, description?: string): Promise<StoryElement>` | 创建故事元素 |
| `bindAsset` | `(elementId: string, asset: AssetBinding): Promise<StoryElement>` | 绑定资产到元素 |
| `unbindAsset` | `(elementId: string, assetUrl: string): Promise<StoryElement>` | 解绑资产 |
| `getElement` | `(elementId: string): Promise<StoryElement \| undefined>` | 按 ID 获取元素 |
| `getAllElements` | `(): Promise<StoryElement[]>` | 获取所有元素 |
| `getElementsByType` | `(type: ElementType): Promise<StoryElement[]>` | 按类型获取元素 |
| `deleteElement` | `(elementId: string): Promise<void>` | 删除元素 |
| `updateElement` | `(elementId: string, updates: Partial<StoryElement>): Promise<StoryElement>` | 更新元素 |

#### reference-engine-port.ts — 引用引擎端口

##### `IReferenceEngine`

分镜间引用的验证、解析、视频 URL 解析端口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `validateReference` | `(shot: StoryBeat, allShots: StoryBeat[], reference: ShotReference): ReferenceValidationResult` | 校验分镜引用 |
| `getTargetShot` | `(shot: StoryBeat, allShots: StoryBeat[], reference: ShotReference): StoryBeat \| undefined` | 解析目标分镜 |
| `getReferenceVideoUrl` | `(shot: StoryBeat, allShots: StoryBeat[], reference: ShotReference): string \| undefined` | 获取引用视频 URL |
| `buildReferenceDescription` | `(shot: StoryBeat, allShots: StoryBeat[], reference: ShotReference): string` | 构建引用描述 |

**`ReferenceValidationResult`**：`{ valid: boolean; error?; errors?: string[]; warnings?: string[] }`

#### version-storage-port.ts — 版本存储端口

##### `IVersionStorage`

| 方法 | 签名 | 说明 |
|------|------|------|
| `getStoryVersions` | `<T = StoryVersion>(storyId: string): Promise<T[]>` | 获取故事版本列表 |
| `createStoryVersion` | `(version: StoryVersion): Promise<void>` | 创建故事版本 |
| `deleteStoryVersion` | `(versionId: string): Promise<void>` | 删除故事版本 |
| `deleteOldStoryVersions` | `(storyId: string, keepCount: number): Promise<void>` | 删除旧版本，保留指定数量 |

#### element-storage-port.ts — 元素存储端口

##### `IElementStorage`

| 方法 | 签名 | 说明 |
|------|------|------|
| `subscribe` | `(listener: UpdateListener): () => void` | 订阅更新通知 |
| `notify` | `(): void` | 触发通知 |
| `getLibrary` | `(): Promise<ElementLibrary>` | 获取元素库 |
| `getElement` | `(elementId: string): Promise<StoryElement \| undefined>` | 按 ID 获取元素 |
| `getAllElements` | `(): Promise<StoryElement[]>` | 获取所有元素 |
| `getElementsByType` | `(type: ElementType): Promise<StoryElement[]>` | 按类型获取元素 |
| `createElement` | `(type: ElementType, name: string, description?: string): Promise<StoryElement>` | 创建元素 |
| `updateElement` | `(elementId: string, updates: Partial<StoryElement>): Promise<StoryElement>` | 更新元素 |
| `deleteElement` | `(elementId: string): Promise<void>` | 删除元素 |

#### template-storage-port.ts — 模板存储端口

##### `ITemplateStorage`

| 方法 | 签名 | 说明 |
|------|------|------|
| `getVideoTemplates` | `<T = Record<string, unknown>>(): Promise<T[]>` | 获取视频模板列表 |
| `createVideoTemplate` | `(template: Record<string, unknown>): Promise<void>` | 创建视频模板 |
| `saveASTTemplate` | `(meta: { id; name; description?; category?; genre?; tone?; tags?; author?; totalDuration; beatsCount; charactersCount?; scenesCount?; astFilePath?; astFileSize?; isPublic?; parentTemplateId? }): Promise<void>` | 保存 AST 模板 |
| `getASTTemplate` | `(id: string): Promise<Record<string, unknown> \| null>` | 获取 AST 模板 |
| `getASTTemplates` | `(filters?: { category?; search?; sortBy?: "created" \| "usage" \| "name"; limit? }): Promise<Record<string, unknown>[]>` | 查询 AST 模板 |
| `deleteASTTemplate` | `(id: string): Promise<boolean>` | 删除 AST 模板 |
| `incrementASTTemplateUsage` | `(id: string): Promise<void>` | 增加模板使用计数 |

#### media-asset-repository-port.ts — 媒体资产仓库端口

##### `IMediaAssetRepository`

| 方法 | 签名 | 说明 |
|------|------|------|
| `findAll` | `(): Promise<Result<MediaAsset[]>>` | 查询全部媒体资产 |
| `findById` | `(id: string): Promise<Result<MediaAsset \| null>>` | 按 ID 查询 |
| `create` | `(input: Partial<MediaAsset> & { id: string }): Promise<Result<MediaAsset>>` | 创建资产 |
| `update` | `(input: Partial<MediaAsset> & { id: string }): Promise<Result<MediaAsset>>` | 更新资产 |
| `delete` | `(id: string): Promise<Result<void>>` | 删除资产 |

#### file-storage-port.ts — 文件存储端口

基于 key 寻址的文件 CRUD 端口，本地/云端双向兼容。

##### `IFileStorage`

| 方法 | 签名 | 说明 |
|------|------|------|
| `saveFile` | `(params: SaveFileParams): Promise<{ key: string }>` | 保存文件（buffer 或 base64） |
| `readFile` | `(key: string): Promise<Buffer \| null>` | 读取文件为 Buffer |
| `readFileAsBase64` | `(key: string): Promise<string \| null>` | 读取文件为 base64 data URL |
| `deleteFile` | `(key: string): Promise<boolean>` | 删除文件 |
| `exists` | `(key: string): Promise<boolean>` | 检查文件是否存在 |
| `copyFile` | `(params: CopyFileParams): Promise<{ key: string }>` | 复制文件 |
| `listFiles` | `(category: FileCategory): Promise<FileMetadata[]>` | 列出某类别下文件 |
| `getFileInfo` | `(key: string): Promise<FileMetadata \| null>` | 获取文件元数据 |
| `ensureDir` | `(category: FileCategory): Promise<void>` | 确保类别目录存在 |
| `writeFileAtomic` | `(params: WriteFileAtomicParams): Promise<{ key: string }>` | 原子写入（tmp + rename） |

**辅助类型**：
- `FileCategory` — `"character" | "scene" | "storyboard" | "video-cache" | "image-cache" | "upload" | "plugin"`
- `FileMetadata` — `{ key; category: FileCategory; size; mimeType; createdAt; updatedAt }`
- `SaveFileParams` — `{ category: FileCategory; key; data: Buffer | ArrayBuffer | string; mimeType? }`
- `CopyFileParams` — `{ sourceKey; targetCategory: FileCategory; targetKey }`
- `WriteFileAtomicParams` — `{ category: FileCategory; key; data: string | Buffer }`

---

### 1.2 Schema (domain/schemas)

所有 Zod Schema 通过 `src/domain/schemas/index.ts` 统一 barrel 导出。每个 schema 文件导出 schema 对象与 `z.infer` 推导的 TypeScript 类型。

#### character.ts

| Schema | 类型 | 说明 |
|--------|------|------|
| `characterSchema` | `Character` | 角色主体 |
| `characterOutfitSchema` | `CharacterOutfit` | 角色服装 |
| `characterAppearanceSchema` | `CharacterAppearance` | 角色外观 |
| `createCharacterInputSchema` | `CreateCharacterInput` | 创建角色输入 |
| `updateCharacterInputSchema` | `UpdateCharacterInput` | 更新角色输入 |

#### scene.ts

| Schema | 类型 | 说明 |
|--------|------|------|
| `sceneSchema` | `Scene` | 场景主体 |
| `sceneCameraSchema` | `SceneCamera` | 场景相机 |
| `sceneElementTypeSchema` | `SceneElementType` | 场景元素类型 |
| `sceneElementSchema` | `SceneElement` | 场景元素 |
| `createSceneInputSchema` | `CreateSceneInput` | 创建场景输入 |
| `updateSceneInputSchema` | `UpdateSceneInput` | 更新场景输入 |

#### story.ts

| Schema / 常量 | 类型 | 说明 |
|---------------|------|------|
| `storySchema` | `Story` | 故事主体 |
| `storyBeatSchema` | `StoryBeat` | 故事分镜 |
| `storyBeatKeyframeSchema` | `StoryBeatKeyframe` | 分镜关键帧 |
| `storyBeatFramePairSchema` | `StoryBeatFramePair` | 分镜首末帧对 |
| `storyBeatVideoSchema` | `StoryBeatVideoGeneration` | 分镜视频生成 |
| `elementBindingSchema` | `ElementBinding` | 元素绑定 |
| `sceneTransitionSchema` | `SceneTransition` | 场景转场 |
| `beatCameraSchema` | `BeatCamera` | 分镜相机 |
| `createStoryInputSchema` | `CreateStoryInput` | 创建故事输入 |
| `updateStoryInputSchema` | `UpdateStoryInput` | 更新故事输入 |
| `chainModeSchema` | `ChainMode` | 链式生成模式 |
| `beatInputSchema` | `BeatInput` | 分镜输入 |
| `frameInputSchema` | `FrameInput` | 帧输入 |
| `videoInputSchema` | `VideoInput` | 视频输入 |
| `referenceImageWeightSchema` | `ReferenceImageWeight` | 参考图权重 |
| `promptLabSchema` | `PromptLab` | Prompt 实验室 |
| `storyVersionSchema` | `StoryVersion` | 故事版本 |
| `storyStyleGuideSchema` | `StoryStyleGuide` | 故事风格指南 |
| `storyStatusSchema` | `StoryStatus` | 故事状态 |
| `STORY_STATUSES` | — | 故事状态常量数组 |
| `VALID_SHOT_TYPES` | — | 有效分镜类型常量数组 |

#### shot-system.ts

| Schema | 类型 | 说明 |
|--------|------|------|
| `shotInstructionSchema` | `ShotInstruction` / `ShotInstructionTemplate` | 分镜指令 |
| `featureAnchorItemSchema` | — | 特征锚点项 |
| `featureAnchoringSchema` | `FeatureAnchoringConfig` | 特征锚定配置 |
| `consistencyCheckResultSchema` | `ConsistencyCheckResult` | 一致性检查结果 |
| `shotReferenceSchema` | `ShotReference` | 分镜引用 |
| `shotGenerationStatusSchema` | `ShotGenerationStatus` | 分镜生成状态 |
| `shotGenerationResultSchema` | `ShotGenerationResult` | 分镜生成结果 |
| `fixedImageSchema` | `FixedImageConfig` | 固定图像配置 |
| `referenceVideoSchema` | `ReferenceVideoConfig` | 参考视频配置 |
| `templateConfigSchema` | `TemplateConfig` | 模板配置 |
| `elementTypeSchema` | `ElementType` | 元素类型 |
| `assetTypeSchema` | `AssetType` | 资产类型 |
| `assetBindingSchema` | `AssetBinding` | 资产绑定 |
| `referenceImageQualitySchema` | `ReferenceImageQuality` | 参考图质量 |
| `elementFeatureAnchorSchema` | `ElementFeatureAnchor` | 元素特征锚点 |
| `storyElementSchema` | `StoryElement` | 故事元素 |
| `elementLibrarySchema` | `ElementLibrary` | 元素库 |

#### api.ts

| Schema | 类型 | 说明 |
|--------|------|------|
| `apiConfigSchema` | `ApiConfig` | API 配置 |
| `apiErrorCodeSchema` | `ApiErrorCode` | API 错误码 |
| `apiResponseSchema` | `ApiResponse` | API 响应包装 |
| `imageGenerationResultSchema` | `ImageGenerationResult` | 图像生成结果 |
| `videoGenerationResultSchema` | `VideoGenerationResult` | 视频生成结果 |
| `videoTaskStatusSchema` | `VideoTaskStatus` | 视频任务状态 |
| `videoTaskSchema` | `VideoTask` | 视频任务 |
| `healthStatusSchema` | `HealthStatus` | 健康状态 |
| `userApiConfigSchema` | `UserApiConfig` | 用户 API 配置 |

附加类型：`ModelSelection`

#### llm-message.ts

| 类型 | 说明 |
|------|------|
| `LLMMessage` | LLM 消息（OpenAI chat 格式） |
| `ToolDef` | 工具定义 |
| `ToolCall` | 工具调用 |
| `StreamChunk` | 流式 chunk |
| `ChatCompletionRequest` | 对话补全请求 |
| `ChatCompletionResponse` | 对话补全响应 |
| `ProviderCapability` | Provider 能力 |

#### media.ts

| Schema | 类型 | 说明 |
|--------|------|------|
| `mediaAssetSchema` | `MediaAsset` | 媒体资产 |
| `videoTemplateShotSchema` | `VideoTemplateShot` | 视频模板分镜 |
| `videoTemplateSchema` | `VideoTemplate` | 视频模板 |
| `collectionSchema` | `Collection` | 资产集合 |
| `collectionAssetSchema` | `CollectionAsset` | 集合资产 |
| `batchTaskSchema` | `BatchTask` | 批量任务 |
| `batchTaskResultSchema` | `BatchTaskResult` | 批量任务结果 |
| `storyboardAssetSchema` | `StoryboardAsset` | 分镜板资产 |
| `asaExportDataSchema` | `AsaExportData` | ASA 导出数据 |
| `searchResultSchema` | `SearchResult` | 搜索结果 |
| `enhancedVideoGenerationParamsSchema` | `EnhancedVideoGenerationParams` | 增强视频生成参数 |

附加类型：`MediaAssetType`、`AssetLibraryType`、`ImportMode`

#### shot.ts

| Schema | 类型 | 说明 |
|--------|------|------|
| `subShotSchema` | `SubShot` | 子分镜 |

#### asset.ts

| Schema / 枚举 | 类型 | 说明 |
|---------------|------|------|
| `assetTypeEnum` | — | 资产类型枚举 |
| `generationAssetSchema` | `GenerationAsset`（别名 `GenerationAssetType`） | 生成资产 |

#### prop.ts — 道具库（Task 2A.8）

| Schema / 枚举 | 类型 | 说明 |
|---------------|------|------|
| `propTypeEnum` | — | 道具类型枚举 |
| `propSchema` | `Prop` | 道具 |
| `createPropInputSchema` | `CreatePropInput` | 创建道具输入 |
| `updatePropInputSchema` | `UpdatePropInput` | 更新道具输入 |

附加类型：`PropType`

#### character-variant.ts — 角色变体（Task 2A.10）

| Schema | 类型 | 说明 |
|--------|------|------|
| `characterVariantSchema` | `CharacterVariant` | 角色变体 |
| `createCharacterVariantInputSchema` | `CreateCharacterVariantInput` | 创建角色变体输入 |
| `updateCharacterVariantInputSchema` | `UpdateCharacterVariantInput` | 更新角色变体输入 |

#### scene-variant.ts — 场景变体（Q3-1）

| Schema | 类型 | 说明 |
|--------|------|------|
| `sceneVariantSchema` | `SceneVariant` | 场景变体 |
| `createSceneVariantInputSchema` | `CreateSceneVariantInput` | 创建场景变体输入 |
| `updateSceneVariantInputSchema` | `UpdateSceneVariantInput` | 更新场景变体输入 |

#### timeline.ts — 时间线维度建模（Q3-3）

| Schema | 类型 | 说明 |
|--------|------|------|
| `storyTimelineSchema` | `StoryTimeline` | 故事时间线 |
| `createStoryTimelineInputSchema` | `CreateStoryTimelineInput` | 创建时间线输入 |
| `updateStoryTimelineInputSchema` | `UpdateStoryTimelineInput` | 更新时间线输入 |
| `plotNodeSchema` | `PlotNode` | 剧情节点 |
| `createPlotNodeInputSchema` | `CreatePlotNodeInput` | 创建剧情节点输入 |
| `updatePlotNodeInputSchema` | `UpdatePlotNodeInput` | 更新剧情节点输入 |
| `plotEventTypeSchema` | `PlotEventType` | 剧情事件类型 |
| `timelineTypeSchema` | `TimelineType` | 时间线类型 |
| `snapshotStrategySchema` | `SnapshotStrategy` | 快照策略 |

#### blockout-scene.ts — 3D 白盒预览（Task 2A.21）

仅类型导出（类型定义在 domain 层，工厂函数/预设库在 `@/modules/blockout-3d`）：

`Vec3`、`Vec2`、`GroundType`、`GroundPlane`、`PrimitiveType`、`PrimitiveShape`、`LightingType`、`LightingPreset`、`ShotCamera`、`PosePreset`、`PoseMetadata`、`HeightPreset`、`HeightMetadata`、`Mannequin`、`CameraInterpolation`、`CameraKeyframe`、`CameraPath`、`CameraPathValidation`、`BlockoutScene`

---

### 1.3 类型 (domain/types)

通过 `src/domain/types/index.ts` 统一 barrel 导出。

#### memory.ts

| 类型 | 说明 |
|------|------|
| `ArchivalMemoryEntry` | 归档记忆条目 |

#### cloud-provider.ts

| 类型 | 说明 |
|------|------|
| `CloudProviderInfo` | 云 Provider 信息 |

#### video-model.ts

| 类型 | 说明 |
|------|------|
| `VideoModelFormat` | 视频模型格式 |

#### result.ts — Result 类型与错误体系

**类型**：

| 类型 | 说明 |
|------|------|
| `Result<T>` | Result 类型（成功/失败联合） |
| `GenerationType` | 生成类型 |

**类**：

| 类 | 说明 |
|----|------|
| `AppError` | 应用错误基类 |
| `DatabaseError` | 数据库错误 |
| `ValidationError` | 校验错误 |
| `ApiError` | API 错误 |
| `NotFoundError` | 未找到错误 |
| `NetworkError` | 网络错误 |
| `StorageError` | 存储错误 |
| `ConfigurationError` | 配置错误 |
| `GenerationError` | 生成错误 |
| `TimeoutError` | 超时错误 |
| `RateLimitError` | 限流错误 |
| `AuthenticationError` | 认证错误 |

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `ok` | `<T>(value: T): Result<T>` | 构造成功结果 |
| `err` | `<T>(error: AppError): Result<T>` | 构造失败结果 |
| `fromThrowable` | `<T>(fn: () => T): Result<T>` | 同步函数包装 |
| `fromAsyncThrowable` | `<T>(fn: () => Promise<T>): Promise<Result<T>>` | 异步函数包装 |

#### sync.ts — 同步类型与工具

**类型**：`SyncStatus`、`SyncEntityType`、`ChangeOperation`、`VectorClock`、`SyncChangeLogEntry`、`SyncPushResult`、`SyncPullResult`、`RemoteChange`、`SyncConflict`、`SyncStatusInfo`、`ConflictStrategy`、`SyncConfig`

**常量**：

| 常量 | 说明 |
|------|------|
| `SYNC_TABLES` | 同步表清单 |
| `DEFAULT_SYNC_CONFIG` | 默认同步配置 |

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `createVectorClock` | `(nodeId: string): VectorClock` | 创建向量时钟 |
| `incrementVectorClock` | `(clock: VectorClock, nodeId: string): VectorClock` | 递增向量时钟 |
| `mergeVectorClocks` | `(a: VectorClock, b: VectorClock): VectorClock` | 合并向量时钟 |
| `compareVectorClocks` | `(a: VectorClock, b: VectorClock): "before" \| "after" \| "equal" \| "concurrent"` | 比较向量时钟 |
| `isVectorClockConflict` | `(a: VectorClock, b: VectorClock): boolean` | 判断是否冲突 |

#### electron-api.ts

| 类型 | 说明 |
|------|------|
| `VideoTaskRecord` | 视频任务记录 |
| `VideoTaskHistory` | 视频任务历史 |
| `CustomApiConfig` | 自定义 API 配置 |

#### error-codes.ts — 错误码分类

**类型**：`ErrorDomain`、`ErrorCodeEntry`、`ErrorCategory`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `isRetryable` | `(errorCode: string): boolean` | 判断错误码是否可重试 |
| `classifyError` | `(errorCode: string): ErrorCategory` | 错误码分类 |

#### agent-tools.ts

Agent 工具相关类型定义（详见源码）。

---

### 1.4 领域服务 (domain/services)

通过 `src/domain/services/index.ts` 统一 barrel 导出。领域服务为纯函数或常量对象，无副作用。

#### StoryGenerationService（story-generation-service.ts）

常量对象，包含故事生成相关纯函数：

| 方法 | 签名 | 说明 |
|------|------|------|
| `resolveGenerationContext` | `(ctx: BeatGenerationContext): ResolvedGenerationParams` | 解析分镜生成上下文（角色引用、场景引用等） |
| `buildVideoPrompt` | `(beat: StoryBeat, basePrompt: string, promptLanguage?: "en" \| "zh" \| "auto", styleGuide?: StoryStyleGuide, shotInstruction?: ShotInstruction): string` | 构建视频 prompt |
| `validateGenerationPrereqs` | `(beat: StoryBeat, type: "keyframe" \| "framePair" \| "video"): Result<void>` | 校验生成前置条件 |
| `buildChainReference` | `(beats: StoryBeat[], beatId: string): { prevBeat: StoryBeat \| null }` | 构建链式引用（前一镜） |

**类型**：`BeatGenerationContext`、`ResolvedGenerationParams`

#### BeatWorkflowService（beat-workflow-service.ts）

常量对象，管理分镜工作流步骤：

| 方法 | 签名 | 说明 |
|------|------|------|
| `getNextStep` | `(beat: StoryBeat): GenerationStep \| null` | 获取下一待执行步骤 |
| `getStepPrereqs` | `(step: GenerationStep): string` | 获取步骤前置条件描述 |
| `shouldAutoAdvance` | `(beat: StoryBeat): boolean` | 判断是否应自动推进 |

**类型**：
- `GenerationStep` — `"keyframe" | "framePair" | "video"`
- `BeatWorkflowResult` — `{ step; beat: StoryBeat; success; error? }`

#### reference-resolver.ts — 引用解析

| 函数 | 签名 | 说明 |
|------|------|------|
| `resolveCharacterRef` | `(character: Character, beat?: StoryBeat \| null, elements?: StoryElement[]): string \| undefined` | 解析单个角色引用 URL |
| `resolveCharacterRefs` | `(characterIds: string[], characters: Character[], beat?: StoryBeat \| null, elements?: StoryElement[]): string[]` | 批量解析角色引用 |
| `resolveSceneRef` | `(scene: { refImagePath?; scenePath?; generatedImage?; imageUrl? }): string \| undefined` | 解析场景引用 URL |

#### reference-check.ts — 引用检查

| 函数 | 签名 | 说明 |
|------|------|------|
| `checkCharacterReferences` | `(characterId: string, characterName: string, stories: Story[]): DeleteCheckResult` | 检查角色被哪些故事引用 |
| `checkSceneReferences` | `(sceneId: string, sceneName: string, stories: Story[]): DeleteCheckResult` | 检查场景被哪些故事引用 |
| `checkElementReferences` | `(elementId: string, elementName: string, stories: Story[], elementType?: "character" \| "scene"): DeleteCheckResult` | 通用元素引用检查 |

**类型**：
- `ReferenceInfo` — `{ elementId; elementType: "character" \| "scene"; elementName; usedInBeats: string[] }`
- `DeleteCheckResult` — `{ canDelete: boolean; references: ReferenceInfo[]; warningMessage? }`

---

### 1.5 领域工具 (domain/utils)

通过 `src/domain/utils/index.ts` 统一 barrel 导出。纯函数工具，供领域服务与模块复用。

#### shot-prompt.ts

| 导出 | 签名 | 说明 |
|------|------|------|
| `SHOT_SIZE_OPTIONS` | `Array<{ value; label; labelKey; description; descKey; keyword }>` | 景别选项 |
| `CAMERA_MOVEMENT_OPTIONS` | `Array<{ value; label; labelKey; description; descKey; keyword }>` | 运镜选项 |
| `CAMERA_ANGLE_OPTIONS` | `Array<{ value; label; labelKey; description; descKey; keyword }>` | 角度选项 |
| `shotInstructionToPrompt` | `(instruction: ResolvedShotInstruction): string` | 分镜指令转 prompt 文本 |
| `resolveShotInstruction` | `(beat: { shotInstruction?: ShotInstructionTemplate }): ResolvedShotInstruction \| null` | 解析分镜指令 |

**类型**：`ResolvedShotInstruction`

#### beat-prompt-builder.ts

| 函数 | 签名 | 说明 |
|------|------|------|
| `getBeatCharacterIds` | `(beat: { characterIds?: string[] }): string[]` | 获取分镜角色 ID |
| `generateBeatImagePrompt` | `(params: BeatImagePromptParams): string` | 生成分镜图像 prompt（增强模式） |
| `generateSimpleBeatImagePrompt` | `(beat: StoryBeat, characters: Character[], scenes: Scene[], frameType?: string): string` | 生成简单分镜图像 prompt |

**类型**：`BeatImagePromptParams` — `{ beat; characters; scenes; isEnhanced?; fixedImage?; featureAnchoring?; shotInstruction? }`

#### frame-pair-accessors.ts

| 函数 | 签名 | 说明 |
|------|------|------|
| `getFirstFrameUrl` | `(framePair: StoryBeatFramePair \| undefined): string \| undefined` | 获取首帧 URL（兼容新旧字段） |
| `getLastFrameUrl` | `(framePair: StoryBeatFramePair \| undefined): string \| undefined` | 获取末帧 URL（兼容新旧字段） |

#### prompt-vocabulary.ts — Prompt 词汇表

**常量**：

| 常量 | 类型 | 说明 |
|------|------|------|
| `QUALITY_TAGS_IMAGE` | `string[]` | 图像质量标签 |
| `QUALITY_TAGS_VIDEO` | `string[]` | 视频质量标签 |
| `STYLE_KEYWORDS` | `Record<string, string[]>` | 风格关键词 |
| `SCENE_TYPE_KEYWORDS` | `Record<string, string[]>` | 场景类型关键词 |
| `MOOD_KEYWORDS` | `Record<string, string[]>` | 基调关键词 |
| `LIGHTING_KEYWORDS` | `Record<string, string>` | 光照关键词 |
| `CAMERA_ANGLE_KEYWORDS`（导出别名 `PROMPT_CAMERA_ANGLE_KEYWORDS`） | `Record<string, string>` | 相机角度关键词 |
| `CAMERA_MOVEMENT_KEYWORDS` | `Record<string, string>` | 运镜关键词 |
| `TRANSITION_KEYWORDS` | `Record<string, string>` | 转场关键词 |
| `POSITION_KEYWORDS` | `Record<string, string>` | 位置关键词 |

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `joinParts` | `(parts: (string \| undefined \| null \| false)[], separator?: string): string` | 拼接非空片段 |
| `buildCharacterAppearanceDesc` | `(char: Character): string` | 构建角色外观描述 |
| `buildCharacterFullDesc` | `(char: Character): string` | 构建角色完整描述 |
| `buildSceneAtmosphereDesc` | `(scene: Scene): string` | 构建场景氛围描述 |
| `buildSceneVisualDesc` | `(scene: Scene): string` | 构建场景视觉描述 |
| `buildElementEffectDesc` | `(element: SceneElement): string` | 构建元素效果描述 |
| `buildFixedImageDesc` | `(config: FixedImageConfig): string` | 构建固定图像描述 |
| `buildReferenceVideoDesc` | `(config: ReferenceVideoConfig): string` | 构建参考视频描述 |
| `buildTemplateDesc` | `(config: TemplateConfig): string` | 构建模板描述 |
| `getStyleKeywords` | `(style: string): string[]` | 获取风格关键词 |
| `getSceneTypeKeywords` | `(type: string): string[]` | 获取场景类型关键词 |
| `getMoodKeywords` | `(mood: string): string[]` | 获取基调关键词 |

---

### 1.6 视频任务状态机 (domain/video)

#### task-state.ts

视频任务状态机定义。

**常量**：

| 常量 | 类型 | 说明 |
|------|------|------|
| `VALID_TRANSITIONS` | `Record<VideoTaskStatus, VideoTaskStatus[]>` | 合法状态转移表 |
| `TERMINAL_STATUSES` | `VideoTaskStatus[]` | 终态列表（`["completed", "cancelled"]`） |
| `STUCK_TASK_THRESHOLD_MS` | `number` | 卡住阈值（30 分钟，`30 * 60 * 1000`） |

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `isValidTransition` | `(from: VideoTaskStatus, to: VideoTaskStatus): boolean` | 校验状态转移合法性 |
| `isStuck` | `(task: VideoTask, nowMs?: number): boolean` | 判断任务是否卡住 |

**`TaskMachine`** 常量对象：

| 方法 | 签名 | 说明 |
|------|------|------|
| `canTransition` | `(from: VideoTaskStatus, to: VideoTaskStatus): boolean` | 状态转移判定（封装 `isValidTransition`） |

---

## 2. 共享逻辑层 (src/shared-logic)

### 2.0 零外部依赖原则

> **CRITICAL**：shared-logic 层是纯逻辑层，**零外部依赖**。

```
shared-logic/ → NOTHING（零外部依赖）
```

**强制规则**：

- **禁止**导入 `@/`、`@shared/`、`@domain/`、`@/modules/*`、`@/infrastructure/*` 等任何项目层
- **仅允许**本目录内的相对导入（如 `./shot/xxx`、`../prompt/xxx`）
- 所有类型必须自包含（inline 定义，不引用其他层的类型）
- 不依赖 logger；日志通过回调由调用方处理
- 不包含 I/O；纯函数 only

**路径别名**：
- 渲染进程：`@/shared-logic/*`
- 主进程：`@shared-logic/*`

**顶层 barrel**（`src/shared-logic/index.ts`）按命名空间聚合 9 个子模块：

```typescript
export * as shot from "./shot";
export * as prompt from "./prompt";
export * as video from "./video";
export * as story from "./story";
export * as retry from "./retry";
export * as agent from "./agent";
export * as json from "./json";
export * as migration from "./migration";
export * as timeline from "./timeline";
```

---

### 2.1 shot/ 子模块

分镜引用引擎、一致性检查、视觉一致性、情绪-运镜映射、角色一致性增强器。

#### reference-engine.ts — 分镜引用引擎

**常量**：

| 常量 | 类型 | 说明 |
|------|------|------|
| `ReferenceDirection` | `{ None; Previous; Next; Custom } as const` | 引用方向 |
| `ReferenceContentType` | `{ FullVideo; LastFrame; FirstFrame; VideoSegment } as const` | 引用内容类型 |

**类型**：`ReferenceDirectionType`、`ReferenceContentTypeType`、`Shot`（别名 `ReferenceShot`）、`Reference`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `validateReference` | `(shot: Shot, allShots: Shot[], reference: Reference): ValidationResult` | 校验分镜引用 |
| `getTargetShot` | `(shot: Shot, allShots: Shot[], reference: Reference): Shot \| undefined` | 解析目标分镜 |
| `getReferenceVideoUrl` | `(shot: Shot, allShots: Shot[], reference: Reference): string \| undefined` | 获取引用视频 URL |
| `buildReferenceDescription` | `(shot: Shot, allShots: Shot[], reference: Reference): string` | 构建引用描述 |

#### consistency-check.ts — 配置一致性检查

**类型**：`FeatureAnchoringConfig` — `{ enabled; characterAnchors: CharacterAnchor[]; disableFrameBinding? }`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `performConfigCheck` | `(params: ConfigCheckParams): ConfigCheckResult` | 执行生成配置完整性检查（参考图/特征标签是否就绪） |
| `validateFeatureAnchoringConfig` | `(config: FeatureAnchoringConfig): ValidationConfigResult` | 校验特征锚定配置 |
| `validateNoFrameBinding` | `(params: { videoRequestParams?: { previousLastFrameUrl?; fixedImage?: { lockType? } } }): ...` | 校验无帧绑定 |

#### reference-check.ts — 引用计数检查

**类型**：`Story`（别名 `ReferenceCheckStory`）、`ReferenceResult` — `{ isReferenced; referencingStories: { storyId; storyTitle; beatCount }[]; totalBeats }`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `checkCharacterReferences` | `(characterId: string, stories: Story[]): ReferenceResult` | 检查角色引用 |
| `checkSceneReferences` | `(sceneId: string, stories: Story[]): ReferenceResult` | 检查场景引用 |
| `checkMultipleCharacterReferences` | `(characterIds: string[], stories: Story[]): Record<string, ReferenceResult>` | 批量检查角色引用 |
| `checkMultipleSceneReferences` | `(sceneIds: string[], stories: Story[]): Record<string, ReferenceResult>` | 批量检查场景引用 |

#### visual-consistency-check.ts — 视觉一致性检查

**类型**：`Element`（别名 `VisualConsistencyElement`）、`Beat`（别名 `VisualConsistencyBeat`）

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `buildConsistencyPrompt` | `(element: Element): string` | 构建一致性检查 prompt |
| `parseConsistencyAnalysis` | `(analysis: string, _element: Element): ConsistencyResult` | 解析一致性分析结果 |
| `checkVisualConsistency` | `(apiGateway: ApiGateway, params: { generatedImageUrl?; referenceImageUrl?; element: Element }): Promise<ConsistencyResult>` | 异步视觉一致性检查 |
| `checkBeatElementConsistency` | `(apiGateway: ApiGateway, params: { beat: Beat; elements: Element[]; getGeneratedImageUrl: (elementId: string) => string \| undefined }): Promise<BeatConsistencyResult>` | 分镜元素一致性批量检查 |

#### mood-shot-mapping.ts — 情绪-运镜映射

**类型**：
- `ShotSize`（别名 `MoodShotSize`）— `"extreme_close" | "close" | "medium" | "wide" | "extreme_wide"`
- `CameraMovement`（别名 `MoodCameraMovement`）
- `CameraAngle`（别名 `MoodCameraAngle`）
- `MoodShotMapping`、`SceneVariantInput`、`ShotRecommendation`

**常量**：

| 常量 | 说明 |
|------|------|
| `MOOD_TO_CAMERA_MAPPING` | 情绪 → 运镜映射表 |
| `WEATHER_MODIFIERS` | 天气修饰符 |
| `CROWD_MODIFIERS` | 人群修饰符 |

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `recommendShotBySceneVariant` | `(variant: SceneVariantInput): ShotRecommendation` | 按场景变体推荐运镜 |

#### consistency-enhancer.ts — 角色一致性增强器（Task 2A.12）

**类型**：
- `ConsistencyStrategy` — `"multi_ref_fusion" | "single_ref" | "text_only"`
- `CharacterRefSource` — `"primary" | "default_variant" | "default_outfit" | ...`
- `CharacterRefCandidate` — `{ url; source: CharacterRefSource; authoritative?: boolean }`
- `PreprocessHint` — `{ centerCropToSquare; maxEdge; format }`
- `CharacterAssetInput`、`ModelConsistencyCapability`

**常量**：`DEFAULT_PREPROCESS_HINT`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `extractCharacterReferenceCandidates` | `(input: CharacterAssetInput): CharacterRefCandidate[]` | 提取角色参考图候选 |
| `selectConsistencyStrategy` | `(capability: ModelConsistencyCapability, availableCandidateCount: number): ConsistencyStrategy` | 选择一致性策略 |
| `selectReferenceImages` | `(candidates: CharacterRefCandidate[], strategy: ConsistencyStrategy, maxCharacterRefs: number): CharacterRefCandidate[]` | 选择参考图 |
| `buildConsistencyEnhancedCharacterRefs` | `(input: CharacterAssetInput, capability: ModelConsistencyCapability): string[]` | 构建增强角色引用 |
| `listAllCharacterReferenceOptions` | `(input: CharacterAssetInput): CharacterRefCandidate[]` | 列出所有角色参考选项 |
| `buildManualCharacterRefs` | `(selectedUrls: string[], capability: ModelConsistencyCapability): string[]` | 构建手动角色引用 |
| `describeConsistencyStrategy` | `(strategy: ConsistencyStrategy): string` | 描述策略（中文） |

---

### 2.2 prompt/ 子模块

Prompt 引擎、Prompt 服务、Compositor prompt、Skill 路由、安全改写、多语言词汇表。

#### prompt-engine.ts — Prompt 构建基础

**常量**：

| 常量 | 类型 | 说明 |
|------|------|------|
| `QUALITY_TAGS_IMAGE` | `string[]` | 图像质量标签 |
| `QUALITY_TAGS_VIDEO` | `string[]` | 视频质量标签 |
| `STYLE_KEYWORDS` | `Record<string, string>` | 风格关键词 |
| `SCENE_TYPE_MAP` | `Record<string, string>` | 场景类型映射 |
| `MOOD_MAP` | `Record<string, string>` | 基调映射 |
| `LIGHTING_MAP` | `Record<string, string>` | 光照映射 |
| `SHOT_TYPE_MAP` | `Record<string, string>` | 景别映射 |
| `CAMERA_MOVEMENT_MAP` | `Record<string, string>` | 运镜映射 |

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `joinParts` | `(parts: (string \| undefined \| null)[]): string` | 拼接非空片段（"，"分隔） |
| `buildCharacterFullDesc` | `(c: CharacterDesc): string` | 构建角色完整描述 |
| `buildSceneAtmosphereDesc` | `(s: SceneDesc): string` | 构建场景氛围描述 |
| `buildSceneVisualDesc` | `(s: SceneDesc): string` | 构建场景视觉描述 |

#### prompt-service.ts — Prompt 服务

**类型**：
- `CharacterInput`、`SceneInput`、`BeatInput`、`ElementInput`
- `VideoPromptParams` — `{ beat?; characters?; scenes?; elements?; shotInstruction?; index? }`
- `QuickModeParams` — `{ prompt; duration?; resolution?; style?; characters?; scene?; referenceImage? }`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `resolveBeatShotInfo` | `(beat: BeatInput): { shotSize?; cameraAngle?; cameraMovement? }` | 解析分镜运镜信息 |
| `buildShotInstructionFromLegacy` | `(params: { shotSize?; shotType?; cameraAngle?; cameraMovement? }): { shotSize; cameraAngle; cameraMovement } \| undefined` | 旧字段 → 新 shotInstruction 映射 |
| `generateCharacterImagePrompt` | `(character: CharacterInput, _options?: Record<string, unknown>): string` | 生成角色图像 prompt |
| `generateCharacterDetailedPromptInstruction` | `(character: CharacterInput): string` | 生成角色详细 prompt 指令 |
| `generateSceneImagePrompt` | `(scene: SceneInput, _options?: Record<string, unknown>): string` | 生成场景图像 prompt |
| `generateScenePromptOptimization` | `(description: string): string` | 生成场景 prompt 优化 |
| `generateVideoPrompt` | `(params: VideoPromptParams): string` | 生成视频 prompt |
| `generateSingleBeatPrompt` | `(params: VideoPromptParams): string` | 生成单镜 prompt（封装 `generateVideoPrompt`） |
| `generateQuickModeVideoPrompt` | `(params: QuickModeParams): string` | 生成快捷模式视频 prompt |
| `generateKeyframePrompt` | `(params: { content?; shotRequirement?; ... }): string` | 生成关键帧 prompt |
| `generateFirstFramePrompt` | `(params: { keyframePrompt?; actionDescription? }): string` | 生成首帧 prompt |
| `generateLastFramePrompt` | `(params: { keyframePrompt?; actionDescription?; duration? }): string` | 生成末帧 prompt |
| `generateStoryPlanPrompt` | `(params: StoryPlanParams): string` | 生成故事规划 prompt |
| `generateCharacterAnalysisPrompt` | `(): string` | 生成角色分析 prompt |
| `generateSceneAnalysisPrompt` | `(): string` | 生成场景分析 prompt |

#### compositor-prompt.ts — Compositor 合成 Prompt（Task 2A.9）

**类型**：
- `PropInput` — `{ id?; name?; type?; description?; tags? }`
- `CompositorPromptParams` — `{ character: CharacterInput; props?: PropInput[]; scene?: SceneInput; extraPrompt?: string }`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `generateCompositorPrompt` | `(params: CompositorPromptParams): string` | 拼装"角色 + 道具 + 场景 → 单图合成"prompt |

#### skills/ — Skill 路由（Task 1.4 v5.3 增强）

##### skills/index.ts — Skill 注册器

**类型**：`ProjectType`、`FailureDimension`、`FailureContext`、`ConversationTurn`、`AgentContext`、`Skill`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `registerSkill` | `(skill: Skill): void` | 注册 Skill（重复注册覆盖） |
| `getSkill` | `(id: string): Skill \| undefined` | 按 ID 获取 Skill |
| `listSkills` | `(): Skill[]` | 列出所有已注册 Skill |
| `clearSkills` | `(): void` | 清空注册表（仅测试） |
| `routeSkill` | `(userMessage: string): Skill` | 按 matchers 关键词匹配 Skill |

**核心 Skill 实例**（自动注册）：`interviewSkill`、`promptSkill`、`compressSkill`、`troubleshootSkill`、`qcSkill`

注册优先级：`troubleshoot > qc > interview > compress > prompt`

##### 扩展 Skill（Task 4.7 v5.3）

**camera-skill.ts**：
- 常量：`cameraSkill`
- 函数：`buildCameraInstruction(shotSize, movement, lens?)`、`recommendCameraByMood(mood)`
- 类型：`ShotSize`（别名 `ExtShotSize`）、`CameraMovement`（别名 `ExtCameraMovement`）、`LensParameter`、`CameraInstruction`

**lighting-skill.ts**：
- 常量：`lightingSkill`
- 函数：`buildLightingInstruction(type, supplement?)`、`recommendLightingByMood(mood)`
- 类型：`LightingType`、`LightingInstruction`

**characters-skill.ts**：
- 常量：`charactersSkill`
- 函数：`buildCharacterIdentity(identity)`、`buildMultiCharacterBlocking(blocking)`、`detectCharacterConflicts(characters)`
- 类型：`CharacterIdentity`（别名 `ExtCharacterIdentity`）、`MultiCharacterBlocking`（别名 `ExtMultiCharacterBlocking`）、`CharacterConflict`

**style-skill.ts**：
- 常量：`styleSkill`
- 函数：`buildStyleInstruction(style, supplement?)`、`rewriteIpStyle(input)`、`listSupportedStyles()`
- 类型：`VisualStyle`

**vfx-skill.ts**：
- 常量：`vfxSkill`
- 函数：`buildParticleEffect(particle, density?)`、`buildDestructionEffect(effect, scale?)`、`buildEnergyEffect(effect, intensity?)`、`buildWeatherEffect(weather)`
- 类型：`VfxCategory`、`VfxParticle`、`VfxWeather`

**audio-skill.ts**：
- 常量：`audioSkill`
- 函数：`buildDialogueInstruction(dialogue)`、`buildMusicInstruction(music)`、`buildEnvironmentInstruction(env)`、`buildAudioInstruction(instruction)`
- 类型：`AudioDialogue`、`AudioMusic`、`AudioEnvironment`、`AudioInstruction`

**其他 Skill 文件**：`interview-skill.ts`、`prompt-skill.ts`、`compress-skill.ts`、`troubleshoot-skill.ts`、`qc-skill.ts`（导出对应 Skill 实例）

##### skills/extended-types.ts

扩展 Skill 共享类型定义（`ShotSize`、`CameraMovement`、`LensParameter`、`CameraInstruction`、`LightingType`、`LightingInstruction`、`CharacterIdentity`、`MultiCharacterBlocking`、`VisualStyle`、`VfxCategory`、`VfxParticle`、`VfxWeather`、`AudioDialogue`、`AudioMusic`、`AudioEnvironment`、`AudioInstruction`）。

#### vocabulary/ — 多语言词汇表 + 模型 ID 防混淆（Task 4.7 v5.3）

##### vocabulary/multilingual.ts

**类型**：`SupportedLanguage`（`"zh" | "en" | "ja" | "ko" | "es" | "ru"`）、`MultilingualTerm`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `translate` | `(concept: string, lang: SupportedLanguage): string` | 翻译概念 |
| `getTranslations` | `(concept: string): Record<SupportedLanguage, string> \| null` | 获取概念的所有语言翻译 |
| `listConcepts` | `(): string[]` | 列出所有概念 |
| `buildMixedPrompt` | `(concepts: string[], primaryLang: SupportedLanguage, secondaryLang?: SupportedLanguage): string` | 跨语言混合 prompt 构建 |

##### vocabulary/model-name-map.ts

**类型**：`ModelIdEntry`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `lookupModelId` | `(modelId: string): ModelIdEntry \| null` | 查找模型 ID |
| `normalizeModelId` | `(modelId: string): string` | 归一化模型 ID |
| `getModelStandardName` | `(modelId: string): string` | 获取模型标准名 |
| `listModelEntries` | `(): ModelIdEntry[]` | 列出所有模型条目 |
| `listModelsByFamily` | `(family: string): ModelIdEntry[]` | 按家族列出模型 |
| `areSameModel` | `(idA: string, idB: string): boolean` | 判断两个 ID 是否同一模型 |

#### safety/ — 安全改写（Task 1.4 v5.3 → Task 4.12 生产级）

##### safety/ip-rewriter.ts — IP 安全改写

**类型**：`IpCategory`（`"celebrity" | "ip" | "brand"`）、`ConfidenceLevel`、`IpRewriteChange`、`IpRewriteResult`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `rewriteIp` | `(input: string): IpRewriteResult` | IP/名人/品牌关键词安全改写 |
| `needsUserConfirmation` | `(result: IpRewriteResult, threshold?: number): boolean` | 是否需要用户确认（默认阈值 0.9） |
| `listKnownKeywords` | `(): { celebrity: string[]; ip: string[]; brand: string[] }` | 列出已知关键词 |
| `getDatabaseStats` | `(): { celebrity; ip; brand; total }` | 数据库统计 |

##### safety/antislop.ts — 反空泛词汇过滤

**类型**：`AntislopReplacement`、`AntislopResult`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `filterAntislop` | `(input: string): AntislopResult` | 过滤 masterpiece/best quality 等空泛词 |
| `hasSlop` | `(input: string): boolean` | 判断是否含空泛词 |
| `listSlopVocabulary` | `(): Array<{ slop; replacement; reason }>` | 列出空泛词汇表 |

##### safety/filter-repair.ts — 误报修复（Task 4.12 新增）

**类型**：`BenignContext`（`"medical" | "education" | "news" | "art" | "scifi"`）、`FilterRepairItem`、`FilterRepairResult`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `repairFalsePositives` | `(input: string): FilterRepairResult` | 为医疗/教育/新闻等良性上下文添加注释 |
| `listBenignContextEntries` | `(): Array<{ trigger; context: BenignContext; annotation; reason }>` | 列出良性上下文条目 |
| `getBenignContextStats` | `(): Record<BenignContext, number>` | 良性上下文统计 |

---

### 2.3 video/ 子模块

视频任务参数构建、Provider 追踪、视频恢复。

#### video-task-params.ts — 视频任务参数构建

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `buildVideoGenerationParams` | `(params: { beat?; characters?; scenes?; elements?; shotInstruction?; firstFrameUrl?; lastFrameUrl?; duration?; ... }): { ... }` | 构建视频生成参数 |
| `buildQuickVideoParams` | `(params: { prompt?; duration?; resolution?; style?; characters?; scene?; referenceImage?; providerId?; ... }): { ... }` | 构建快捷模式视频参数 |
| `buildKeyframeGenerationParams` | `(params: { beat; prevBeat?; characterRef?; sceneRef?; providerId?; modelId? }): { prompt; ... }` | 构建关键帧生成参数 |
| `buildFramePairGenerationParams` | `(params: { beat; characterRef?; sceneRef?; providerId?; modelId? }): { firstFrame; lastFrame }` | 构建首末帧对生成参数 |

#### video-tracker.ts — Provider 追踪

**类型**：`TrackingInfo` — `{ providerName; taskId; apiUrl; model; apiKeyPreview; taskUrl?; queryEndpoint?; apiDocUrl? }`

**常量**：

| 常量 | 说明 |
|------|------|
| `PROVIDERS` | `Record<string, ProviderInfo>` — Provider 映射表（火山引擎等） |
| `DEFAULT_PROVIDER` | `ProviderInfo` — 默认 Provider（自定义 API） |

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `getProviderInfoByApiUrl` | `(apiUrl?: string): ProviderInfo` | 按 API URL 匹配 Provider |
| `buildTrackingInfoByApiUrl` | `(apiUrl?, taskId?, model?, apiKeyPreview?, ...): TrackingInfo` | 构建追踪信息 |

#### video-recovery.ts — 视频恢复

**常量**：

| 常量 | 值 | 说明 |
|------|----|------|
| `EXPIRY_HOURS` | `720` | 过期阈值（小时） |
| `MAX_POLL_DURATION_MS` | `30 * 60 * 1000` | 最大轮询时长（30 分钟） |
| `POLL_INTERVAL_MS` | `60 * 1000` | 轮询间隔（1 分钟） |
| `MAX_RECOVERY_ATTEMPTS` | `30` | 最大恢复尝试次数 |

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `recoverVideoByTaskId` | `(apiGateway: ApiGateway, taskId: string, taskRecord?: TaskRecord): Promise<RecoveryResult>` | 按任务 ID 恢复视频 |

---

### 2.4 story/ 子模块

故事服务、分镜板生成、Few-shot 示例、故事规划生成器。

#### story-service.ts — 故事服务

**类型**：
- `RawStoryBeat` — 原始分镜（LLM 输出，字段缩写）
- `StoryBeat` — 标准化分镜
- `StoryPlanValidationResult` — 故事规划校验结果

**re-export**：`StoryInput`、`GenerateStoryPlanOptions`、`TextGenerationResult`（来自 story-plan-generator）、`buildShotInstructionFromLegacy`（来自 prompt-service）

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `fixShotParams` | `(data: ShotParamsData): { fixed: ShotParamsData; autoFixed: string[] }` | 修复分镜参数 |
| `fixStoryBeat` | `(data: StoryBeatData): { fixed: StoryBeatData; autoFixed: string[] }` | 修复分镜数据 |
| `validateStoryPlan` | `(plan: RawStoryBeat[]): StoryPlanValidationResult` | 校验故事规划 |
| `parseStoryPlanJSON` | `(text: string): RawStoryBeat[] \| null` | 解析故事规划 JSON（支持 markdown 代码块） |
| `convertToStoryBeats` | `(rawBeats: RawStoryBeat[], enhancedGeneration?: boolean, idGenerator?: (index: number) => string): StoryBeat[]` | 转换为标准 StoryBeat |
| `generateStoryPlanWithValidation` | `(story: StoryInput, characters: unknown[], scenes: unknown[], options: GenerateStoryPlanOptions, generateTextFn: (prompt: string, opts: Record<string, unknown>) => Promise<TextGenerationResult>): Promise<GenerateStoryPlanResult>` | 带校验的故事规划生成（re-export from story-plan-generator） |

#### story-plan-generator.ts — 故事规划生成器

**类型**：
- `StoryInput` — `{ title?; description?; genre?; tone?; targetDuration? }`
- `GenerateStoryPlanOptions` — `{ maxRetries?; autoFix?; fewShotCount?; enhancedGeneration?; planPrompt? }`
- `TextGenerationResult` — `{ success; data?: { text? }; error? }`
- `GenerateStoryPlanResult` — `{ beats; validationResults; autoFixedCount; retryCount; fixDetails }`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `generateStoryPlanWithValidation` | `(story: StoryInput, characters: unknown[], scenes: unknown[], options: GenerateStoryPlanOptions, generateTextFn): Promise<GenerateStoryPlanResult>` | 带校验与重试的故事规划生成 |

#### storyboard-generation.ts — 分镜板生成

**类型**：
- `Beat`（别名 `StoryboardBeat`）— 分镜
- `ApiGateway`（别名 `StoryboardApiGateway`）— API 网关接口

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `generateBeatKeyframe` | `(apiGateway: ApiGateway, _promptService: unknown, beat: Beat, prevBeat?: Beat, options?: GenerationOptions): Promise<KeyframeResult>` | 生成分镜关键帧 |
| `generateBeatFramePair` | `(apiGateway: ApiGateway, _promptService: unknown, beat: Beat, options?: GenerationOptions): Promise<FramePairResult>` | 生成分镜首末帧对 |
| `generateBeatVideo` | `(apiGateway: ApiGateway, beat: Beat, options?: GenerationOptions): Promise<VideoResult>` | 生成分镜视频 |
| `generateBeatFullWorkflow` | `(apiGateway: ApiGateway, promptService: unknown, beat: Beat, prevBeat: Beat \| undefined, options: GenerationOptions, onProgress?: ProgressCallback): Promise<{ keyframe; framePair; videoTaskId }>` | 分镜完整工作流 |
| `generateKeyframeChain` | `(apiGateway: ApiGateway, promptService: unknown, beats: Beat[], options: { getCharacterRef?; getSceneRef?; providerId?; modelId?; ... }): Promise<...>` | 关键帧链式生成 |

#### story-few-shot.ts — Few-shot 示例

**类型**：`FewShotInput`、`FewShotOutput`、`FewShotExample`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `selectFewShotExamples` | `(context: FewShotInput, count?: number): FewShotExample[]` | 选择 few-shot 示例（默认 3 条） |
| `buildFewShotPrompt` | `(examples: FewShotExample[]): string` | 构建 few-shot prompt |

---

### 2.5 timeline/ 子模块

时间线状态推演引擎，包含状态传播、级联更新、绑定注入、跨时间线注入、重点快照、滑动窗口等。

#### state-propagation-engine.ts — 主算法

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `propagateStates` | `(timeline, plotEvents, ...) => PropagationResult` | 状态推演主入口 |
| `computeNextNodeSnapshots` | `(...) => NodeSnapshots` | 计算下一节点快照 |
| `computeCascadeEffects` | `(...) => ...` | 计算级联效果 |
| `getNodeSnapshots` | `(...) => NodeSnapshots` | 获取节点快照 |
| `getAllSnapshots` | `(...) => ...` | 获取所有快照 |

#### state-transition-rules.ts — 规则库

**常量**：

| 常量 | 说明 |
|------|------|
| `CHARACTER_RULES` | 角色状态转换规则 |
| `SCENE_RULES` | 场景状态转换规则 |
| `CASCADE_RULES` | 级联规则 |
| `NO_OP_EVENTS` | 无操作事件 |

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `isCharacterEvent` | `(event: string): boolean` | 判断是否角色事件 |
| `isSceneEvent` | `(event: string): boolean` | 判断是否场景事件 |
| `isNoOpEvent` | `(event: string): boolean` | 判断是否无操作事件 |
| `isCompoundEvent` | `(event: string): boolean` | 判断是否复合事件 |
| `createNoOpTransition` | `() => ...` | 创建无操作转换 |

#### cascade-update.ts — 级联更新与脏标记

**类型**：`CascadeUpdateMode`、`DirtyLevel`、`DirtyEntry`、`DirtyMap`、`IncrementalUpdateResult`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `markDirty` | `(...) => ...` | 标记脏 |
| `incrementalUpdate` | `(...) => IncrementalUpdateResult` | 增量更新 |
| `isDirty` | `(...) => boolean` | 判断是否脏 |
| `getDirtyEntry` | `(...) => DirtyEntry \| undefined` | 获取脏条目 |
| `getDirtyNodeIds` | `() => string[]` | 获取所有脏节点 ID |
| `getDirectDirtyNodeIds` | `() => string[]` | 获取直接脏节点 ID |
| `clearDirty` | `(...) => ...` | 清除脏标记 |
| `clearAllDirty` | `() => ...` | 清除所有脏标记 |
| `serializeDirtyMap` | `(map: DirtyMap): string` | 序列化脏标记 |
| `deserializeDirtyMap` | `(str: string): DirtyMap` | 反序列化脏标记 |

#### binding-injector.ts — TimelineBinding 注入层

**类型**：`BindingType`、`BindingImportance`、`BindingPropagation`、`BindingForInjection`、`InjectedBindingInfo`、`SkippedBindingInfo`、`SkipReason`、`TokenBudget`、`InjectionResult`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `normalizeBinding` | `(...) => BindingForInjection` | 归一化绑定 |
| `estimateTokenCount` | `(text: string): number` | 估算 token 数 |
| `injectBindings` | `(...) => InjectionResult` | 注入绑定 |
| `buildInjectionBlock` | `(...) => string` | 构建注入块 |
| `computeCascadeAffectedNodeIds` | `(...) => string[]` | 计算级联影响节点 |
| `getInjectableBindings` | `(...) => BindingForInjection[]` | 获取可注入绑定 |
| `getNodeBindings` | `(...) => ...` | 获取节点绑定 |
| `getDownstreamNodeIds` | `(...) => string[]` | 获取下游节点 ID |
| `extractBindingsFromTimeline` | `(...) => ...` | 从时间线提取绑定 |

#### prompt-enhancer.ts — 增强 Prompt 合成

**类型**：`PromptSections`、`EnhancedPrompt`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `enhancePrompt` | `(...) => EnhancedPrompt` | 增强 prompt |
| `formatTimelinePosition` | `(...) => string` | 格式化时间线位置 |
| `formatCharacterStates` | `(...) => string` | 格式化角色状态 |
| `formatSceneStates` | `(...) => string` | 格式化场景状态 |
| `formatPlotEvent` | `(...) => string` | 格式化剧情事件 |
| `assembleFinalPrompt` | `(...) => string` | 拼装最终 prompt |
| `batchEnhancePrompts` | `(...) => EnhancedPrompt[]` | 批量增强 |

#### cross-timeline-injector.ts — 跨时间线绑定注入（Q3-9 / Task 4.6.7）

**类型**：`CrossTimelineBindingType`、`TimelineRelationshipType`、`CrossTimelineBindingLike`、`TimelineRelationshipLike`、`MultiTimelineLike`、`CrossTimelineInjectionResult`、`CrossTimelineSkipReason`、`TimelineLayerInfoLike`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `injectCrossTimelineBindings` | `(...) => CrossTimelineInjectionResult` | 跨时间线绑定注入 |
| `normalizeCrossTimelineBinding` | `(...) => CrossTimelineBindingLike` | 归一化跨时间线绑定 |
| `buildCrossTimelineInjectionBlock` | `(...) => string` | 构建跨时间线注入块 |
| `findRelationship` | `(...) => TimelineRelationshipLike \| undefined` | 查找关系 |
| `getInboundCrossTimelineBindings` | `(...) => CrossTimelineBindingLike[]` | 获取入站绑定 |
| `getOutboundCrossTimelineBindings` | `(...) => CrossTimelineBindingLike[]` | 获取出站绑定 |
| `getBindingsBetweenTimelines` | `(...) => CrossTimelineBindingLike[]` | 获取时间线间绑定 |
| `getTimelineRelationships` | `(...) => TimelineRelationshipLike[]` | 获取时间线关系 |
| `computeTimelineLayers` | `(...) => TimelineLayerInfoLike[]` | 计算时间线层级 |

#### pinned-snapshot.ts — 重点快照标注（Q3-10 / Task 4.6.8）

**类型**：`PinReason`、`PinnedBy`、`PinnedSnapshotEntry`、`PinnedSnapshotStore`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `createPinnedSnapshotStore` | `(): PinnedSnapshotStore` | 创建重点快照存储 |
| `pinNode` | `(...) => ...` | 标注节点 |
| `unpinNode` | `(nodeId: string): ...` | 取消标注 |
| `isPinned` | `(nodeId: string): boolean` | 判断是否标注 |
| `getPinnedEntry` | `(nodeId: string): PinnedSnapshotEntry \| undefined` | 获取标注条目 |
| `getPinnedNodeIds` | `(): string[]` | 获取所有标注节点 ID |
| `getPinnedCount` | `(): number` | 获取标注数量 |
| `shouldAutoPin` | `(...) => boolean` | 判断是否应自动标注 |
| `autoPinFromTimeline` | `(...) => ...` | 从时间线自动标注 |
| `getPinnedByReason` | `(reason: PinReason): PinnedSnapshotEntry[]` | 按原因获取标注 |
| `getPinnedBy` | `(nodeId: string): PinnedBy \| undefined` | 获取标注者 |
| `serializePinnedStore` | `(store: PinnedSnapshotStore): string` | 序列化 |
| `deserializePinnedStore` | `(str: string): PinnedSnapshotStore` | 反序列化 |

#### snapshot-window.ts — 滑动窗口管理（Q3-10 / Task 4.6.8）

**类型**：`SnapshotStrategy`、`WindowConfig`、`WindowState`、`SnapshotStore`

**常量**：`DEFAULT_WINDOW_SIZE`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `createSnapshotStore` | `(): SnapshotStore` | 创建快照存储 |
| `initWindow` | `(...) => WindowState` | 初始化窗口 |
| `getSnapshotStrategy` | `(...) => SnapshotStrategy` | 获取快照策略 |
| `slideWindow` | `(...) => WindowState` | 滑动窗口 |
| `getSnapshot` | `(...) => ...` | 获取快照 |
| `getWindowNodes` | `(...) => string[]` | 获取窗口内节点 |
| `getPinnedInWindow` | `(...) => string[]` | 获取窗口内标注节点 |
| `getCachedCount` | `(...) => number` | 获取缓存数量 |
| `getCenterNode` | `(...) => string \| undefined` | 获取中心节点 |

#### snapshot-types.ts — 共享类型

包含全部时间线快照相关类型定义：

`PlotEventType`、`PlotEventParameters`、`PlotEventAIAnalysis`、`PlotEvent`、`Injury`、`CharacterStateSnapshot`、`AtmosphereChange`、`SceneStateSnapshot`、`CharacterTransition`、`SceneTransition`、`StateTransition`、`CharacterStateRule`、`SceneStateRule`、`CascadeRule`、`TimelineBindingLike`、`CharacterInitialState`、`SceneInitialState`、`PlotNodeLike`、`StoryTimelineLike`、`NodeSnapshots`、`PropagationResult`

---

### 2.6 retry/ 子模块

统一重试执行函数（项目内重试逻辑的单一来源）。

#### retry-with-backoff.ts

**类型**：
- `BackoffStrategy` — `"exponential" | "linear" | "fixed"`
- `RetryWithBackoffOptions<T>` — `{ fn; maxRetries; baseDelayMs; maxDelayMs?; backoff?; shouldJitter?; retryOn?; onRetry?; signal?; getDelayOverride? }`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `retryWithBackoff` | `<T>(options: RetryWithBackoffOptions<T>): Promise<T>` | 统一重试执行 |
| `defaultRetryableError` | `(error: unknown): boolean` | 默认可重试判定（HTTP 5xx/408/429、网络错误码、应用错误码、消息模式匹配） |
| `calculateBackoffDelay` | `(attempt: number, baseDelayMs: number, strategy: BackoffStrategy, maxDelayMs: number, shouldJitter: boolean): number` | 计算退避延迟 |

**可重试错误判定规则**：
- `AbortError` → 不可重试（用户主动取消）
- HTTP 5xx → 可重试
- HTTP 408/429 → 可重试
- HTTP 4xx（除 408/429）→ 不可重试
- 网络错误码（`ECONNREFUSED` 等）→ 可重试
- 应用错误码（`NETWORK_ERROR`/`TIMEOUT`/`RATE_LIMITED`/`API_SERVER_ERROR`）→ 可重试

---

### 2.7 agent/ 子模块

Agent 共享逻辑，可供渲染进程和主进程共用。

#### token-estimator.ts

启发式 token 估算器（中英文区分）。

**常量**：

| 常量 | 值 | 说明 |
|------|----|------|
| `TOKEN_OVERHEAD_PER_MESSAGE` | `4` | 每条消息固定 overhead |
| `TOKEN_OVERHEAD_PER_TOOL_CALL` | `3` | 每个工具调用 overhead |
| `TOKEN_OVERHEAD_PER_TOOL_RESULT` | `3` | 每个工具结果 overhead |
| `TOKEN_OVERHEAD_SYSTEM` | `3` | system prompt overhead |

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `estimateTokens` | `(text: string): number` | 估算字符串 token 数（中英文混合，CJK 1.5 token/字，ASCII 0.25 token/字符） |
| `estimateContentTokens` | `(message: { content?; toolCalls? }): number` | 估算消息内容 token 数（不含 overhead） |
| `estimateMessagesTokens` | `(messages: Array<{ role?; content?; toolCalls? }>, includeSystem?: boolean): number` | 估算消息数组 token 总数（含 overhead） |
| `estimateSystemPromptTokens` | `(systemPrompt: string): number` | 估算 system prompt token 数（含 overhead） |

---

### 2.8 json/ 子模块

JSON 提取与安全解析工具，统一替代各模块中重复的 `text.match(/\{[\s\S]*\}/)` + `JSON.parse` + try/catch 模式。

#### index.ts

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `extractJsonObject` | `(text: string): string \| null` | 提取第一个 JSON 对象片段（`{...}`） |
| `extractJsonArray` | `(text: string): string \| null` | 提取第一个 JSON 数组片段（`[...]`） |
| `safeParseJson` | `<T = unknown>(jsonStr: string): T \| null` | 安全解析 JSON（失败返回 null） |
| `extractAndParseJsonObject` | `<T = unknown>(text: string): T \| null` | 提取并解析 JSON 对象（支持 markdown 代码块） |
| `extractAndParseJsonArray` | `<T = unknown>(text: string): T[] \| null` | 提取并解析 JSON 数组（支持 markdown 代码块） |

---

### 2.9 migration/ 子模块

幂等迁移工厂，统一单例 Promise 迁移模式。

#### create-idempotent-migration.ts

**类型**：`IdempotentMigration` — `{ initialize: () => Promise<number>; resetState: () => void }`

**函数**：

| 函数 | 签名 | 说明 |
|------|------|------|
| `createIdempotentMigration` | `(migrationFn: () => Promise<number>, onError: (err: unknown) => void): IdempotentMigration` | 创建幂等迁移实例 |

**行为**：
- 首次调用 `initialize()` 时执行 `migrationFn`，并缓存 Promise
- 后续调用返回同一个 Promise（单例）
- `migrationFn` 失败时调用 `onError`，重置 Promise 允许重试，返回 0

---

## 附录：路径别名速查

| 别名 | 适用进程 | 用途 |
|------|---------|------|
| `@/domain/*` | 渲染进程 | 导入领域层类型/Port |
| `@/shared-logic/*` | 渲染进程 | 导入共享逻辑 |
| `@shared-logic/*` | 主进程 | 导入共享逻辑（electron 主进程专用别名） |
| `@domain/*` | 主进程 | 导入领域层类型（electron 主进程专用别名） |

## 附录：相关文档

- [ports.md](./ports.md) — Port 接口清单（含分类、依赖方向图）
- [API_REFERENCE_PART2.md](./API_REFERENCE_PART2.md) — 模块层 API 参考
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 整体架构
- [di-tokens.md](./di-tokens.md) — DI 容器 Token 清单
