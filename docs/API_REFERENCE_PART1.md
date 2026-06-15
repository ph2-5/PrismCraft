# API 参考手册 — 第一部分：领域层与共享逻辑层

> 本文档详细记录 `src/domain` 和 `src/shared-logic` 两个层的所有导出 API。
> 所有签名均从源码中精确提取，包含完整的参数类型和返回类型。

---

## 1. 领域层 (src/domain)

### 1.1 端口接口 (domain/ports)

#### storage-port.ts

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
| `updateCharacter` | `(id: string, updates: Partial<Character>, version?: number): Promise<void>` | 更新角色 |
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
| `updateScene` | `(id: string, updates: Partial<Scene>, version?: number): Promise<void>` | 更新场景 |
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
| `updateStory` | `(id: string, updates: Partial<Story>, version?: number): Promise<void>` | 更新故事 |
| `deleteStory` | `(id: string): Promise<void>` | 删除故事 |

---

#### ai-provider-port.ts

##### `IVideoProvider`

视频生成提供者端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `generateVideo` | `(prompt: string, options?: { firstFrameUrl?: string; lastFrameUrl?: string; characterRefs?: string[]; characterRef?: string; sceneRef?: string; duration?: number; referenceVideo?: string \| null; providerId?: string; modelId?: string; format?: string }): Promise<ApiResponse<VideoGenerationResult>>` | 生成视频 |
| `queryVideoStatus` | `(taskId: string, options?: { providerId?: string; modelId?: string; format?: string }): Promise<ApiResponse<{ status: "pending" \| "generating" \| "completed" \| "failed"; videoUrl?: string; progress?: number; message?: string }>>` | 查询视频生成状态 |
| `generateKeyframe` | `(params: { characterRefs?: string[]; characterRef?: string; sceneRef?: string; prevKeyframe?: string; shotRequirement?: { shotType?: string; cameraAngle?: string; cameraMovement?: string; action?: string }; content?: string; providerId?: string; modelId?: string; format?: string }): Promise<ApiResponse<{ imageUrl: string; source?: string; prompt?: string }>>` | 生成预览图 |
| `generateFramePair` | `(params: { keyframeUrl: string; keyframePrompt?: string; characterRefs?: string[]; characterRef?: string; sceneRef?: string; prevLastFrameUrl?: string; actionDescription?: string; duration?: number; providerId?: string; modelId?: string; format?: string }): Promise<ApiResponse<{ firstFrame: { imageUrl: string; prompt: string; derivedFrom: string }; lastFrame: { imageUrl: string; prompt: string; derivedFrom: string }; generatedAt: number }>>` | 生成首尾帧 |
| `generateVideoWithFrames` | `(params: { prompt: string; firstFrameUrl?: string; lastFrameUrl?: string; characterRefs?: string[]; characterRef?: string; sceneRef?: string; duration?: number; providerId?: string; modelId?: string; format?: string; referenceVideo?: string \| null }): Promise<ApiResponse<VideoGenerationResult>>` | 基于首尾帧生成视频 |

##### `IImageProvider`

图片生成提供者端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `generateImage` | `(prompt: string, type?: string, options?: { size?: string; providerId?: string; modelId?: string; purpose?: string }): Promise<ApiResponse<ImageGenerationResult>>` | 生成图片 |
| `analyzeImage` | `(imageUrl: string, type?: "character" \| "scene", prompt?: string, options?: { providerId?: string; modelId?: string }): Promise<ApiResponse<{ analysis: string; analyzed?: Record<string, unknown> }>>` | 分析图片 |

##### `ITextProvider`

文本生成提供者端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `generateText` | `(prompt: string, options?: { maxTokens?: number; temperature?: number; providerId?: string; modelId?: string }): Promise<ApiResponse<{ text: string }>>` | 生成文本 |

##### `IFileUploader`

文件上传端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `uploadFile` | `(file: File): Promise<{ success: true; data: { url: string; [key: string]: unknown }; source?: string; error?: string; message?: string } \| { success: false; error: string; message?: string; data?: { url: string; [key: string]: unknown } }>` | 上传文件 |

---

#### sync-port.ts

##### `DbRunResult`

```typescript
interface DbRunResult {
  changes?: number;
  lastInsertRowid?: number;
}
```

##### `ISyncStorage`

同步存储端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `safeQuery` | `<T>(sql: string, params?: unknown[]): Promise<T[]>` | 安全查询 |
| `safeRun` | `(sql: string, params?: unknown[]): Promise<DbRunResult>` | 安全执行 |
| `safeTransaction` | `(statements: { sql: string; params: unknown[] }[]): Promise<unknown[]>` | 安全事务 |
| `registerChangeTracker` | `(tracker: (entityType: string, entityId: string, operation: string) => Promise<void>): void` | 注册变更追踪器 |

---

#### element-manager-port.ts

##### `IElementManager`

元素管理器端口接口，提供元素生命周期管理、资产绑定和更新通知。

| 方法 | 签名 | 说明 |
|------|------|------|
| `subscribe` | `(listener: UpdateListener): () => void` | 订阅元素更新通知，返回取消订阅函数 |
| `getLibrary` | `(): Promise<ElementLibrary>` | 获取完整元素库 |
| `createElement` | `(type: ElementType, name: string, description?: string): Promise<StoryElement>` | 创建新元素 |
| `bindAsset` | `(elementId: string, asset: AssetBinding): Promise<StoryElement>` | 绑定资产到元素 |
| `unbindAsset` | `(elementId: string, assetUrl: string): Promise<StoryElement>` | 解绑元素资产 |
| `getElement` | `(elementId: string): Promise<StoryElement \| undefined>` | 按 ID 获取元素 |
| `getAllElements` | `(): Promise<StoryElement[]>` | 获取所有元素 |
| `getElementsByType` | `(type: ElementType): Promise<StoryElement[]>` | 按类型获取元素 |
| `deleteElement` | `(elementId: string): Promise<void>` | 删除元素 |
| `updateElement` | `(elementId: string, updates: Partial<StoryElement>): Promise<StoryElement>` | 更新元素 |

> `UpdateListener` 类型: `() => void`

---

#### reference-engine-port.ts

##### `ReferenceValidationResult`

```typescript
interface ReferenceValidationResult {
  valid: boolean;
  error?: string;
}
```

##### `IReferenceEngine`

引用引擎端口接口，管理分镜间引用、验证和视频 URL 解析。

| 方法 | 签名 | 说明 |
|------|------|------|
| `validateReference` | `(shot: StoryBeat, allShots: StoryBeat[], reference: ShotReference): ReferenceValidationResult` | 验证分镜引用的正确性和完整性 |
| `getTargetShot` | `(shot: StoryBeat, allShots: StoryBeat[], reference: ShotReference): StoryBeat \| undefined` | 解析引用目标分镜 |
| `getReferenceVideoUrl` | `(shot: StoryBeat, allShots: StoryBeat[], reference: ShotReference): string \| undefined` | 获取引用的视频 URL |
| `buildReferenceDescription` | `(shot: StoryBeat, allShots: StoryBeat[], reference: ShotReference): string` | 构建引用的可读描述 |

---

#### version-storage-port.ts

##### `IVersionStorage`

版本存储端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `getStoryVersions` | `<T = StoryVersion>(storyId: string): Promise<T[]>` | 获取故事版本列表 |
| `createStoryVersion` | `(version: StoryVersion): Promise<void>` | 创建故事版本 |
| `deleteStoryVersion` | `(versionId: string): Promise<void>` | 删除故事版本 |
| `deleteOldStoryVersions` | `(storyId: string, keepCount: number): Promise<void>` | 删除旧版本，保留指定数量 |

---

#### element-storage-port.ts

##### `IElementStorage`

元素存储端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `subscribe` | `(listener: UpdateListener): () => void` | 订阅更新通知 |
| `notify` | `(): void` | 通知所有订阅者 |
| `getLibrary` | `(): Promise<ElementLibrary>` | 获取完整元素库 |
| `getElement` | `(elementId: string): Promise<StoryElement \| undefined>` | 按 ID 获取元素 |
| `getAllElements` | `(): Promise<StoryElement[]>` | 获取所有元素 |
| `getElementsByType` | `(type: ElementType): Promise<StoryElement[]>` | 按类型获取元素 |
| `createElement` | `(type: ElementType, name: string, description?: string): Promise<StoryElement>` | 创建元素 |
| `updateElement` | `(elementId: string, updates: Partial<StoryElement>): Promise<StoryElement>` | 更新元素 |
| `deleteElement` | `(elementId: string): Promise<void>` | 删除元素 |

> `UpdateListener` 类型: `() => void`

---

#### template-storage-port.ts

##### `ITemplateStorage`

模板存储端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `getVideoTemplates` | `<T = Record<string, unknown>>(): Promise<T[]>` | 获取视频模板列表 |
| `createVideoTemplate` | `(template: Record<string, unknown>): Promise<void>` | 创建视频模板 |
| `saveASTTemplate` | `(meta: { id: string; name: string; description?: string; category?: string; genre?: string; tone?: string; tags?: string; author?: string; totalDuration: number; beatsCount: number; charactersCount?: number; scenesCount?: number; astFilePath?: string; astFileSize?: number; isPublic?: boolean; parentTemplateId?: string }): Promise<void>` | 保存 AST 模板 |
| `getASTTemplate` | `(id: string): Promise<Record<string, unknown> \| null>` | 获取 AST 模板 |
| `getASTTemplates` | `(filters?: { category?: string; search?: string; sortBy?: "created" \| "usage" \| "name"; limit?: number }): Promise<Record<string, unknown>[]>` | 获取 AST 模板列表（支持筛选） |
| `deleteASTTemplate` | `(id: string): Promise<boolean>` | 删除 AST 模板 |
| `incrementASTTemplateUsage` | `(id: string): Promise<void>` | 增加模板使用计数 |

---

#### media-asset-repository-port.ts

##### `IMediaAssetRepository`

媒体资产仓库端口接口。

| 方法 | 签名 | 说明 |
|------|------|------|
| `findAll` | `(): Promise<Result<MediaAsset[]>>` | 查找所有媒体资产 |
| `findById` | `(id: string): Promise<Result<MediaAsset \| null>>` | 按 ID 查找媒体资产 |
| `create` | `(input: Partial<MediaAsset> & { id: string }): Promise<Result<MediaAsset>>` | 创建媒体资产 |
| `update` | `(input: Partial<MediaAsset> & { id: string }): Promise<Result<MediaAsset>>` | 更新媒体资产 |
| `delete` | `(id: string): Promise<Result<void>>` | 删除媒体资产 |

---

### 1.2 Schema 定义 (domain/schemas)

#### character.ts

##### `characterOutfitSchema` → `CharacterOutfit`

| 字段 | 类型 | 默认值/约束 | 说明 |
|------|------|-------------|------|
| `id` | `string` | — | 服装 ID |
| `name` | `string` | `min(1)` | 服装名称 |
| `description` | `string` | — | 服装描述 |
| `clothing` | `string` | — | 服装内容 |
| `accessories` | `string[]` | `optional().default([])` | 配饰列表 |
| `imageUrl` | `string` | `url().optional()` | 图片 URL |
| `localImagePath` | `string` | `optional()` | 本地图片路径 |
| `thumbnailPath` | `string` | `optional()` | 缩略图路径 |
| `isDefault` | `boolean` | `default(false)` | 是否为默认服装 |
| `createdAt` | `string` | `default(() => new Date().toISOString())` | 创建时间 |

##### `characterAppearanceSchema` → `CharacterAppearance`

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `hairColor` | `string` | `""` | 发色 |
| `hairStyle` | `string` | `""` | 发型 |
| `eyeColor` | `string` | `""` | 眼睛颜色 |
| `height` | `string` | `""` | 身高 |
| `build` | `string` | `""` | 体型 |
| `clothing` | `string` | `""` | 服装 |

##### `characterSchema` → `Character`

| 字段 | 类型 | 约束/默认值 | 说明 |
|------|------|-------------|------|
| `id` | `string` | — | 角色 ID |
| `name` | `string` | `min(1, "角色名称不能为空")` | 角色名称 |
| `description` | `string` | — | 角色描述 |
| `gender` | `string` | — | 性别 |
| `age` | `number` | `positive().optional()` | 年龄 |
| `style` | `string` | — | 艺术风格 |
| `personality` | `string[]` | — | 性格特征 |
| `appearance` | `CharacterAppearance` | — | 外观 |
| `outfits` | `CharacterOutfit[]` | `optional()` | 服装列表 |
| `prompt` | `string` | — | 提示词 |
| `imageGenerationPrompt` | `string` | `optional()` | 图片生成提示词 |
| `generatedImage` | `string` | `optional()` | 生成的图片 URL |
| `refImagePath` | `string` | `optional()` | 参考图路径 |
| `generatedVideo` | `string` | `optional()` | 生成的视频 URL |
| `videoGenerationStatus` | `"pending" \| "generating" \| "completed" \| "failed"` | `optional()` | 视频生成状态 |
| `videoGenerationTaskId` | `string` | `optional()` | 视频生成任务 ID |
| `updatedAt` | `string` | `optional()` | 更新时间 |
| `traits` | `string[]` | `optional()` | 特征标签 |
| `avatarPath` | `string` | `optional()` | 头像路径 |
| `thumbnailPath` | `string` | `optional()` | 缩略图路径 |
| `previewPath` | `string` | `optional()` | 预览路径 |
| `source` | `string` | `optional()` | 来源 |
| `tags` | `string[]` | `optional()` | 标签 |
| `generationPrompt` | `string` | `optional()` | 生成提示词 |
| `generationParams` | `Record<string, unknown>` | `optional()` | 生成参数 |
| `useCount` | `number` | `nonnegative().optional()` | 使用次数 |
| `lastUsedAt` | `string` | `optional()` | 最后使用时间 |
| `createdAt` | `string` | `optional()` | 创建时间 |

##### `createCharacterInputSchema` → `CreateCharacterInput`

从 `characterSchema` 中 pick 以下字段：`name`, `description`, `gender`, `age`, `style`, `personality`, `appearance`, `outfits`, `traits`, `prompt`, `tags`, `generatedImage`, `refImagePath`, `imageGenerationPrompt`, `thumbnailPath`, `previewPath`, `avatarPath`

##### `updateCharacterInputSchema` → `UpdateCharacterInput`

`characterSchema.partial().required({ id: true })` — 所有字段可选，但 `id` 必填。

---

#### scene.ts

##### `sceneCameraSchema` → `SceneCamera`

| 字段 | 类型 | 说明 |
|------|------|------|
| `position` | `string` | `optional()` |
| `angle` | `string` | `optional()` |
| `zoom` | `number` | `optional()` |
| `distance` | `string` | `optional()` |
| `movement` | `string` | `optional()` |

##### `sceneSchema` → `Scene`

| 字段 | 类型 | 约束/默认值 | 说明 |
|------|------|-------------|------|
| `id` | `string` | — | 场景 ID |
| `name` | `string` | `min(1, "场景名称不能为空")` | 场景名称 |
| `description` | `string` | — | 场景描述 |
| `type` | `string` | — | 场景类型 |
| `timeOfDay` | `string` | — | 时间段 |
| `weather` | `string` | — | 天气 |
| `mood` | `string` | — | 氛围 |
| `lighting` | `string` | — | 光照 |
| `elements` | `string[]` | — | 场景元素 |
| `colors` | `string[]` | — | 色彩方案 |
| `prompt` | `string` | — | 提示词 |
| `imageGenerationPrompt` | `string` | `optional()` | 图片生成提示词 |
| `generatedImage` | `string` | `optional()` | 生成的图片 |
| `generatedVideo` | `string` | `optional()` | 生成的视频 |
| `videoGenerationStatus` | `"pending" \| "generating" \| "completed" \| "failed"` | `optional()` | 视频生成状态 |
| `videoGenerationTaskId` | `string` | `optional()` | 视频任务 ID |
| `updatedAt` | `string` | `optional()` | 更新时间 |
| `camera` | `SceneCamera` | `optional()` | 相机配置 |
| `imageUrl` | `string` | `optional()` | 图片 URL |
| `scenePath` | `string` | `optional()` | 场景路径 |
| `refImagePath` | `string` | `optional()` | 参考图路径 |
| `thumbnailPath` | `string` | `optional()` | 缩略图路径 |
| `previewPath` | `string` | `optional()` | 预览路径 |
| `atmosphere` | `string` | `optional()` | 氛围描述 |
| `source` | `string` | `optional()` | 来源 |
| `tags` | `string[]` | `optional()` | 标签 |
| `createdAt` | `string` | `optional()` | 创建时间 |
| `generationPrompt` | `string` | `optional()` | 生成提示词 |
| `generationParams` | `Record<string, unknown>` | `optional()` | 生成参数 |
| `useCount` | `number` | `nonnegative().optional()` | 使用次数 |
| `lastUsedAt` | `number` | `optional()` | 最后使用时间 |

##### `sceneElementTypeSchema` → `SceneElementType`

```typescript
"existing_character" | "new_character" | "prop" | "environment"
```

##### `sceneElementSchema` → `SceneElement`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 元素 ID |
| `name` | `string` | 元素名称 |
| `type` | `SceneElementType` | 元素类型 |
| `characterId` | `string` | `optional()` |
| `characterConfig` | `Record<string, unknown>` | `optional()` |
| `description` | `string` | `optional()` |
| `imageUrl` | `string` | `optional()` |
| `dialogue` | `string` | `optional()` |
| `action` | `string` | `optional()` |
| `emotion` | `string` | `optional()` |
| `position` | `string` | `optional()` |
| `pose` | `string` | `optional()` |
| `order` | `number` | `optional()` |
| `timelineGroup` | `number` | `optional()` |
| `timelineOrder` | `number` | `optional()` |

##### `createSceneInputSchema` → `CreateSceneInput`

从 `sceneSchema` 中 pick 以下字段：`name`, `description`, `type`, `timeOfDay`, `weather`, `mood`, `lighting`, `atmosphere`, `elements`, `colors`, `camera`, `prompt`, `imageGenerationPrompt`, `generatedImage`, `refImagePath`, `imageUrl`, `scenePath`, `thumbnailPath`, `previewPath`, `source`, `generationPrompt`, `generationParams`, `tags`

##### `updateSceneInputSchema` → `UpdateSceneInput`

`sceneSchema.partial().required({ id: true })`

---

#### story.ts

##### `storyStyleGuideSchema` → `StoryStyleGuide`

| 字段 | 类型 | 说明 |
|------|------|------|
| `styleImageUrl` | `string` | `optional()` |
| `stylePrompt` | `string` | `optional()` |
| `colorPalette` | `string[]` | `optional()` |
| `artStyle` | `string` | `optional()` |
| `moodAtmosphere` | `string` | `optional()` |
| `generatedAt` | `string` | `optional()` |
| `source` | `"ai" \| "upload" \| "manual"` | `optional()` |

##### `chainModeSchema` → `ChainMode`

```typescript
"auto" | "isolated" | "custom" | "asset"  // default: "auto"
```

##### `beatInputSchema` → `BeatInput`

```typescript
"ai" | "upload" | "asset" | "isolated"  // default: "ai"
```

##### `frameInputSchema` → `FrameInput`

```typescript
"ai" | "upload" | "keyframe" | "isolated"  // default: "ai"
```

##### `videoInputSchema` → `VideoInput`

```typescript
"ai" | "upload" | "framepair" | "isolated"  // default: "ai"
```

##### `referenceImageWeightSchema` → `ReferenceImageWeight`

| 字段 | 类型 | 说明 |
|------|------|------|
| `url` | `string` | 图片 URL |
| `weight` | `number` | 权重 (0-1) |
| `type` | `"portrait" \| "scene" \| "style" \| "prev_frame"` | 类型 |
| `description` | `string` | 描述 |

##### `promptLabSchema` → `PromptLab`

| 字段 | 类型 | 说明 |
|------|------|------|
| `coreElements` | `string` | 核心元素 |
| `cameraAction` | `string` | 镜头动作 |
| `styleAtmosphere` | `string` | 风格氛围 |
| `negativePrompt` | `string` | `optional()` |
| `referenceWeights` | `ReferenceImageWeight[]` | `optional()` |
| `targetModel` | `string` | `optional()` |
| `targetProvider` | `string` | `optional()` |
| `estimatedCost` | `number` | `optional()` |
| `estimatedTokens` | `number` | `optional()` |
| `firstFramePrompt` | `string` | `optional()` |
| `videoPrompt` | `string` | `optional()` |

##### `storyBeatKeyframeSchema` → `StoryBeatKeyframe`

| 字段 | 类型 | 说明 |
|------|------|------|
| `imageUrl` | `string` | `optional()` |
| `prompt` | `string` | `optional()` |
| `generatedAt` | `string` | `optional()` |
| `source` | `"ai" \| "upload"` | `optional()` |
| `referencedPrevKeyframe` | `string` | `optional()` |

##### `storyBeatFramePairSchema` → `StoryBeatFramePair`

| 字段 | 类型 | 说明 |
|------|------|------|
| `firstFrameUrl` | `string` | `optional()` |
| `lastFrameUrl` | `string` | `optional()` |
| `firstFramePrompt` | `string` | `optional()` |
| `lastFramePrompt` | `string` | `optional()` |
| `generatedAt` | `string` | `optional()` |
| `source` | `"ai" \| "upload"` | `optional()` |
| `firstFrame` | `{ imageUrl: string; prompt: string; derivedFrom: string }` | `optional()` |
| `lastFrame` | `{ imageUrl: string; prompt: string; derivedFrom: string }` | `optional()` |

##### `storyBeatVideoSchema` → `StoryBeatVideoGeneration`

| 字段 | 类型 | 说明 |
|------|------|------|
| `videoUrl` | `string` | `optional()` |
| `taskId` | `string` | `optional()` |
| `status` | `ShotGenerationStatus` | `optional()` |
| `generatedAt` | `string` | `optional()` |
| `source` | `"ai" \| "upload"` | `optional()` |
| `prompt` | `string` | `optional()` |
| `error` | `string` | `optional()` |
| `createdAt` | `string` | `optional()` |

##### `elementBindingSchema` → `ElementBinding`

| 字段 | 类型 | 说明 |
|------|------|------|
| `role` | `string` | `optional()` |
| `position` | `string` | `optional()` |
| `action` | `string` | `optional()` |
| `emotion` | `string` | `optional()` |
| `description` | `string` | `optional()` |
| `text` | `string` | `optional()` |
| `imageUrl` | `string` | `optional()` |

##### `VALID_SHOT_TYPES`

```typescript
const VALID_SHOT_TYPES: Set<string> = new Set([
  "wide", "medium", "close", "extreme_close", "extreme_wide",
  "low", "high", "birdseye", "wormseye",
]);
```

##### `storyBeatSchema` → `StoryBeat`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 分镜 ID |
| `sequence` | `number` | 序号 |
| `order` | `number` | `optional()` |
| `description` | `string` | 描述（null 转 ""） |
| `duration` | `number` | `optional()`（null 转 undefined） |
| `type` | `"action" \| "dialogue" \| "scene" \| "transition" \| "effect"` | `optional()` |
| `title` | `string` | `optional()` |
| `content` | `string` | `optional()` |
| `transition` | `string` | `optional()` |
| `characterIds` | `string[]` | 角色 ID 列表 |
| `characterOutfits` | `Record<string, string>` | `optional()` |
| `scene` | `string` | `optional()`（@deprecated，使用 sceneId） |
| `sceneId` | `string` | `optional()` |
| `sceneElements` | `SceneElement[]` | `optional()` |
| `elementIds` | `string[]` | 元素 ID 列表 |
| `elementBindings` | `Record<string, ElementBinding>` | `optional()` |
| `shotType` | `string` | `optional()`（@deprecated） |
| `camera` | `BeatCamera` | `optional()`（@deprecated） |
| `shotInstruction` | `ShotInstruction` | `optional()` |
| `reference` | `ShotReference` | `optional()` |
| `featureAnchoring` | `FeatureAnchoringConfig` | `optional()` |
| `consistencyCheck` | `ConsistencyCheckResult` | `optional()` |
| `fixedImage` | `FixedImageConfig` | `optional()` |
| `referenceVideo` | `ReferenceVideoConfig` | `optional()` |
| `template` | `TemplateConfig` | `optional()` |
| `generationStatus` | `ShotGenerationStatus` | `optional()` |
| `generationResult` | `ShotGenerationResult` | `optional()` |
| `generationPrompt` | `string` | `optional()`（@deprecated） |
| `enhancedGeneration` | `boolean` | `optional()` |
| `imageGenerationPrompt` | `string` | `optional()`（@deprecated） |
| `firstFramePrompt` | `string` | `optional()` |
| `lastFramePrompt` | `string` | `optional()` |
| `promptLayers` | `{ coreElements: string; cameraAction: string; styleAtmosphere?: string }` | `optional()` |
| `keyframe` | `StoryBeatKeyframe` | `optional()` |
| `framePair` | `StoryBeatFramePair` | `optional()` |
| `videoGen` | `StoryBeatVideoGeneration` | `optional()` |
| `imageUrl` | `string` | `optional()` |
| `videoReferenceUrl` | `string` | `optional()` |
| `keyframeInput` | `BeatInput` | `optional()` |
| `framePairInput` | `FrameInput` | `optional()` |
| `videoInput` | `VideoInput` | `optional()` |
| `uploadedKeyframe` | `string` | `optional()` |
| `uploadedFramePair` | `{ firstFrame: string; lastFrame: string; firstFramePrompt?: string; lastFramePrompt?: string }` | `optional()` |
| `uploadedVideo` | `string` | `optional()` |
| `chainMode` | `ChainMode` | `optional()` |
| `customChainTarget` | `string` | `optional()` |
| `localVideoPath` | `string` | `optional()` |
| `localKeyframePath` | `string` | `optional()` |
| `localFirstFramePath` | `string` | `optional()` |
| `localLastFramePath` | `string` | `optional()` |

##### `storyVersionSchema` → `StoryVersion`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 版本 ID |
| `storyId` | `string` | 故事 ID |
| `timestamp` | `number` | 时间戳 |
| `beats` | `StoryBeat[]` | 分镜列表 |
| `title` | `string` | 标题 |
| `description` | `string` | 描述 |
| `genre` | `string` | 类型 |
| `tone` | `string` | 基调 |
| `targetDuration` | `number` | 目标时长 |
| `characters` | `string[]` | 角色 ID 列表 |
| `scenes` | `string[]` | 场景 ID 列表 |
| `changeSummary` | `string` | 变更摘要 |
| `autoSaved` | `boolean` | 是否自动保存 |

##### `storySchema` → `Story`

| 字段 | 类型 | 约束/默认值 | 说明 |
|------|------|-------------|------|
| `id` | `string` | — | 故事 ID |
| `title` | `string` | `min(1, "故事标题不能为空")` | 标题 |
| `description` | `string` | null 转 "" | 描述 |
| `characters` | `string[]` | — | 角色 ID 列表 |
| `scenes` | `string[]` | — | 场景 ID 列表 |
| `createdAt` | `number` | — | 创建时间 |
| `updatedAt` | `number` | — | 更新时间 |
| `genre` | `string` | `optional()` | 类型 |
| `tone` | `string` | `optional()` | 基调 |
| `targetDuration` | `number` | `optional()` | 目标时长 |
| `keyframeChainValid` | `boolean` | `optional()` | 关键帧链是否有效 |
| `beats` | `StoryBeat[]` | — | 分镜列表 |
| `elementIds` | `string[]` | — | 元素 ID 列表 |
| `elementBindings` | `Record<string, ElementBinding>` | `optional()` | 元素绑定 |
| `styleGuide` | `StoryStyleGuide` | `optional()` | 风格指南 |

##### `createStoryInputSchema` → `CreateStoryInput`

从 `storySchema` 中 pick：`title`, `description`, `genre`, `tone`, `targetDuration`, `characters`, `scenes`, `beats`, `elementIds`, `elementBindings`

##### `updateStoryInputSchema` → `UpdateStoryInput`

`storySchema.partial().required({ id: true })`

---

#### shot-system.ts

##### `shotInstructionSchema` → `ShotInstruction`

| 字段 | 类型 | 说明 |
|------|------|------|
| `shotSize` | `"extreme_close" \| "close" \| "medium" \| "wide" \| "extreme_wide"` | 景别 |
| `cameraMovement` | `"static" \| "push" \| "pull" \| "pan" \| "orbit" \| "crane_up" \| "crane_down" \| "tracking"` | 运镜方式 |
| `cameraAngle` | `"eye_level" \| "low" \| "high" \| "birds_eye" \| "worms_eye" \| "dutch"` | 镜头角度 |

##### `featureAnchorItemSchema`

| 字段 | 类型 | 说明 |
|------|------|------|
| `elementId` | `string` | 元素 ID |
| `referenceImageUrl` | `string` | 参考图 URL |
| `featureTags` | `string[]` | 特征标签 |
| `weight` | `number` | 权重 (0-1)，默认 0.8 |

##### `featureAnchoringSchema` → `FeatureAnchoringConfig`

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | `boolean` | 是否启用 |
| `characterAnchors` | `FeatureAnchorItem[]` | 角色锚点列表 |
| `propAnchors` | `FeatureAnchorItem[]` | `optional()` |
| `previewImageUrl` | `string` | `optional()` |
| `disableFrameBinding` | `boolean` | `default(true)` |
| `featureConsistencyStrength` | `number` | `min(0).max(1).default(0.8)` |
| `blend` | `{ mode: "anchor_only" \| "chain_only" \| "blend"; chainWeight: number; anchorWeight: number; autoFallback: boolean }` | `optional()` |

##### `consistencyCheckResultSchema` → `ConsistencyCheckResult`

| 字段 | 类型 | 说明 |
|------|------|------|
| `passed` | `boolean` | 是否通过 |
| `characterScores` | `{ elementId: string; elementName: string; score: number; issues: string[] }[]` | 角色评分 |
| `overallScore` | `number` | 总体评分 |
| `recommendation` | `"accept" \| "regenerate" \| "adjust"` | 建议 |

##### `shotReferenceSchema` → `ShotReference`

| 字段 | 类型 | 说明 |
|------|------|------|
| `direction` | `"none" \| "previous" \| "next" \| "custom"` | 引用方向 |
| `targetShotId` | `string` | `optional()` |
| `contentType` | `"full_video" \| "last_frame" \| "first_frame" \| "video_segment"` | 内容类型 |
| `segmentDuration` | `number` | `optional()` |
| `segmentPosition` | `"start" \| "end"` | `optional()` |

##### `shotGenerationStatusSchema` → `ShotGenerationStatus`

```typescript
"idle" | "pending" | "generating" | "completed" | "failed"
```

##### `shotGenerationResultSchema` → `ShotGenerationResult`

| 字段 | 类型 | 说明 |
|------|------|------|
| `videoUrl` | `string` | `optional()` |
| `lastFrameUrl` | `string` | `optional()` |
| `firstFrameUrl` | `string` | `optional()` |
| `duration` | `number` | 时长 |
| `generatedAt` | `string` | 生成时间 |
| `prompt` | `string` | 提示词 |
| `taskId` | `string` | `optional()` |
| `error` | `string` | `optional()` |

##### `fixedImageSchema` → `FixedImageConfig`

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | `boolean` | 是否启用 |
| `lockType` | `"character" \| "scene"` | 锁定类型 |
| `imageUrl` | `string` | `optional()` |
| `name` | `string` | `optional()` |
| `characters` | `{ characterId: string; characterName: string; imageUrl: string }[]` | `optional()` |

##### `referenceVideoSchema` → `ReferenceVideoConfig`

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | `boolean` | 是否启用 |
| `videoUrl` | `string` | `optional()` |
| `mimicryLevel` | `"light" \| "medium" \| "deep"` | 模仿级别 |
| `name` | `string` | `optional()` |
| `duration` | `number` | `optional()` |

##### `templateConfigSchema` → `TemplateConfig`

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | `boolean` | 是否启用 |
| `templateId` | `string` | `optional()` |
| `template` | `unknown` | `optional()` |
| `autoMatchStory` | `boolean` | `optional()` |
| `name` | `string` | `optional()` |
| `matchCamera` | `boolean` | `optional()` |
| `matchTransition` | `boolean` | `optional()` |
| `matchTiming` | `boolean` | `optional()` |

##### `beatCameraSchema` → `BeatCamera`

| 字段 | 类型 | 说明 |
|------|------|------|
| `angle` | `string` | `optional()` |
| `movement` | `string` | `optional()` |
| `distance` | `string` | `optional()` |
| `speed` | `string` | `optional()` |
| `relationType` | `"continuous" \| "contrast" \| "parallel" \| "fade"` | `optional()` |
| `transitionType` | `"cut" \| "dissolve" \| "wipe" \| "fade"` | `optional()` |
| `transitionDuration` | `number` | `optional()` |

##### `elementTypeSchema` → `ElementType`

```typescript
"character" | "prop" | "effect"
```

##### `assetTypeSchema` → `AssetType`

```typescript
"image" | "video" | "text"
```

##### `assetBindingSchema` → `AssetBinding`

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `AssetType` | 资产类型 |
| `url` | `string` | URL |
| `name` | `string` | 名称 |
| `uploadedAt` | `string` | 上传时间 |
| `isPrimary` | `boolean` | `optional()` |

##### `referenceImageQualitySchema` → `ReferenceImageQuality`

| 字段 | 类型 | 说明 |
|------|------|------|
| `isValid` | `boolean` | 是否有效 |
| `resolution` | `{ width: number; height: number }` | 分辨率 |
| `minResolution` | `number` | 最低分辨率 |
| `clarityScore` | `number` | 清晰度评分 |
| `issues` | `string[]` | 问题列表 |

##### `elementFeatureAnchorSchema` → `ElementFeatureAnchor`

| 字段 | 类型 | 说明 |
|------|------|------|
| `elementId` | `string` | 元素 ID |
| `elementType` | `ElementType` | 元素类型 |
| `referenceImageUrl` | `string` | 参考图 URL |
| `featureTags` | `string[]` | 特征标签 |
| `characterFeatures` | `{ faceShape?: string; hairColor?: string; hairStyle?: string; eyeColor?: string; build?: string; clothing?: string; colorPalette?: string[]; distinctiveMarks?: string[] }` | `optional()` |
| `sceneFeatures` | `{ sceneType?: string; colorTone?: string; lightingType?: string; keyElements?: string[]; structureDesc?: string }` | `optional()` |
| `extractedAt` | `string` | 提取时间 |
| `confidence` | `number` | 置信度 |

##### `storyElementSchema` → `StoryElement`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 元素 ID |
| `type` | `ElementType` | 元素类型 |
| `name` | `string` | 名称 |
| `description` | `string` | 描述 |
| `bindings` | `AssetBinding[]` | 资产绑定列表 |
| `characterConfig` | `{ gender?: string; age?: number; style?: string; personality?: string[]; appearance?: { hairColor?: string; hairStyle?: string; eyeColor?: string; height?: string; build?: string; clothing?: string } }` | `optional()` |
| `sceneConfig` | `{ timeOfDay?: string; weather?: string; mood?: string; lighting?: string; style?: string }` | `optional()` |
| `featureAnchor` | `ElementFeatureAnchor` | `optional()` |
| `referenceImageQuality` | `ReferenceImageQuality` | `optional()` |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | 更新时间 |

##### `elementLibrarySchema` → `ElementLibrary`

| 字段 | 类型 | 说明 |
|------|------|------|
| `elements` | `StoryElement[]` | 元素列表 |
| `nextCode` | `Record<ElementType, number>` | 下一个编号 |

---

#### api.ts

##### `apiConfigSchema` → `ApiConfig`

| 字段 | 类型 | 说明 |
|------|------|------|
| `apiUrl` | `string` | `optional()` |
| `apiKey` | `string` | `optional()` |
| `model` | `string` | `optional()` |
| `size` | `string` | `optional()` |

##### `apiErrorCodeSchema` → `ApiErrorCode`

```typescript
"INVALID_API_KEY" | "RATE_LIMITED" | "ENDPOINT_NOT_FOUND" | "API_SERVER_ERROR" |
"TIMEOUT" | "CONNECTION_FAILED" | "INVALID_RESPONSE" | "POLLINATIONS_FAILED" |
"INTERNAL_ERROR" | "UNKNOWN_ERROR"
```

##### `apiResponseSchema` → `ApiResponse<T>`

```typescript
| { success: true; data: T; source?: string; error?: string; message?: string }
| { success: false; error: string; message?: string; data?: T }
```

##### `imageGenerationResultSchema` → `ImageGenerationResult`

| 字段 | 类型 | 说明 |
|------|------|------|
| `imageUrl` | `string` | 图片 URL |
| `source` | `string` | `optional()` |
| `prompt` | `string` | `optional()` |

##### `videoGenerationResultSchema` → `VideoGenerationResult`

| 字段 | 类型 | 说明 |
|------|------|------|
| `videoUrl` | `string` | `optional()` |
| `taskId` | `string` | `optional()` |
| `status` | `string` | `optional()` |
| `promptWasTruncated` | `boolean` | `optional()` |
| `originalPromptLength` | `number` | `optional()` |
| `providerId` | `string` | `optional()` |
| `providerModelId` | `string` | `optional()` |
| `providerFormat` | `string` | `optional()` |
| `urlTtl` | `number` | `optional()` |

##### `videoTaskStatusSchema` → `VideoTaskStatus`

```typescript
"pending" | "generating" | "completed" | "failed" | "cancelled" | "retrying" | "timeout"
```

##### `videoTaskSchema` → `VideoTask`

| 字段 | 类型 | 说明 |
|------|------|------|
| `taskId` | `string` | 任务 ID |
| `status` | `VideoTaskStatus` | 状态 |
| `progress` | `number` | 进度 (0-100) |
| `videoUrl` | `string` | `optional()` |
| `localVideoPath` | `string` | `optional()` |
| `message` | `string` | `default("")` |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | `optional()` |
| `expiresAt` | `string` | `optional()` |
| `model` | `string` | `optional()` |
| `prompt` | `string` | `optional()` |
| `parameters` | `Record<string, unknown>` | `optional()` |
| `apiUrl` | `string` | `optional()` |
| `apiEndpoint` | `string` | `optional()` |
| `providerId` | `string` | `optional()` |
| `providerModelId` | `string` | `optional()` |
| `providerFormat` | `string` | `optional()` |
| `fixedImageUrl` | `string` | `optional()` |
| `fixedImageLockType` | `"character" \| "scene"` | `optional()` |
| `referenceVideoUrl` | `string` | `optional()` |
| `referenceVideoMimicryLevel` | `"light" \| "medium" \| "deep"` | `optional()` |
| `templateId` | `string` | `optional()` |
| `templateShots` | `string` | `optional()` |
| `beatId` | `string` | `optional()` |
| `storyId` | `string` | `optional()` |
| `storyTitle` | `string` | `optional()` |
| `beatTitle` | `string` | `optional()` |
| `cacheFailed` | `boolean` | `optional()` |
| `promptWasTruncated` | `boolean` | `optional()` |
| `pollFailureCount` | `number` | `optional()` |
| `pollCount` | `number` | `optional()` |
| `recoveryAttempts` | `number` | `optional()` |
| `lastPolledAt` | `string` | `optional()` |
| `vectorClock` | `string` | `optional()` |
| `syncStatus` | `"pending" \| "synced" \| "conflict"` | `optional()` |
| `urlObtainedAt` | `number` | `optional()` |
| `urlTtl` | `number` | `optional()` |

##### `healthStatusSchema` → `HealthStatus`

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | `{ configured: boolean; provider: string; available: boolean }` | 文本服务状态 |
| `image` | `{ configured: boolean; provider: string; available: boolean }` | 图片服务状态 |
| `video` | `{ configured: boolean; provider: string; available: boolean }` | 视频服务状态 |
| `vision` | `{ configured: boolean; provider: string; available: boolean }` | 视觉服务状态 |

##### `userApiConfigSchema` → `UserApiConfig`

| 字段 | 类型 | 说明 |
|------|------|------|
| `imageApiUrl` | `string` | 图片 API URL |
| `imageApiKey` | `string` | 图片 API Key |
| `imageModel` | `string` | 图片模型 |
| `videoApiUrl` | `string` | 视频 API URL |
| `videoApiKey` | `string` | 视频 API Key |
| `videoModel` | `string` | 视频模型 |
| `textApiUrl` | `string` | 文本 API URL |
| `textApiKey` | `string` | 文本 API Key |
| `textModel` | `string` | 文本模型 |
| `visionApiUrl` | `string` | 视觉 API URL |
| `visionApiKey` | `string` | 视觉 API Key |
| `visionModel` | `string` | 视觉模型 |
| `useCustomImageApi` | `boolean` | 是否使用自定义图片 API |
| `useCustomVideoApi` | `boolean` | 是否使用自定义视频 API |
| `useCustomVisionApi` | `boolean` | 是否使用自定义视觉 API |

##### `ModelSelection`（接口）

```typescript
interface ModelSelection {
  providerId: string;
  modelId: string;
  providerName: string;
  modelName: string;
  format?: string;
}
```

---

#### media.ts

##### `mediaAssetSchema` → `MediaAsset`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 资产 ID |
| `name` | `string` | 名称 |
| `description` | `string` | `default("")` |
| `type` | `"image" \| "video"` | 类型 |
| `url` | `string` | URL |
| `thumbnailUrl` | `string` | `optional()` |
| `tags` | `string[]` | `default([])` |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | 更新时间 |
| `boundTo` | `{ type: "character" \| "scene"; id: string; name: string }` | `optional()` |
| `fileSize` | `number` | `optional()` |
| `mimeType` | `string` | `optional()` |
| `width` | `number` | `optional()` |
| `height` | `number` | `optional()` |
| `duration` | `number` | `optional()` |

##### `videoTemplateShotSchema` → `VideoTemplateShot`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 镜头 ID |
| `sequence` | `number` | 序号 |
| `description` | `string` | 描述 |
| `duration` | `number` | 时长 |
| `cameraAngle` | `string` | 镜头角度 |
| `cameraMovement` | `string` | 运镜方式 |
| `transition` | `string` | `optional()` |
| `promptTemplate` | `string` | `optional()` |

##### `videoTemplateSchema` → `VideoTemplate`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 模板 ID |
| `name` | `string` | 名称 |
| `description` | `string` | 描述 |
| `category` | `string` | 分类 |
| `totalDuration` | `number` | 总时长 |
| `shots` | `VideoTemplateShot[]` | 镜头列表 |
| `tags` | `string[]` | `default([])` |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | 更新时间 |
| `thumbnailUrl` | `string` | `optional()` |

##### `collectionSchema` → `Collection`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 集合 ID |
| `name` | `string` | 名称 |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | 更新时间 |

##### `collectionAssetSchema` → `CollectionAsset`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | ID |
| `collectionId` | `string` | 集合 ID |
| `assetType` | `"character" \| "scene" \| "storyboard"` | 资产类型 |
| `assetId` | `string` | 资产 ID |

##### `batchTaskSchema` → `BatchTask`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 任务 ID |
| `itemId` | `string` | 项目 ID |
| `itemName` | `string` | 项目名称 |
| `status` | `"pending" \| "generating" \| "completed" \| "failed"` | 状态 |
| `progress` | `number` | 进度 (0-100) |
| `error` | `string` | `optional()` |
| `result` | `BatchTaskResult` | `optional()` |

##### `batchTaskResultSchema` → `BatchTaskResult`

| 字段 | 类型 | 说明 |
|------|------|------|
| `imageUrl` | `string` | `optional()` |
| `source` | `string` | `optional()` |
| `prompt` | `string` | `optional()` |
| `[key: string]` | `unknown` | passthrough |

##### `storyboardAssetSchema` → `StoryboardAsset`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 资产 ID |
| `script` | `string` | 脚本 |
| `duration` | `number` | 时长 |
| `shotType` | `"wide" \| "medium" \| "close_up" \| "extreme_close_up" \| "over_shoulder" \| "aerial" \| "tracking" \| "static"` | `optional()` |
| `previewPath` | `string` | `optional()` |
| `characterIds` | `string[]` | 角色 ID 列表 |
| `sceneId` | `string` | `optional()` |
| `projectId` | `string` | `optional()` |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | 更新时间 |

##### `asaExportDataSchema` → `AsaExportData`

| 字段 | 类型 | 说明 |
|------|------|------|
| `format` | `"asa"` | 格式标识 |
| `version` | `"1.0"` | 版本 |
| `createdAt` | `string` | 创建时间 |
| `collections` | `{ id: string; name: string; assetIds: { assetType: "character" \| "scene" \| "storyboard"; assetId: string }[] }[]` | `optional()` |
| `characters` | `Record<string, unknown>[]` | `optional()` |
| `scenes` | `Record<string, unknown>[]` | `optional()` |
| `storyboards` | `Record<string, unknown>[]` | `optional()` |

##### `searchResultSchema` → `SearchResult`

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `"character" \| "scene" \| "story"` | 类型 |
| `id` | `string` | ID |
| `title` | `string` | 标题 |
| `subtitle` | `string` | `optional()` |

##### `enhancedVideoGenerationParamsSchema` → `EnhancedVideoGenerationParams`

| 字段 | 类型 | 说明 |
|------|------|------|
| `prompt` | `string` | 提示词 |
| `duration` | `number` | `optional()` |
| `fixedImage` | `FixedImageConfig` | `optional()` |
| `referenceVideo` | `ReferenceVideoConfig` | `optional()` |
| `template` | `TemplateConfig` | `optional()` |
| `providerId` | `string` | `optional()` |
| `modelId` | `string` | `optional()` |
| `featureAnchoring` | `FeatureAnchoringConfig` | `optional()` |

##### 类型别名

| 名称 | 定义 |
|------|------|
| `MediaAssetType` | `"image" \| "video"` |
| `AssetLibraryType` | `"character" \| "scene" \| "storyboard"` |
| `ImportMode` | `"replace" \| "skip" \| "merge"` |

---

### 1.3 领域服务 (domain/services)

#### story-generation-service.ts

##### `BeatGenerationContext`

```typescript
interface BeatGenerationContext {
  beat: StoryBeat;
  prevBeat: StoryBeat | null;
  characters: Character[];
  scenes: Scene[];
  elements: StoryElement[];
}
```

##### `ResolvedGenerationParams`

```typescript
interface ResolvedGenerationParams {
  characterRefs: string[];
  sceneRef: string | undefined;
  prevKeyframeUrl: string | undefined;
  prevLastFrameUrl: string | undefined;
  prevVideoUrl: string | undefined;
}
```

##### `StoryGenerationService`

```typescript
const StoryGenerationService: {
  resolveGenerationContext: (ctx: BeatGenerationContext) => ResolvedGenerationParams;
  buildVideoPrompt: (
    beat: StoryBeat,
    basePrompt: string,
    promptLanguage?: "en" | "zh" | "auto",
    styleGuide?: StoryStyleGuide,
    shotInstruction?: ShotInstruction,
  ) => string;
  validateGenerationPrereqs: (
    beat: StoryBeat,
    type: "keyframe" | "framePair" | "video",
  ) => Result<void>;
  buildChainReference: (
    beats: StoryBeat[],
    beatId: string,
  ) => { prevBeat: StoryBeat | null };
} as const;
```

| 方法 | 说明 |
|------|------|
| `resolveGenerationContext` | 解析分镜生成上下文，包括角色引用、场景引用、前一帧 URL 等 |
| `buildVideoPrompt` | 构建视频生成提示词，支持首尾帧约束、风格指南、镜头指令 |
| `validateGenerationPrereqs` | 验证生成前置条件（keyframe → framePair → video 的依赖链） |
| `buildChainReference` | 构建链式引用，找到前一个分镜 |

---

#### beat-workflow-service.ts

##### `GenerationStep`

```typescript
type GenerationStep = "keyframe" | "framePair" | "video";
```

##### `BeatWorkflowResult`

```typescript
interface BeatWorkflowResult {
  step: GenerationStep;
  beat: StoryBeat;
  success: boolean;
  error?: string;
}
```

##### `BeatWorkflowService`

```typescript
const BeatWorkflowService: {
  getNextStep: (beat: StoryBeat) => GenerationStep | null;
  getStepPrereqs: (step: GenerationStep) => string;
  shouldAutoAdvance: (beat: StoryBeat) => boolean;
} as const;
```

| 方法 | 说明 |
|------|------|
| `getNextStep` | 获取分镜的下一个生成步骤 |
| `getStepPrereqs` | 获取步骤的前置条件描述 |
| `shouldAutoAdvance` | 判断是否应自动推进到下一步 |

---

#### reference-resolver.ts

##### `resolveCharacterRef`

```typescript
function resolveCharacterRef(
  character: Character,
  beat?: StoryBeat | null,
  elements?: StoryElement[],
): string | undefined
```

解析角色引用图片 URL。优先级：服装图 → 元素绑定图 → avatarPath → generatedImage → refImagePath。

##### `resolveCharacterRefs`

```typescript
function resolveCharacterRefs(
  characterIds: string[],
  characters: Character[],
  beat?: StoryBeat | null,
  elements?: StoryElement[],
): string[]
```

批量解析角色引用图片 URL。

##### `resolveSceneRef`

```typescript
function resolveSceneRef(
  scene: { refImagePath?: string; scenePath?: string; generatedImage?: string; imageUrl?: string },
): string | undefined
```

解析场景引用图片 URL。优先级：refImagePath → scenePath → generatedImage → imageUrl。

---

#### reference-check.ts

##### `ReferenceInfo`

```typescript
interface ReferenceInfo {
  elementId: string;
  elementType: "character" | "scene";
  elementName: string;
  usedInBeats: string[];
  usedInStories: string[];
}
```

##### `DeleteCheckResult`

```typescript
interface DeleteCheckResult {
  canDelete: boolean;
  references: ReferenceInfo[];
  warningMessage?: string;
}
```

##### `checkCharacterReferences`

```typescript
function checkCharacterReferences(
  characterId: string,
  characterName: string,
  stories: Story[],
): DeleteCheckResult
```

检查角色是否被故事引用，用于删除前校验。

##### `checkSceneReferences`

```typescript
function checkSceneReferences(
  sceneId: string,
  sceneName: string,
  stories: Story[],
): DeleteCheckResult
```

检查场景是否被故事引用，用于删除前校验。

##### `checkElementReferences`

```typescript
function checkElementReferences(
  elementId: string,
  elementName: string,
  stories: Story[],
  elementType?: "character" | "scene",
): DeleteCheckResult
```

检查元素是否被故事引用，用于删除前校验。

---

### 1.4 类型定义 (domain/types)

#### result.ts

##### `Result<T, E>`

```typescript
type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

##### `AppError`

```typescript
class AppError extends Error {
  readonly code: string;
  constructor(code: string, message: string, cause?: unknown);
  toString(): string;
}
```

##### 错误类层次

| 类名 | 构造函数签名 | code |
|------|-------------|------|
| `DatabaseError` | `(message: string, cause?: unknown)` | `"DATABASE_ERROR"` |
| `ValidationError` | `(message: string, cause?: unknown)` | `"VALIDATION_ERROR"` |
| `ApiError` | `(message: string, statusCode?: number, apiCode?: string, cause?: unknown)` | `"API_ERROR"` |
| `NotFoundError` | `(entity: string, id: string)` | `"NOT_FOUND"` |
| `NetworkError` | `(message: string, cause?: unknown)` | `"NETWORK_ERROR"` |
| `StorageError` | `(message: string, cause?: unknown)` | `"STORAGE_ERROR"` |
| `ConfigurationError` | `(message: string, cause?: unknown)` | `"CONFIGURATION_ERROR"` |
| `GenerationError` | `(message: string, generationType: GenerationType, cause?: unknown)` | `"GENERATION_ERROR"` |
| `TimeoutError` | `(message: string, cause?: unknown)` | `"TIMEOUT_ERROR"` |
| `RateLimitError` | `(message: string, retryAfter?: number, cause?: unknown)` | `"RATE_LIMIT_ERROR"` |
| `AuthenticationError` | `(message: string, cause?: unknown)` | `"AUTHENTICATION_ERROR"` |

##### `GenerationType`

```typescript
type GenerationType = "keyframe" | "framePair" | "video" | "image" | "text";
```

##### 工具函数

| 函数 | 签名 | 说明 |
|------|------|------|
| `ok` | `<T>(value: T): Result<T, never>` | 创建成功结果 |
| `err` | `<E extends AppError>(error: E): Result<never, E>` | 创建错误结果 |
| `fromThrowable` | `<T>(fn: () => T): Result<T, AppError>` | 将可能抛异常的函数包装为 Result |
| `fromAsyncThrowable` | `<T>(fn: () => Promise<T>): Promise<Result<T, AppError>>` | 将可能抛异常的异步函数包装为 Result |

---

#### sync.ts

##### 类型定义

| 名称 | 定义 |
|------|------|
| `SyncStatus` | `"synced" \| "pending" \| "conflict"` |
| `SyncEntityType` | `"character" \| "scene" \| "story" \| "media_asset" \| "storyboard_asset" \| "video_task" \| "story_version" \| "collection" \| "element" \| "video_template" \| "ast_template"` |
| `ChangeOperation` | `"insert" \| "update" \| "delete"` |

##### `VectorClock`

```typescript
interface VectorClock {
  [deviceId: string]: number;
}
```

##### `SyncChangeLogEntry`

```typescript
interface SyncChangeLogEntry {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: ChangeOperation;
  vectorClock: VectorClock;
  data: string | null;
  timestamp: number;
  synced: number;
  deviceId: string;
}
```

##### `SyncPushResult`

```typescript
interface SyncPushResult {
  accepted: number;
  conflicts: SyncConflict[];
  serverVectorClock: VectorClock;
}
```

##### `SyncPullResult`

```typescript
interface SyncPullResult {
  changes: RemoteChange[];
  latestVectorClock: VectorClock;
  hasMore: boolean;
}
```

##### `RemoteChange`

```typescript
interface RemoteChange {
  entityType: SyncEntityType;
  entityId: string;
  operation: ChangeOperation;
  vectorClock: VectorClock;
  data: Record<string, unknown> | null;
  timestamp: number;
  deviceId: string;
}
```

##### `SyncConflict`

```typescript
interface SyncConflict {
  entityType: SyncEntityType;
  entityId: string;
  localVectorClock: VectorClock;
  remoteVectorClock: VectorClock;
  localData: Record<string, unknown> | null;
  remoteData: Record<string, unknown> | null;
  resolved: boolean;
  resolution: "local" | "remote" | "merge" | null;
}
```

##### `SyncStatusInfo`

```typescript
interface SyncStatusInfo {
  lastSyncAt: number | null;
  pendingChanges: number;
  conflicts: number;
  isSyncing: boolean;
  deviceId: string;
}
```

##### `ConflictStrategy`

```typescript
type ConflictStrategy = "last-write-wins" | "local-wins" | "remote-wins" | "manual";
```

##### `SyncConfig`

```typescript
interface SyncConfig {
  enabled: boolean;
  autoSync: boolean;
  syncInterval: number;
  conflictStrategy: ConflictStrategy;
  endpoint: string;
  deviceId: string;
  deviceVectorClock?: VectorClock;
  server: SyncServerConfig | null;
}
```

##### `SyncServerConfig`

```typescript
interface SyncServerConfig {
  url: string;
  connected: boolean;
  lastConnectedAt: number | null;
  serverVersion: string | null;
}
```

##### `SyncCredentials`

```typescript
interface SyncCredentials {
  username: string;
  token: string;
}
```

##### `SyncTestRequest`

```typescript
interface SyncTestRequest {
  url: string;
  username: string;
  password: string;
}
```

##### `SyncTestResult`

```typescript
interface SyncTestResult {
  success: boolean;
  message: string;
  serverVersion?: string;
  token?: string;
  latency?: number;
}
```

##### `SyncAuthResult`

```typescript
interface SyncAuthResult {
  success: boolean;
  token: string;
  userId: string;
  expiresIn?: number;
}
```

##### `SyncProxyRequest`

```typescript
interface SyncProxyRequest {
  action: "push" | "pull";
  changes?: unknown[];
  deviceId?: string;
  since?: number;
  page?: number;
}
```

##### 常量

| 名称 | 类型 | 值 |
|------|------|-----|
| `SYNCABLE_TABLE_MAP` | `Record<SyncEntityType, string>` | `{ character: "characters", scene: "scenes", story: "stories", ... }` |
| `SYNC_TABLES` | `SyncEntityType[]` | 所有可同步实体类型数组 |
| `DEFAULT_SYNC_CONFIG` | `SyncConfig` | `{ enabled: false, autoSync: true, syncInterval: 30000, conflictStrategy: "last-write-wins", ... }` |

##### 向量时钟工具函数

| 函数 | 签名 | 说明 |
|------|------|------|
| `createVectorClock` | `(deviceId: string, counter?: number): VectorClock` | 创建向量时钟 |
| `incrementVectorClock` | `(clock: VectorClock, deviceId: string): VectorClock` | 递增向量时钟 |
| `mergeVectorClocks` | `(a: VectorClock, b: VectorClock): VectorClock` | 合并两个向量时钟 |
| `compareVectorClocks` | `(a: VectorClock, b: VectorClock): number` | 比较两个向量时钟（1: a>b, -1: a<b, 0: 并发） |
| `isVectorClockConflict` | `(a: VectorClock, b: VectorClock): boolean` | 判断是否存在冲突 |

---

#### electron-api.ts

##### `VideoTaskRecord`

```typescript
interface VideoTaskRecord {
  taskId: string;
  status: "pending" | "generating" | "completed" | "failed" | "cancelled" | "retrying";
  progress: number;
  videoUrl?: string;
  localVideoPath?: string;
  message: string;
  createdAt: string;
  updatedAt?: string;
  storyId?: string;
  beatId?: string;
  config?: { model?: string; prompt?: string; parameters?: string; template_id?: string; template_shots?: string };
  provider?: { api_url?: string; api_endpoint?: string; provider_id?: string; provider_model_id?: string; provider_format?: string };
  mediaRefs?: { fixed_image_url?: string; fixed_image_lock_type?: string; reference_video_url?: string; reference_video_mimicry_level?: string };
  tracking?: { last_polled_at?: number; poll_count?: number; poll_failure_count?: number; recovery_attempts?: number; expires_at?: number; url_obtained_at?: number; url_ttl?: number };
}
```

##### `VideoTaskHistory`

```typescript
interface VideoTaskHistory {
  taskId: string;
  status: "pending" | "generating" | "completed" | "failed" | "retrying";
  model?: string;
  prompt?: string;
  parameters?: Record<string, unknown>;
  videoUrl?: string;
  createdAt: string;
  expiresAt: string;
  lastPolledAt?: string;
  pollCount: number;
  recoveryAttempts: number;
}
```

##### `CustomApiConfig`

```typescript
interface CustomApiConfig {
  providerId?: string;
  modelId?: string;
  format?: string;
}
```

---

#### cloud-provider.ts

##### `CloudProviderInfo`

```typescript
interface CloudProviderInfo {
  name: string;
  websiteUrl?: string;
  taskUrlPattern?: (taskId: string) => string;
  queryEndpoint?: (baseUrl: string, taskId: string) => string;
  apiDocUrl?: string;
  howToCheck: string;
}
```

---

#### video-model.ts

##### `VideoModelFormat`

```typescript
type VideoModelFormat =
  | "volcengine" | "kuaishou" | "zhipu" | "seedance" | "pixverse"
  | "google" | "anthropic" | "openai-sora" | "minimax"
  | "openai-compatible" | "openai";
```

---

#### error-codes.ts

##### `ErrorDomain`

```typescript
type ErrorDomain =
  | "database" | "validation" | "api" | "network" | "storage"
  | "generation" | "recovery" | "cache" | "config" | "auth"
  | "state" | "system";
```

##### `ErrorCodeEntry`

```typescript
interface ErrorCodeEntry {
  code: string;
  domain: ErrorDomain;
  i18nKey: string;
  retryable: boolean;
}
```

##### `ErrorCategory`

```typescript
type ErrorCategory =
  | "timeout" | "rate_limit" | "quota" | "invalid_params"
  | "network" | "server_error" | "database_busy" | "auth" | "unknown";
```

##### 错误码列表

| 代码 | 域 | i18nKey | 可重试 |
|------|-----|--------|--------|
| `DATABASE_ERROR` | database | errorCode.databaseError | ✅ |
| `VALIDATION_ERROR` | validation | errorCode.validationError | ❌ |
| `API_ERROR` | api | errorCode.apiError | ✅ |
| `NOT_FOUND` | database | errorCode.notFound | ❌ |
| `NETWORK_ERROR` | network | errorCode.networkError | ✅ |
| `STORAGE_ERROR` | storage | errorCode.storageError | ✅ |
| `CONFIGURATION_ERROR` | config | errorCode.configurationError | ❌ |
| `GENERATION_ERROR` | generation | errorCode.generationError | ✅ |
| `TIMEOUT_ERROR` | network | errorCode.timeoutError | ✅ |
| `RATE_LIMIT_ERROR` | api | errorCode.rateLimitError | ✅ |
| `AUTHENTICATION_ERROR` | auth | errorCode.authenticationError | ❌ |
| `UNKNOWN_ERROR` | system | errorCode.unknownError | ❌ |
| `CLEANUP_ERROR` | system | errorCode.cleanupError | ✅ |
| `CACHE_CLEANUP_ERROR` | cache | errorCode.cacheCleanupError | ✅ |
| `CACHE_VIDEO_ERROR` | cache | errorCode.cacheVideoError | ✅ |
| `CACHE_DB_ERROR` | cache | errorCode.cacheDbError | ✅ |
| `REMOVE_TASK_ERROR` | system | errorCode.removeTaskError | ❌ |
| `CLEAR_ACTIVE_TASKS_ERROR` | system | errorCode.clearActiveTasksError | ❌ |
| `RETRY_NOT_RECOMMENDED` | recovery | errorCode.retryNotRecommended | ❌ |
| `DUPLICATE_DETECTED` | recovery | errorCode.duplicateDetected | ❌ |
| `HIGH_RISK_RETRY` | recovery | errorCode.highRiskRetry | ❌ |
| `INVALID_TRANSITION` | state | errorCode.invalidTransition | ❌ |
| `VERIFICATION_FAILED` | recovery | errorCode.verificationFailed | ✅ |
| `RECOVERY_INCOMPLETE` | recovery | errorCode.recoveryIncomplete | ✅ |
| `RECOVERY_FAILED` | recovery | errorCode.recoveryFailed | ❌ |
| `RECOVERY_PENDING` | recovery | errorCode.recoveryPending | ✅ |
| `UNKNOWN_STATUS` | recovery | errorCode.unknownStatus | ✅ |
| `QUERY_FAILED` | recovery | errorCode.queryFailed | ✅ |
| `BACKGROUND_RECOVERY_ERROR` | recovery | errorCode.backgroundRecoveryError | ✅ |
| `SYNTHESIZE_PROGRESS` | generation | errorCode.synthesizeProgress | ❌ |
| `UNHANDLED_REJECTION` | system | errorCode.unhandledRejection | ❌ |
| `LOG` | system | errorCode.log | ❌ |

##### 工具函数

| 函数 | 签名 | 说明 |
|------|------|------|
| `isRetryable` | `(code: string): boolean` | 判断错误码是否可重试 |
| `getErrorCodeEntry` | `(code: string): ErrorCodeEntry \| undefined` | 获取错误码条目 |
| `classifyError` | `(errorCode?: string, errorMessage?: string): ErrorCategory` | 分类错误 |

---

### 1.5 工具函数 (domain/utils)

#### shot-prompt.ts

##### `SHOT_SIZE_OPTIONS`

```typescript
const SHOT_SIZE_OPTIONS: Array<{
  value: ShotInstructionTemplate["shotSize"];
  label: string;
  description: string;
  keyword: string;
}>
```

| value | label | description | keyword |
|-------|-------|-------------|---------|
| `extreme_close` | 特写 | 极度放大的局部画面，强调细节 | extreme close-up shot |
| `close` | 近景 | 人物胸部以上的画面，突出表情 | close-up shot |
| `medium` | 中景 | 人物腰部以上的画面，展示动作 | medium shot |
| `wide` | 全景 | 人物全身及周围环境的画面 | wide shot |
| `extreme_wide` | 远景 | 大范围场景画面，强调环境 | extreme wide shot, establishing shot |

##### `CAMERA_MOVEMENT_OPTIONS`

```typescript
const CAMERA_MOVEMENT_OPTIONS: Array<{
  value: ShotInstructionTemplate["cameraMovement"];
  label: string;
  description: string;
  keyword: string;
}>
```

| value | label | description | keyword |
|-------|-------|-------------|---------|
| `static` | 固定 | 镜头不动，画面稳定 | static camera, fixed shot |
| `push` | 推 | 镜头向主体推进 | push in, zoom in, dolly in |
| `pull` | 拉 | 镜头远离主体 | pull out, zoom out, dolly out |
| `pan` | 摇 | 镜头左右或上下旋转 | pan shot, camera pan |
| `orbit` | 环绕 | 镜头围绕主体旋转 | orbit shot, 360 degree rotation around subject |
| `crane_up` | 升 | 镜头向上移动 | crane up, rising shot, ascending |
| `crane_down` | 降 | 镜头向下移动 | crane down, descending shot |
| `tracking` | 跟拍 | 镜头跟随主体移动 | tracking shot, following shot |

##### `CAMERA_ANGLE_OPTIONS`

```typescript
const CAMERA_ANGLE_OPTIONS: Array<{
  value: ShotInstructionTemplate["cameraAngle"];
  label: string;
  description: string;
  keyword: string;
}>
```

| value | label | description | keyword |
|-------|-------|-------------|---------|
| `eye_level` | 平拍 | 与主体视线平齐 | eye level shot |
| `low` | 仰视 | 从低处向上拍摄 | low angle shot, looking up |
| `high` | 俯视 | 从高处向下拍摄 | high angle shot, looking down |
| `birds_eye` | 鸟瞰 | 正上方垂直向下拍摄 | bird's eye view, overhead shot |
| `worms_eye` | 虫视 | 从地面仰视拍摄 | worm's eye view, ground level looking up |
| `dutch` | 倾斜 | 镜头倾斜，制造不安感 | dutch angle, tilted frame, canted angle |

##### `ResolvedShotInstruction`

```typescript
interface ResolvedShotInstruction {
  shotSize?: string;
  cameraMovement?: string;
  cameraAngle?: string;
}
```

##### `shotInstructionToPrompt`

```typescript
function shotInstructionToPrompt(instruction: ResolvedShotInstruction): string
```

将镜头指令转换为英文提示词。

##### `resolveShotInstruction`

```typescript
function resolveShotInstruction(beat: {
  shotInstruction?: ShotInstructionTemplate;
  camera?: BeatCamera | string | null;
  shotType?: string | null;
}): ResolvedShotInstruction | null
```

从三个重叠字段中解析有效镜头指令。优先级：`shotInstruction` > `camera` > `shotType`。

---

#### beat-prompt-builder.ts

##### `BeatImagePromptParams`

```typescript
interface BeatImagePromptParams {
  beat: StoryBeat;
  characters: Character[];
  scenes: Scene[];
  isEnhanced?: boolean;
  fixedImage?: FixedImageConfig;
  featureAnchoring?: FeatureAnchoringConfig;
  elements?: StoryElement[];
  shotInstruction?: ShotInstructionTemplate;
}
```

##### `getBeatCharacterIds`

```typescript
function getBeatCharacterIds(beat: { characterIds?: string[] }): string[]
```

获取分镜的角色 ID 列表。

##### `generateBeatImagePrompt`

```typescript
function generateBeatImagePrompt(params: BeatImagePromptParams): string
```

生成分镜图片提示词。支持特征锚定、固定图片、镜头指令、场景描述、角色描述等。

##### `generateSimpleBeatImagePrompt`

```typescript
function generateSimpleBeatImagePrompt(
  beat: StoryBeat,
  characters: Character[],
  scenes: Scene[],
  frameType?: string,
): string
```

生成简化的分镜图片提示词，用于首帧/尾帧生成。

---

#### frame-pair-accessors.ts

##### `getFirstFrameUrl`

```typescript
function getFirstFrameUrl(framePair: StoryBeatFramePair | undefined): string | undefined
```

获取首帧 URL，兼容 `firstFrameUrl` 和 `firstFrame.imageUrl` 两种格式。

##### `getLastFrameUrl`

```typescript
function getLastFrameUrl(framePair: StoryBeatFramePair | undefined): string | undefined
```

获取尾帧 URL，兼容 `lastFrameUrl` 和 `lastFrame.imageUrl` 两种格式。

---

#### prompt-vocabulary.ts

##### 常量

| 名称 | 类型 | 说明 |
|------|------|------|
| `QUALITY_TAGS_IMAGE` | `string[]` | 图片质量标签：`["masterpiece", "best quality", "highly detailed", "sharp focus", "professional"]` |
| `QUALITY_TAGS_VIDEO` | `string[]` | 视频质量标签：`["high quality", "smooth motion", "cinematic", "professional"]` |
| `STYLE_KEYWORDS` | `Record<string, string[]>` | 风格关键词映射（anime, realistic, 3d, watercolor, sketch, chibi, pixel, oil_painting） |
| `SCENE_TYPE_KEYWORDS` | `Record<string, string[]>` | 场景类型关键词映射（室内, 室外, 城市, 自然, 科幻, 古风, 奇幻, 末日） |
| `MOOD_KEYWORDS` | `Record<string, string[]>` | 氛围关键词映射（平静, 紧张, 欢快, 悲伤, 神秘, 浪漫, 恐怖, 史诗） |
| `LIGHTING_KEYWORDS` | `Record<string, string>` | 光照关键词映射（自然光, 暖光, 冷光, 逆光, 侧光, 顶光, 霓虹, 烛光, 月光） |
| `CAMERA_ANGLE_KEYWORDS` | `Record<string, string>` | 镜头角度关键词映射 |
| `CAMERA_MOVEMENT_KEYWORDS` | `Record<string, string>` | 运镜关键词映射 |
| `TRANSITION_KEYWORDS` | `Record<string, string>` | 转场关键词映射 |
| `POSITION_KEYWORDS` | `Record<string, string>` | 位置关键词映射 |

##### 工具函数

| 函数 | 签名 | 说明 |
|------|------|------|
| `joinParts` | `(parts: (string \| undefined \| null \| false)[], separator?: string): string` | 过滤空值后拼接字符串 |
| `buildCharacterAppearanceDesc` | `(char: Character): string` | 构建角色外观描述（中文） |
| `buildCharacterFullDesc` | `(char: Character): string` | 构建角色完整描述（中文） |
| `buildSceneAtmosphereDesc` | `(scene: Scene): string` | 构建场景氛围描述 |
| `buildSceneVisualDesc` | `(scene: Scene): string` | 构建场景视觉描述 |
| `buildElementEffectDesc` | `(element: SceneElement): string` | 构建元素效果描述 |
| `buildFixedImageDesc` | `(config: FixedImageConfig): string` | 构建固定图片描述 |
| `buildReferenceVideoDesc` | `(config: ReferenceVideoConfig): string` | 构建参考视频描述 |
| `buildTemplateDesc` | `(config: TemplateConfig): string` | 构建模板描述 |
| `getStyleKeywords` | `(style: string): string[]` | 获取风格关键词 |
| `getSceneTypeKeywords` | `(type: string): string[]` | 获取场景类型关键词 |
| `getMoodKeywords` | `(mood: string): string[]` | 获取氛围关键词 |

---

## 2. 共享逻辑层 (src/shared-logic)

> 共享逻辑层为零外部依赖的纯函数层，仅允许内部相对导入。

### 2.1 shot/ 子域

#### reference-engine.ts

##### `ReferenceDirection`

```typescript
const ReferenceDirection: {
  None: "none";
  Previous: "previous";
  Next: "next";
  Custom: "custom";
} as const;
```

##### `ReferenceDirectionType`

```typescript
type ReferenceDirectionType = "none" | "previous" | "next" | "custom";
```

##### `ReferenceContentType`

```typescript
const ReferenceContentType: {
  FullVideo: "full_video";
  LastFrame: "last_frame";
  FirstFrame: "first_frame";
  VideoSegment: "video_segment";
} as const;
```

##### `ReferenceContentTypeType`

```typescript
type ReferenceContentTypeType = "full_video" | "last_frame" | "first_frame" | "video_segment";
```

##### `Shot`

```typescript
interface Shot {
  id: string;
  sequence?: number;
  duration?: number;
  videoGen?: { videoUrl?: string };
  generationResult?: {
    videoUrl?: string;
    lastFrameUrl?: string;
    firstFrameUrl?: string;
  };
}
```

##### `Reference`

```typescript
interface Reference {
  direction: ReferenceDirectionType;
  contentType?: ReferenceContentTypeType;
  targetShotId?: string;
  segmentDuration?: number;
}
```

##### `validateReference`

```typescript
function validateReference(
  shot: Shot,
  allShots: Shot[],
  reference: Reference,
): { valid: boolean; error?: string }
```

验证分镜引用的正确性。

##### `getTargetShot`

```typescript
function getTargetShot(
  shot: Shot,
  allShots: Shot[],
  reference: Reference,
): Shot | undefined
```

获取引用目标分镜。

##### `getReferenceVideoUrl`

```typescript
function getReferenceVideoUrl(
  shot: Shot,
  allShots: Shot[],
  reference: Reference,
): string | undefined
```

获取引用视频 URL。

##### `buildReferenceDescription`

```typescript
function buildReferenceDescription(
  shot: Shot,
  allShots: Shot[],
  reference: Reference,
): string
```

构建引用的可读描述。

---

#### consistency-check.ts

##### `FeatureAnchoringConfig`

```typescript
interface FeatureAnchoringConfig {
  enabled: boolean;
  characterAnchors: CharacterAnchor[];
  disableFrameBinding?: boolean;
  featureConsistencyStrength?: number;
}
```

其中 `CharacterAnchor`:

```typescript
interface CharacterAnchor {
  elementId: string;
  referenceImageUrl?: string;
  featureTags?: string[];
  weight: number;
}
```

##### `performConfigCheck`

```typescript
function performConfigCheck(params: {
  featureAnchoring: FeatureAnchoringConfig;
  elements: { id: string; name: string }[];
}): {
  passed: boolean;
  characterScores: { elementId: string; elementName: string; score: number; issues: string[] }[];
  overallScore: number;
  recommendation: "accept" | "adjust" | "regenerate";
}
```

执行特征锚定配置检查。

##### `performConsistencyCheck`

```typescript
function performConsistencyCheck(params: {
  featureAnchoring: FeatureAnchoringConfig;
  elements: { id: string; name: string }[];
}): ConfigCheckResult
```

执行一致性检查（委托给 `performConfigCheck`）。

##### `validateFeatureAnchoringConfig`

```typescript
function validateFeatureAnchoringConfig(
  config: FeatureAnchoringConfig,
): { valid: boolean; warnings: string[]; errors: string[] }
```

验证特征锚定配置的完整性和合理性。

##### `validateNoFrameBinding`

```typescript
function validateNoFrameBinding(params: {
  videoRequestParams?: {
    previousLastFrameUrl?: string;
    fixedImage?: { lockType?: string };
  };
}): { valid: boolean; error?: string }
```

验证特征锚定模式下是否禁用了帧绑定。

---

#### reference-check.ts

##### `Story`（局部类型）

```typescript
interface Story {
  id: string;
  title?: string;
  characters?: string[];
  scenes?: string[];
  beats?: StoryBeat[];
}
```

##### `ReferenceResult`

```typescript
interface ReferenceResult {
  isReferenced: boolean;
  referencingStories: { storyId: string; storyTitle: string; beatCount: number }[];
  totalBeats: number;
}
```

##### `checkCharacterReferences`

```typescript
function checkCharacterReferences(
  characterId: string,
  stories: Story[],
): ReferenceResult
```

检查角色引用情况。

##### `checkSceneReferences`

```typescript
function checkSceneReferences(
  sceneId: string,
  stories: Story[],
): ReferenceResult
```

检查场景引用情况。

##### `checkMultipleCharacterReferences`

```typescript
function checkMultipleCharacterReferences(
  characterIds: string[],
  stories: Story[],
): Record<string, ReferenceResult>
```

批量检查角色引用情况。

##### `checkMultipleSceneReferences`

```typescript
function checkMultipleSceneReferences(
  sceneIds: string[],
  stories: Story[],
): Record<string, ReferenceResult>
```

批量检查场景引用情况。

---

#### visual-consistency-check.ts

##### `Element`

```typescript
interface Element {
  id: string;
  name: string;
  type?: string;
  description?: string;
  featureAnchor?: { featureTags?: string[] };
  characterConfig?: {
    appearance?: {
      hairColor?: string;
      hairStyle?: string;
      eyeColor?: string;
      clothing?: string;
    };
  };
  bindings?: Array<{ type: string; url: string }>;
}
```

##### `Beat`

```typescript
interface Beat {
  id: string;
  elementIds?: string[];
}
```

##### `buildConsistencyPrompt`

```typescript
function buildConsistencyPrompt(element: Element): string
```

构建视觉一致性分析提示词。

##### `parseConsistencyAnalysis`

```typescript
function parseConsistencyAnalysis(
  analysis: string,
  _element: Element,
): { score: number; passed: boolean; issues: string[]; details?: string }
```

解析视觉一致性分析结果（支持 JSON 和正则两种解析方式）。

##### `checkVisualConsistency`

```typescript
async function checkVisualConsistency(
  apiGateway: {
    analyzeImage: (params: {
      imageUrl: string;
      category: string;
      analysisPrompt: string;
    }) => Promise<{
      success: boolean;
      data?: { analysis?: string };
      error?: string | { code: string; message: string };
    }>;
  },
  params: {
    generatedImageUrl?: string;
    referenceImageUrl?: string;
    element: Element;
  },
): Promise<{ score: number; passed: boolean; issues: string[]; details?: string }>
```

检查视觉一致性（通过 AI 分析）。

##### `checkBeatElementConsistency`

```typescript
async function checkBeatElementConsistency(
  apiGateway: ApiGateway,
  params: {
    beat: Beat;
    elements: Element[];
    getGeneratedImageUrl: (elementId: string) => string | undefined;
  },
): Promise<{
  passed: boolean;
  characterScores: Array<{ elementId: string; elementName: string; score: number; issues: string[] }>;
  overallScore: number;
  recommendation: "accept" | "adjust" | "regenerate";
}>
```

检查分镜中所有元素的视觉一致性。

---

### 2.2 prompt/ 子域

#### prompt-engine.ts

##### 常量

| 名称 | 类型 | 说明 |
|------|------|------|
| `QUALITY_TAGS_IMAGE` | `string[]` | 图片质量标签 |
| `QUALITY_TAGS_VIDEO` | `string[]` | 视频质量标签 |
| `STYLE_KEYWORDS` | `Record<string, string>` | 风格关键词映射（anime, realistic, 3d, watercolor, oil, sketch, pixel, cyberpunk, chinese, cartoon） |
| `SCENE_TYPE_MAP` | `Record<string, string>` | 场景类型映射 |
| `MOOD_MAP` | `Record<string, string>` | 氛围映射 |
| `LIGHTING_MAP` | `Record<string, string>` | 光照映射 |
| `SHOT_TYPE_MAP` | `Record<string, string>` | 景别映射 |
| `CAMERA_MOVEMENT_MAP` | `Record<string, string>` | 运镜映射 |

##### 内部工具函数

| 函数 | 签名 | 说明 |
|------|------|------|
| `joinParts` | `(parts: (string \| undefined \| null)[]): string` | 过滤空值后以中文逗号拼接 |
| `buildCharacterFullDesc` | `(c: CharacterDesc): string` | 构建角色完整描述 |
| `buildSceneAtmosphereDesc` | `(s: SceneDesc): string` | 构建场景氛围描述 |
| `buildSceneVisualDesc` | `(s: SceneDesc): string` | 构建场景视觉描述 |

---

#### prompt-service.ts

##### `CharacterInput`

```typescript
interface CharacterInput {
  name?: string;
  gender?: string;
  age?: number | string;
  style?: string;
  appearance?: {
    hairColor?: string;
    hairStyle?: string;
    eyeColor?: string;
    build?: string;
    clothing?: string;
    accessories?: string;
  };
  description?: string;
  personality?: string | string[];
  generatedImage?: string;
}
```

##### `SceneInput`

```typescript
interface SceneInput {
  name?: string;
  type?: string;
  timeOfDay?: string;
  weather?: string;
  mood?: string;
  lighting?: string;
  atmosphere?: string;
  description?: string;
  elements?: string | string[];
  generatedImage?: string;
  colors?: string | string[];
}
```

##### `BeatInput`

```typescript
interface BeatInput {
  content?: string;
  description?: string;
  shotType?: string;
  camera?: { angle?: string; movement?: string };
  duration?: number;
}
```

##### `ElementInput`

```typescript
interface ElementInput {
  id?: string;
  name?: string;
  type?: string;
  featureAnchor?: { featureTags?: string[] };
}
```

##### `VideoPromptParams`

```typescript
interface VideoPromptParams {
  beat?: BeatInput;
  characters?: CharacterInput[];
  scenes?: SceneInput[];
  elements?: ElementInput[];
  shotInstruction?: string;
  index?: number;
}
```

##### `QuickModeParams`

```typescript
interface QuickModeParams {
  prompt: string;
  duration?: number;
  resolution?: string;
  style?: string;
  characters?: CharacterInput[];
  scene?: SceneInput;
  referenceImage?: string;
}
```

##### 提示词生成函数

| 函数 | 签名 | 说明 |
|------|------|------|
| `generateCharacterImagePrompt` | `(character: CharacterInput, options?: Record<string, unknown>): string` | 生成角色图片提示词 |
| `generateCharacterDetailedPromptInstruction` | `(character: CharacterInput): string` | 生成角色详细提示词指令 |
| `generateSceneImagePrompt` | `(scene: SceneInput, options?: Record<string, unknown>): string` | 生成场景图片提示词 |
| `generateScenePromptOptimization` | `(description: string): string` | 生成场景提示词优化指令 |
| `generateVideoPrompt` | `(params: VideoPromptParams): string` | 生成视频提示词 |
| `generateSingleBeatPrompt` | `(params: VideoPromptParams): string` | 生成单分镜提示词（委托给 generateVideoPrompt） |
| `generateQuickModeVideoPrompt` | `(params: QuickModeParams): string` | 生成快速模式视频提示词 |
| `generateKeyframePrompt` | `(params: { content?: string; shotRequirement?: { shotType?: string; cameraAngle?: string; cameraMovement?: string; action?: string }; prevKeyframe?: string }): string` | 生成预览图提示词 |
| `generateFirstFramePrompt` | `(params: { keyframePrompt?: string; actionDescription?: string }): string` | 生成首帧提示词 |
| `generateLastFramePrompt` | `(params: { keyframePrompt?: string; actionDescription?: string; duration?: number }): string` | 生成尾帧提示词 |
| `generateStoryPlanPrompt` | `(params: { title?: string; description?: string; genre?: string; tone?: string; targetDuration?: number; characters?: CharacterInput[]; scenes?: SceneInput[] }): string` | 生成故事规划提示词 |
| `generateCharacterAnalysisPrompt` | `(): string` | 生成角色分析提示词 |
| `generateSceneAnalysisPrompt` | `(): string` | 生成场景分析提示词 |

---

### 2.3 video/ 子域

#### video-task-params.ts

##### `buildVideoGenerationParams`

```typescript
function buildVideoGenerationParams(params: {
  beat?: Beat;
  characters?: CharacterInput[];
  scenes?: SceneInput[];
  elements?: ElementInput[];
  shotInstruction?: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  duration?: number;
  providerId?: string;
  modelId?: string;
  videoPrompt?: string;
}): VideoGenerationParams
```

构建视频生成参数。返回类型：

```typescript
interface VideoGenerationParams {
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  duration: number;
  providerId?: string;
  modelId?: string;
  beatId?: string;
  storyId?: string;
}
```

##### `buildQuickVideoParams`

```typescript
function buildQuickVideoParams(params: {
  prompt?: string;
  duration?: number;
  resolution?: string;
  style?: string;
  characters?: CharacterInput[];
  scene?: SceneInput;
  referenceImage?: string;
  providerId?: string;
  modelId?: string;
  videoPrompt?: string;
}): Omit<VideoGenerationParams, "firstFrameUrl" | "lastFrameUrl" | "beatId" | "storyId"> & {
  referenceImageUrl?: string;
}
```

构建快速模式视频参数。

##### `buildKeyframeGenerationParams`

```typescript
function buildKeyframeGenerationParams(params: {
  beat: Beat;
  prevBeat?: Beat;
  characterRef?: string;
  sceneRef?: string;
  providerId?: string;
  modelId?: string;
}): {
  prompt: string;
  characterRef?: string;
  sceneRef?: string;
  prevKeyframe?: string;
  shotRequirement: Record<string, unknown>;
  providerId?: string;
  modelId?: string;
  beatId: string;
}
```

构建预览图生成参数。

##### `buildFramePairGenerationParams`

```typescript
function buildFramePairGenerationParams(params: {
  beat: Beat;
  characterRef?: string;
  sceneRef?: string;
  providerId?: string;
  modelId?: string;
}): {
  firstFrame: { prompt?: string; keyframePrompt: string; actionDescription: string; characterRef?: string; sceneRef?: string };
  lastFrame: { prompt?: string; keyframePrompt: string; actionDescription: string; characterRef?: string; sceneRef?: string; duration?: number };
  providerId?: string;
  modelId?: string;
  beatId: string;
}
```

构建首尾帧生成参数。

---

#### video-tracker.ts

##### `PROVIDERS`

```typescript
const PROVIDERS: Record<string, ProviderInfo>
```

支持的云服务商映射。键为域名，包含：`volces.com`（火山引擎）、`bytepluses.com`（BytePlus）、`dashscope.aliyuncs.com`（阿里云百炼）、`klingai.com`（可灵AI）、`bigmodel.cn`（智谱AI）、`openai.com`（OpenAI）、`atlascloud.ai`（Atlas Cloud）。

##### `DEFAULT_PROVIDER`

```typescript
const DEFAULT_PROVIDER: ProviderInfo
```

默认提供者（自定义 API）。

##### `getProviderInfo`

```typescript
function getProviderInfo(apiUrl?: string): ProviderInfo
```

根据 API URL 获取云服务商信息。

##### `TrackingInfo`

```typescript
interface TrackingInfo {
  providerName: string;
  taskId: string;
  apiUrl: string;
  model: string;
  apiKeyPreview: string;
  taskUrl?: string;
  queryEndpoint?: string;
  apiDocUrl?: string;
  howToCheck?: string;
  providerWebsite?: string;
}
```

##### `buildTrackingInfo`

```typescript
function buildTrackingInfo(
  taskId: string,
  apiUrl?: string,
  apiKeyPreview?: string,
  model?: string,
): TrackingInfo
```

构建视频任务追踪信息。

---

#### video-recovery.ts

##### 常量

| 名称 | 类型 | 值 | 说明 |
|------|------|-----|------|
| `EXPIRY_HOURS` | `number` | `720` | 过期小时数（30天） |
| `MAX_POLL_DURATION_MS` | `number` | `30 * 60 * 1000` | 最大轮询时长（30分钟） |
| `POLL_INTERVAL_MS` | `number` | `60 * 1000` | 轮询间隔（60秒） |
| `MAX_RECOVERY_ATTEMPTS` | `number` | `30` | 最大恢复尝试次数 |

##### `recoverVideoByTaskId`

```typescript
async function recoverVideoByTaskId(
  apiGateway: {
    videoStatus: (params: {
      taskId: string;
      providerId?: string;
      modelId?: string;
      format?: string;
    }) => Promise<{
      success: boolean;
      data?: { status?: string; videoUrl?: string };
    }>;
  },
  taskId: string,
  taskRecord?: {
    status?: string;
    videoUrl?: string;
    providerId?: string;
    providerModelId?: string;
    providerFormat?: string;
  },
): Promise<{
  success: boolean;
  videoUrl?: string;
  message: string;
  status?: string;
}>
```

通过任务 ID 恢复视频。先检查本地记录，再查询云端状态。

---

### 2.4 story/ 子域

#### story-service.ts

##### `RawStoryBeat`

```typescript
interface RawStoryBeat {
  t?: string; title?: string;
  c?: string; content?: string;
  desc?: string; description?: string;
  st?: string; shotType?: string;
  ca?: string; cameraAngle?: string;
  cm?: string; cameraMovement?: string;
  d?: number; duration?: number;
  tp?: string; type?: string;
  ci?: string[]; characterIds?: string[];
  si?: string; sceneId?: string;
  kp?: string; keyframePrompt?: string;
  fp?: string; firstFramePrompt?: string;
  lp?: string; lastFramePrompt?: string;
  ei?: string[]; elementIds?: string[];
  eb?: Record<string, unknown>; elementBindings?: Record<string, unknown>;
  dialogue?: string;
  emotion?: string;
  [key: string]: unknown;
}
```

##### `StoryBeat`（shared-logic 局部类型）

```typescript
interface StoryBeat {
  id?: string;
  sequence?: number;
  title: string;
  content: string;
  description: string;
  shotType: string;
  camera?: { angle?: string; movement?: string };
  duration: number;
  type: string;
  characterIds: string[];
  sceneId?: string;
  keyframePrompt?: string;
  firstFramePrompt?: string;
  lastFramePrompt?: string;
  enhancedGeneration?: boolean;
  elementIds?: string[];
  elementBindings?: Record<string, unknown>;
  imageGenerationPrompt?: string;
  [key: string]: unknown;
}
```

##### `StoryPlanValidationResult`

```typescript
interface StoryPlanValidationResult {
  fixedPlan: StoryBeat[];
  errors: string[];
  autoFixed: string[];
}
```

##### `fixShotParams`

```typescript
function fixShotParams(data: {
  shotType?: string;
  cameraMovement?: string;
  cameraAngle?: string;
  duration?: number;
  [key: string]: unknown;
}): { fixed: ShotParamsData; autoFixed: string[] }
```

修正镜头参数，将中文/别名标准化为英文枚举值。

##### `fixStoryBeat`

```typescript
function fixStoryBeat(data: StoryBeatData): { fixed: StoryBeatData; autoFixed: string[] }
```

修正分镜数据，自动补全缺失字段。

##### `validateStoryPlan`

```typescript
function validateStoryPlan(plan: RawStoryBeat[]): StoryPlanValidationResult
```

验证故事规划，返回修正后的分镜列表和错误/自动修正信息。

##### `parseStoryPlanJSON`

```typescript
function parseStoryPlanJSON(text: string): RawStoryBeat[] | null
```

从文本中解析故事规划 JSON，支持代码块包裹和容错解析。

##### `convertToStoryBeats`

```typescript
function convertToStoryBeats(rawBeats: RawStoryBeat[], enhancedGeneration?: boolean): StoryBeat[]
```

将原始分镜数据转换为标准分镜列表。

##### `generateStoryPlanWithValidation`

```typescript
async function generateStoryPlanWithValidation(
  story: { title?: string; description?: string; genre?: string; tone?: string; targetDuration?: number },
  characters: unknown[],
  scenes: unknown[],
  options: { maxRetries?: number; autoFix?: boolean; fewShotCount?: number; enhancedGeneration?: boolean; planPrompt?: string },
  generateTextFn: (prompt: string, opts: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: { text?: string };
    error?: string | { code: string; message: string };
  }>,
): Promise<{
  beats: StoryBeat[];
  validationResults: StoryPlanValidationResult[];
  autoFixedCount: number;
  retryCount: number;
  fixDetails: string[];
}>
```

带验证的故事规划生成。支持自动重试、自动修正和 few-shot 示例。

---

#### storyboard-generation.ts

##### `Beat`（storyboard 局部类型）

```typescript
interface Beat {
  id: string;
  content?: string;
  description?: string;
  duration?: number;
  shotType?: string;
  camera?: { angle?: string; movement?: string };
  enhancedGeneration?: boolean;
  imageGenerationPrompt?: string;
  firstFramePrompt?: string;
  lastFramePrompt?: string;
  keyframe?: { imageUrl?: string; prompt?: string };
  framePair?: {
    firstFrame?: { imageUrl?: string };
    lastFrame?: { imageUrl?: string };
  };
}
```

##### `ApiGateway`（storyboard 局部类型）

```typescript
interface ApiGateway {
  generateKeyframe: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: { imageUrl: string; prompt?: string; generatedAt?: string };
    error?: string | { code: string; message: string };
  }>;
  generateImage: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: { imageUrl: string };
    error?: string | { code: string; message: string };
  }>;
  generateFramePair: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: {
      firstFrame: { imageUrl: string; prompt?: string };
      lastFrame: { imageUrl: string; prompt?: string };
      generatedAt: number;
    };
    error?: string | { code: string; message: string };
  }>;
  generateVideo: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: { taskId: string; videoUrl?: string; status?: string };
    error?: string | { code: string; message: string };
  }>;
  analyzeImage: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: { analysis?: string };
    error?: string | { code: string; message: string };
  }>;
  videoStatus: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: { status?: string; videoUrl?: string };
    error?: string | { code: string; message: string };
  }>;
}
```

##### `generateBeatKeyframe`

```typescript
async function generateBeatKeyframe(
  apiGateway: ApiGateway,
  _promptService: unknown,
  beat: Beat,
  prevBeat?: Beat,
  options?: Record<string, unknown>,
): Promise<{
  imageUrl: string;
  prompt?: string;
  generatedAt?: string;
  referencedPrevKeyframe?: string;
}>
```

生成分镜预览图。

##### `generateBeatFramePair`

```typescript
async function generateBeatFramePair(
  apiGateway: ApiGateway,
  _promptService: unknown,
  beat: Beat,
  options?: Record<string, unknown>,
): Promise<{
  firstFrame: { imageUrl: string; prompt?: string; derivedFrom?: string };
  lastFrame: { imageUrl: string; prompt?: string; derivedFrom?: string };
  generatedAt: number;
}>
```

生成分镜首尾帧。支持增强模式（分别生成）和标准模式（一起生成）。

##### `generateBeatVideo`

```typescript
async function generateBeatVideo(
  apiGateway: ApiGateway,
  beat: Beat,
  options?: Record<string, unknown>,
): Promise<{
  taskId: string;
  videoUrl?: string;
  status: string;
}>
```

生成分镜视频。

##### `generateBeatFullWorkflow`

```typescript
async function generateBeatFullWorkflow(
  apiGateway: ApiGateway,
  promptService: unknown,
  beat: Beat,
  prevBeat: Beat | undefined,
  options: Record<string, unknown>,
  onProgress?: (stage: string, progress: number) => void,
): Promise<{
  keyframe: KeyframeResult;
  framePair: FramePairResult;
  videoTaskId: string;
}>
```

执行分镜完整生成流程：预览图 → 首尾帧 → 视频。

##### `generateKeyframeChain`

```typescript
async function generateKeyframeChain(
  apiGateway: ApiGateway,
  promptService: unknown,
  beats: Beat[],
  options: {
    getCharacterRef?: (beat: Beat) => string | undefined;
    getSceneRef?: (beat: Beat) => string | undefined;
    providerId?: string;
    modelId?: string;
  },
  onProgress?: (index: number, total: number, beatId: string) => void,
): Promise<Record<string, KeyframeResult>>
```

链式生成多个分镜的预览图，每个分镜使用前一个分镜的预览图作为参考。
